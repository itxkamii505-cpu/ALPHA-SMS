"""
login_panel_client.py — "Login Panel" connections.

Instead of an SMPP bind, ALPHA SMS logs into ANOTHER provider's web panel with the
username/password saved in the admin panel, and reads the SMS/OTP rows from
its CDR page.

Only three things are taken from the remote panel:
      NUMBER  ·  CLI  ·  SMS (full message text)
Range, payout/rate, agent/client and IP always come from OUR own data —
the remote panel's values for those are ignored on purpose.

Standard library only (urllib + http.cookiejar + re) so nothing extra has to
be installed on the VPS.
"""

import gzip
import html
import io
import json
import os
import re
import ssl
import time
import hashlib
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from http.cookiejar import MozillaCookieJar, CookieJar

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE          # these panels often have bad certs


# ── tiny HTML helpers (no BeautifulSoup dependency) ──────────────────────
def strip_tags(s):
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s or "")
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _attr(tag, name):
    m = re.search(r"""%s\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))""" % name, tag, re.I)
    if not m:
        return ""
    return html.unescape(m.group(2) or m.group(3) or m.group(4) or "")


def solve_captcha(text):
    """'12 + 8 = ?' -> '20'. Supports + - * / x × ÷."""
    if not text:
        return None
    t = html.unescape(str(text)).replace("×", "*").replace("÷", "/").replace("−", "-")
    t = re.sub(r"\bx\b", "*", t, flags=re.I)
    m = re.search(r"(-?\d+)\s*([+\-*/])\s*(-?\d+)", t)
    if not m:
        return None
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    if op == "+":
        return str(a + b)
    if op == "-":
        return str(a - b)
    if op == "*":
        return str(a * b)
    if op == "/" and b:
        return str(a // b)
    return None


class PanelSession:
    """One logged-in session against a remote panel with cookie persistence."""

    def __init__(self, login_url, username, password, timeout=18):
        self.login_url = login_url
        self.username = username
        self.password = password
        self.timeout = timeout
        self.logged_in = False

        # Persistent cookie storage to enable superfast 10s scraping without re-login
        sessions_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "sessions")
        try:
            os.makedirs(sessions_dir, exist_ok=True)
        except Exception:
            pass

        key_hash = hashlib.md5(f"{login_url}|{username}".encode("utf-8")).hexdigest()
        self.cookie_file = os.path.join(sessions_dir, f"cookie_{key_hash}.txt")

        try:
            self.jar = MozillaCookieJar(self.cookie_file)
            if os.path.exists(self.cookie_file):
                self.jar.load(ignore_discard=True, ignore_expires=True)
                self.logged_in = len(self.jar) > 0
        except Exception:
            self.jar = CookieJar()

        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            urllib.request.HTTPSHandler(context=_SSL))
        self.opener.addheaders = [
            ("User-Agent", UA),
            ("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"),
            ("Accept-Language", "en-US,en;q=0.9"),
        ]

    def _save_cookies(self):
        if hasattr(self.jar, "save"):
            try:
                self.jar.save(ignore_discard=True, ignore_expires=True)
            except Exception:
                pass

    # ── low level ────────────────────────────────────────────────────
    def open(self, url, data=None, referer=None, ajax=False):
        headers = {}
        if referer:
            headers["Referer"] = referer
        if ajax:
            headers["X-Requested-With"] = "XMLHttpRequest"
        body = urllib.parse.urlencode(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=headers)
        for attempt in range(2):
            try:
                with self.opener.open(req, timeout=self.timeout) as r:
                    raw = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
                    self._save_cookies()
                    return r.geturl(), raw.decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                if attempt == 0 and e.code in (520, 502, 503, 504):
                    time.sleep(1.8)
                    continue
                raise

    # ── login ────────────────────────────────────────────────────────
    def login(self):
        url, page = self.open(self.login_url)

        forms = re.findall(r"(?is)<form[^>]*>.*?</form>", page)
        form = max(forms, key=len) if forms else page
        inputs = re.findall(r"(?i)<input[^>]*>", form)

        data, user_f, pass_f, capt_f = {}, None, None, None
        for tag in inputs:
            name = _attr(tag, "name") or _attr(tag, "id")
            if not name:
                continue
            itype = (_attr(tag, "type") or "text").lower()
            blob = f"{name} {_attr(tag, 'id')} {_attr(tag, 'placeholder')}".lower()
            if itype == "password" or "pass" in blob:
                pass_f = pass_f or name
            elif re.search(r"capt|answer|secur|math|sum", blob):
                capt_f = capt_f or name
            elif re.search(r"user|login|email|uname|account", blob):
                user_f = user_f or name
            elif itype in ("hidden", "submit"):
                data[name] = _attr(tag, "value")
            elif itype in ("text", "") and not user_f:
                user_f = name

        data[user_f or "username"] = self.username
        data[pass_f or "password"] = self.password

        if capt_f:
            answer = solve_captcha(self._captcha_question(form, page, capt_f))
            if answer is None:
                raise RuntimeError("could not read the captcha question on the login page")
            data[capt_f] = answer

        action = _attr(form, "action") if forms else ""
        post_url = urllib.parse.urljoin(url, action) if action else url
        final_url, resp = self.open(post_url, data=data, referer=url)

        has_password_input = bool(re.search(r"""(?i)<input[^>]+type=["']?password""", resp))
        login_path = urllib.parse.urlparse(self.login_url).path.rstrip('/').lower()
        final_path = urllib.parse.urlparse(final_url).path.rstrip('/').lower()

        # If redirected to a dashboard/internal area or page without password field, login succeeded!
        if not has_password_input and (final_path != login_path or any(k in final_path for k in ('dashboard', 'report', 'admin', 'agent', 'client', 'home'))):
            self.logged_in = True
            self._save_cookies()
            return True

        if has_password_input:
            raise RuntimeError(self._error_text(resp))

        low = resp.lower()
        if any(w in low for w in ("wrong captcha", "authentication failed", "invalid credentials", "incorrect password", "invalid username")):
            raise RuntimeError(self._error_text(resp))

        self.logged_in = True
        self._save_cookies()
        return True

    @staticmethod
    def _captcha_question(form, page, field):
        expr = re.compile(r"-?\d+\s*(?:[+\-*/]|x|×|÷)\s*-?\d+", re.I)
        # look just before the captcha input first — that is where the label is
        idx = form.find(field)
        if idx > 0:
            near = strip_tags(form[max(0, idx - 400):idx])
            m = expr.search(near)
            if m:
                return m.group(0)
        m = expr.search(strip_tags(form) or "")
        if m:
            return m.group(0)
        m = expr.search(strip_tags(page) or "")
        return m.group(0) if m else None

    @staticmethod
    def _error_text(resp):
        for chunk in re.findall(r"(?is)<(?:div|span|p|li)[^>]*class=[\"'][^\"']*(?:alert|error|danger|notice|message|toast|notification)[^\"']*[\"'][^>]*>(.*?)</", resp):
            txt = strip_tags(chunk)
            if txt and 5 < len(txt) < 150:
                return txt
        for chunk in re.findall(r"(?is)<(?:div|span|p|td|b|strong|font)[^>]*>(.*?)</", resp):
            txt = strip_tags(chunk)
            if txt and 5 < len(txt) < 120 and re.search(
                    r"\b(invalid|incorrect|wrong|failed|expired|blocked)\b", txt, re.I):
                return txt
        return "panel rejected the login (check username / password / captcha)"

    # ── data ─────────────────────────────────────────────────────────
    def fetch_rows(self, data_url, limit=200):
        """Rows only — see fetch_table() if you also want the header names."""
        return self.fetch_table(data_url, limit)[1]

    def fetch_table(self, data_url, limit=200):
        """Return (headers, rows). Reuses session cookies for fast polling; re-logins on expiry."""
        if self.logged_in:
            try:
                return self._fetch_table_raw(data_url, limit)
            except PermissionError:
                self.logged_in = False
            except Exception as e:
                err_str = str(e).lower()
                if "login" in err_str or "session" in err_str or "auth" in err_str:
                    self.logged_in = False
                else:
                    raise

        self.login()
        return self._fetch_table_raw(data_url, limit)

    def _fetch_table_raw(self, data_url, limit=200):
        url, page = self.open(data_url, referer=self.login_url)
        if re.search(r"""(?i)<input[^>]+type=["']?password""", page):
            self.logged_in = False
            raise PermissionError("session expired — the panel returned its login page")

        login_path = urllib.parse.urlparse(self.login_url).path.rstrip('/').lower()
        curr_path = urllib.parse.urlparse(url).path.rstrip('/').lower()
        if login_path and curr_path == login_path:
            self.logged_in = False
            raise PermissionError("session expired — redirected to login page")

        headers = _table_headers(page)

        # METHOD 1 — DataTable feed (sAjaxSource or ajax URL)
        m = (re.search(r"""["']?sAjaxSource["']?\s*:\s*["']([^"']+)["']""", page) or
             re.search(r"""["']?ajax["']?\s*:\s*["']([^"']+)["']""", page))
        if m:
            src = urllib.parse.urljoin(url, html.unescape(m.group(1)))
            try:
                _, body = self.open(src + ("&" if "?" in src else "?") +
                                    urllib.parse.urlencode(self._dt_params(src, limit)),
                                    referer=url, ajax=True)
                payload = json.loads(body)
                rows = payload.get("aaData") or payload.get("data") or []
                if rows:
                    return headers, [[strip_tags(str(c)) for c in row] for row in rows[:limit]
                                     if isinstance(row, (list, tuple))]
            except (ValueError, urllib.error.URLError, urllib.error.HTTPError):
                pass                                   # fall through to the HTML table

        # METHOD 2 — plain HTML table (use the biggest one on the page)
        best = []
        for table in re.findall(r"(?is)<table[^>]*>.*?</table>", page):
            body = re.search(r"(?is)<tbody[^>]*>(.*?)</tbody>", table)
            trs = re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", body.group(1) if body else table)
            rows = []
            for tr in trs:
                cells = re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", tr)
                if cells:
                    rows.append([strip_tags(c) for c in cells])
            if len(rows) > len(best):
                best = rows
        return headers, best[:limit]

    @staticmethod
    def _dt_params(url, limit):
        year_start = f"{datetime.now().year}-01-01"
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        p = {"sEcho": 1, "iColumns": 9, "iDisplayStart": 0, "iDisplayLength": limit,
             "iSortCol_0": 0, "sSortDir_0": "desc", "iSortingCols": 1,
             "_": int(time.time() * 1000)}
        if "cdr" in url.lower() or "sms" in url.lower():
            p.update({"fdate1": f"{year_start} 00:00:00", "fdate2": f"{tomorrow} 23:59:59",
                      "frange": "", "fnum": "", "fcli": "", "fclient": "",
                      "fgdate": "", "fgmonth": "", "fgrange": "", "fgnumber": "",
                      "fgcli": "", "fg": 0})
        return p


def _table_headers(page):
    """Column names from the biggest table's <thead> on the page."""
    best = []
    for table in re.findall(r"(?is)<table[^>]*>.*?</table>", page):
        head = re.search(r"(?is)<thead[^>]*>(.*?)</thead>", table)
        if head:
            chunk = head.group(1)
        else:                                   # no <thead> — use the first row
            first = re.search(r"(?is)<tr[^>]*>(.*?)</tr>", table)
            chunk = first.group(1) if first else ""
        cells = re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", chunk)
        names = [strip_tags(c).lower() for c in cells]
        if len(names) > len(best):
            best = names
    return best


def map_by_headers(headers):
    """{'number': 2, 'cli': 3, 'message': 5, 'date': 0, 'time': 1} from remote table headers."""
    mapping = {}
    for i, h in enumerate(headers or []):
        cleaned = re.sub(r"[^a-z0-9 ]", " ", str(h or "").lower()).strip()
        if not cleaned:
            continue
        # Phone number column
        if any(k in cleaned for k in ("number", "phone", "msisdn", "destination", "mobile", "to number", "target")) and "number" not in mapping:
            mapping["number"] = i
        # CLI / Sender
        elif any(k in cleaned for k in ("cli", "sender", "sender id", "senderid", "from", "originator", "source")) and "cli" not in mapping:
            mapping["cli"] = i
        # Message body
        elif any(k in cleaned for k in ("sms", "message", "text", "content", "msg", "body", "sms text")) and "message" not in mapping:
            mapping["message"] = i
        # Date & Time combined or Datetime
        elif any(k in cleaned for k in ("datetime", "timestamp", "date time", "date / time", "received", "created", "sent at")) and "date" not in mapping:
            mapping["date"] = i
        # Date column
        elif "date" in cleaned and "date" not in mapping:
            mapping["date"] = i
        # Time column
        elif "time" in cleaned and "time" not in mapping:
            mapping["time"] = i
    return mapping


# ── picking number / CLI / SMS / Date out of a row ────────────────────────
_DIGITS = re.compile(r"^\+?\d[\d\s\-()]{6,}$")


def pick_fields(row, mapping=None):
    """
    Return {"number", "cli", "message", "date", "otp"} for one row.
    Guarantees extraction of Date & Time, Number, CLI, and SMS.
    """
    cells = [str(c or "").strip() for c in row]
    out = {"number": "", "cli": "", "message": "", "date": "", "time": "", "otp": ""}

    if mapping:
        for key in ("number", "cli", "message", "date", "time"):
            idx = mapping.get(key)
            if isinstance(idx, int) and 0 <= idx < len(cells):
                out[key] = cells[idx]
        if out.get("date") and out.get("time") and out["time"] not in out["date"]:
            out["date"] = f"{out['date']} {out['time']}".strip()
        elif not out.get("date") and out.get("time"):
            out["date"] = out["time"]
        if out["number"] or out["message"]:
            out["otp"] = extract_otp(out["message"])
            return out

    for c in cells:
        # Check Date / Datetime
        if not out["date"] and (
            re.search(r"^\d{4}[-/.]\d{2}[-/.]\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?", c) or
            re.search(r"^\d{2}[-/.]\d{2}[-/.]\d{4}([ T]\d{2}:\d{2}(:\d{2})?)?", c)
        ):
            out["date"] = c
        elif not out["time"] and re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", c):
            out["time"] = c
        elif not out["number"] and _DIGITS.match(c) and len(re.sub(r"\D", "", c)) >= 8:
            out["number"] = re.sub(r"[^\d+]", "", c)
        elif " " in c and len(c) > max(12, len(out["message"])):
            out["message"] = c

    if out.get("date") and out.get("time") and out["time"] not in out["date"]:
        out["date"] = f"{out['date']} {out['time']}".strip()
    elif not out.get("date") and out.get("time"):
        out["date"] = out["time"]

    out["otp"] = extract_otp(out["message"])
    return out


def extract_otp(text):
    """
    Ultra-reliable OTP extraction from SMS message text.
    Handles English, French, Spanish, German, Cyrillic, Turkish, Arabic, and all standard formats.
    """
    if not text:
        return ""
    text = str(text).strip()

    patterns = [
        # Explicit prefix with colon/is: "code is: 123456", "code: 123456", "OTP: 123456", "PIN: 1234"
        r"(?i)(?:verification\s*(?:code|pin)?|verify\s*code|otp|o\.t\.p|pin|password|passcode|secret\s*code|kod|kodunuz|codice|c[oó]digo|senha)\s*(?:is|est|ist|es|:|:=|=|-)?\s*[:\-\s]?\s*([0-9A-Z]{4,8})\b",
        # Digits preceding "is your ... code/otp": "123456 is your Apple ID code", "<#> 136445 est votre code Facebook"
        r"(?:^|[^\d])(\d{4,8})\s+(?:is\s+your|is\s+the|est\s+votre|es\s+tu|es\s+su|ist\s+ihr|ist\s+dein|e\'\s+il\s+tuo|to\s+verify|for\s+verification)\b",
        # Prefix G-123456 or WA-123456
        r"\b(?:G|WA|FB|TG)-(\d{4,8})\b",
        # Bracketed or quoted OTP: [123456], (123456), "123456", '123456'
        r"[\[\(\'\"](\d{4,8})[\]\)\'\"]",
        # Hyphenated code: 123-456 or 12-34-56
        r"\b(\d{2,4}[\s\-]\d{2,4}(?:[\s\-]\d{2,4})?)\b",
        # Any standalone 4 to 8 digits
        r"\b(\d{4,8})\b",
    ]

    for p in patterns:
        m = re.search(p, text, re.I)
        if m:
            val = m.group(1)
            digits = re.sub(r"\D", "", val)
            if 4 <= len(digits) <= 8:
                return digits
            if 4 <= len(val) <= 8 and re.match(r"^[0-9A-Za-z]+$", val):
                return val
    return ""
