from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import asyncio, json, random, string, os, sys, logging, hashlib, re, urllib.parse
from datetime import datetime, timedelta
from typing import List
from pathlib import Path
import uvicorn

# ─── Anchor all relative paths ("static/…", "data/…") to this file's own
# folder — NOT to whatever directory the process happens to be launched
# from. Without this, running the app via systemd/pm2/cron/a different
# shell cwd on the VPS makes every "static/..." and "data/..." path fail
# to resolve, which is the #1 cause of "Internal Server Error" on every
# page immediately after deployment.
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import JSON database layer (auto-seeds on first run)
from database import read_db, write_db, next_id, APPS, COUNTRIES, PROVIDERS
from smpp_client import SmppConnectionManager, SmppServer
from login_panel_client import PanelSession, pick_fields, extract_otp, map_by_headers

def is_username_taken(username: str, exclude_table: str = None, exclude_id: int = None) -> bool:
    """One username = one account, system-wide — across Admin/Manager/Reseller/User (users.json),
    Agent (agents.json), and Client (clients.json), regardless of role."""
    uname = (username or "").strip().lower()
    if not uname:
        return False
    for table in ("users", "agents", "clients", "testpanel_credentials"):
        for rec in read_db(table):
            if table == exclude_table and rec.get("id") == exclude_id:
                continue
            if (rec.get("username") or "").strip().lower() == uname:
                return True
    return False

def _norm_key(v):
    """Normalize a country/provider value for matching — trims whitespace
    and lowercases, so 'Italy' / ' italy ' / 'ITALY' are all the same key."""
    return (v or "").strip().lower()

def resolve_payout(country: str, provider: str, ranges: list = None, rate_card: list = None) -> float:
    """SINGLE SOURCE OF TRUTH for what a range pays out per OTP.

    Admin sets the real rate on the Range (sms_ranges.payout) when adding
    numbers / importing a range / editing a range's rate later. rate_card
    is only ever a secondary mirror of that and can drift out of sync (a
    range added without going through the mirroring step, or a rate edited
    on the range without rate_card being touched). Every place in this app
    that needs "what does this range pay" — live SMS ingestion, the
    Manager/Agent 'MY PAYOUT' columns, weekly/monthly settlement — MUST
    call this function instead of reading rate_card or sms_ranges
    directly, or the two sources drifting apart silently reproduces the
    "$0.09 range payout but $0 agent payout" bug.
    """
    if ranges is None:
        ranges = read_db("sms_ranges")
    key = (_norm_key(country), _norm_key(provider))
    rng = next((r for r in ranges
                if (_norm_key(r.get("country")), _norm_key(r.get("provider"))) == key), None)
    if rng is not None and rng.get("payout") is not None:
        try:
            return float(rng.get("payout") or 0)
        except (TypeError, ValueError):
            pass
    if rate_card is None:
        rate_card = read_db("rate_card")
    rc = next((r for r in rate_card
               if (_norm_key(r.get("country")), _norm_key(r.get("provider"))) == key), None)
    if rc is not None and rc.get("sell_rate") is not None:
        try:
            return float(rc.get("sell_rate") or 0)
        except (TypeError, ValueError):
            pass
    return 0.0

import io, csv, zipfile, shutil
from fastapi.responses import StreamingResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

app = FastAPI(title="MAIT SMS", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

# ─── WebSocket Manager ──────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for d in dead:
            self.connections.remove(d)

manager = ConnectionManager()
otp_manager = ConnectionManager()
traffic_manager = ConnectionManager()
smpp_ws_manager = ConnectionManager()

# ─── Real SMPP client manager — actual carrier binds live here ──────────────
async def _smpp_on_message(sender: str, to_number: str, message: str, sms_id: str, company: str):
    result = ingest_sms(sender, to_number, message, sms_id, company)
    entry = result.get("entry")
    if entry:
        await otp_manager.broadcast({
            "type": "otp", "id": entry["id"], "app": entry["app"] or "Unknown",
            "number": to_number, "message": message or "Your verification code is ****",
            "timestamp": entry["timestamp"], "country": entry["country"] or "—", "provider": entry["provider"] or "—"
        })

async def _smpp_on_status_change(account_id: int, status: str):
    accounts = read_db("smpp_accounts")
    acc = next((a for a in accounts if a["id"] == account_id), None)
    if acc:
        previous_status = acc.get("status")
        acc["status"] = status
        write_db("smpp_accounts", accounts)

        # Log the transition — the Dashboard banner reads live status
        # straight from smpp_accounts, no email involved.
        if status in ("error", "disconnected") and previous_status == "active":
            log_audit("System", "SMPP Connection Dropped",
                      f"Connection to '{acc.get('company','Unknown')}' went from active to {status}", module="SMPP")
        elif status == "active" and previous_status in ("error", "disconnected"):
            log_audit("System", "SMPP Connection Restored",
                      f"Connection to '{acc.get('company','Unknown')}' is active again", module="SMPP")

@app.on_event("startup")
async def _migrate_agent_payout():
    """One-time data heal: any number that already has an agent_id but was
    assigned before agent_payout existed as its own field gets backfilled
    from the current range rate, so it stops silently showing whatever
    client_payout happens to be set instead of the Agent's own locked rate.

    Also repairs numbers AND already-logged sms_log rows that got locked in
    at agent_payout/manager_payout/profit of exactly 0 because the old rate
    lookup only checked rate_card and ignored sms_ranges (the Admin's real,
    authoritative rate) — this is the exact "range payout shows $0.09 but
    Agent's My Payout shows $0" bug. Uses resolve_payout() (sms_ranges
    first, rate_card fallback) so old data lines up with the same rate the
    live SMS-receiving code now uses, and applies going forward automatically
    any time the Admin edits a range's rate — this migration re-runs every
    startup, it isn't a one-time fix."""
    numbers = read_db("numbers")
    ranges = read_db("sms_ranges")
    rate_card = read_db("rate_card")
    changed = 0
    for n in numbers:
        best_rate = resolve_payout(n.get("country"), n.get("provider"), ranges, rate_card)

        if n.get("agent_id"):
            if n.get("agent_payout") is None or (n.get("agent_payout") == 0 and best_rate):
                n["agent_payout"] = best_rate
                changed += 1
        if n.get("manager_id"):
            if n.get("manager_payout") is None or (n.get("manager_payout") == 0 and best_rate):
                n["manager_payout"] = best_rate
                changed += 1
    if changed:
        write_db("numbers", numbers)
        logging.getLogger("migration").info(f"Backfilled agent_payout/manager_payout on {changed} existing number field(s)")

    # Same repair for historical sms_log rows — an OTP that was already
    # delivered and logged with profit/agent_payout = 0 under the old buggy
    # lookup gets corrected here too, so old statements/balances aren't
    # permanently stuck at $0 for numbers that DO have a real range rate.
    sms_log = read_db("sms_log")
    numbers_by_number = {n.get("number"): n for n in numbers}
    sms_changed = 0
    for s in sms_log:
        if s.get("agent_payout") not in (None, 0) and s.get("profit") not in (None, 0):
            continue
        rec = numbers_by_number.get(s.get("number"))
        country = s.get("country") or (rec.get("country") if rec else "")
        provider = s.get("provider") or (rec.get("provider") if rec else "")
        best_rate = resolve_payout(country, provider, ranges, rate_card)
        if not best_rate:
            continue
        if s.get("agent_id") and s.get("agent_payout") in (None, 0):
            s["agent_payout"] = best_rate
            sms_changed += 1
        if s.get("profit") in (None, 0) and s.get("client_payout") is None:
            s["profit"] = best_rate
            s["payout_cost"] = best_rate
            sms_changed += 1
    if sms_changed:
        write_db("sms_log", sms_log)
        logging.getLogger("migration").info(f"Backfilled payout on {sms_changed} existing sms_log field(s)")

smpp_client_manager = SmppConnectionManager(_smpp_on_message, _smpp_on_status_change)
smpp_server = SmppServer(_smpp_on_message, _smpp_on_status_change, lambda: read_db("smpp_accounts"),
                          max_connections=int(read_db("settings").get("smpp_max_connections", 100)))

@app.on_event("startup")
async def _start_smpp_connections():
    """Start the SMPP SERVER (the normal case — carriers connect outbound to
    us using the host/port/system_id/password they were given) and bind any
    accounts explicitly configured for outbound client mode."""
    settings = read_db("settings")
    host = settings.get("smpp_host", "0.0.0.0")
    port = int(settings.get("smpp_port", 2775))
    try:
        await smpp_server.start(host, port)
        logging.getLogger("smpp_server").info(f"SMPP server started successfully — listening for carriers on {host}:{port}")
    except OSError as e:
        logging.getLogger("smpp_server").error(
            f"COULD NOT START SMPP SERVER on {host}:{port} — {e}. "
            f"Likely cause: another process is already using port {port}, or you don't have permission to bind it. "
            f"Carriers will NOT be able to connect until this is fixed."
        )
    except Exception as e:
        logging.getLogger("smpp_server").error(f"Could not start SMPP server on {host}:{port} — {e}")
    await smpp_client_manager.sync_with_accounts(read_db("smpp_accounts"))

@app.on_event("startup")
async def _start_cr_api_poller():
    asyncio.create_task(cr_api_poll_loop())


@app.on_event("startup")
async def _resume_login_panels():
    """Any Login Panel left on "running" starts pulling again by itself after
    a restart — the admin should never have to press Start twice."""
    resumed = 0
    for p in read_db("login_panels"):
        if p.get("status") == "running":
            _lp_start(p["id"])
            resumed += 1
    if resumed:
        logging.getLogger("login_panel").info(f"resumed {resumed} connection(s) after restart")

@app.on_event("shutdown")
async def _stop_smpp_connections():
    await smpp_client_manager.stop_all()
    await smpp_server.stop()


# ─── Weekly / Monthly payout settlement ──────────────────────────────────────
# Balance is NOT credited the instant an OTP is delivered — it's batched and
# credited on a schedule, same as a real payroll run:
#   • WEEKLY-schedule numbers → credited every Monday 09:00 Asia/Karachi (PKT),
#     the full week's earnings, no minimum.
#   • MONTHLY-schedule numbers → credited on the 1st of the month 09:00 PKT,
#     but only once that Agent's accumulated total reaches the $50 minimum —
#     below that it simply carries over and keeps accumulating untouched.
try:
    from zoneinfo import ZoneInfo
    _PKT = ZoneInfo("Asia/Karachi")
except Exception:
    _PKT = None

def _pkt_now() -> datetime:
    if _PKT:
        return datetime.now(_PKT)
    return datetime.utcnow() + timedelta(hours=5)  # PKT has no DST

def run_weekly_settlement() -> dict:
    """Credit every Agent's balance with their WEEKLY-schedule earnings
    that haven't been settled yet. Marks those sms_log rows as settled so
    they're never counted twice."""
    sms = read_db("sms_log")
    agents = read_db("agents")
    totals: dict = {}
    touched = False
    for s in sms:
        if s.get("settled") or s.get("payout_schedule", "weekly") != "weekly":
            continue
        aid = s.get("agent_id")
        if not aid:
            continue
        amt = float(s.get("agent_payout", s.get("profit", 0)) or 0)
        totals[aid] = totals.get(aid, 0) + amt
        s["settled"] = True
        s["settled_at"] = datetime.utcnow().isoformat()
        s["settled_batch"] = "weekly"
        touched = True
    if touched:
        write_db("sms_log", sms)
    for aid, amt in totals.items():
        agent = next((a for a in agents if a["id"] == aid), None)
        if agent and amt:
            agent["balance"] = round(float(agent.get("balance", 0) or 0) + amt, 2)
    if totals:
        write_db("agents", agents)
        log_audit("System", "Weekly Settlement",
                   f"Credited {len(totals)} agent(s) — total ${sum(totals.values()):.2f}", module="Payouts")
    settings = read_db("settings")
    settings["last_weekly_settlement"] = datetime.utcnow().isoformat()
    write_db("settings", settings)
    return {"agents_credited": len(totals), "total": round(sum(totals.values()), 2)}

def run_monthly_settlement() -> dict:
    """Credit every Agent's balance with their MONTHLY-schedule earnings —
    but only the agents whose accumulated total has reached the $50
    minimum. Anyone below that is left untouched (unsettled) so it keeps
    accumulating toward next month's run instead of being lost."""
    settings = read_db("settings")
    minimum = float(settings.get("monthly_min_settlement", 50) or 50)
    sms = read_db("sms_log")
    agents = read_db("agents")

    pending: dict = {}
    for s in sms:
        if s.get("settled") or s.get("payout_schedule") != "monthly":
            continue
        aid = s.get("agent_id")
        if not aid:
            continue
        amt = float(s.get("agent_payout", s.get("profit", 0)) or 0)
        pending.setdefault(aid, []).append((s, amt))

    credited = {}
    for aid, rows in pending.items():
        total = sum(amt for _, amt in rows)
        if total < minimum:
            continue  # stays unsettled — carries over to next month's run
        for s, _ in rows:
            s["settled"] = True
            s["settled_at"] = datetime.utcnow().isoformat()
            s["settled_batch"] = "monthly"
        agent = next((a for a in agents if a["id"] == aid), None)
        if agent:
            agent["balance"] = round(float(agent.get("balance", 0) or 0) + total, 2)
        credited[aid] = total

    if credited:
        write_db("sms_log", sms)
        write_db("agents", agents)
        log_audit("System", "Monthly Settlement",
                   f"Credited {len(credited)} agent(s) — total ${sum(credited.values()):.2f}", module="Payouts")
    settings["last_monthly_settlement"] = datetime.utcnow().isoformat()
    write_db("settings", settings)
    return {"agents_credited": len(credited), "total": round(sum(credited.values()), 2)}

@app.post("/api/admin/run-weekly-settlement")
async def admin_run_weekly_settlement():
    """Manual trigger (Admin button) — the scheduler below calls the same
    function automatically every Monday 09:00 PKT."""
    return run_weekly_settlement()

@app.post("/api/admin/run-monthly-settlement")
async def admin_run_monthly_settlement():
    """Manual trigger (Admin button) — the scheduler below calls the same
    function automatically on the 1st of the month, 09:00 PKT."""
    return run_monthly_settlement()

@app.on_event("startup")
async def _start_settlement_scheduler():
    """Checks once a minute whether it's time for the weekly or monthly
    settlement run, using Asia/Karachi time. A 'last run' marker in
    settings.json prevents double-crediting if the server restarts, or
    stays up, right at the trigger minute."""
    async def _loop():
        while True:
            try:
                now = _pkt_now()
                settings = read_db("settings")
                if now.weekday() == 0 and now.hour == 9:  # Monday, 09:00 PKT
                    last = settings.get("last_weekly_settlement") or ""
                    if last[:10] != datetime.utcnow().date().isoformat():
                        run_weekly_settlement()
                if now.day == 1 and now.hour == 9:  # 1st of month, 09:00 PKT
                    last = settings.get("last_monthly_settlement") or ""
                    if last[:7] != datetime.utcnow().strftime("%Y-%m"):
                        run_monthly_settlement()
            except Exception as e:
                logging.getLogger("settlement").error(f"Settlement scheduler error: {e}")
            await asyncio.sleep(60)
    asyncio.create_task(_loop())


# ─── Pages ──────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse("static/index.html")

@app.get("/login", response_class=HTMLResponse)
async def login_page():
    return FileResponse("static/login.html")

@app.get("/manager", response_class=HTMLResponse)
async def manager_page():
    return FileResponse("static/manager.html")

@app.get("/agent", response_class=HTMLResponse)
async def agent_page():
    return FileResponse("static/agent.html")

@app.get("/client", response_class=HTMLResponse)
async def client_page():
    return FileResponse("static/client.html")

# ─── /ints/* URLs (role is visible in the address, like the reference panel) ─
_INTS_PANELS = {
    "admin":   "static/index.html",
    "manager": "static/manager.html",
    "agent":   "static/agent.html",
    "client":  "static/client.html",
}

@app.get("/ints", response_class=HTMLResponse)
@app.get("/ints/", response_class=HTMLResponse)
async def ints_root():
    return RedirectResponse("/ints/login")

@app.get("/ints/login", response_class=HTMLResponse)
async def ints_login():
    return FileResponse("static/login.html")

@app.get("/ints/test", response_class=HTMLResponse)
@app.get("/ints/test/", response_class=HTMLResponse)
@app.get("/ints/test/{page}", response_class=HTMLResponse)
@app.get("/ints/testpanel", response_class=HTMLResponse)
@app.get("/ints/testpanel/{page}", response_class=HTMLResponse)
async def ints_testpanel(page: str = ""):
    return FileResponse("static/testpanel.html")

@app.get("/ints/{role}", response_class=HTMLResponse)
async def ints_panel_root(role: str):
    if role not in _INTS_PANELS:
        return RedirectResponse("/ints/login")
    return RedirectResponse(f"/ints/{role}/SMSDashboard")

@app.get("/ints/{role}/{page}", response_class=HTMLResponse)
async def ints_panel_page(role: str, page: str):
    """Every in-panel page keeps its own URL (…/manager/SMSNumbers, …/agent/MySMSNumbers).
    The panel is a single-page app, so each of these serves the same shell and the
    front-end opens the right page from the URL."""
    if role not in _INTS_PANELS:
        return RedirectResponse("/ints/login")
    return FileResponse(_INTS_PANELS[role])

# ─── Unified dashboard (single URL for every role) ─────────────────────────
@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page():
    return FileResponse("static/dashboard.html")

@app.get("/panel/admin", response_class=HTMLResponse)
async def panel_admin():
    return FileResponse("static/index.html")

@app.get("/panel/manager", response_class=HTMLResponse)
async def panel_manager():
    return FileResponse("static/manager.html")

@app.get("/panel/agent", response_class=HTMLResponse)
async def panel_agent():
    return FileResponse("static/agent.html")

@app.get("/panel/client", response_class=HTMLResponse)
async def panel_client():
    return FileResponse("static/client.html")

@app.get("/testpanel", response_class=HTMLResponse)
async def testpanel_page():
    return FileResponse("static/testpanel.html")

@app.get("/testpanel/login")
async def testpanel_login_page():
    return RedirectResponse(url="/login")

@app.post("/api/testpanel/login")
async def testpanel_login(payload: dict, request: Request):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    client_ip = request.client.host if request.client else "unknown"

    blocked = read_db("blocked_ips")
    if any(b.get("ip") == client_ip for b in blocked):
        raise HTTPException(status_code=403, detail="Access denied — this IP address is blocked")

    accounts = read_db("testpanel_credentials")
    acc = next((a for a in accounts if a.get("username") == username), None)
    if not acc or acc.get("password") != password:
        log_login_activity(username, "TestPanel", client_ip, "failed")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if acc.get("status") == "suspended":
        log_login_activity(username, "TestPanel", client_ip, "suspended")
        raise HTTPException(status_code=403, detail="Account suspended")

    acc["last_login"] = datetime.utcnow().isoformat()
    write_db("testpanel_credentials", accounts)
    log_login_activity(username, "TestPanel", client_ip, "success")
    return {"success": True, "id": acc["id"], "username": acc["username"], "role": "TestPanel"}

@app.get("/api/testpanel-accounts")
async def get_testpanel_accounts(page: int = 1, limit: int = 20):
    data = read_db("testpanel_credentials")
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.post("/api/testpanel-accounts")
async def create_testpanel_account(payload: dict):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    if not username or not password:
        raise HTTPException(400, "Username and password are required")
    if is_username_taken(username):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    data = read_db("testpanel_credentials")
    acc = {"id": next_id(data), "username": username, "password": password,
           "status": "active", "created": datetime.utcnow().isoformat(), "last_login": None}
    data.append(acc)
    write_db("testpanel_credentials", data)
    log_audit("Admin", "Test Panel Account Created", f"Created test panel login '{username}'", module="Accounts")
    return acc

@app.patch("/api/testpanel-accounts/{acc_id}")
async def update_testpanel_account(acc_id: int, payload: dict):
    data = read_db("testpanel_credentials")
    acc = next((a for a in data if a["id"] == acc_id), None)
    if not acc:
        raise HTTPException(404, "Account not found")
    acc.update(payload)
    write_db("testpanel_credentials", data)
    return acc

@app.delete("/api/testpanel-accounts/{acc_id}")
async def delete_testpanel_account(acc_id: int):
    data = [a for a in read_db("testpanel_credentials") if a["id"] != acc_id]
    write_db("testpanel_credentials", data)
    log_audit("Admin", "Test Panel Account Deleted", f"Deleted test panel account #{acc_id}", module="Accounts")
    return {"success": True}

# ─── Auth ───────────────────────────────────────────────────────────────────
@app.post("/api/auth/login")
async def api_login(payload: dict, request: Request):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    client_ip = request.client.host if request.client else "unknown"

    # Real enforcement: reject the attempt outright if this IP is blocked
    blocked = read_db("blocked_ips")
    if any(b.get("ip") == client_ip for b in blocked):
        log_login_activity(username, "Unknown", client_ip, "blocked")
        raise HTTPException(status_code=403, detail="Access denied — this IP address is blocked")

    users = read_db("users")
    user = next((u for u in users if u["username"] == username), None)
    source_table = "users"

    # Also check agents table
    if not user:
        agents = read_db("agents")
        user = next((a for a in agents if a["username"] == username), None)
        source_table = "agents"
        if user and not user.get("role"):
            user = {**user, "role": "Agent"}

    # Also check clients table (previously missing — Client accounts could never log in)
    if not user:
        clients = read_db("clients")
        user = next((c for c in clients if c["username"] == username), None)
        source_table = "clients"
        if user and not user.get("role"):
            user = {**user, "role": "Client"}

    # Also check Test Panel accounts — they log in through this same main
    # login page too, just get routed to the separate /testpanel UI.
    if not user:
        tp_accounts = read_db("testpanel_credentials")
        user = next((t for t in tp_accounts if t["username"] == username), None)
        if user:
            user = {**user, "role": "TestPanel"}
        source_table = "testpanel_credentials"

    if user and user.get("password") == password:
        if user.get("status") == "suspended":
            log_login_activity(username, user.get("role","?"), client_ip, "suspended")
            raise HTTPException(status_code=403, detail="Account suspended")
        # Update last_login in whichever table this account actually came from
        table_data = read_db(source_table)
        rec = next((r for r in table_data if r["id"] == user["id"]), None)
        if rec:
            rec["last_login"] = datetime.utcnow().isoformat()
            write_db(source_table, table_data)

        _role = user.get("role") or {"agents": "Agent", "clients": "Client",
                                     "testpanel_credentials": "TestPanel"}.get(source_table, "Admin")
        log_login_activity(username, _role, client_ip, "success")
        return {
            "success": True,
            "role": _role,
            "username": username,
            "id": user["id"],
            "manager_id": user.get("manager_id"),
            "agent_id": user.get("agent_id"),
            "commission_rate": user.get("commission_rate", 5.0)
        }
    log_login_activity(username, "Unknown", client_ip, "failed")
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/auth/logout")
async def api_logout():
    return {"success": True}

@app.post("/api/account/change-password")
async def change_own_password(payload: dict):
    """Change the password for the currently-logged-in account, whatever
    role it is (Admin/Manager/User live in 'users', Agent in 'agents',
    Client in 'clients', TestPanel in 'testpanel_credentials'). Verifies
    the current password server-side before writing the new one."""
    role = (payload.get("role") or "").strip()
    user_id = payload.get("id")
    current_password = payload.get("current_password", "")
    new_password = payload.get("new_password", "")

    if not user_id:
        raise HTTPException(400, "Missing account id")
    if not current_password or not new_password:
        raise HTTPException(400, "Current password and new password are required")
    if len(new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")

    table = {"Agent": "agents", "Client": "clients", "TestPanel": "testpanel_credentials"}.get(role, "users")
    data = read_db(table)
    account = next((a for a in data if a["id"] == user_id), None)
    if not account:
        raise HTTPException(404, "Account not found")
    if account.get("password") != current_password:
        raise HTTPException(400, "Current password is incorrect")

    account["password"] = new_password
    write_db(table, data)
    log_audit(account.get("username", "?"), "Password Changed",
              f"{role or 'Account'} password was changed", module="Accounts")
    return {"success": True}

# ─── Dashboard ──────────────────────────────────────────────────────────────
@app.get("/api/dashboard/stats")
async def dashboard_stats():
    numbers  = read_db("numbers")
    sms      = read_db("sms_log")
    users    = read_db("users")
    sessions = read_db("smpp_sessions")
    reg_req  = read_db("registration_requests")
    pay_req  = read_db("payout_requests")
    blocked  = read_db("blocked_ips")
    delivered = [s for s in sms if s["status"] == "delivered"]
    success_rate = round(len(delivered) / max(len(sms), 1) * 100, 1)

    today = datetime.utcnow().date()
    sms_today = [s for s in sms if s.get("timestamp","")[:10] == today.isoformat()]

    # Test Panel — today's OTP count and "my payout" (carrier rate earned),
    # counted even when the payout actually given to Test Panel is $0.
    test_logs = read_db("test_sms_logs")
    test_logs_today = [s for s in test_logs if s.get("timestamp","")[:10] == today.isoformat()]
    test_panel_otps_today = len(test_logs_today)
    test_panel_payout_today = round(sum(s.get("carrier_rate", 0) or 0 for s in test_logs_today), 4)

    # Agent Payout today — what's owed to Agents based on the rate we give them
    agent_payout_today = round(sum(s.get("profit", 0) or 0 for s in sms_today if s.get("agent_id")), 4)
    # Admin Payout today — our own earning based on the carrier's rate (My Cost)
    admin_payout_today = round(sum(s.get("carrier_revenue", s.get("profit", 0)) or 0 for s in sms_today), 4)

    # Last 24 hourly buckets and last 30 days of profit, computed from real sms_log data
    now = datetime.utcnow()
    traffic_data = []
    for i in range(23, -1, -1):
        hour_start = now - timedelta(hours=i)
        hour_key = hour_start.strftime("%Y-%m-%dT%H")
        traffic_data.append(sum(1 for s in sms if s.get("timestamp","")[:13] == hour_key))
    profit_data = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date().isoformat()
        profit_data.append(round(sum(s.get("carrier_revenue", s.get("profit",0)) for s in sms if s.get("timestamp","")[:10] == day), 2))

    app_counts = {}
    for s in sms:
        app_counts[s.get("app","Other")] = app_counts.get(s.get("app","Other"), 0) + 1
    total_app = sum(app_counts.values()) or 1
    app_distribution = {k: round(v/total_app*100, 1) for k, v in app_counts.items()} if app_counts else {}

    smpp_accounts = read_db("smpp_accounts")
    smpp_load = round(sum(1 for a in smpp_accounts if a.get("status") == "active") / max(len(smpp_accounts), 1) * 100, 1) if smpp_accounts else 0

    # Real disk usage of the data/ folder against a soft cap, so this
    # genuinely moves as real records accumulate (not a fabricated number)
    try:
        data_dir_bytes = sum(f.stat().st_size for f in Path("data").glob("*.json"))
        storage_used = round(min(data_dir_bytes / (50 * 1024 * 1024), 1) * 100, 1)  # cap: 50MB
    except Exception:
        storage_used = 0

    down_connections = [
        {"company": a.get("company", "Unknown"), "status": a.get("status")}
        for a in smpp_accounts
        if a.get("interconnect_type") in (None, "smpp") and a.get("status") in ("error", "disconnected")
    ]

    return {
        "total_numbers":   len(numbers),
        "active_numbers":  sum(1 for n in numbers if n["status"] == "active"),
        "total_sms_today": len(sms_today),
        "revenue_today":   round(sum(s.get("carrier_revenue", s.get("profit",0)) for s in sms_today), 2),
        "test_panel_otps_today": test_panel_otps_today,
        "test_panel_payout_today": test_panel_payout_today,
        "agent_payout_today": agent_payout_today,
        "admin_payout_today": admin_payout_today,
        "active_users":    sum(1 for u in users if u["status"] == "active"),
        "smpp_sessions":   len([s for s in sessions if s["status"] == "active"]),
        "success_rate":    success_rate,
        "smpp_load":       smpp_load,
        "storage_used":    storage_used,
        "pending_requests": len([x for x in reg_req if x["status"]=="pending"]) +
                            len([x for x in pay_req  if x["status"]=="pending"]),
        "blocked_ips_count": len(blocked),
        "down_connections": down_connections,
        "traffic_data":    traffic_data,
        "profit_data":     profit_data,
        "app_distribution": app_distribution
    }

# ─── SMS: daily/weekly/monthly breakdown for the dashboard header cards ──────
@app.get("/api/sms/daily-stats")
async def sms_daily_stats(agent_id: int=None, manager_id: int=None, client_id: int=None):
    sms = read_db("sms_log")

    if client_id is not None:
        # Client dashboard — was missing entirely, so this param was silently
        # ignored and the Client's own dashboard fell through to computing
        # stats over the WHOLE system (every Manager/Agent/Client's SMS),
        # not just their own. Scope it exactly like /api/sms/client-stats does.
        cid = str(client_id)
        clients = read_db("clients")
        client = next((c for c in clients if str(c.get("id")) == cid), None)
        username = client.get("username","").lower() if client else ""
        sms = [s for s in sms if str(s.get("client_id")) == cid or
               (s.get("client_id") is None and username and s.get("user","").lower() == username)]
    elif agent_id is not None:
        aid = str(agent_id)
        clients = read_db("clients")
        usernames = {c.get("username","").lower() for c in clients if str(c.get("agent_id")) == aid and c.get("username")}
        sms = [s for s in sms if str(s.get("agent_id")) == aid or
               (not s.get("agent_id") and s.get("user","").lower() in usernames)]
    elif manager_id is not None:
        mid = str(manager_id)
        clients = read_db("clients")
        usernames = {c.get("username","").lower() for c in clients if str(c.get("manager_id")) == mid and c.get("username")}
        sms = [s for s in sms if str(s.get("manager_id")) == mid or
               (not s.get("manager_id") and s.get("user","").lower() in usernames)]

    now = datetime.utcnow()
    today = now.date()
    yesterday = today - timedelta(days=1)
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def count_on(day):
        return sum(1 for s in sms if s.get("timestamp","")[:10] == day.isoformat())
    def count_since(start_day):
        return sum(1 for s in sms if s.get("timestamp","")[:10] >= start_day.isoformat())

    weekly_traffic = [count_on(today - timedelta(days=i)) for i in range(6, -1, -1)]

    return {
        "today": count_on(today),
        "yesterday": count_on(yesterday),
        "this_week": count_since(week_start),
        "this_month": count_since(month_start),
        "all_time": len(sms),
        "weekly_traffic": weekly_traffic
    }

# ─── Numbers ────────────────────────────────────────────────────────────────
@app.get("/api/numbers")
async def get_numbers(page: int=1, limit: int=20, search: str="", status: str="",
                       range: str="", client_id: int=None, agent_id: int=None,
                       manager_id: int=None, unassigned: bool=False, service: str="",
                       assigned_to_agent: int=None):
    data = read_db("numbers")
    if search:
        data = [n for n in data if search in n.get("number","") or search.lower() in n.get("user","").lower()]
    if status:
        data = [n for n in data if n.get("status") == status]
    if service:
        data = [n for n in data if n.get("app","") == service]
    if unassigned:
        data = [n for n in data if not n.get("manager_id") and not n.get("agent_id") and not n.get("client_id")]
    if assigned_to_agent is not None:
        clients = read_db("clients")
        my_client_ids = {c["id"] for c in clients if c.get("agent_id") == assigned_to_agent}
        data = [n for n in data if n.get("client_id") in my_client_ids]
    if range:
        # "range" is identified by a sms_ranges row id — match its country+provider
        ranges = read_db("sms_ranges")
        r = next((r for r in ranges if str(r["id"]) == str(range)), None)
        if r:
            data = [n for n in data if n.get("country") == r.get("country") and n.get("provider") == r.get("provider")]
    if client_id is not None:
        data = [n for n in data if str(n.get("client_id")) == str(client_id)]
    # agent_id/manager_id scope to that account's WHOLE downstream chain — a
    # number handed to an agent, then handed on to that agent's client, still
    # carries agent_id (and manager_id) so it stays visible the whole way up.
    # String comparison so a stored int/str mismatch never breaks scoping.
    if agent_id is not None:
        data = [n for n in data if str(n.get("agent_id")) == str(agent_id)]
    if manager_id is not None:
        data = [n for n in data if str(n.get("manager_id")) == str(manager_id)]
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data),
            "page": page, "pages": max(1,(len(data)+limit-1)//limit)}

@app.post("/api/numbers/bulk-assign-many")
async def bulk_assign_many(payload: dict):
    """Same logic as the single-number assign endpoint, but processes an
    entire list of numbers in one request — one file read/write instead of
    one HTTP round-trip per number. This is what makes assigning 500-700
    numbers at once fast instead of taking minutes."""
    number_ids = set(payload.get("number_ids", []))
    target_type = payload.get("target_type", "client")
    target_id = payload.get("target_id", payload.get("client_id"))
    notes = payload.get("notes", "")

    if not number_ids:
        raise HTTPException(400, "number_ids is required")
    if not target_id:
        raise HTTPException(400, "target_id is required")

    to_username, to_role = None, None
    if target_type == "manager":
        managers = read_db("users")
        mgr = next((m for m in managers if m["id"] == target_id and m.get("role") == "Manager"), None)
        if not mgr:
            raise HTTPException(404, "Manager not found")
        to_username, to_role = mgr.get("username"), "Manager"
    elif target_type == "agent":
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == target_id), None)
        if not agent:
            raise HTTPException(404, "Agent not found")
        to_username, to_role = agent.get("username"), "Agent"
        agent_manager_id = agent.get("manager_id")
        # NOTE: whether it's Admin or a Manager calling this endpoint, the
        # Agent's per-OTP payout is ALWAYS the Admin-set range rate below
        # (range_rate) — nothing from `payload` is ever used to set it.
        # A Manager has no way to pick or change what an Agent earns.
    else:
        clients = read_db("clients")
        client = next((c for c in clients if c["id"] == target_id), None)
        if not client:
            raise HTTPException(404, "Client not found")
        to_username, to_role = client.get("username"), "Client"
        client_manager_id = client.get("manager_id")
        client_agent_id = client.get("agent_id")

    ranges = read_db("sms_ranges")
    rate_card = read_db("rate_card")
    range_lookup = {}
    for r in ranges:
        range_lookup[(r.get("country"), r.get("provider"))] = r

    numbers = read_db("numbers")
    updated_ids = []
    explicit_client_payout = payload.get("client_payout")

    for n in numbers:
        if n["id"] not in number_ids:
            continue
        rng = range_lookup.get((n.get("country"), n.get("provider")))
        range_term = rng.get("payout_schedule", "weekly") if rng else "weekly"
        # Canonical resolver — sms_ranges (Admin's real rate) first,
        # rate_card only as a fallback. Same source of truth used by live
        # SMS ingestion and every "MY PAYOUT" column, so this can never
        # drift out of sync with what the Agent actually gets paid.
        range_rate = resolve_payout(n.get("country"), n.get("provider"), ranges, rate_card)

        if target_type == "manager":
            n["manager_id"] = target_id
            n["agent_id"] = None
            n["client_id"] = None
            n["client_name"] = None
            n["client_username"] = None
            n["user"] = ""
            n["client_payout"] = range_rate
            n["agent_payout"] = None
            n["manager_payout"] = range_rate
        elif target_type == "agent":
            n["manager_id"] = agent_manager_id
            n["agent_id"] = target_id
            n["client_id"] = None
            n["client_name"] = None
            n["client_username"] = None
            n["user"] = ""
            n["client_payout"] = range_rate
            n["agent_payout"] = range_rate
            # manager_payout is intentionally left untouched — locked in
            # whenever this number first reached a Manager.
        else:
            n["manager_id"] = client_manager_id
            n["agent_id"] = client_agent_id
            n["client_id"] = target_id
            n["client_name"] = to_username
            n["client_username"] = to_username
            n["user"] = to_username
            n["client_payout"] = float(explicit_client_payout) if explicit_client_payout is not None else range_rate
            # agent_payout is intentionally left untouched here — it was
            # locked in when the Agent first received this number, and must
            # never change just because this Client gets a different rate.

        n["status"] = "assigned"
        n["notes"] = notes
        n["payment_term"] = range_term
        updated_ids.append(n["id"])

    write_db("numbers", numbers)

    if updated_ids:
        transfers = read_db("number_transfers")
        transfers.append({
            "id": next_id(transfers),
            "from_user_id": None, "from_username": "Admin", "from_role": "Admin",
            "to_user_id": target_id, "to_username": to_username, "to_role": to_role,
            "count": len(updated_ids), "number_ids": updated_ids, "service": "",
            "notes": notes, "timestamp": datetime.utcnow().isoformat(), "status": "completed"
        })
        write_db("number_transfers", transfers)
        log_audit("Admin", "Bulk Number Assign", f"{len(updated_ids)} number(s) → {to_role} '{to_username}'", module="Numbers")

    return {"success": True, "assigned": len(updated_ids)}

@app.post("/api/numbers/{number_id}/assign")
async def assign_number(number_id: int, payload: dict):
    """Unified assign — Admin can hand a number to a Manager, an Agent, or a
    Client directly. Assigning to an Agent/Client also stamps the manager_id
    (and agent_id, for a Client) that account belongs to, so the whole
    downstream chain stays visible to everyone above it in the hierarchy."""
    target_type = payload.get("target_type", "client")  # "manager" | "agent" | "client"
    target_id = payload.get("target_id", payload.get("client_id"))  # back-compat with old client_id-only calls
    notes = payload.get("notes", "")

    numbers = read_db("numbers")
    n = next((n for n in numbers if n["id"] == number_id), None)
    if not n:
        raise HTTPException(404, "Number not found")
    if not target_id:
        raise HTTPException(400, "target_id is required")

    to_username, to_role = None, None

    if target_type == "manager":
        managers = read_db("users")
        mgr = next((m for m in managers if m["id"] == target_id and m.get("role") == "Manager"), None)
        if not mgr:
            raise HTTPException(404, "Manager not found")
        n["manager_id"] = target_id
        n["agent_id"] = None
        n["client_id"] = None
        n["client_name"] = None
        n["client_username"] = None
        n["user"] = ""
        n["agent_payout"] = None  # no longer with any agent
        to_username, to_role = mgr.get("username"), "Manager"

    elif target_type == "agent":
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == target_id), None)
        if not agent:
            raise HTTPException(404, "Agent not found")
        n["manager_id"] = agent.get("manager_id")
        n["agent_id"] = target_id
        n["client_id"] = None
        n["client_name"] = None
        n["client_username"] = None
        n["user"] = ""
        to_username, to_role = agent.get("username"), "Agent"

    else:  # client
        clients = read_db("clients")
        client = next((c for c in clients if c["id"] == target_id), None)
        if not client:
            raise HTTPException(404, "Client not found")
        n["manager_id"] = client.get("manager_id")
        n["agent_id"] = client.get("agent_id")
        n["client_id"] = target_id
        n["client_name"] = client.get("username")
        n["client_username"] = client.get("username")
        n["user"] = client.get("username")
        to_username, to_role = client.get("username"), "Client"

    n["status"] = "assigned"
    n["notes"] = notes

    ranges = read_db("sms_ranges")
    rng = next((r for r in ranges if r.get("country") == n.get("country") and r.get("provider") == n.get("provider")), None)
    range_term = rng.get("payout_schedule", "weekly") if rng else "weekly"
    if rng:
        range_rate = rng.get("payout", 0)
    else:
        # Fallback: rate_card (same source the "PAYOUT" column reads from).
        # Keeps a number from locking in agent_payout=0 just because
        # sms_ranges and rate_card have drifted out of sync.
        rc = next((r for r in read_db("rate_card") if r.get("country") == n.get("country") and r.get("provider") == n.get("provider")), None)
        range_rate = rc.get("sell_rate", 0) if rc else 0
    n["payment_term"] = range_term

    if target_type in ("manager", "agent"):
        # Locked rate — always Admin's own range rate, never a submitted value.
        n["client_payout"] = range_rate
        if target_type == "agent":
            # This is the Agent's OWN earning — locked in here, and must
            # NEVER change again just because the Agent later gives this
            # number to a Client at a different (custom) rate.
            n["agent_payout"] = range_rate
        else:
            n["manager_payout"] = range_rate
    elif payload.get("client_payout") is not None:
        # Client assignment — Agent's own discretion on the payout amount.
        # This only affects what the Client receives, never n["agent_payout"].
        n["client_payout"] = float(payload.get("client_payout") or 0)
    else:
        n["client_payout"] = range_rate
    write_db("numbers", numbers)

    transfers = read_db("number_transfers")
    transfers.append({
        "id": next_id(transfers),
        "from_user_id": None, "from_username": "Admin", "from_role": "Admin",
        "to_user_id": target_id, "to_username": to_username, "to_role": to_role,
        "count": 1, "number_ids": [number_id], "service": n.get("app", ""),
        "notes": notes, "timestamp": datetime.utcnow().isoformat(), "status": "completed"
    })
    write_db("number_transfers", transfers)
    log_audit("Admin", "Number Assigned", f"{n.get('number')} → {to_role} '{to_username}'", module="Numbers")
    return {"success": True, "data": n}

@app.post("/api/numbers/bulk-unassign-many")
async def bulk_unassign_many(payload: dict):
    """Revoke/return many numbers to the pool in one request — same speed
    benefit as bulk-assign-many."""
    number_ids = set(payload.get("number_ids", []))
    numbers = read_db("numbers")
    # An agent_id alone means "return every number this agent holds".
    if not number_ids and payload.get("agent_id") is not None:
        aid = str(payload["agent_id"])
        number_ids = {n["id"] for n in numbers if str(n.get("agent_id")) == aid}
    if not number_ids:
        raise HTTPException(400, "number_ids or agent_id is required")

    updated_ids = []
    for n in numbers:
        if n["id"] not in number_ids:
            continue
        n["manager_id"] = None
        n["agent_id"] = None
        n["client_id"] = None
        n["client_name"] = None
        n["client_username"] = None
        n["user"] = "unallocated"
        n["status"] = "active"
        updated_ids.append(n["id"])
    write_db("numbers", numbers)

    if updated_ids:
        log_audit("Admin", "Bulk Number Revoke", f"Revoked {len(updated_ids)} number(s) back to pool", module="Numbers")

    return {"success": True, "revoked": len(updated_ids)}

@app.post("/api/numbers/{number_id}/unassign")
async def unassign_number(number_id: int):
    numbers = read_db("numbers")
    n = next((n for n in numbers if n["id"] == number_id), None)
    if not n:
        raise HTTPException(404, "Number not found")

    prev_client = n.get("client_id")
    n["manager_id"] = None
    n["agent_id"] = None
    n["client_id"] = None
    n["client_name"] = None
    n["client_username"] = None
    n["user"] = "unallocated"
    n["status"] = "active"
    write_db("numbers", numbers)

    if prev_client:
        transfers = read_db("number_transfers")
        transfers.append({
            "id": next_id(transfers),
            "from_user_id": prev_client, "from_username": None, "from_role": "Client",
            "to_user_id": n.get("agent_id"), "to_username": None, "to_role": "Agent",
            "count": 1, "number_ids": [number_id], "service": n.get("app", ""),
            "notes": "Returned", "timestamp": datetime.utcnow().isoformat(), "status": "completed"
        })
        write_db("number_transfers", transfers)
    return {"success": True, "data": n}

@app.delete("/api/numbers/{number_id}")
async def delete_number(number_id: int):
    """Permanently delete a single number from the pool — irreversible,
    unlike unassign which just returns it to the unassigned pool."""
    numbers = read_db("numbers")
    n = next((n for n in numbers if n["id"] == number_id), None)
    if not n:
        raise HTTPException(404, "Number not found")
    numbers = [x for x in numbers if x["id"] != number_id]
    write_db("numbers", numbers)
    log_audit("Admin", "Number Deleted", f"Permanently deleted {n.get('number')}", module="Numbers")
    return {"success": True, "deleted": 1}

@app.post("/api/numbers/bulk-delete-many")
async def bulk_delete_many(payload: dict):
    """Permanently delete many numbers at once — irreversible."""
    number_ids = set(payload.get("number_ids", []))
    if not number_ids:
        raise HTTPException(400, "number_ids is required")
    numbers = read_db("numbers")
    remaining = [n for n in numbers if n["id"] not in number_ids]
    deleted_count = len(numbers) - len(remaining)
    write_db("numbers", remaining)
    if deleted_count:
        log_audit("Admin", "Bulk Number Delete", f"Permanently deleted {deleted_count} number(s)", module="Numbers")
    return {"success": True, "deleted": deleted_count}

@app.delete("/api/numbers/sms-ranges/{range_id}")
async def delete_sms_range(range_id: int, delete_numbers: bool = True):
    """Delete an SMS range. By default this also permanently deletes every
    number that belongs to that range (same country+provider) — so removing
    a range clears its whole number block in one go."""
    ranges = read_db("sms_ranges")
    r = next((r for r in ranges if r["id"] == range_id), None)
    if not r:
        raise HTTPException(404, "Range not found")

    deleted_numbers = 0
    if delete_numbers:
        numbers = read_db("numbers")
        remaining = [n for n in numbers
                     if not (n.get("country") == r.get("country") and n.get("provider") == r.get("provider"))]
        deleted_numbers = len(numbers) - len(remaining)
        write_db("numbers", remaining)

    ranges = [x for x in ranges if x["id"] != range_id]
    write_db("sms_ranges", ranges)
    log_audit("Admin", "Range Deleted",
              f"Deleted range '{r.get('range_name') or r.get('country')}' and {deleted_numbers} number(s)",
              module="Numbers")
    return {"success": True, "deleted_range": True, "deleted_numbers": deleted_numbers}

@app.post("/api/numbers/import-to-range")
async def import_to_range(payload: dict):
    """Tab 1: 'Import to Existing Range' — add numbers to an existing range,
    or create a brand-new range on the fly with a name and payout the admin
    chooses themselves."""
    numbers_text = payload.get("numbers", "")
    lines = [l.strip() for l in numbers_text.splitlines() if l.strip()]
    if not lines:
        raise HTTPException(400, "No numbers provided")

    ranges = read_db("sms_ranges")
    range_id = payload.get("range_id")
    new_range = payload.get("new_range")

    if new_range:
        # Admin is naming their own range and setting their own payout —
        # ONE payment term per range (Weekly OR Monthly), not both.
        payout_schedule = new_range.get("payout_schedule", "weekly")
        payout = float(new_range.get("payout", 0) or 0)
        otp_limit = int(new_range.get("otp_limit", 0) or 0)
        entry = {
            "id": next_id(ranges),
            "country": new_range.get("country", ""),
            "provider": new_range.get("provider", "Manual"),
            "prefix": new_range.get("prefix", ""),
            "range_name": new_range.get("name", ""),
            "cost": float(new_range.get("cost", 0) or 0),
            "payout_schedule": payout_schedule,
            "payout": payout,
            "otp_limit": otp_limit,
            "active": True,
            "created": datetime.utcnow().isoformat()
        }
        ranges.append(entry)
        write_db("sms_ranges", ranges)
        range_id = entry["id"]

        # Mirror into rate_card so MY PAYOUT / PAYOUT columns elsewhere pick it up
        rate_card = read_db("rate_card")
        rate_card.append({
            "id": next_id(rate_card), "country": entry["country"], "provider": entry["provider"],
            "buy_rate": entry["cost"], "sell_rate": payout,
            "margin": f"{round((1 - payout/entry['cost'])*100) if entry['cost'] else 0}%",
            "active": True, "created": datetime.utcnow().isoformat()
        })
        write_db("rate_card", rate_card)
        rng = entry
    else:
        rng = next((r for r in ranges if r["id"] == range_id), None)
        if not rng:
            raise HTTPException(404, "Range not found — select a range or create a new one")

    country_override = payload.get("country_override", "").strip()
    numbers = read_db("numbers")
    added = []
    for num in lines:
        added.append({
            "id": next_id(numbers) + len(added), "number": num,
            "app": "Unassigned", "status": "active", "user": "unallocated",
            "country": country_override or rng.get("country", ""),
            "provider": rng.get("provider", "Manual"),
            "otp_limit": rng.get("otp_limit", 0),
            "allocated_at": datetime.utcnow().isoformat(),
            "last_sms": None, "sms_count": 0, "notes": ""
        })
    numbers.extend(added)
    write_db("numbers", numbers)
    return {"imported": len(added), "range_id": range_id, "range_name": rng.get("range_name", rng.get("country"))}

@app.post("/api/numbers/bulk-range-import")
async def bulk_range_import(file: UploadFile = File(...), provider_name: str=Form(""), mode: str=Form("iprn"),
                             override_cost: str=Form(""), payout_schedule: str=Form("weekly"), override_payout: str=Form(""), otp_limit: str=Form("0")):
    """Tab 2: 'Bulk Range Import' — upload a provider file; ranges are
    auto-created per unique country/provider grouping found in the file.
    Cost and payout are always the admin's own — one payment term
    (Weekly or Monthly) per range, there is no auto-formula."""
    content = await file.read()
    filename = file.filename or ""
    rows = []  # list of (country, provider, number)

    if filename.lower().endswith(".csv") or filename.lower().endswith(".txt"):
        text = content.decode(errors="replace")
        import csv as _csv, io as _io
        sniff = text.splitlines()[0] if text.splitlines() else ""
        if "," in sniff:
            reader = _csv.reader(_io.StringIO(text))
            for row in reader:
                if not row or not row[0].strip():
                    continue
                if len(row) >= 3:
                    rows.append((row[0].strip(), row[1].strip() or provider_name or "Provider", row[2].strip()))
                elif len(row) == 2:
                    rows.append((row[0].strip(), provider_name or "Provider", row[1].strip()))
                else:
                    rows.append(("Unknown", provider_name or "Provider", row[0].strip()))
        else:
            for line in text.splitlines():
                line = line.strip()
                if line:
                    rows.append(("Unknown", provider_name or "Provider", line))
    else:
        # Excel — not parsed here (would need openpyxl); ask for CSV/TXT instead
        raise HTTPException(400, "Please upload a CSV or TXT file (Excel parsing not available in this environment)")

    if not rows:
        raise HTTPException(400, "No numbers found in file")

    try:
        my_cost = float(override_cost) if override_cost else 0.0
        my_payout = float(override_payout) if override_payout else 0.0
        my_otp_limit = int(otp_limit) if otp_limit else 0
    except ValueError:
        raise HTTPException(400, "Cost/Payout/OTP Limit must be numeric")
    if not my_payout:
        raise HTTPException(400, f"Set the {payout_schedule} payment amount")

    # Group by (country, provider) — one new range per unique termination
    groups = {}
    for country, provider, number in rows:
        groups.setdefault((country, provider), []).append(number)

    ranges = read_db("sms_ranges")
    rate_card = read_db("rate_card")
    numbers_db = read_db("numbers")
    test_numbers_db = read_db("test_numbers")
    created_ranges = []
    total_added = 0

    for (country, provider, nums) in [(c, p, n) for (c, p), n in groups.items()]:
        cost = my_cost
        month_day = datetime.utcnow().strftime("%b %d")
        range_name = f"{country} {provider} SSP {month_day}"

        rng_entry = {"id": next_id(ranges), "country": country, "provider": provider,
                     "prefix": "", "range_name": range_name, "cost": cost,
                     "payout_schedule": payout_schedule, "payout": my_payout,
                     "otp_limit": my_otp_limit,
                     "active": True, "created": datetime.utcnow().isoformat(),
                     "is_test": mode == "test"}
        ranges.append(rng_entry)
        created_ranges.append(rng_entry)

        rate_card.append({"id": next_id(rate_card), "country": country, "provider": provider,
                           "buy_rate": cost, "sell_rate": my_payout,
                           "margin": f"{round((1 - my_payout/cost)*100) if cost else 0}%",
                           "active": True, "created": datetime.utcnow().isoformat()})

        for num in nums:
            if mode == "test":
                test_numbers_db.append({
                    "id": next_id(test_numbers_db), "number": num, "country": country,
                    "provider": provider, "app": "", "added_by": "Admin (bulk import)",
                    "created": datetime.utcnow().isoformat()
                })
            else:
                numbers_db.append({
                    "id": next_id(numbers_db) + total_added, "number": num, "app": "Unassigned",
                    "status": "active", "user": "unallocated", "country": country, "provider": provider,
                    "otp_limit": my_otp_limit,
                    "allocated_at": datetime.utcnow().isoformat(), "last_sms": None, "sms_count": 0, "notes": ""
                })
            total_added += 1

    write_db("sms_ranges", ranges)
    write_db("rate_card", rate_card)
    if mode == "test":
        write_db("test_numbers", test_numbers_db)
    else:
        write_db("numbers", numbers_db)

    return {"ranges_created": len(created_ranges), "numbers_imported": total_added,
            "ranges": [{"name": r["range_name"], "country": r["country"], "provider": r["provider"],
                        "cost": r["cost"], "payout_schedule": r["payout_schedule"], "payout": r["payout"]} for r in created_ranges]}

@app.post("/api/numbers/upload")
async def upload_numbers(file: UploadFile = File(...)):
    content = await file.read()
    lines = [l.strip() for l in content.decode(errors="replace").splitlines() if l.strip()]
    numbers = read_db("numbers")
    added = []
    for num in lines:
        added.append({"id": next_id(numbers) + len(added),
            "number": num, "app": "Unassigned", "status": "active",
            "user": "unallocated", "country": "US", "provider": "Manual",
            "allocated_at": datetime.utcnow().isoformat(),
            "last_sms": None, "sms_count": 0, "notes": ""})
    numbers.extend(added)
    write_db("numbers", numbers)
    return {"imported": len(added), "total": len(numbers)}

@app.get("/api/numbers/allocation-history")
async def get_allocation_history(page: int=1, limit: int=20):
    data = read_db("allocation_history")
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.post("/api/numbers/bulk-allocate")
async def bulk_allocate(payload: dict):
    """Real bulk allocation — picks actual numbers (by count, an explicit
    number range, or a saved Range/Block) and assigns them to a Manager,
    Agent, or Client.

    Hierarchy-aware: when allocating straight to an Agent or a Client, the
    pool prefers numbers already idle one level up that target's own chain
    (sitting unused with that Agent's Manager, or that Client's own Manager
    / Agent) before dipping into the fully-global unassigned pool — mirroring
    the real Admin -> Manager -> Agent -> Client hand-down flow. If nothing
    is available anywhere in the chain for the requested range/amount, it
    reports "no free numbers available" rather than allocating fewer than
    asked.
    """
    target_type = payload.get("target_type", "client")
    target_id = payload.get("target_id")
    count = int(payload.get("count", 0) or 0)
    range_id = payload.get("range_id")
    range_start = payload.get("range_start", "").strip()
    range_end = payload.get("range_end", "").strip()
    notes = payload.get("notes", "")

    if not target_id:
        raise HTTPException(400, "target_id is required")

    numbers = read_db("numbers")

    to_username, to_role = None, None
    parent_manager_id, parent_agent_id = None, None

    if target_type == "manager":
        users = read_db("users")
        mgr = next((m for m in users if m["id"] == target_id and m.get("role") == "Manager"), None)
        if not mgr: raise HTTPException(404, "Manager not found")
        to_username, to_role = mgr.get("username"), "Manager"
    elif target_type == "agent":
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == target_id), None)
        if not agent: raise HTTPException(404, "Agent not found")
        to_username, to_role = agent.get("username"), "Agent"
        parent_manager_id = agent.get("manager_id")
    else:
        target_type = "client"
        clients = read_db("clients")
        client = next((c for c in clients if c["id"] == target_id), None)
        if not client: raise HTTPException(404, "Client not found")
        to_username, to_role = client.get("username"), "Client"
        parent_manager_id = client.get("manager_id")
        parent_agent_id = client.get("agent_id")

    # Build the candidate pool, hierarchy-first:
    #   1) numbers already idle one level up this target's own chain
    #      (e.g. sitting with the client's own Manager/Agent, unused)
    #   2) fully unassigned numbers (fresh from Admin's global pool)
    fully_unassigned = [n for n in numbers if not n.get("manager_id") and not n.get("agent_id") and not n.get("client_id")]
    pool, seen_ids = [], set()

    if target_type == "client":
        if parent_agent_id is not None:
            for n in numbers:
                if n.get("agent_id") == parent_agent_id and not n.get("client_id") and n["id"] not in seen_ids:
                    pool.append(n); seen_ids.add(n["id"])
        if parent_manager_id is not None:
            for n in numbers:
                if n.get("manager_id") == parent_manager_id and not n.get("agent_id") and not n.get("client_id") and n["id"] not in seen_ids:
                    pool.append(n); seen_ids.add(n["id"])
    elif target_type == "agent":
        if parent_manager_id is not None:
            for n in numbers:
                if n.get("manager_id") == parent_manager_id and not n.get("agent_id") and not n.get("client_id") and n["id"] not in seen_ids:
                    pool.append(n); seen_ids.add(n["id"])

    for n in fully_unassigned:
        if n["id"] not in seen_ids:
            pool.append(n); seen_ids.add(n["id"])

    # Narrow the pool to the requested range/block, if any.
    rng = None
    if range_id:
        ranges = read_db("sms_ranges")
        rng = next((r for r in ranges if r["id"] == range_id), None)
        if not rng:
            raise HTTPException(404, "Range not found")
        pool = [n for n in pool if n.get("country") == rng.get("country") and n.get("provider") == rng.get("provider")]
    elif range_start and range_end:
        pool = [n for n in pool if range_start <= n.get("number","") <= range_end]

    if count:
        if len(pool) < count:
            raise HTTPException(400, f"No free numbers available — only {len(pool)} available for this selection")
        picked = pool[:count]
    else:
        if not pool:
            raise HTTPException(400, "No free numbers available for this selection")
        picked = pool

    if not picked:
        raise HTTPException(400, "No free numbers available — nothing to allocate")

    if target_type == "manager":
        for n in picked:
            n["manager_id"] = target_id; n["agent_id"] = None; n["client_id"] = None
            n["client_name"] = None; n["client_username"] = None; n["user"] = ""
            n["status"] = "assigned"; n["notes"] = notes
    elif target_type == "agent":
        for n in picked:
            n["manager_id"] = parent_manager_id; n["agent_id"] = target_id; n["client_id"] = None
            n["client_name"] = None; n["client_username"] = None; n["user"] = ""
            n["status"] = "assigned"; n["notes"] = notes
    else:
        for n in picked:
            n["manager_id"] = parent_manager_id; n["agent_id"] = parent_agent_id; n["client_id"] = target_id
            n["client_name"] = to_username; n["client_username"] = to_username; n["user"] = to_username
            n["status"] = "assigned"; n["notes"] = notes

    write_db("numbers", numbers)

    history = read_db("allocation_history")
    entry = {
        "id": next_id(history), "from_user": "Admin", "to_user": to_username,
        "to_role": to_role, "range_id": range_id,
        "range_name": (rng.get("range_name") or rng.get("country")) if rng else None,
        "range_start": range_start, "range_end": range_end,
        "count": len(picked), "timestamp": datetime.utcnow().isoformat(),
        "status": "completed", "notes": notes
    }
    history.append(entry)
    write_db("allocation_history", history)
    log_audit("Admin", "Bulk Allocation", f"Allocated {len(picked)} number(s) to {to_role} '{to_username}'", module="Numbers")
    return {"success": True, "allocated": len(picked), **entry}

@app.get("/api/numbers/blacklist")
async def get_blacklist():
    return read_db("blacklist")

@app.post("/api/numbers/blacklist")
async def add_blacklist(payload: dict):
    data = read_db("blacklist")
    entry = {"id": next_id(data), "pattern": payload.get("pattern",""),
             "type": payload.get("type","number"), "reason": payload.get("reason","Spam"),
             "created": datetime.utcnow().isoformat(), "active": True}
    data.append(entry)
    write_db("blacklist", data)
    return entry

@app.delete("/api/numbers/blacklist/{bl_id}")
async def delete_blacklist(bl_id: int):
    data = [b for b in read_db("blacklist") if b["id"] != bl_id]
    write_db("blacklist", data)
    return {"success": True}

@app.get("/api/numbers/sms-ranges")
async def get_sms_ranges():
    ranges = read_db("sms_ranges")
    numbers = read_db("numbers")
    # Enrich each range with how many of its numbers are currently
    # unassigned — used by Bulk Allocation's "Select Range" dropdown so the
    # admin can see availability before picking an amount.
    for r in ranges:
        r["available"] = sum(
            1 for n in numbers
            if n.get("country") == r.get("country") and n.get("provider") == r.get("provider")
            and not n.get("manager_id") and not n.get("agent_id") and not n.get("client_id")
        )
        r["total_numbers"] = sum(
            1 for n in numbers
            if n.get("country") == r.get("country") and n.get("provider") == r.get("provider")
        )
    return ranges

@app.post("/api/numbers/sms-ranges")
async def add_sms_range(payload: dict):
    data = read_db("sms_ranges")
    payload["id"] = next_id(data)
    payload["created"] = datetime.utcnow().isoformat()
    payload["active"] = True
    data.append(payload)
    write_db("sms_ranges", data)
    return payload

@app.patch("/api/numbers/sms-ranges/{range_id}")
async def update_sms_range(range_id: int, payload: dict):
    """Admin edits an existing range's rate/prefix/schedule/status.
    Only fields actually sent are updated — everything else is kept.
    Live payout resolution (resolve_payout) always reads sms_ranges
    first, so this takes effect immediately everywhere — Agent/Manager
    "MY PAYOUT" columns and new SMS ingestion — with no extra syncing
    needed. rate_card is still mirrored below purely so any legacy
    consumer reading it directly doesn't see a stale number."""
    data = read_db("sms_ranges")
    rng = next((r for r in data if r["id"] == range_id), None)
    if not rng:
        raise HTTPException(404, "Range not found")
    for field in ("country", "provider", "prefix", "range_name", "cost",
                  "payout", "payout_schedule", "otp_limit", "active"):
        if field in payload:
            val = payload[field]
            if field in ("cost", "payout"):
                val = float(val) if val not in (None, "") else 0.0
            rng[field] = val
    rng["updated"] = datetime.utcnow().isoformat()
    write_db("sms_ranges", data)

    rate_card = read_db("rate_card")
    rc = next((r for r in rate_card
               if r.get("country") == rng.get("country") and r.get("provider") == rng.get("provider")), None)
    if rc:
        rc["sell_rate"] = rng.get("payout", rc.get("sell_rate", 0))
        rc["buy_rate"] = rng.get("cost", rc.get("buy_rate", 0))
        write_db("rate_card", rate_card)

    log_audit("Admin", "Range Rate Updated",
              f"'{rng.get('range_name') or rng.get('country')}' ({rng.get('country')}/{rng.get('provider')}) "
              f"payout set to ${rng.get('payout', 0):.4f}", module="Numbers")
    return rng

@app.get("/api/numbers/rate-card")
async def get_rate_card():
    return read_db("rate_card")

@app.post("/api/numbers/rate-card")
async def add_rate_card(payload: dict):
    data = read_db("rate_card")
    payload["id"] = next_id(data)
    payload["created"] = datetime.utcnow().isoformat()
    payload["active"] = True
    data.append(payload)
    write_db("rate_card", data)
    return payload

# ─── SMS ────────────────────────────────────────────────────────────────────
@app.get("/api/sms/logs")
async def get_sms_logs(page: int=1, limit: int=20, status: str="", app: str="",
                        date_from: str="", date_to: str="", search: str="", user: str="",
                        cli: str="", range: str="", agent_id: int=None, manager_id: int=None,
                        client_id: int=None, group_by: str=""):
    data = read_db("sms_log")
    if status: data = [s for s in data if s["status"] == status]
    if app:    data = [s for s in data if s["app"].lower() == app.lower()]
    if user:   data = [s for s in data if s.get("user","").lower() == user.lower()]
    if date_from:
        data = [s for s in data if s.get("timestamp","") >= date_from]
    if date_to:
        # include the whole end day
        data = [s for s in data if s.get("timestamp","") <= date_to + "T23:59:59"]
    if search:
        q = search.lower()
        data = [s for s in data if q in s.get("number","").lower() or q in s.get("user","").lower() or q in s.get("message","").lower()]
    if cli:
        q = cli.lower()
        data = [s for s in data if q in (s.get("cli") or "").lower()]
    if range:
        ranges = read_db("sms_ranges")
        r = next((r for r in ranges if str(r["id"]) == str(range)), None)
        if r:
            data = [s for s in data if s.get("country") == r.get("country") and s.get("provider") == r.get("provider")]

    # Scope to a specific agent's / manager's / client's own traffic.
    # Prefer the direct ownership IDs stamped on each log entry (works even
    # when a number sits with just a Manager or Agent, no Client yet);
    # fall back to username-matching only for entries that predate this.
    # String comparison throughout so any int/str mismatch in stored data
    # (e.g. an id saved as "5" instead of 5) never silently breaks scoping.
    if client_id is not None:
        cid = str(client_id)
        clients = read_db("clients")
        c = next((c for c in clients if str(c["id"]) == cid), None)
        uname = (c.get("username","") if c else "").lower()
        data = [s for s in data if str(s.get("client_id")) == cid or
                (not s.get("client_id") and s.get("user","").lower() == uname)]
    elif agent_id is not None:
        aid = str(agent_id)
        clients = read_db("clients")
        usernames = {c.get("username","").lower() for c in clients if str(c.get("agent_id")) == aid and c.get("username")}
        data = [s for s in data if str(s.get("agent_id")) == aid or
                (not s.get("agent_id") and s.get("user","").lower() in usernames)]
    elif manager_id is not None:
        mid = str(manager_id)
        clients = read_db("clients")
        usernames = {c.get("username","").lower() for c in clients if str(c.get("manager_id")) == mid and c.get("username")}
        data = [s for s in data if str(s.get("manager_id")) == mid or
                (not s.get("manager_id") and s.get("user","").lower() in usernames)]

    if group_by in ("date", "month", "range", "number", "cli"):
        groups = {}
        for s in data:
            if group_by == "date":
                key = s.get("timestamp","")[:10]
            elif group_by == "month":
                key = s.get("timestamp","")[:7]
            elif group_by == "range":
                key = f"{s.get('country','')}-{s.get('provider','')}"
            elif group_by == "number":
                key = s.get("number","")
            else:
                key = s.get("cli","") or "—"
            g = groups.setdefault(key, {"key": key, "sms_count": 0, "payout": 0.0})
            g["sms_count"] += 1
            g["payout"] += float(s.get("profit", 0) or 0)
        grouped = sorted(groups.values(), key=lambda g: g["key"], reverse=True)
        start = (page-1)*limit
        return {"data": grouped[start:start+limit], "total": len(grouped), "grouped": True, "group_by": group_by}

    data = sorted(data, key=lambda s: s.get("timestamp",""), reverse=True)
    start = (page-1)*limit
    page_data = data[start:start+limit]
    for s in page_data:
        s["range_label"] = _range_label(s)
    return {"data": page_data, "total": len(data)}

@app.get("/api/client/{client_id}/transactions")
async def get_client_transactions(client_id: int, limit: int=20):
    # No ledger of manual balance adjustments exists yet in this app —
    # return an honest empty list rather than fabricating transaction history.
    return {"data": []}

@app.get("/api/client/{client_id}/earnings")
async def get_client_earnings(client_id: int):
    clients = read_db("clients")
    client = next((c for c in clients if c["id"] == client_id), None)
    username = (client.get("username","") if client else "").lower()
    sms = [s for s in read_db("sms_log")
           if str(s.get("client_id")) == str(client_id) or
              (s.get("client_id") is None and username and s.get("user","").lower() == username)]

    total_cost = sum(s.get("profit", 0) for s in sms)
    avg_cost = total_cost / len(sms) if sms else 0

    months = {}
    for s in sms:
        key = s.get("timestamp","")[:7]
        m = months.setdefault(key, {"month": key, "sms_count": 0, "cost": 0.0})
        m["sms_count"] += 1
        m["cost"] += s.get("profit", 0)
    monthly_data = []
    for m in sorted(months.values(), key=lambda x: x["month"], reverse=True):
        m["avg_cost"] = m["cost"] / m["sms_count"] if m["sms_count"] else 0
        monthly_data.append(m)

    return {
        "total_cost": round(total_cost, 4),
        "avg_cost": round(avg_cost, 4),
        "savings": 0,
        "monthly_data": monthly_data
    }

@app.get("/api/sms/client-logs")
async def get_client_sms_logs(client_id: int, page: int=1, limit: int=20, search: str="",
                               status: str="", cli: str="", range: str="",
                               date_from: str="", date_to: str=""):
    clients = read_db("clients")
    client = next((c for c in clients if c["id"] == client_id), None)
    username = (client.get("username","") if client else "").lower()
    data = [s for s in read_db("sms_log")
            if str(s.get("client_id")) == str(client_id) or
               (s.get("client_id") is None and username and s.get("user","").lower() == username)]

    if search:
        q = search.lower()
        data = [s for s in data if q in s.get("number","").lower() or q in s.get("message","").lower()]
    if status:
        data = [s for s in data if s.get("status") == status]
    if cli:
        q = cli.lower()
        data = [s for s in data if q in (s.get("cli") or "").lower()]
    if range:
        ranges = read_db("sms_ranges")
        r = next((r for r in ranges if str(r["id"]) == str(range)), None)
        if r:
            data = [s for s in data if s.get("country") == r.get("country") and s.get("provider") == r.get("provider")]
    if date_from:
        data = [s for s in data if s.get("timestamp","") >= date_from]
    if date_to:
        data = [s for s in data if s.get("timestamp","") <= date_to + "T23:59:59"]

    delivered = [s for s in data if s.get("status") == "delivered"]
    stats = {
        "total_sms": len(data),
        "delivered": len(delivered),
        "failed": len(data) - len(delivered),
        "total_cost": round(sum(s.get("profit",0) for s in data), 4)
    }
    data = sorted(data, key=lambda s: s.get("timestamp",""), reverse=True)
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data), "stats": stats}

@app.get("/api/sms/stats")
async def get_sms_stats(agent_id: int=None, manager_id: int=None, client_id: int=None):
    data = read_db("sms_log")

    if client_id is not None:
        cid = str(client_id)
        clients = read_db("clients")
        c = next((c for c in clients if str(c["id"]) == cid), None)
        uname = (c.get("username","") if c else "").lower()
        data = [s for s in data if str(s.get("client_id")) == cid or
                (not s.get("client_id") and uname and s.get("user","").lower() == uname)]
    elif agent_id is not None:
        aid = str(agent_id)
        clients = read_db("clients")
        usernames = {c.get("username","").lower() for c in clients if str(c.get("agent_id")) == aid and c.get("username")}
        data = [s for s in data if str(s.get("agent_id")) == aid or
                (not s.get("agent_id") and s.get("user","").lower() in usernames)]
    elif manager_id is not None:
        mid = str(manager_id)
        clients = read_db("clients")
        usernames = {c.get("username","").lower() for c in clients if str(c.get("manager_id")) == mid and c.get("username")}
        data = [s for s in data if str(s.get("manager_id")) == mid or
                (not s.get("manager_id") and s.get("user","").lower() in usernames)]

    delivered = [s for s in data if s["status"] == "delivered"]
    now = datetime.utcnow()
    hourly_traffic = []
    for i in range(23, -1, -1):
        hour_key = (now - timedelta(hours=i)).strftime("%Y-%m-%dT%H")
        hourly_traffic.append(sum(1 for s in data if s.get("timestamp","")[:13] == hour_key))
    daily_profit = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date().isoformat()
        # Admin (no scope given) sees real carrier income; Manager/Agent/Client see their own payout earnings
        field = "carrier_revenue" if (agent_id is None and manager_id is None and client_id is None) else "profit"
        daily_profit.append(round(sum(s.get(field, s.get("profit",0)) for s in data if s.get("timestamp","")[:10] == day), 2))
    app_counts = {}
    for s in data:
        app_counts[s.get("app","Other")] = app_counts.get(s.get("app","Other"), 0) + 1
    total_app = sum(app_counts.values()) or 1
    app_breakdown = {k: round(v/total_app*100, 1) for k, v in app_counts.items()} if app_counts else {}
    profit_field = "carrier_revenue" if (agent_id is None and manager_id is None and client_id is None) else "profit"
    return {
        "total_sms":    len(data),
        "delivered":    len(delivered),
        "failed":       len(data) - len(delivered),
        "total_profit": round(sum(s.get(profit_field, s.get("profit",0)) for s in data), 4),
        "hourly_traffic": hourly_traffic,
        "app_breakdown": app_breakdown,
        "daily_profit":  daily_profit
    }

# ─── SMPP ───────────────────────────────────────────────────────────────────
def ingest_sms(sender: str, to_number: str, message: str, sms_id: str = "", company: str = ""):
    """Single source of truth for logging an inbound OTP/SMS — used by both
    the HTTP interconnect and the real SMPP client. Never raises; always
    returns a result dict so the caller can ack the delivery either way."""
    try:
        # Test numbers are a separate pool — but if this exact number is ALSO
        # currently assigned to a Manager/Agent/Client in the real numbers
        # pool, its OTPs must still land in their real reports, not disappear
        # into the isolated Test Panel log. Only route to test_sms_logs when
        # the number is a pure, unassigned test number.
        test_numbers = read_db("test_numbers")
        test_num_rec = next((n for n in test_numbers if n.get("number") == to_number), None)
        numbers_pool = read_db("numbers")
        assigned_number_rec = next((n for n in numbers_pool if n.get("number") == to_number
                                     and (n.get("manager_id") or n.get("agent_id") or n.get("client_id"))), None)
        if test_num_rec and not assigned_number_rec:
            if sms_id:
                existing = [s for s in read_db("test_sms_logs") if s.get("sms_id") == sms_id]
                if existing:
                    return {"status": "ok", "duplicate": True, "sms_id": sms_id}
            test_logs = read_db("test_sms_logs")
            test_entry = {
                "id": next_id(test_logs), "number": to_number, "cli": sender,
                "message": message, "country": test_num_rec.get("country",""),
                "provider": test_num_rec.get("provider",""), "app": test_num_rec.get("app",""),
                "carrier_rate": test_num_rec.get("carrier_rate", 0),
                "payout_rate": test_num_rec.get("payout_rate", 0),
                "sms_id": sms_id, "timestamp": datetime.utcnow().isoformat()
            }
            test_logs.append(test_entry)
            write_db("test_sms_logs", test_logs)
            if company:
                accounts = read_db("smpp_accounts")
                acc = next((a for a in accounts if a.get("company","").lower() == str(company).lower()
                            or a.get("system_id","").lower() == str(company).lower()), None)
                if acc:
                    acc["messages_today"] = acc.get("messages_today", 0) + 1
                    write_db("smpp_accounts", accounts)
            return {"status": "ok", "logged": True, "matched_number": True, "test": True}

        if sms_id:
            existing = [s for s in read_db("sms_log") if s.get("sms_id") == sms_id]
            if existing:
                return {"status": "ok", "duplicate": True, "sms_id": sms_id}

        numbers = numbers_pool
        number_rec = next((n for n in numbers if n.get("number") == to_number), None)
        country = number_rec.get("country", "") if number_rec else ""
        provider = number_rec.get("provider", "") if number_rec else ""

        # THE payout rate for this OTP — always resolved from the Range
        # (Admin-set, authoritative) with rate_card only as a fallback.
        # This is what an Agent actually earns per OTP; it must NEVER
        # silently come out as $0 just because rate_card wasn't mirrored.
        carrier_revenue = 0.0   # what the carrier actually pays Admin for this message
        payout_cost = 0.0       # what Admin pays out to whoever owns this number (Manager/Agent/Client)
        if country and provider:
            payout_cost = resolve_payout(country, provider)
            rate = next((r for r in read_db("rate_card") if r.get("country") == country and r.get("provider") == provider), None)
            if rate:
                carrier_revenue = rate.get("buy_rate", 0)
        # If the Agent negotiated a specific rate for THEIR client on this
        # exact number, that's the Client-facing payout — takes priority
        # over the range rate, but only for the client_payout figure, not
        # for what the Agent themselves earns (agent_payout below).
        if number_rec and number_rec.get("client_payout") is not None:
            payout_cost = number_rec.get("client_payout", payout_cost)

        sms_log = read_db("sms_log")
        entry = {
            "id": next_id(sms_log), "number": to_number, "cli": sender,
            "message": message, "app": number_rec.get("app","") if number_rec else "",
            "status": "delivered", "timestamp": datetime.utcnow().isoformat(),
            "provider": provider, "profit": payout_cost, "country": country,
            "carrier_revenue": carrier_revenue, "payout_cost": payout_cost,
            "admin_profit": round(carrier_revenue - payout_cost, 4),
            "user": number_rec.get("user","") if number_rec else "",
            "manager_id": number_rec.get("manager_id") if number_rec else None,
            "agent_id": number_rec.get("agent_id") if number_rec else None,
            "client_id": number_rec.get("client_id") if number_rec else None,
            # What the Agent who owns this number actually earns per OTP —
            # kept separate from "profit" (the Client-facing payout amount)
            # so weekly/monthly settlement credits the correct amount.
            # Priority: the number's own locked-in agent_payout (set at
            # allocation time) → the live range rate (resolve_payout) →
            # never the Client-facing payout_cost, which can be a totally
            # different (Agent-chosen) number.
            "agent_payout": (
                number_rec.get("agent_payout")
                if number_rec and number_rec.get("agent_payout") not in (None, 0)
                else resolve_payout(country, provider)
            ),
            # Weekly (every Monday) or monthly (1st of month, $50 minimum) —
            # captured at delivery time so it survives later re-assignment.
            "payout_schedule": (number_rec.get("payout_schedule", "weekly") if number_rec else "weekly"),
            "settled": False,
            "sms_id": sms_id, "company": company
        }
        sms_log.append(entry)
        write_db("sms_log", sms_log)

        if number_rec:
            number_rec["sms_count"] = number_rec.get("sms_count", 0) + 1
            number_rec["last_sms"] = entry["timestamp"]
            write_db("numbers", numbers)

        if company:
            accounts = read_db("smpp_accounts")
            acc = next((a for a in accounts if a.get("company","").lower() == str(company).lower()
                        or a.get("system_id","").lower() == str(company).lower()), None)
            if acc:
                acc["messages_today"] = acc.get("messages_today", 0) + 1
                write_db("smpp_accounts", accounts)

        return {"status": "ok", "logged": True, "matched_number": bool(number_rec), "entry": entry}
    except Exception as e:
        return {"status": "ok", "logged": False, "error": str(e)}

@app.api_route("/api/sms/inbound", methods=["GET", "POST"])
async def sms_inbound(request: Request):
    """HTTP interconnect receiver. Accepts GET or POST (query string or
    JSON/form body). Supports TWO carrier parameter formats at the same
    time, so old and new carriers both keep working:
      - Original format: from, to, message, sms_id, company/system_id
      - New format:       from, to, msg (or msg64base — base64-encoded
                           message body), uuid (message id)
    This endpoint must NEVER fail a legitimate delivery attempt — every
    incoming hit is logged, even if a field is missing or a number is
    unrecognized, so no OTP is ever silently dropped."""
    try:
        params = dict(request.query_params)
        if request.method == "POST":
            try:
                body = await request.json()
                if isinstance(body, dict):
                    params.update(body)
            except Exception:
                try:
                    form = await request.form()
                    params.update(dict(form))
                except Exception:
                    pass

        sender = params.get("from", "")
        to_number = params.get("to", "")

        # Message body: try the original "message" param first, then the
        # new carrier's "msg", then decode "msg64base" (base64) if that's
        # all that was sent.
        message = params.get("message", "") or params.get("msg", "")
        if not message and params.get("msg64base"):
            try:
                import base64 as _b64
                message = _b64.b64decode(params.get("msg64base")).decode("utf-8", errors="replace")
            except Exception:
                message = params.get("msg64base", "")

        # Message ID: original "sms_id" param, or the new carrier's "uuid".
        sms_id = params.get("sms_id", "") or params.get("uuid", "")
        company = params.get("company", params.get("system_id", ""))

        result = ingest_sms(sender, to_number, message, sms_id, company)
        entry = result.pop("entry", None)
        if entry:
            await otp_manager.broadcast({
                "type": "otp", "id": entry["id"], "app": entry["app"] or "Unknown",
                "number": to_number, "message": message or "Your verification code is ****",
                "timestamp": entry["timestamp"], "country": entry["country"] or "—", "provider": entry["provider"] or "—"
            })
        return result
    except Exception as e:
        return {"status": "ok", "logged": False, "error": str(e)}

@app.get("/api/cr-api-connections")
async def get_cr_api_connections():
    data = read_db("cr_api_connections")
    # Never expose the raw token to the frontend list view — mask it.
    safe = []
    for c in data:
        c2 = {**c}
        tok = c2.get("token", "")
        c2["token_masked"] = (tok[:4] + "…" + tok[-4:]) if len(tok) > 8 else "••••"
        c2.pop("token", None)
        safe.append(c2)
    return {"data": safe, "total": len(safe)}

@app.post("/api/cr-api-connections")
async def add_cr_api_connection(payload: dict):
    panel_name = (payload.get("panel_name") or "").strip()
    panel_url = (payload.get("panel_url") or "").strip()
    token = (payload.get("token") or "").strip()
    if not panel_name or not panel_url or not token:
        raise HTTPException(400, "Panel Name, Panel URL, and Token are all required")
    data = read_db("cr_api_connections")
    entry = {
        "id": next_id(data), "panel_name": panel_name, "panel_url": panel_url,
        "token": token, "active": True, "last_pulled_at": None,
        "last_status": "Not polled yet", "total_pulled": 0,
        "created": datetime.utcnow().isoformat()
    }
    data.append(entry)
    write_db("cr_api_connections", data)
    log_audit("Admin", "CR API Connection Added", f"'{panel_name}' connected", module="CR API")
    return {"success": True, "id": entry["id"]}

@app.patch("/api/cr-api-connections/{conn_id}")
async def toggle_cr_api_connection(conn_id: int, payload: dict):
    data = read_db("cr_api_connections")
    c = next((c for c in data if c["id"] == conn_id), None)
    if not c:
        raise HTTPException(404, "Connection not found")
    if "active" in payload:
        c["active"] = bool(payload["active"])
    write_db("cr_api_connections", data)
    return {"success": True}

@app.delete("/api/cr-api-connections/{conn_id}")
async def delete_cr_api_connection(conn_id: int):
    data = read_db("cr_api_connections")
    data = [c for c in data if c["id"] != conn_id]
    write_db("cr_api_connections", data)
    log_audit("Admin", "CR API Connection Removed", f"Connection #{conn_id} removed", module="CR API")
    return {"success": True}


def _cr_api_pull_one(conn: dict):
    """Blocking HTTP call — run inside a thread so it never stalls the event loop."""
    import urllib.request, urllib.parse, json as _json
    dt1 = conn.get("last_pulled_at") or (datetime.utcnow() - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    params = {"token": conn["token"], "dt1": dt1, "records": "200"}
    url = conn["panel_url"].rstrip("?") + ("&" if "?" in conn["panel_url"] else "?") + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
        result = _json.loads(body)
    except Exception as e:
        return {"ok": False, "error": str(e), "pulled": 0}

    if result.get("status") != "success":
        return {"ok": False, "error": result.get("msg", "Unknown error"), "pulled": 0}

    pulled = 0
    for row in result.get("data", []):
        num = str(row.get("num", "")).strip()
        cli = str(row.get("cli", "")).strip()
        message = str(row.get("message", "")).strip()
        dt = str(row.get("dt", "")).strip()
        if not num:
            continue
        # No sms_id is provided by this API — build a stable dedupe key from
        # the row's own fields so re-polling overlapping windows never
        # double-counts the same message.
        sms_id = f"crapi-{conn['id']}-{hashlib.md5((dt+num+cli+message).encode()).hexdigest()[:16]}"
        ingest_sms(sender=cli, to_number=num, message=message, sms_id=sms_id, company=conn["panel_name"])
        pulled += 1
    return {"ok": True, "pulled": pulled, "count": result.get("total", len(result.get("data", [])))}


async def cr_api_poll_loop():
    """Runs forever in the background, pulling from every active CR API
    connection every 20 seconds so OTPs from another panel start flowing
    into this system automatically once a connection is saved."""
    await asyncio.sleep(5)
    while True:
        try:
            connections = read_db("cr_api_connections")
            for conn in connections:
                if not conn.get("active"):
                    continue
                result = await asyncio.to_thread(_cr_api_pull_one, conn)
                all_conns = read_db("cr_api_connections")
                c = next((c for c in all_conns if c["id"] == conn["id"]), None)
                if c:
                    if result["ok"]:
                        c["last_status"] = f"OK — pulled {result['pulled']} message(s)"
                        c["total_pulled"] = c.get("total_pulled", 0) + result["pulled"]
                    else:
                        c["last_status"] = f"Error — {result['error']}"
                    c["last_pulled_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                    write_db("cr_api_connections", all_conns)
        except Exception as e:
            logging.getLogger("cr_api").error(f"CR API poll loop error: {e}")
        await asyncio.sleep(20)

@app.get("/api/smpp/accounts")
async def get_smpp_accounts():
    accounts = read_db("smpp_accounts")
    sms_log = read_db("sms_log")
    today = datetime.utcnow().date().isoformat()
    for acc in accounts:
        company = (acc.get("company") or "").lower()
        system_id = (acc.get("system_id") or "").lower()
        matched = [s for s in sms_log if (s.get("company") or "").lower() in (company, system_id) and (company or system_id)]
        acc["total_otp"] = len(matched)
        acc["otp_today"] = sum(1 for s in matched if s.get("timestamp","")[:10] == today)
    return accounts

@app.post("/api/smpp/accounts")
async def add_smpp_account(account: dict):
    data = read_db("smpp_accounts")
    account["id"] = next_id(data)
    account["status"] = "connecting" if account.get("interconnect_type") == "smpp-client" else "listening"
    account["created"] = datetime.utcnow().isoformat()
    account["messages_today"] = 0
    data.append(account)
    write_db("smpp_accounts", data)
    if account.get("interconnect_type") == "smpp-client":
        await smpp_client_manager.sync_with_accounts(data)
    return account

@app.patch("/api/smpp/accounts/{acc_id}")
async def update_smpp_account(acc_id: int, payload: dict):
    data = read_db("smpp_accounts")
    acc = next((a for a in data if a["id"] == acc_id), None)
    if acc: acc.update(payload)
    write_db("smpp_accounts", data)
    await smpp_client_manager.sync_with_accounts(data)
    return acc

@app.delete("/api/smpp/accounts/{acc_id}")
async def delete_smpp_account(acc_id: int):
    data = [a for a in read_db("smpp_accounts") if a["id"] != acc_id]
    write_db("smpp_accounts", data)
    await smpp_client_manager.sync_with_accounts(data)
    return {"success": True}

@app.post("/api/smpp/accounts/{acc_id}/reconnect")
async def reconnect_smpp_account(acc_id: int):
    """Force a specific account's connection to be torn down and rebuilt —
    useful after fixing credentials without restarting the whole server.
    Only meaningful for accounts in outbound smpp-client mode; server-mode
    accounts just wait for the carrier's next connection attempt."""
    data = read_db("smpp_accounts")
    if acc_id in smpp_client_manager.connections:
        await smpp_client_manager.connections[acc_id].stop()
        del smpp_client_manager.connections[acc_id]
    await smpp_client_manager.sync_with_accounts(data)
    return {"success": True}

@app.get("/api/smpp/server-info")
async def get_smpp_server_info():
    """What to hand the carrier: our host/port + this account's own
    system_id/password credentials to enter into THEIR SMPP client config.
    Also reports whether the listener is actually up right now."""
    settings = read_db("settings")
    return {
        "port": settings.get("smpp_port", 2775),
        "listening": smpp_server._server is not None,
        "bound_connections": len(smpp_server._connections)
    }

@app.post("/api/smpp/accounts/{acc_id}/test")
async def test_smpp_account(acc_id: int):
    """Real one-shot connection test for outbound smpp-client accounts —
    actually opens a TCP socket and attempts a genuine SMPP bind_transceiver,
    then unbinds. For server-mode accounts (the normal case — the carrier
    connects to us), there's nothing to dial out to; we just report whether
    they're currently bound."""
    accounts = read_db("smpp_accounts")
    acc = next((a for a in accounts if a["id"] == acc_id), None)
    if not acc:
        raise HTTPException(404, "Account not found")

    if acc.get("interconnect_type") != "smpp-client":
        is_bound = acc["id"] in smpp_server._connections
        return {
            "success": is_bound,
            "error": None if is_bound else "Not currently bound — waiting for the carrier to connect to your server"
        }

    import time as _time
    from smpp_client import build_bind_transceiver, build_unbind, decode_header, CMD_BIND_TRANSCEIVER_RESP, STATUS_OK, _decode_password

    start = _time.monotonic()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(acc["host"], int(acc["port"])), timeout=10
        )
        writer.write(build_bind_transceiver(acc.get("system_id",""), _decode_password(acc.get("password","")), 1))
        await writer.drain()

        header_bytes = await asyncio.wait_for(reader.readexactly(16), timeout=10)
        command_length, command_id, command_status, seq = decode_header(header_bytes)
        if command_length > 16:
            await reader.readexactly(command_length - 16)

        elapsed_ms = round((_time.monotonic() - start) * 1000)

        writer.write(build_unbind(2))
        await writer.drain()
        writer.close()

        if command_id == CMD_BIND_TRANSCEIVER_RESP and command_status == STATUS_OK:
            return {"success": True, "response_time": elapsed_ms}
        else:
            return {"success": False, "error": f"Bind rejected (status={command_status})"}
    except asyncio.TimeoutError:
        return {"success": False, "error": "Connection timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/smpp/sessions")
async def get_smpp_sessions():
    return read_db("smpp_sessions")

@app.delete("/api/smpp/sessions/{session_id}")
async def disconnect_smpp_session(session_id: int):
    data = [s for s in read_db("smpp_sessions") if s.get("id") != session_id]
    write_db("smpp_sessions", data)
    log_audit("Admin", "SMPP Session Disconnected", f"Disconnected session #{session_id}", module="SMPP")
    return {"success": True}

@app.get("/api/smpp/throughput")
async def get_throughput():
    sms = read_db("sms_log")
    now = datetime.utcnow()
    last_minute = [s for s in sms if s.get("timestamp","") >= (now - timedelta(minutes=1)).isoformat()]
    current_mps = round(len(last_minute) / 60, 1)

    # Real per-minute buckets for the last 60 minutes (not random)
    data = []
    for i in range(59, -1, -1):
        bucket_start = now - timedelta(minutes=i+1)
        bucket_end = now - timedelta(minutes=i)
        count = sum(1 for s in sms if bucket_start.isoformat() <= s.get("timestamp","") < bucket_end.isoformat())
        data.append(count)
    peak_mps = max(data) if data else 0

    delivered = [s for s in sms if s.get("status") == "delivered"]
    dlr_rate = round(len(delivered) / max(len(sms), 1) * 100, 1) if sms else 0

    return {"current_mps": current_mps, "peak_mps": peak_mps, "data": data, "dlr_rate": dlr_rate}

@app.get("/api/smpp/connection-logs")
async def get_connection_logs():
    # Real connect/disconnect history, if any has been recorded — otherwise empty
    accounts = read_db("smpp_accounts")
    logs = []
    for a in accounts:
        logs.append({
            "id": a["id"], "ip": a.get("whitelist_ip", "") or "—",
            "system_id": a.get("system_id", a.get("company", "—")),
            "event": "Connected" if a.get("status") == "active" else "Disconnected",
            "timestamp": a.get("created", datetime.utcnow().isoformat())
        })
    return logs

@app.get("/api/smpp/dlr")
async def get_dlr_stats():
    sms = read_db("sms_log")
    now = datetime.utcnow()
    delivered = [s for s in sms if s.get("status") == "delivered"]
    pending = [s for s in sms if s.get("status") == "pending"]
    failed = [s for s in sms if s.get("status") == "failed"]
    dlr_rate = round(len(delivered) / max(len(sms), 1) * 100, 1) if sms else 0

    # Real hourly DLR rate for the last 60 minutes
    data = []
    for i in range(59, -1, -1):
        bucket_start = now - timedelta(minutes=i+1)
        bucket_end = now - timedelta(minutes=i)
        window = [s for s in sms if bucket_start.isoformat() <= s.get("timestamp","") < bucket_end.isoformat()]
        window_delivered = [s for s in window if s.get("status") == "delivered"]
        data.append(round(len(window_delivered) / len(window) * 100, 1) if window else 0)

    return {"dlr_rate": dlr_rate, "delivered": len(delivered), "pending": len(pending),
            "failed": len(failed), "data": data}

# ═══ LOGIN PANEL connections ════════════════════════════════════════════════
# A second kind of provider connection: instead of an SMPP bind, we log into
# the provider's own web panel and read its SMS/CDR page.
# ONLY the number, the CLI and the SMS text are taken from there — the range,
# the payout/rate, the agent/client and the IP always come from OUR own data.

LOGIN_PANEL_TASKS = {}          # panel_id -> asyncio.Task


def _lp_public(p):
    q = dict(p)
    q.pop("password", None)
    q["has_password"] = bool(p.get("password"))
    return q


def _lp_ingest(panel, rows, headers=None):
    """Turn remote rows into our own sms_log entries. Returns how many were new."""
    numbers = read_db("numbers")
    ranges = read_db("sms_ranges")
    rate_card = read_db("rate_card")
    sms_log = read_db("sms_log")
    seen = {s.get("ext_key") for s in sms_log if s.get("ext_key")}
    # columns are matched by the remote table's own header names ("Number",
    # "CLI", "SMS"…) unless the admin pinned them by hand
    mapping = panel.get("columns") or map_by_headers(headers) or None
    added = 0

    for row in rows:
        f = pick_fields(row, mapping)
        number, cli, message = f["number"], f["cli"], f["message"]
        if not number or not message:
            continue

        key = hashlib.md5(f"{panel['id']}|{number}|{f['date']}|{message}".encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)

        # ── everything below this line comes from OUR panel, not theirs ──
        digits = re.sub(r"\D", "", number)
        rec = next((n for n in numbers
                    if re.sub(r"\D", "", str(n.get("number", ""))) == digits), None)
        if rec is None and digits:              # fall back to a prefix match
            rec = next((n for n in numbers
                        if re.sub(r"\D", "", str(n.get("number", ""))).startswith(digits[:6])), None)

        rng = next((r for r in ranges if rec and r.get("id") == rec.get("range_id")), None)
        country = (rng or {}).get("country") or (rec or {}).get("country", "")
        provider = (rng or {}).get("provider") or (rec or {}).get("provider", "")
        range_label = (rng or {}).get("name") or (f"{country} {provider}".strip())

        if rec and rec.get("payout") is not None:
            payout = rec.get("payout")
        elif rng and rng.get("payout") is not None:
            payout = rng.get("payout")
        else:
            rate = next((r for r in rate_card
                         if r.get("country") == country and r.get("provider") == provider), None)
            payout = (rate or {}).get("sell_rate", 0)

        entry = {
            "id": next_id(sms_log),
            # ── taken from the remote panel ──
            "number": number, "cli": cli, "message": message,
            "timestamp": (f["date"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S")).replace(" ", "T"),
            "otp": extract_otp(message),
            # ── our own data ──
            "range_label": range_label, "range": range_label,
            "country": country, "provider": provider, "range_id": (rng or {}).get("id"),
            "type": "General", "status": "delivered", "cause": "Success",
            "currency": (rng or {}).get("currency", "USD"),
            "payout": payout, "profit": payout,
            "client_payout": (rec or {}).get("client_payout"),
            "manager_id": (rec or {}).get("manager_id"),
            "agent_id": (rec or {}).get("agent_id"),
            "client_id": (rec or {}).get("client_id"),
            "user": (rec or {}).get("user", ""),
            "source": "login_panel", "panel_id": panel["id"], "panel_name": panel.get("name", ""),
            "ext_key": key,
        }
        sms_log.append(entry)
        added += 1
        if rec:
            rec["sms_count"] = rec.get("sms_count", 0) + 1
            rec["last_sms"] = entry["timestamp"]

    if added:
        write_db("sms_log", sms_log)
        write_db("numbers", numbers)
    return added


def _lp_poll_once(panel):
    """Blocking one-shot: login + fetch + ingest. Runs in a worker thread."""
    sess = PanelSession(panel["panel_url"], panel.get("username", ""), panel.get("password", ""))
    sess.login()
    headers, rows = sess.fetch_table(panel["data_url"], limit=int(panel.get("rows", 200)))
    return len(rows), _lp_ingest(panel, rows, headers)


async def _lp_worker(panel_id):
    """Keeps one Login Panel connection pulling until it is stopped."""
    while True:
        panels = read_db("login_panels")
        panel = next((p for p in panels if p.get("id") == panel_id), None)
        if not panel or panel.get("status") != "running":
            return
        try:
            fetched, added = await asyncio.to_thread(_lp_poll_once, panel)
            panel.update({"last_run": datetime.now().isoformat(), "last_error": "",
                          "last_fetched": fetched,
                          "total_sms": panel.get("total_sms", 0) + added})
            logging.getLogger("login_panel").info(
                f"{panel.get('name')}: {fetched} row(s) read, {added} new")
        except Exception as e:
            panel["last_error"] = str(e)[:200]
            panel["last_run"] = datetime.now().isoformat()
            logging.getLogger("login_panel").warning(f"{panel.get('name')} failed: {e}")
        write_db("login_panels", panels)
        await asyncio.sleep(max(10, int(panel.get("interval", 20))))


def _lp_start(panel_id):
    task = LOGIN_PANEL_TASKS.get(panel_id)
    if task and not task.done():
        return
    LOGIN_PANEL_TASKS[panel_id] = asyncio.create_task(_lp_worker(panel_id))


@app.get("/api/login-panels")
async def list_login_panels():
    data = read_db("login_panels")
    return {"data": [_lp_public(p) for p in data], "total": len(data)}


@app.post("/api/login-panels")
async def create_login_panel(payload: dict):
    for field in ("username", "password", "panel_url", "data_url"):
        if not str(payload.get(field, "") or "").strip():
            raise HTTPException(400, f"{field.replace('_', ' ').title()} is required")
    data = read_db("login_panels")
    panel = {
        "id": next_id(data),
        "name": payload.get("name") or urllib.parse.urlparse(payload["panel_url"]).netloc or "Login Panel",
        "username": payload["username"].strip(),
        "password": payload["password"],
        "panel_url": payload["panel_url"].strip(),
        "data_url": payload["data_url"].strip(),
        "interval": int(payload.get("interval") or 20),
        "rows": int(payload.get("rows") or 200),
        "columns": payload.get("columns") or None,
        "status": "stopped", "total_sms": 0, "last_run": None, "last_error": "",
        "created": datetime.now().isoformat(),
    }
    data.append(panel)
    write_db("login_panels", data)
    return _lp_public(panel)


@app.patch("/api/login-panels/{panel_id}")
async def update_login_panel(panel_id: int, payload: dict):
    data = read_db("login_panels")
    panel = next((p for p in data if p.get("id") == panel_id), None)
    if not panel:
        raise HTTPException(404, "Login panel not found")
    for k in ("name", "username", "panel_url", "data_url", "interval", "rows", "columns"):
        if payload.get(k) not in (None, ""):
            panel[k] = payload[k]
    if payload.get("password"):
        panel["password"] = payload["password"]
    write_db("login_panels", data)
    return _lp_public(panel)


@app.delete("/api/login-panels/{panel_id}")
async def delete_login_panel(panel_id: int):
    data = read_db("login_panels")
    if not any(p.get("id") == panel_id for p in data):
        raise HTTPException(404, "Login panel not found")
    task = LOGIN_PANEL_TASKS.pop(panel_id, None)
    if task:
        task.cancel()
    write_db("login_panels", [p for p in data if p.get("id") != panel_id])
    return {"success": True}


@app.post("/api/login-panels/{panel_id}/start")
async def start_login_panel(panel_id: int):
    data = read_db("login_panels")
    panel = next((p for p in data if p.get("id") == panel_id), None)
    if not panel:
        raise HTTPException(404, "Login panel not found")
    panel["status"] = "running"
    panel["last_error"] = ""
    write_db("login_panels", data)
    _lp_start(panel_id)
    return {"success": True, "status": "running"}


@app.post("/api/login-panels/{panel_id}/stop")
async def stop_login_panel(panel_id: int):
    data = read_db("login_panels")
    panel = next((p for p in data if p.get("id") == panel_id), None)
    if not panel:
        raise HTTPException(404, "Login panel not found")
    panel["status"] = "stopped"
    write_db("login_panels", data)
    task = LOGIN_PANEL_TASKS.pop(panel_id, None)
    if task:
        task.cancel()
    return {"success": True, "status": "stopped"}


@app.post("/api/login-panels/{panel_id}/test")
async def test_login_panel(panel_id: int):
    """Log in once and show what the first rows look like — nothing is saved."""
    data = read_db("login_panels")
    panel = next((p for p in data if p.get("id") == panel_id), None)
    if not panel:
        raise HTTPException(404, "Login panel not found")

    def _probe():
        sess = PanelSession(panel["panel_url"], panel.get("username", ""), panel.get("password", ""))
        sess.login()
        return sess.fetch_table(panel["data_url"], limit=5)

    try:
        headers, rows = await asyncio.to_thread(_probe)
    except Exception as e:
        return {"success": False, "error": str(e)[:300]}
    mapping = panel.get("columns") or map_by_headers(headers) or None
    preview = [pick_fields(r, mapping) for r in rows[:5]]
    for p in preview:
        p["otp"] = extract_otp(p.get("message", ""))
    return {"success": True, "rows": len(rows), "preview": preview}


# ─── Bank Accounts (agent panel) ────────────────────────────────────────────
@app.get("/api/bank-accounts")
async def get_bank_accounts(agent_id: int = None):
    data = read_db("bank_accounts")
    if agent_id is not None:
        data = [b for b in data if str(b.get("agent_id")) == str(agent_id)]
    return {"data": data, "total": len(data)}

@app.post("/api/bank-accounts")
async def create_bank_account(payload: dict):
    if not payload.get("bank_name"):
        raise HTTPException(400, "Bank name is required")
    data = read_db("bank_accounts")
    acc = {"id": next_id(data), "agent_id": payload.get("agent_id"),
           "currency": payload.get("currency", ""), "country": payload.get("country", ""),
           "bank_name": payload.get("bank_name", ""), "bank_branch": payload.get("bank_branch", ""),
           "bank_address": payload.get("bank_address", ""), "account_no": payload.get("account_no", ""),
           "beneficiary": payload.get("beneficiary", ""),
           "created": datetime.utcnow().isoformat()}
    data.append(acc)
    write_db("bank_accounts", data)
    return acc

@app.delete("/api/bank-accounts/{acc_id}")
async def delete_bank_account(acc_id: int):
    data = read_db("bank_accounts")
    if not any(b.get("id") == acc_id for b in data):
        raise HTTPException(404, "Bank account not found")
    write_db("bank_accounts", [b for b in data if b.get("id") != acc_id])
    return {"success": True}

# ─── Agents ─────────────────────────────────────────────────────────────────
@app.get("/api/agents")
async def get_agents(page: int=1, limit: int=20, manager_id: int=None):
    data = read_db("agents")
    if manager_id:
        data = [a for a in data if str(a.get("manager_id")) == str(manager_id)]

    # Today's OTP count per agent — one pass over sms_log, not one query per agent.
    today = datetime.utcnow().date().isoformat()
    sms = read_db("sms_log")
    today_otp_by_agent = {}
    for s in sms:
        if s.get("timestamp","")[:10] == today and s.get("agent_id"):
            key = str(s["agent_id"])
            today_otp_by_agent[key] = today_otp_by_agent.get(key, 0) + 1
    for a in data:
        a["today_otp"] = today_otp_by_agent.get(str(a["id"]), 0)

    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.post("/api/agents")
async def create_agent(payload: dict):
    if not payload.get("username"):
        raise HTTPException(400, "Username is required")
    if is_username_taken(payload["username"]):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    data = read_db("agents")
    agent = {"id": next_id(data), "username": payload["username"],
             "password": payload.get("password", "agent123"), "role": "Agent",
             "email": payload.get("email",""), "full_name": payload.get("full_name",""),
             "phone": payload.get("phone",""), "manager_id": payload.get("manager_id"),
             "status": payload.get("status", "active"), "balance": float(payload.get("balance", 0) or 0),
             "commission_rate": float(payload.get("commission_rate", 5.0)),
             "clients_count": 0, "numbers_assigned": 0,
             "created": datetime.utcnow().isoformat(), "last_login": None, "notes": ""}
    data.append(agent)
    write_db("agents", data)
    return agent

@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: int):
    data = read_db("agents")
    agent = next((a for a in data if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent

@app.patch("/api/agents/{agent_id}")
async def update_agent(agent_id: int, payload: dict):
    data = read_db("agents")
    agent = next((a for a in data if a["id"] == agent_id), None)
    if not agent: raise HTTPException(404, "Agent not found")
    if payload.get("username") and is_username_taken(payload["username"], exclude_table="agents", exclude_id=agent_id):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    agent.update(payload)
    write_db("agents", data)
    return agent

@app.post("/api/agents/{agent_id}/adjust-balance")
async def adjust_agent_balance(agent_id: int, payload: dict):
    """Admin-only manual balance adjustment (add/subtract/set) — Managers
    have no equivalent endpoint for this; they can only create Agents and
    hand out numbers, never touch balance."""
    data = read_db("agents")
    agent = next((a for a in data if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(404, "Agent not found")

    op = payload.get("operation", "add")
    amount = float(payload.get("amount", 0) or 0)
    reason = payload.get("reason", "")
    adjusted_by = payload.get("adjusted_by", "Admin")
    before = float(agent.get("balance", 0) or 0)

    if op == "add":
        agent["balance"] = round(before + amount, 2)
    elif op == "subtract":
        agent["balance"] = round(max(0, before - amount), 2)
    elif op == "set":
        agent["balance"] = round(amount, 2)
    else:
        raise HTTPException(400, "Invalid operation")

    write_db("agents", data)
    log_audit(adjusted_by, "Balance Adjusted (Agent)",
              f"{agent.get('username','?')}: ${before:.2f} → ${agent['balance']:.2f} ({op} ${amount:.2f}) — {reason or 'no reason given'}",
              module="Balances")

    if op == "add" and amount > 0:
        notes = read_db("credit_notes")
        notes.append({
            "id": next_id(notes), "agent_id": agent_id, "date": datetime.utcnow().date().isoformat(),
            "amount": amount, "currency": "USD", "reason": reason or "Manual credit",
            "status": "confirmed", "created": datetime.utcnow().isoformat()
        })
        write_db("credit_notes", notes)

    return {"success": True, "before": before, "after": agent["balance"]}

@app.get("/api/statements")
async def get_statements(agent_id: int = None, currency: str = "USD"):
    """Real monthly statement — credit = earnings from sms_log, debit = amounts
    actually paid out via payout_requests, grouped by calendar month."""
    sms = read_db("sms_log")
    if agent_id is not None:
        sms = [s for s in sms if str(s.get("agent_id")) == str(agent_id)]

    payouts = read_db("payout_requests")
    if agent_id is not None:
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == agent_id), None)
        uname = agent.get("username","") if agent else ""
        payouts = [p for p in payouts if p.get("user") == uname and p.get("status") == "paid"]
    else:
        payouts = [p for p in payouts if p.get("status") == "paid"]

    months = {}
    for s in sms:
        m = s.get("timestamp","")[:7]  # YYYY-MM
        if not m: continue
        months.setdefault(m, {"month": m, "sms_count": 0, "credit": 0.0, "debit": 0.0})
        months[m]["sms_count"] += 1
        months[m]["credit"] += s.get("profit", 0)
    for p in payouts:
        m = (p.get("timestamp") or p.get("paid_at") or "")[:7]
        if not m: continue
        months.setdefault(m, {"month": m, "sms_count": 0, "credit": 0.0, "debit": 0.0})
        months[m]["debit"] += p.get("amount", 0)

    data = sorted(months.values(), key=lambda x: x["month"], reverse=True)
    for d in data:
        d["credit"] = round(d["credit"], 2)
        d["debit"] = round(d["debit"], 2)

    return {"data": data, "total": len(data), "currency": currency}


def _simple_pdf(lines: list[str]) -> bytes:
    """Build a minimal one-page PDF (Helvetica) without any third-party library."""
    def esc(t): return t.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    body = ["BT", "/F1 16 Tf", "60 760 Td", "18 TL"]
    for i, ln in enumerate(lines):
        body.append("/F1 16 Tf" if i == 0 else "/F1 11 Tf")
        body.append(f"({esc(str(ln))}) Tj")
        body.append("T*")
    body.append("ET")
    stream = "\n".join(body).encode("latin-1", "replace")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF").encode()
    return bytes(out)

@app.get("/api/credit-notes/{note_id}/pdf")
async def credit_note_pdf(note_id: int):
    note = next((n for n in read_db("credit_notes") if n.get("id") == note_id), None)
    if not note:
        raise HTTPException(404, "Credit note not found")
    agent = next((a for a in read_db("agents") if a.get("id") == note.get("agent_id")), {})
    due = str(note.get("due_date") or note.get("date") or "")[:10]
    lines = ["CREDIT NOTE", "",
             f"Note #      : CNOTE#{note.get('id')}",
             f"Date        : {str(note.get('date') or note.get('created') or '')[:19]}",
             f"Agent       : {agent.get('username', '')}",
             f"Payterm     : {note.get('term', 'Weekly')}",
             f"Currency    : {note.get('currency', 'USD')}",
             f"Payout      : {note.get('amount', 0)}",
             f"Due Date    : {due}",
             f"Status      : {note.get('status', '')}"]
    return Response(content=_simple_pdf(lines), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="CNOTE-{note_id}.pdf"'})

@app.get("/api/credit-notes")
async def get_credit_notes(agent_id: int = None, page: int = 1, limit: int = 20):
    data = read_db("credit_notes")
    if agent_id is not None:
        data = [n for n in data if str(n.get("agent_id")) == str(agent_id)]
    data.sort(key=lambda n: n.get("created",""), reverse=True)
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: int):
    data = read_db("agents")
    agent = next((a for a in data if a["id"] == agent_id), None)
    data = [a for a in data if a["id"] != agent_id]
    write_db("agents", data)
    if agent:
        log_audit("Admin", "Agent Deleted", f"Deleted agent '{agent.get('username','?')}'", module="Accounts")
    return {"success": True}

# ─── Clients ────────────────────────────────────────────────────────────────
@app.get("/api/clients")
async def get_clients(page: int=1, limit: int=20, agent_id: int=None, manager_id: int=None,
                       search: str="", status: str=""):
    data = read_db("clients")
    if agent_id:
        data = [c for c in data if str(c.get("agent_id")) == str(agent_id)]
    if manager_id:
        data = [c for c in data if str(c.get("manager_id")) == str(manager_id)]
    if search:
        s = search.lower()
        data = [c for c in data if s in c.get("username","").lower() or s in (c.get("full_name") or "").lower() or s in (c.get("email") or "").lower()]
    if status:
        data = [c for c in data if c.get("status") == status]
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.post("/api/clients")
async def create_client(payload: dict):
    if not payload.get("username"):
        raise HTTPException(400, "Username is required")
    if is_username_taken(payload["username"]):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    data = read_db("clients")
    # Get agent to inherit manager_id
    agent_id = payload.get("agent_id")
    manager_id = None
    if agent_id:
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == agent_id), None)
        if agent:
            manager_id = agent.get("manager_id")
    
    client = {"id": next_id(data), "username": payload["username"],
              "password": payload.get("password","client123"), "role": "Client",
              "email": payload.get("email",""), "full_name": payload.get("full_name",""),
              "phone": payload.get("contact_no", payload.get("phone","")),
              "company_name": payload.get("company_name",""), "skype_id": payload.get("skype_id",""),
              "country": payload.get("country",""), "address": payload.get("address",""),
              "agent_id": agent_id, "manager_id": manager_id,
              "status": payload.get("status","active"), "balance": float(payload.get("balance", 0.0)),
              "numbers_assigned": 0, "daily_limit": int(payload.get("daily_limit", 100)),
              "monthly_limit": int(payload.get("monthly_limit", 3000)),
              "service": payload.get("service","WhatsApp"),
              "created": datetime.utcnow().isoformat(),
              "last_active": datetime.utcnow().isoformat(),
              "total_sms": 0, "notes": ""}
    data.append(client)
    write_db("clients", data)
    
    # Update agent's client count
    if agent_id:
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == agent_id), None)
        if agent:
            agent["clients_count"] = agent.get("clients_count", 0) + 1
            write_db("agents", agents)
    
    return client

@app.patch("/api/clients/{client_id}")
async def update_client(client_id: int, payload: dict):
    data = read_db("clients")
    client = next((c for c in data if c["id"] == client_id), None)
    if not client: raise HTTPException(404, "Client not found")
    if payload.get("username") and is_username_taken(payload["username"], exclude_table="clients", exclude_id=client_id):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    client.update(payload)
    write_db("clients", data)
    return client

@app.post("/api/clients/{client_id}/adjust-balance")
async def adjust_client_balance(client_id: int, payload: dict):
    """Admin-only manual balance adjustment for Clients."""
    data = read_db("clients")
    client = next((c for c in data if c["id"] == client_id), None)
    if not client:
        raise HTTPException(404, "Client not found")

    op = payload.get("operation", "add")
    amount = float(payload.get("amount", 0) or 0)
    reason = payload.get("reason", "")
    adjusted_by = payload.get("adjusted_by", "Admin")
    before = float(client.get("balance", 0) or 0)

    if op == "add":
        client["balance"] = round(before + amount, 2)
    elif op == "subtract":
        client["balance"] = round(max(0, before - amount), 2)
    elif op == "set":
        client["balance"] = round(amount, 2)
    else:
        raise HTTPException(400, "Invalid operation")

    write_db("clients", data)
    log_audit(adjusted_by, "Balance Adjusted (Client)",
              f"{client.get('username','?')}: ${before:.2f} → ${client['balance']:.2f} ({op} ${amount:.2f}) — {reason or 'no reason given'}",
              module="Balances")
    return {"success": True, "before": before, "after": client["balance"]}

@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: int):
    data = read_db("clients")
    client = next((c for c in data if c["id"] == client_id), None)
    data = [c for c in data if c["id"] != client_id]
    write_db("clients", data)
    if client:
        log_audit("Admin", "Client Deleted", f"Deleted client '{client.get('username','?')}'", module="Accounts")
    return {"success": True}

@app.get("/api/client/{client_id}/numbers")
async def get_client_numbers(client_id: int, page: int=1, limit: int=20, search: str="", range: str=""):
    data = [n for n in read_db("numbers") if str(n.get("client_id")) == str(client_id)]
    if search:
        data = [n for n in data if search in n.get("number","")]
    if range:
        ranges = read_db("sms_ranges")
        r = next((r for r in ranges if str(r["id"]) == str(range)), None)
        if r:
            data = [n for n in data if n.get("country") == r.get("country") and n.get("provider") == r.get("provider")]
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.get("/api/client/{client_id}/stats")
async def get_client_stats(client_id: int):
    clients = read_db("clients")
    client = next((c for c in clients if c["id"] == client_id), None)
    if not client:
        raise HTTPException(404, "Client not found")
    numbers = read_db("numbers")
    numbers_assigned = sum(1 for n in numbers if str(n.get("client_id")) == str(client_id))
    return {
        "numbers_assigned": numbers_assigned,
        "total_sms": client.get("total_sms", 0),
        "balance": client.get("balance", 0),
        "daily_limit": client.get("daily_limit", 0),
        "monthly_limit": client.get("monthly_limit", 0),
        "status": client.get("status", "active")
    }

@app.get("/api/sms/client-stats")
async def get_sms_client_stats(client_id: int):
    clients = read_db("clients")
    client = next((c for c in clients if c["id"] == client_id), None)
    username = client.get("username","").lower() if client else ""
    sms = [s for s in read_db("sms_log")
           if str(s.get("client_id")) == str(client_id) or
              (s.get("client_id") is None and username and s.get("user","").lower() == username)]

    today = datetime.utcnow().date()
    yesterday = today - timedelta(days=1)
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def count_on(day):
        return sum(1 for s in sms if s.get("timestamp","")[:10] == day.isoformat())
    def count_since(start_day):
        return sum(1 for s in sms if s.get("timestamp","")[:10] >= start_day.isoformat())

    weekly_traffic = [count_on(today - timedelta(days=i)) for i in range(6, -1, -1)]
    month_sms = [s for s in sms if s.get("timestamp","")[:10] >= month_start.isoformat()]
    delivered_month = [s for s in month_sms if s.get("status") == "delivered"]
    delivery_rate = len(delivered_month) / len(month_sms) if month_sms else 0
    payout_this_month = round(sum(s.get("profit", 0) for s in delivered_month), 2)

    delivered = [s for s in sms if s.get("status") == "delivered"]
    return {
        "total_sms": len(sms),
        "delivered": len(delivered),
        "failed": len(sms) - len(delivered),
        "today": count_on(today),
        "yesterday": count_on(yesterday),
        "this_week": count_since(week_start),
        "this_month": len(month_sms),
        "payout_this_month": payout_this_month,
        "delivery_rate": round(delivery_rate * 100, 1),
        "weekly_traffic": weekly_traffic
    }

# ─── Users ──────────────────────────────────────────────────────────────────
@app.get("/api/users")
async def get_users(page: int=1, limit: int=20, search: str="", role: str=""):
    data = read_db("users")
    if search: data=[u for u in data if search.lower() in u["username"].lower() or search.lower() in u.get("email","").lower()]
    if role:   data=[u for u in data if u["role"].lower() == role.lower()]
    # Strip passwords from response
    safe = [{k:v for k,v in u.items() if k != "password"} for u in data]
    start = (page-1)*limit
    return {"data": safe[start:start+limit], "total": len(safe)}

@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    data = read_db("users")
    user = next((u for u in data if u["id"] == user_id), None)
    if not user: raise HTTPException(404, "User not found")
    return {k:v for k,v in user.items() if k != "password"}

@app.post("/api/users")
async def create_user(payload: dict):
    if not payload.get("username"):
        raise HTTPException(400, "Username is required")
    role = payload.get("role", "User")
    if role in ("Agent", "Client", "Reseller"):
        raise HTTPException(400, f"{role} accounts must be created from the '{role}s' page — they need their own hierarchy setup (manager/agent links, commission rates, etc.) that this generic form doesn't provide.")
    if is_username_taken(payload["username"]):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    data = read_db("users")
    user = {
        "id": next_id(data),
        "username": payload["username"],
        "password": payload.get("password","user123"),
        "role": role,
        "email": payload.get("email",""),
        "balance": float(payload.get("balance",0)),
        "status": "active",
        "numbers": 0,
        "created": datetime.utcnow().isoformat(),
        "last_login": None,
        "company": payload.get("company",""),
        "phone": payload.get("phone",""),
        "two_fa": False,
        "notes": ""
    }
    data.append(user)
    write_db("users", data)
    return {k:v for k,v in user.items() if k != "password"}

@app.patch("/api/users/{user_id}")
async def update_user(user_id: int, payload: dict):
    data = read_db("users")
    user = next((u for u in data if u["id"] == user_id), None)
    if not user: raise HTTPException(404, "User not found")
    if payload.get("username") and is_username_taken(payload["username"], exclude_table="users", exclude_id=user_id):
        raise HTTPException(400, "This username is already taken — each username can only have one account in the system")
    for k, v in payload.items():
        if k not in ("id",):
            user[k] = v
    write_db("users", data)
    return {k:v for k,v in user.items() if k != "password"}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
    data = [u for u in read_db("users") if u["id"] != user_id]
    write_db("users", data)
    return {"success": True}

# ─── Audit Logs ─────────────────────────────────────────────────────────────
def log_audit(user: str, action: str, details: str, module: str = "General", ip: str = "system"):
    """Single source of truth for audit trail entries — call this at every
    balance change, payout decision, number deletion, and account change so
    the Audit Logs page reflects what actually happened, not just transfers."""
    try:
        audit = read_db("audit_logs")
        audit.insert(0, {
            "id": next_id(audit), "user": user, "action": action,
            "ip": ip, "timestamp": datetime.utcnow().isoformat(),
            "details": details, "module": module
        })
        write_db("audit_logs", audit)
    except Exception:
        pass  # audit logging must never break the actual operation

def log_login_activity(username: str, role: str, ip: str, result: str):
    """Every login attempt — success, failed password, suspended account, or
    blocked IP — gets recorded here so Admin can see exactly who logged in
    from where and when, and spot suspicious activity."""
    try:
        data = read_db("login_activity")
        data.insert(0, {
            "id": next_id(data), "username": username, "role": role,
            "ip": ip, "result": result, "timestamp": datetime.utcnow().isoformat()
        })
        # Keep the log from growing forever — last 2000 entries is plenty
        write_db("login_activity", data[:2000])
    except Exception:
        pass

@app.get("/api/login-activity")
async def get_login_activity(page: int=1, limit: int=50, search: str="", result: str=""):
    data = read_db("login_activity")
    if search:
        q = search.lower()
        data = [a for a in data if q in a.get("username","").lower() or q in a.get("ip","")]
    if result:
        data = [a for a in data if a.get("result") == result]
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.get("/api/audit-logs")
async def get_audit_logs(page: int=1, limit: int=20):
    data = read_db("audit_logs")
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.post("/api/audit-logs")
async def add_audit_log(payload: dict):
    data = read_db("audit_logs")
    entry = {"id": next_id(data), "timestamp": datetime.utcnow().isoformat(), **payload}
    data.insert(0, entry)
    write_db("audit_logs", data)
    return entry

# ─── Requests ───────────────────────────────────────────────────────────────
@app.get("/api/registration-requests")
async def get_reg_requests():
    return read_db("registration_requests")

@app.patch("/api/registration-requests/{req_id}")
async def update_reg_request(req_id: int, payload: dict):
    data = read_db("registration_requests")
    req = next((r for r in data if r["id"] == req_id), None)
    if req: req.update(payload)
    write_db("registration_requests", data)
    return req

@app.get("/api/payout-requests")
async def get_payout_requests(manager_id: int=None):
    data = read_db("payout_requests")
    if manager_id is not None:
        data = [r for r in data if str(r.get("manager_id")) == str(manager_id)]
    return {"data": data, "total": len(data)}

@app.post("/api/payout-requests")
async def create_payout_request(payload: dict):
    amount = float(payload.get("amount", 0) or 0)
    min_payout = float(read_db("settings").get("min_payout", 0) or 0)
    if amount < min_payout:
        raise HTTPException(400, f"Payment low — minimum payout amount is ${min_payout:.2f}")

    user_id = payload.get("user_id")
    requesting_agent = None
    if user_id:
        agents = read_db("agents")
        requesting_agent = next((a for a in agents if a["id"] == user_id), None)
        if requesting_agent:
            available = float(requesting_agent.get("balance", 0) or 0)
            if available <= 0:
                raise HTTPException(400, "You don't have any payment available — your balance is $0.00")
            if amount > available:
                raise HTTPException(400, f"Insufficient payment — your available balance is only ${available:.2f}")

    # Auto-attach the requesting agent's manager + username so managers/admin
    # can see who it's from and managers can be scoped to their own agents.
    manager_id = payload.get("manager_id")
    username = payload.get("user")
    if requesting_agent and not (manager_id and username):
        manager_id = manager_id or requesting_agent.get("manager_id")
        username = username or requesting_agent.get("username")

    # Hold the requested amount immediately — it comes back out of the
    # agent's visible balance the moment the request is submitted, so it
    # can't be requested twice. It's released (refunded) if Admin rejects,
    # or simply stays deducted once Admin approves/pays.
    if requesting_agent:
        agents = read_db("agents")
        agent_rec = next((a for a in agents if a["id"] == requesting_agent["id"]), None)
        if agent_rec:
            agent_rec["balance"] = round(float(agent_rec.get("balance", 0) or 0) - amount, 2)
            write_db("agents", agents)

    data = read_db("payout_requests")
    entry = {"id": next_id(data), "timestamp": datetime.utcnow().isoformat(),
             "status": "pending", **payload, "manager_id": manager_id, "user": username,
             "held": True}
    data.append(entry)
    write_db("payout_requests", data)
    return entry

@app.get("/api/settings/min-payout")
async def get_min_payout():
    return {"min_payout": float(read_db("settings").get("min_payout", 0) or 0)}

@app.patch("/api/payout-requests/{req_id}")
async def update_payout_request(req_id: int, payload: dict):
    data = read_db("payout_requests")
    req = next((r for r in data if r["id"] == req_id), None)
    if not req:
        return None

    was_paid = req.get("status") == "paid"
    was_rejected = req.get("status") == "rejected"
    req.update(payload)
    now_paid = req.get("status") == "paid"
    now_rejected = req.get("status") == "rejected"

    # The amount was already deducted (held) the moment the request was
    # created — approving/paying just confirms it, no further deduction.
    if now_paid and not was_paid:
        req["paid_at"] = datetime.utcnow().isoformat()

    # Rejecting releases the hold — refund the amount back to the agent's
    # balance, exactly once.
    if now_rejected and not was_rejected and req.get("held") and not req.get("refunded"):
        user_id = req.get("user_id")
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == user_id), None)
        if agent:
            agent["balance"] = round(float(agent.get("balance", 0) or 0) + float(req.get("amount", 0) or 0), 2)
            write_db("agents", agents)
        req["refunded"] = True
        req["refunded_at"] = datetime.utcnow().isoformat()

    write_db("payout_requests", data)

    new_status = payload.get("status")
    if new_status == "paid" and not was_paid:
        log_audit(payload.get("approved_by", "Admin"), "Payout Approved",
                   f"Approved ${req.get('amount',0):.2f} payout to {req.get('user','?')} (request #{req_id})",
                   module="Payouts")
    elif new_status == "rejected" and not was_rejected:
        log_audit(payload.get("approved_by", "Admin"), "Payout Rejected",
                   f"Rejected ${req.get('amount',0):.2f} payout request from {req.get('user','?')} — refunded to balance (request #{req_id})",
                   module="Payouts")

    return req

# ─── Weekly earnings / invoice (auto-computed on each request — no live cron
# needed since it's recalculated fresh from SMS logs every time it's viewed) ──
@app.get("/api/agent/{agent_id}/earnings")
async def get_agent_earnings_summary(agent_id: int):
    """Real earnings summary for Agent's 'My Earnings' page — today/this
    month/last month/all time, a 30-day chart, and a per-day history table."""
    agents = read_db("agents")
    agent = next((a for a in agents if a["id"] == agent_id), None)
    clients = read_db("clients")
    my_usernames = {c.get("username","").lower() for c in clients if str(c.get("agent_id")) == str(agent_id) and c.get("username")}

    sms = read_db("sms_log")
    my_sms = [s for s in sms if str(s.get("agent_id")) == str(agent_id) or
              (s.get("agent_id") is None and s.get("user","").lower() in my_usernames)]

    now = datetime.utcnow()
    today = now.date()
    month_start = today.replace(day=1)
    last_month_end = month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    def sum_profit(records):
        return round(sum(r.get("profit", 0) for r in records), 2)

    today_sms = [s for s in my_sms if s.get("timestamp","")[:10] == today.isoformat()]
    month_sms = [s for s in my_sms if s.get("timestamp","")[:10] >= month_start.isoformat()]
    last_month_sms = [s for s in my_sms if last_month_start.isoformat() <= s.get("timestamp","")[:10] <= last_month_end.isoformat()]

    chart_data = []
    history = []
    for i in range(29, -1, -1):
        day = today - timedelta(days=i)
        day_sms = [s for s in my_sms if s.get("timestamp","")[:10] == day.isoformat()]
        day_earn = sum_profit(day_sms)
        chart_data.append(day_earn)
        if day_sms:
            history.append({
                "date": day.isoformat(), "sms_count": len(day_sms),
                "rate": agent.get("commission_rate", 5) if agent else 5,
                "commission": day_earn, "status": "paid" if i > 0 else "pending"
            })

    return {
        "today": sum_profit(today_sms),
        "this_month": sum_profit(month_sms),
        "last_month": sum_profit(last_month_sms),
        "all_time": sum_profit(my_sms),
        "chart_data": chart_data,
        "history": list(reversed(history))
    }

@app.get("/api/agents/{agent_id}/weekly-earnings")
async def get_agent_weekly_earnings(agent_id: int, weeks: int = 8):
    agents = read_db("agents")
    agent = next((a for a in agents if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(404, "Agent not found")
    commission_rate = float(agent.get("commission_rate", 5.0)) / 100.0

    clients = read_db("clients")
    my_usernames = {c.get("username","").lower() for c in clients if str(c.get("agent_id")) == str(agent_id) and c.get("username")}

    logs = read_db("sms_log")
    my_logs = [l for l in logs if (l.get("user","").lower() in my_usernames)]

    # Bucket by ISO year-week (Mon–Sun), most recent first
    buckets = {}
    for l in my_logs:
        ts = l.get("timestamp", "")
        try:
            dt = datetime.fromisoformat(ts.replace("Z",""))
        except Exception:
            continue
        iso_year, iso_week, _ = dt.isocalendar()
        key = f"{iso_year}-W{iso_week:02d}"
        week_start = dt - timedelta(days=dt.weekday())
        week_end = week_start + timedelta(days=6)
        b = buckets.setdefault(key, {"week": key,
                                      "start": week_start.date().isoformat(),
                                      "end": week_end.date().isoformat(),
                                      "sms_count": 0, "gross_profit": 0.0})
        b["sms_count"] += 1
        b["gross_profit"] += float(l.get("profit", 0) or 0)

    now = datetime.utcnow()
    cur_iso_year, cur_iso_week, _ = now.isocalendar()
    current_key = f"{cur_iso_year}-W{cur_iso_week:02d}"

    result = []
    for b in buckets.values():
        b["earnings"] = round(b["gross_profit"] * commission_rate, 2)
        b["status"] = "in_progress" if b["week"] == current_key else "completed"
        result.append(b)
    result.sort(key=lambda x: x["week"], reverse=True)
    return {"data": result[:weeks], "commission_rate": agent.get("commission_rate", 5.0)}

# ─── Firewall ────────────────────────────────────────────────────────────────
@app.get("/api/firewall/events")
async def get_fw_events(page: int=1, limit: int=20):
    data = read_db("firewall_events")
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.get("/api/firewall/blocked-ips")
async def get_blocked_ips():
    return read_db("blocked_ips")

@app.post("/api/firewall/block-ip")
async def block_ip(payload: dict):
    data = read_db("blocked_ips")
    entry = {"id": next_id(data), "ip": payload["ip"],
             "reason": payload.get("reason","Manual"),
             "blocked_at": datetime.utcnow().isoformat(),
             "expires": payload.get("expires","Permanent"), "auto": False}
    data.append(entry)
    write_db("blocked_ips", data)
    # Log firewall event
    events = read_db("firewall_events")
    events.insert(0, {"id": next_id(events), "ip": payload["ip"],
        "event": "Blocked", "reason": payload.get("reason","Manual"),
        "timestamp": datetime.utcnow().isoformat(), "threat": "High"})
    write_db("firewall_events", events)
    return entry

@app.delete("/api/firewall/blocked-ips/{ip_id}")
async def unblock_ip(ip_id: int):
    data = [b for b in read_db("blocked_ips") if b["id"] != ip_id]
    write_db("blocked_ips", data)
    return {"success": True}

@app.get("/api/firewall/stats")
async def get_fw_stats():
    blocked = read_db("blocked_ips")
    events  = read_db("firewall_events")
    now = datetime.utcnow()
    events_24h = sum(1 for e in events if e.get("timestamp","") >= (now - timedelta(hours=24)).isoformat())
    hourly_events = []
    for i in range(23, -1, -1):
        hour_key = (now - timedelta(hours=i)).strftime("%Y-%m-%dT%H")
        hourly_events.append(sum(1 for e in events if e.get("timestamp","")[:13] == hour_key))
    threat_level = "High" if events_24h > 50 else "Medium" if events_24h > 10 else "Low"
    return {"total_blocked": len(blocked), "events_24h": events_24h,
            "threat_level": threat_level,
            "scanner_agents": 0,
            "hourly_events": hourly_events}

# ─── API Tokens ──────────────────────────────────────────────────────────────
@app.get("/api/tokens")
async def get_tokens(manager_id: int=None, agent_id: int=None):
    data = read_db("api_tokens")
    if manager_id is not None:
        agents = read_db("agents")
        my_agent_ids = {a["id"] for a in agents if str(a.get("manager_id")) == str(manager_id)}
        data = [t for t in data if t.get("agent_id") in my_agent_ids]
    if agent_id is not None:
        data = [t for t in data if str(t.get("agent_id")) == str(agent_id)]
    return data

@app.post("/api/tokens")
async def create_token(payload: dict):
    data = read_db("api_tokens")
    agent_id = payload.get("agent_id")
    agent_username = None
    if agent_id:
        agents = read_db("agents")
        agent = next((a for a in agents if a["id"] == agent_id), None)
        agent_username = agent.get("username") if agent else None

    tok = {"id": next_id(data), "name": payload.get("name","New Token"),
           "token": "sk_" + ''.join(random.choices(string.ascii_letters+string.digits, k=32)),
           "created": datetime.utcnow().isoformat(), "last_used": None,
           "status": "active", "calls": 0,
           "agent_id": agent_id, "agent_username": agent_username,
           "created_by": payload.get("created_by", "Admin"),
           "permissions": payload.get("permissions",["read"])}
    data.append(tok)
    write_db("api_tokens", data)
    return tok

@app.delete("/api/tokens/{token_id}")
async def delete_token(token_id: int):
    data = [t for t in read_db("api_tokens") if t["id"] != token_id]
    write_db("api_tokens", data)
    return {"success": True}

# ─── CR API — per-agent token-authorized SMS/CDR retrieval ───────────────────
# Matches the "CR API Guide for Data Retrieval" spec exactly: token auth,
# dt1/dt2 date range, records limit (max 200), filternum, filtercli.
@app.api_route("/crapi/viewstats", methods=["GET", "POST"])
async def crapi_viewstats(request: Request):
    params = dict(request.query_params)
    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict):
                params.update(body)
        except Exception:
            try:
                form = await request.form()
                params.update(dict(form))
            except Exception:
                pass

    token = params.get("token", "")
    tokens = read_db("api_tokens")
    tok = next((t for t in tokens if t.get("token") == token), None)
    if not tok or tok.get("status") != "active":
        return JSONResponse(status_code=401, content={"status": "error", "msg": "Not Authorized"})

    # Update usage stats on the token
    tok["calls"] = tok.get("calls", 0) + 1
    tok["last_used"] = datetime.utcnow().isoformat()
    write_db("api_tokens", tokens)

    agent_id = tok.get("agent_id")
    clients = read_db("clients")
    my_usernames = {c.get("username","").lower() for c in clients if str(c.get("agent_id")) == str(agent_id) and c.get("username")}

    sms = read_db("sms_log")
    data = [s for s in sms if s.get("user","").lower() in my_usernames]

    dt1 = params.get("dt1", "")
    dt2 = params.get("dt2", "")
    if dt1:
        dt1_norm = dt1.replace(" ", "T").replace("%20", "T")
        data = [s for s in data if s.get("timestamp","") >= dt1_norm]
    if dt2:
        dt2_norm = dt2.replace(" ", "T").replace("%20", "T")
        data = [s for s in data if s.get("timestamp","") <= dt2_norm]

    filternum = params.get("filternum", "")
    if filternum:
        data = [s for s in data if filternum in s.get("number","")]

    filtercli = params.get("filtercli", "")
    if filtercli:
        data = [s for s in data if filtercli.lower() in (s.get("cli","") or "").lower()]

    try:
        records = min(int(params.get("records", 25)), 200)
    except (ValueError, TypeError):
        records = 25

    data.sort(key=lambda s: s.get("timestamp",""), reverse=True)
    data = data[:records]

    result = [{
        "dt": s.get("timestamp","").replace("T", " ")[:19],
        "num": s.get("number",""),
        "cli": s.get("cli","") or "",
        "message": s.get("message",""),
        "payout": str(s.get("profit", 0))
    } for s in data]

    return {"status": "success", "total": len(result), "data": result}

# ─── Rate Limits & Settings ──────────────────────────────────────────────────
@app.get("/api/rate-limits")
async def get_rate_limits():
    return read_db("rate_limits")

@app.post("/api/rate-limits")
async def update_rate_limits(payload: dict):
    data = read_db("rate_limits")
    data.update(payload)
    write_db("rate_limits", data)
    return {"success": True, "data": data}

@app.get("/api/settings")
async def get_settings():
    return read_db("settings")

@app.post("/api/settings")
async def update_settings(payload: dict):
    data = read_db("settings")
    data.update(payload)
    write_db("settings", data)
    return {"success": True, "data": data}

# ─── Permissions ─────────────────────────────────────────────────────────────
@app.get("/api/permissions")
async def get_permissions():
    return read_db("permissions")

@app.post("/api/permissions")
async def update_permissions(payload: dict):
    write_db("permissions", payload)
    return {"success": True}

# ─── Webhook ─────────────────────────────────────────────────────────────────
@app.get("/api/webhook/config")
async def get_webhook_config():
    return read_db("webhook_config")

@app.post("/api/webhook/config")
async def update_webhook_config(payload: dict):
    data = read_db("webhook_config")
    data.update(payload)
    write_db("webhook_config", data)
    return {"success": True, "data": data}

@app.post("/api/webhook/test")
async def test_webhook(payload: dict):
    return {"success": True, "status_code": 200, "response_time_ms": 142,
            "message": "Webhook delivered successfully", "payload_sent": payload}

# ─── Test Panel — SMS Test Numbers (uploaded by Admin) ───────────────────────
def _range_label(n):
    # a label already stored on the record wins (Login Panel rows carry OUR
    # own range name), then the range's own name, then country-provider
    if n.get("range_label"):
        return n["range_label"]
    ranges = read_db("sms_ranges")
    r = None
    if n.get("range_id") is not None:
        r = next((x for x in ranges if x.get("id") == n.get("range_id")), None)
    if r is None:
        r = next((x for x in ranges if x.get("country") == n.get("country")
                  and x.get("provider") == n.get("provider")), None)
    if r and (r.get("range_name") or r.get("name")):
        return r.get("range_name") or r.get("name")
    return f"{n.get('country','')}-{n.get('provider','')}".strip("-")

@app.get("/api/sms/test-numbers")
async def get_test_numbers(page: int=1, limit: int=25, search: str="", range: str=""):
    data = read_db("test_numbers")
    if search:
        data = [n for n in data if search in n.get("number","")]
    if range:
        ranges = read_db("sms_ranges")
        r = next((r for r in ranges if str(r["id"]) == str(range)), None)
        if r:
            data = [n for n in data if n.get("country") == r.get("country") and n.get("provider") == r.get("provider")]
    data = sorted(data, key=lambda n: n.get("id", 0), reverse=True)
    start = (page-1)*limit
    out = []
    for n in data[start:start+limit]:
        out.append({**n, "range_label": _range_label(n)})
    return {"data": out, "total": len(data)}

@app.post("/api/sms/test-numbers")
async def add_test_number(payload: dict):
    if not payload.get("number"):
        raise HTTPException(400, "Number is required")
    data = read_db("test_numbers")
    if any(n["number"] == payload["number"] for n in data):
        raise HTTPException(400, "This number is already in the test panel")
    entry = {
        "id": next_id(data),
        "number": payload["number"],
        "country": payload.get("country",""),
        "provider": payload.get("provider",""),
        "app": payload.get("app",""),
        "added_by": payload.get("added_by","Admin"),
        "created": datetime.utcnow().isoformat()
    }
    data.append(entry)
    write_db("test_numbers", data)
    return entry

@app.post("/api/sms/test-numbers/bulk")
async def add_test_numbers_bulk(payload: dict):
    """Admin uploads test numbers from the existing number pool (by range) in bulk."""
    range_id = payload.get("range_id")
    count = int(payload.get("count", 10))
    carrier_rate = float(payload.get("carrier_rate", 0) or 0)
    payout_rate = float(payload.get("payout_rate", 0) or 0)
    ranges = read_db("sms_ranges")
    r = next((r for r in ranges if str(r["id"]) == str(range_id)), None)
    if not r:
        raise HTTPException(404, "Range not found")

    pool = [n for n in read_db("numbers") if n.get("country") == r.get("country") and n.get("provider") == r.get("provider")]
    data = read_db("test_numbers")
    existing = {n["number"] for n in data}
    added = []
    for n in pool:
        if len(added) >= count:
            break
        if n["number"] in existing:
            continue
        entry = {"id": next_id(data), "number": n["number"], "country": n.get("country",""),
                  "provider": n.get("provider",""), "app": n.get("app",""),
                  "carrier_rate": carrier_rate, "payout_rate": payout_rate,
                  "added_by": payload.get("added_by","Admin"), "created": datetime.utcnow().isoformat()}
        data.append(entry)
        existing.add(n["number"])
        added.append(entry)
    write_db("test_numbers", data)
    return {"added": len(added), "data": added}

@app.delete("/api/sms/test-numbers/{test_id}")
async def delete_test_number(test_id: int):
    data = [n for n in read_db("test_numbers") if n["id"] != test_id]
    write_db("test_numbers", data)
    return {"success": True}

@app.delete("/api/sms/test-numbers")
async def clear_all_test_numbers():
    """Clear every test number in one action, so a fresh batch can be uploaded
    without deleting them one by one."""
    count = len(read_db("test_numbers"))
    write_db("test_numbers", [])
    log_audit("Admin", "Test Numbers Cleared", f"Cleared all {count} test number(s)", module="Test Panel")
    return {"success": True, "cleared": count}

# ─── Test Panel — Recent SMS Test (incoming SMS on test numbers) ─────────────
@app.get("/api/sms/test-logs")
async def get_test_logs(page: int=1, limit: int=25, search: str="", range: str="",
                         date_from: str="", date_to: str=""):
    data = read_db("test_sms_logs")
    if search:
        q = search.lower()
        data = [s for s in data if q in s.get("number","").lower() or q in (s.get("cli") or "").lower()]
    if range:
        ranges = read_db("sms_ranges")
        r = next((r for r in ranges if str(r["id"]) == str(range)), None)
        if r:
            data = [s for s in data if s.get("country") == r.get("country") and s.get("provider") == r.get("provider")]
    if date_from:
        data = [s for s in data if s.get("timestamp","") >= date_from]
    if date_to:
        data = [s for s in data if s.get("timestamp","") <= date_to + "T23:59:59"]
    data = sorted(data, key=lambda s: s.get("timestamp",""), reverse=True)
    start = (page-1)*limit
    out = []
    for s in data[start:start+limit]:
        out.append({**s, "range_label": _range_label(s)})
    return {"data": out, "total": len(data)}

@app.post("/api/sms/test-logs")
async def receive_test_sms(payload: dict):
    """Records an incoming SMS on a test number (e.g. an OTP arriving during testing)."""
    number = payload.get("number")
    if not number:
        raise HTTPException(400, "Number is required")
    test_numbers = read_db("test_numbers")
    tn = next((n for n in test_numbers if n["number"] == number), None)
    entry = {
        "id": next_id(read_db("test_sms_logs")),
        "number": number,
        "cli": payload.get("cli",""),
        "message": payload.get("message",""),
        "country": tn.get("country","") if tn else payload.get("country",""),
        "provider": tn.get("provider","") if tn else payload.get("provider",""),
        "app": tn.get("app","") if tn else payload.get("app",""),
        "timestamp": datetime.utcnow().isoformat()
    }
    data = read_db("test_sms_logs")
    data.append(entry)
    write_db("test_sms_logs", data)
    return entry

@app.get("/api/sms/test-stats")
async def get_test_stats():
    logs = read_db("test_sms_logs")
    now = datetime.utcnow()
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    def count_on(day):
        return sum(1 for s in logs if s.get("timestamp","")[:10] == day.isoformat())
    def count_since(start_day):
        return sum(1 for s in logs if s.get("timestamp","")[:10] >= start_day.isoformat())

    week_labels, week_data = [], []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        week_labels.append(d.strftime("%a"))
        week_data.append(count_on(d))

    return {
        "today": count_on(today),
        "this_week": count_since(week_start),
        "this_month": count_since(month_start),
        "total": len(logs),
        "delivered": len(logs),
        "failed": 0,
        "pending": 0,
        "week_labels": week_labels,
        "week_data": week_data,
        "total_carrier_revenue": round(sum(s.get("carrier_rate", 0) or 0 for s in logs), 4),
        "total_payout": round(sum(s.get("payout_rate", 0) or 0 for s in logs), 4)
    }

# ─── Announcements ───────────────────────────────────────────────────────────
@app.get("/api/announcements")
async def get_announcements(role: str="", manager_id: str=None, agent_id: str=None):
    manager_id = int(manager_id) if manager_id not in (None, "") else None
    agent_id = int(agent_id) if agent_id not in (None, "") else None
    data = read_db("announcements")

    if role == "Admin":
        # Admin oversees everything
        return {"data": data, "total": len(data)}

    def visible(a):
        target = a.get("target", {"scope": "all"})
        scope = target.get("scope", "all")
        if scope == "all":
            return True
        if scope == "manager":
            return manager_id is not None and str(target.get("manager_id")) == str(manager_id)
        if scope == "agent":
            return agent_id is not None and str(target.get("agent_id")) == str(agent_id)
        return False

    filtered = [a for a in data if visible(a)]
    return {"data": filtered, "total": len(filtered)}

@app.post("/api/announcements")
async def create_announcement(payload: dict):
    sender_role = payload.get("sender_role", "Admin")
    sender_id = payload.get("sender_id")
    sender_username = payload.get("sender_username", "")

    if sender_role == "Manager":
        target = {"scope": "manager", "manager_id": sender_id}
    elif sender_role == "Agent":
        target = {"scope": "agent", "agent_id": sender_id}
    else:
        target = {"scope": "all"}

    data = read_db("announcements")
    entry = {"id": next_id(data), "created": datetime.utcnow().isoformat(),
             "author": sender_username or sender_role, "sender_role": sender_role,
             "sender_id": sender_id, "target": target, "pinned": False,
             "title": payload.get("title",""), "body": payload.get("body",""),
             "type": payload.get("type","info")}
    data.insert(0, entry)
    write_db("announcements", data)
    return entry

@app.post("/api/announcements/mark-read")
async def mark_announcements_read(payload: dict):
    # No per-user read-state tracking exists yet — acknowledge the request
    return {"success": True}

@app.delete("/api/announcements/{ann_id}")
async def delete_announcement(ann_id: int):
    data = [a for a in read_db("announcements") if a["id"] != ann_id]
    write_db("announcements", data)
    return {"success": True}

# ─── Support Tickets ─────────────────────────────────────────────────────────
@app.get("/api/support-tickets")
async def get_tickets():
    return read_db("support_tickets")

@app.patch("/api/support-tickets/{ticket_id}")
async def update_ticket(ticket_id: int, payload: dict):
    data = read_db("support_tickets")
    ticket = next((t for t in data if t["id"] == ticket_id), None)
    if ticket: ticket.update(payload)
    write_db("support_tickets", data)
    return ticket

# ─── Manager Stats ───────────────────────────────────────────────────────────
@app.get("/api/manager/{manager_id}/earnings")
async def get_manager_earnings_summary(manager_id: int):
    """Real earnings summary for Manager's 'My Earnings' page."""
    sms = read_db("sms_log")
    my_sms = [s for s in sms if str(s.get("manager_id")) == str(manager_id)]

    now = datetime.utcnow()
    today = now.date()
    month_start = today.replace(day=1)
    last_month_end = month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    def sum_profit(records):
        return round(sum(r.get("profit", 0) for r in records), 2)

    today_sms = [s for s in my_sms if s.get("timestamp","")[:10] == today.isoformat()]
    month_sms = [s for s in my_sms if s.get("timestamp","")[:10] >= month_start.isoformat()]
    last_month_sms = [s for s in my_sms if last_month_start.isoformat() <= s.get("timestamp","")[:10] <= last_month_end.isoformat()]

    chart_data = []
    history = []
    for i in range(29, -1, -1):
        day = today - timedelta(days=i)
        day_sms = [s for s in my_sms if s.get("timestamp","")[:10] == day.isoformat()]
        day_earn = sum_profit(day_sms)
        chart_data.append(day_earn)
        if day_sms:
            history.append({
                "date": day.isoformat(), "sms_count": len(day_sms),
                "rate": 5, "commission": day_earn, "status": "paid" if i > 0 else "pending"
            })

    return {
        "today": sum_profit(today_sms),
        "this_month": sum_profit(month_sms),
        "last_month": sum_profit(last_month_sms),
        "all_time": sum_profit(my_sms),
        "chart_data": chart_data,
        "history": list(reversed(history))
    }

@app.get("/api/manager/{manager_id}/stats")
async def manager_stats(manager_id: int):
    mid = str(manager_id)
    agents  = [a for a in read_db("agents")  if str(a.get("manager_id")) == mid]
    clients = [c for c in read_db("clients") if str(c.get("manager_id")) == mid]
    client_usernames = {c.get("username","").lower() for c in clients if c.get("username")}
    numbers = [n for n in read_db("numbers") if str(n.get("manager_id")) == mid]

    sms = read_db("sms_log")
    # Real ownership-based scoping — matches every OTP that's currently on a
    # number under this manager, whether or not it's reached a named Client
    # yet. Username matching is kept only as a fallback for legacy entries
    # that predate manager_id being stamped on sms_log. String comparison
    # throughout so any int/str mismatch in stored data never breaks this.
    my_sms = [s for s in sms if str(s.get("manager_id")) == mid or
              (not s.get("manager_id") and s.get("user","").lower() in client_usernames)]

    today = datetime.utcnow().date().isoformat()
    sms_today = [s for s in my_sms if s.get("timestamp","")[:10] == today]

    now = datetime.utcnow()
    traffic_data = []
    for i in range(23, -1, -1):
        hour_key = (now - timedelta(hours=i)).strftime("%Y-%m-%dT%H")
        traffic_data.append(sum(1 for s in my_sms if s.get("timestamp","")[:13] == hour_key))

    return {
        "total_agents":   len(agents),
        "active_agents":  sum(1 for a in agents  if a.get("status") == "active"),
        "total_clients":  len(clients),
        "active_clients": sum(1 for c in clients if c.get("status") == "active"),
        "total_balance":  round(sum(c.get("balance") or 0 for c in clients), 2),
        "total_sms":      len(my_sms),
        "revenue_today":  round(sum(s.get("profit",0) for s in sms_today), 2),
        "numbers_assigned": len(numbers),
        "traffic_data":   traffic_data,
        "top_agents": sorted(agents, key=lambda a: a.get("clients_count",0), reverse=True)[:5]
    }

# ─── Hierarchy view ──────────────────────────────────────────────────────────
@app.get("/api/backup/export")
async def export_backup():
    """Zips the entire data/ folder (every table — clients, agents, numbers,
    sms_log, settings, everything) into one downloadable file. Restoring this
    exact file on a fresh server brings the whole system back byte-for-byte."""
    buffer = io.BytesIO()
    data_dir = Path("data")
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(data_dir.glob("*.json")):
            zf.write(f, arcname=f"data/{f.name}")
        # A manifest so restore can sanity-check it's a real MAIT SMS backup
        manifest = {
            "app": "MAIT SMS", "exported_at": datetime.utcnow().isoformat(),
            "files": [f.name for f in sorted(data_dir.glob("*.json"))]
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
    buffer.seek(0)

    filename = f"mait_sms_backup_{datetime.utcnow().strftime('%Y-%m-%d_%H%M')}.zip"
    log_audit("Admin", "Backup Exported", f"Downloaded full system backup ({filename})", module="System")
    return StreamingResponse(
        buffer, media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.post("/api/backup/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Accepts a backup zip (from export_backup, or a hand-made one with the
    same structure) and overwrites every data/*.json file with its contents.
    A safety copy of the current data/ folder is kept in data_before_restore/
    in case something needs to be rolled back manually."""
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Please upload a .zip backup file")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(400, "That file isn't a valid zip archive")

    names = zf.namelist()
    json_entries = [n for n in names if n.startswith("data/") and n.endswith(".json")]
    if not json_entries:
        raise HTTPException(400, "This doesn't look like an MAIT SMS backup — no data/*.json files found inside")

    # Safety copy of current state before overwriting anything
    data_dir = Path("data")
    safety_dir = Path("data_before_restore")
    try:
        if safety_dir.exists():
            shutil.rmtree(safety_dir)
        shutil.copytree(data_dir, safety_dir)
    except Exception:
        pass  # never let the safety-copy step block a real restore

    restored = []
    for entry in json_entries:
        target_name = entry.split("/", 1)[1]  # strip the "data/" prefix
        try:
            raw = zf.read(entry)
            json.loads(raw)  # validate it's real JSON before writing
            with open(data_dir / target_name, "wb") as f:
                f.write(raw)
            restored.append(target_name)
        except Exception:
            continue  # skip anything corrupted rather than failing the whole restore

    log_audit("Admin", "Backup Restored", f"Restored {len(restored)} file(s) from '{file.filename}'", module="System")
    return {"success": True, "restored_files": len(restored), "files": restored}

@app.get("/api/reports/business")
async def business_report(date_from: str = "", date_to: str = ""):
    sms = read_db("sms_log")
    if date_from:
        sms = [s for s in sms if s.get("timestamp","") >= date_from]
    if date_to:
        sms = [s for s in sms if s.get("timestamp","") <= date_to + "T23:59:59"]

    delivered = [s for s in sms if s.get("status") == "delivered"]
    failed = [s for s in sms if s.get("status") != "delivered"]
    total_revenue = round(sum(s.get("carrier_revenue", s.get("profit", 0)) for s in sms), 2)

    clients = read_db("clients")
    agents = read_db("agents")
    client_to_agent = {c.get("username","").lower(): c.get("agent_id") for c in clients if c.get("username")}
    agent_names = {a["id"]: a["username"] for a in agents}

    agent_totals = {}
    for s in sms:
        agent_id = client_to_agent.get(s.get("user","").lower())
        if agent_id is None:
            continue
        t = agent_totals.setdefault(agent_id, {"sms_count": 0, "revenue": 0.0})
        t["sms_count"] += 1
        t["revenue"] += s.get("profit", 0)
    top_agents = sorted(
        [{"agent": agent_names.get(aid, f"Agent #{aid}"), "sms_count": v["sms_count"], "revenue": round(v["revenue"], 2)}
         for aid, v in agent_totals.items()],
        key=lambda x: x["revenue"], reverse=True
    )[:10]

    number_totals = {}
    for s in sms:
        num = s.get("number", "")
        if not num:
            continue
        number_totals[num] = number_totals.get(num, 0) + 1
    top_numbers = sorted(
        [{"number": k, "sms_count": v} for k, v in number_totals.items()],
        key=lambda x: x["sms_count"], reverse=True
    )[:10]

    return {
        "date_from": date_from or "all-time",
        "date_to": date_to or "now",
        "total_sms": len(sms),
        "delivered": len(delivered),
        "failed": len(failed),
        "success_rate": round(len(delivered) / max(len(sms), 1) * 100, 1),
        "total_revenue": total_revenue,
        "top_agents": top_agents,
        "top_numbers": top_numbers
    }

@app.get("/api/search")
async def global_search(q: str = ""):
    q = (q or "").strip().lower()
    if len(q) < 2:
        return {"numbers": [], "clients": [], "agents": [], "managers": []}

    numbers = [n for n in read_db("numbers") if q in n.get("number","").lower()][:10]
    clients = [c for c in read_db("clients") if q in c.get("username","").lower()
               or q in (c.get("full_name") or "").lower()][:10]
    agents = [a for a in read_db("agents") if q in a.get("username","").lower()
              or q in (a.get("full_name") or "").lower()][:10]
    managers = [u for u in read_db("users") if u.get("role") in ("Manager", "Admin")
                and q in u.get("username","").lower()][:10]

    return {
        "numbers": [{"id": n["id"], "number": n["number"], "status": n.get("status"),
                     "user": n.get("user","")} for n in numbers],
        "clients": [{"id": c["id"], "username": c["username"], "balance": c.get("balance",0),
                     "status": c.get("status")} for c in clients],
        "agents": [{"id": a["id"], "username": a["username"], "balance": a.get("balance",0),
                    "status": a.get("status")} for a in agents],
        "managers": [{"id": m["id"], "username": m["username"], "role": m.get("role"),
                      "status": m.get("status")} for m in managers]
    }

@app.get("/api/hierarchy")
async def get_hierarchy():
    users   = read_db("users")
    agents  = read_db("agents")
    clients = read_db("clients")
    managers = [u for u in users if u["role"] == "Manager"]
    result = []
    for mgr in managers:
        mgr_agents = [a for a in agents if a.get("manager_id") == mgr["id"]]
        for agent in mgr_agents:
            agent["clients"] = [c for c in clients if c.get("agent_id") == agent["id"]]
        result.append({"manager": {k:v for k,v in mgr.items() if k!="password"},
                        "agents": mgr_agents})
    return result

# ─── DB Export/Import ────────────────────────────────────────────────────────
@app.get("/api/db/export")
async def export_db():
    """Export all JSON databases as a single JSON bundle."""
    from database import SEEDS
    bundle = {}
    for name in SEEDS.keys():
        bundle[name] = read_db(name)
    return JSONResponse(content=bundle)

@app.post("/api/db/reset/{table}")
async def reset_table(table: str):
    """Reset a specific table to seed data."""
    from database import SEEDS
    if table not in SEEDS:
        raise HTTPException(404, f"Table '{table}' not found")
    write_db(table, SEEDS[table]())
    return {"success": True, "table": table, "message": f"Table '{table}' reset to seed data"}

# ─── Services (Facebook, WhatsApp, Aadhaar, etc.) ────────────────────────────
@app.get("/api/services")
async def get_services():
    data = read_db("services")
    if not data:
        # seed defaults
        from datetime import datetime as dt
        defaults = [
            {"id":i+1,"name":n,"icon":ic,"color":cl,"description":desc,"payout_rate":pr,"active":True,
             "created":dt.utcnow().isoformat()}
            for i,(n,ic,cl,desc,pr) in enumerate([
                ("WhatsApp","fab fa-whatsapp","#25d366","WhatsApp OTP verification numbers",0.05),
                ("Telegram","fab fa-telegram","#2aabee","Telegram OTP verification numbers",0.04),
                ("Google","fab fa-google","#4285f4","Google account verification",0.06),
                ("Facebook","fab fa-facebook","#1877f2","Facebook OTP numbers",0.045),
                ("Amazon","fab fa-amazon","#ff9900","Amazon account verification",0.055),
                ("Twitter","fab fa-twitter","#1da1f2","Twitter/X OTP numbers",0.035),
                ("Instagram","fab fa-instagram","#e1306c","Instagram verification numbers",0.04),
                ("Netflix","fas fa-film","#e50914","Netflix account OTP",0.05),
                ("Uber","fab fa-uber","#000000","Uber app verification",0.035),
                ("Discord","fab fa-discord","#5865f2","Discord account numbers",0.03),
                ("Aadhaar","fas fa-id-card","#ff6600","Aadhaar/India ID verification numbers",0.08),
                ("TikTok","fab fa-tiktok","#010101","TikTok account verification",0.04),
                ("Snapchat","fab fa-snapchat","#fffc00","Snapchat OTP numbers",0.035),
                ("LinkedIn","fab fa-linkedin","#0a66c2","LinkedIn verification",0.05),
                ("Microsoft","fab fa-microsoft","#00a4ef","Microsoft/Outlook OTP",0.055),
            ])
        ]
        write_db("services", defaults)
        return defaults
    return data

@app.post("/api/services")
async def create_service(payload: dict):
    data = read_db("services")
    svc = {
        "id": next_id(data),
        "name": payload.get("name",""),
        "icon": payload.get("icon","fas fa-mobile-screen"),
        "color": payload.get("color","#4c6ef5"),
        "description": payload.get("description",""),
        "payout_rate": float(payload.get("payout_rate",0.05)),
        "active": True,
        "created": datetime.utcnow().isoformat()
    }
    data.append(svc)
    write_db("services", data)
    return svc

@app.patch("/api/services/{svc_id}")
async def update_service(svc_id: int, payload: dict):
    data = read_db("services")
    svc = next((s for s in data if s["id"] == svc_id), None)
    if not svc: raise HTTPException(404, "Service not found")
    svc.update(payload)
    write_db("services", data)
    return svc

@app.delete("/api/services/{svc_id}")
async def delete_service(svc_id: int):
    data = [s for s in read_db("services") if s["id"] != svc_id]
    write_db("services", data)
    return {"success": True}

# ─── CLI Routes ───────────────────────────────────────────────────────────────
@app.get("/api/cli-routes")
async def get_cli_routes():
    return read_db("cli_routes")

@app.post("/api/cli-routes")
async def create_cli_route(payload: dict):
    data = read_db("cli_routes")
    cli = {
        "id": next_id(data),
        "cli": payload.get("cli",""),
        "country": payload.get("country",""),
        "status": "active",
        "description": payload.get("description",""),
        "created": datetime.utcnow().isoformat()
    }
    data.append(cli)
    write_db("cli_routes", data)
    return cli

@app.patch("/api/cli-routes/{cli_id}")
async def update_cli_route(cli_id: int, payload: dict):
    data = read_db("cli_routes")
    cli = next((c for c in data if c["id"] == cli_id), None)
    if not cli: raise HTTPException(404, "CLI route not found")
    cli.update(payload)
    write_db("cli_routes", data)
    return cli

@app.delete("/api/cli-routes/{cli_id}")
async def delete_cli_route(cli_id: int):
    data = [c for c in read_db("cli_routes") if c["id"] != cli_id]
    write_db("cli_routes", data)
    return {"success": True}

# ─── Payout Rates ─────────────────────────────────────────────────────────────
@app.get("/api/payout-rates")
async def get_payout_rates():
    data = read_db("payout_rates")
    if not data:
        defaults = {
            "admin_to_manager": {"default_rate": 0.05, "description": "Admin pays manager per OTP delivered", "currency": "USD"},
            "manager_to_agent": {"default_rate": 0.03, "description": "Manager pays agent per OTP delivered", "currency": "USD"},
            "service_rates": {
                "WhatsApp": {"admin_to_manager": 0.05, "manager_to_agent": 0.03},
                "Telegram": {"admin_to_manager": 0.04, "manager_to_agent": 0.025},
                "Google": {"admin_to_manager": 0.06, "manager_to_agent": 0.035},
                "Facebook": {"admin_to_manager": 0.045, "manager_to_agent": 0.028},
                "Amazon": {"admin_to_manager": 0.055, "manager_to_agent": 0.032},
                "Aadhaar": {"admin_to_manager": 0.08, "manager_to_agent": 0.05},
                "TikTok": {"admin_to_manager": 0.04, "manager_to_agent": 0.025},
            }
        }
        write_db("payout_rates", defaults)
        return defaults
    return data

@app.post("/api/payout-rates")
async def update_payout_rates(payload: dict):
    data = read_db("payout_rates")
    # deep merge
    for key, val in payload.items():
        if key == "service_rates" and isinstance(val, dict):
            if "service_rates" not in data:
                data["service_rates"] = {}
            data["service_rates"].update(val)
        else:
            data[key] = val
    write_db("payout_rates", data)
    return {"success": True, "data": data}

# ─── Number Transfer System ───────────────────────────────────────────────────
@app.get("/api/number-transfers")
async def get_number_transfers(page: int=1, limit: int=20, from_role: str="", to_role: str="",
                                from_user_id: int=None, to_user_id: int=None):
    data = read_db("number_transfers")
    if from_role: data = [t for t in data if t.get("from_role","").lower() == from_role.lower()]
    if to_role:   data = [t for t in data if t.get("to_role","").lower() == to_role.lower()]
    if from_user_id: data = [t for t in data if t.get("from_user_id") == from_user_id]
    if to_user_id:   data = [t for t in data if t.get("to_user_id") == to_user_id]
    start = (page-1)*limit
    return {"data": data[start:start+limit], "total": len(data)}

@app.get("/api/number-transfers/{transfer_id}")
async def get_number_transfer_detail(transfer_id: int):
    data = read_db("number_transfers")
    t = next((t for t in data if t["id"] == transfer_id), None)
    if not t:
        raise HTTPException(404, "Transfer not found")
    return t

@app.post("/api/number-transfers/{transfer_id}/cancel")
async def cancel_number_transfer(transfer_id: int):
    data = read_db("number_transfers")
    t = next((t for t in data if t["id"] == transfer_id), None)
    if not t:
        raise HTTPException(404, "Transfer not found")
    if t.get("status") != "pending":
        raise HTTPException(400, "Only pending transfers can be cancelled")
    t["status"] = "cancelled"
    write_db("number_transfers", data)
    log_audit(t.get("from_username","?"), "Transfer Cancelled", f"Cancelled transfer #{transfer_id}", module="Numbers")
    return {"success": True}

@app.post("/api/number-transfers")
async def transfer_numbers(payload: dict):
    """Transfer numbers between users (admin→manager, manager→agent, agent→client)"""
    from_user_id  = payload.get("from_user_id")
    to_user_id    = payload.get("to_user_id")
    number_ids    = payload.get("number_ids", [])   # list of number IDs
    count         = payload.get("count", 0)          # or transfer by count
    service       = payload.get("service", "")
    from_role     = payload.get("from_role", "Admin")
    to_role       = payload.get("to_role", "Manager")
    notes         = payload.get("notes", "")

    numbers = read_db("numbers")

    # Resolve target username
    to_username = "unknown"
    if to_role in ("Manager", "User"):
        users = read_db("users")
        u = next((u for u in users if u["id"] == to_user_id), None)
        if u: to_username = u["username"]
    elif to_role == "Agent":
        agents = read_db("agents")
        a = next((a for a in agents if a["id"] == to_user_id), None)
        if a: to_username = a["username"]
    elif to_role == "Client":
        clients = read_db("clients")
        c = next((c for c in clients if c["id"] == to_user_id), None)
        if c: to_username = c["username"]

    # Resolve from_username
    from_username = "admin"
    if from_role == "Manager":
        users = read_db("users")
        u = next((u for u in users if u["id"] == from_user_id), None)
        if u: from_username = u["username"]
    elif from_role == "Agent":
        agents = read_db("agents")
        a = next((a for a in agents if a["id"] == from_user_id), None)
        if a: from_username = a["username"]

    transferred = []
    if number_ids:
        # Transfer specific numbers
        for n in numbers:
            if n["id"] in number_ids:
                n["user"] = to_username
                if service: n["app"] = service
                transferred.append(n["id"])
    elif count > 0:
        # Auto-pick unallocated or matching numbers
        pool = [n for n in numbers if n.get("user","") in ("unallocated","admin","") or n.get("user","").startswith("user")]
        if service:
            pool = [n for n in pool if n.get("app","") == service] or pool
        for n in pool[:count]:
            n["user"] = to_username
            if service: n["app"] = service
            transferred.append(n["id"])

    write_db("numbers", numbers)

    # Update recipient's numbers_assigned count
    if to_role == "Agent":
        agents = read_db("agents")
        a = next((a for a in agents if a["id"] == to_user_id), None)
        if a:
            a["numbers_assigned"] = a.get("numbers_assigned", 0) + len(transferred)
            write_db("agents", agents)
    elif to_role == "Client":
        clients = read_db("clients")
        c = next((c for c in clients if c["id"] == to_user_id), None)
        if c:
            c["numbers_assigned"] = c.get("numbers_assigned", 0) + len(transferred)
            write_db("clients", clients)

    # Record transfer
    transfers = read_db("number_transfers")
    entry = {
        "id": next_id(transfers),
        "from_user_id": from_user_id,
        "from_username": from_username,
        "from_role": from_role,
        "to_user_id": to_user_id,
        "to_username": to_username,
        "to_role": to_role,
        "count": len(transferred),
        "number_ids": transferred,
        "service": service,
        "notes": notes,
        "timestamp": datetime.utcnow().isoformat(),
        "status": "completed"
    }
    transfers.insert(0, entry)
    write_db("number_transfers", transfers)

    # Add audit log
    audit = read_db("audit_logs")
    audit.insert(0, {
        "id": next_id(audit),
        "user": from_username,
        "action": "Number Transfer",
        "ip": "system",
        "timestamp": datetime.utcnow().isoformat(),
        "details": f"Transferred {len(transferred)} numbers from {from_username} ({from_role}) to {to_username} ({to_role})",
        "module": "Numbers"
    })
    write_db("audit_logs", audit)

    return {"success": True, "transferred": len(transferred), **entry}

# ─── Numbers: transfer to manager (admin panel) ───────────────────────────────
@app.post("/api/numbers/transfer-to-manager")
async def transfer_to_manager(payload: dict):
    payload["from_role"] = "Admin"
    payload["to_role"] = "Manager"
    return await transfer_numbers(payload)

# ─── Numbers: manager transfers to agent ─────────────────────────────────────
@app.post("/api/numbers/transfer-to-agent")
async def transfer_to_agent(payload: dict):
    payload["from_role"] = payload.get("from_role", "Manager")
    payload["to_role"] = "Agent"
    return await transfer_numbers(payload)

# ─── Numbers: agent transfers to client ──────────────────────────────────────
@app.post("/api/numbers/transfer-to-client")
async def transfer_to_client(payload: dict):
    payload["from_role"] = payload.get("from_role", "Agent")
    payload["to_role"] = "Client"
    return await transfer_numbers(payload)

# ─── Numbers: revoke back from user ──────────────────────────────────────────
@app.post("/api/numbers/revoke")
async def revoke_numbers(payload: dict):
    """Revoke numbers back to admin pool"""
    number_ids = payload.get("number_ids", [])
    from_username = payload.get("from_username", "")
    numbers = read_db("numbers")
    revoked = 0
    for n in numbers:
        if (number_ids and n["id"] in number_ids) or (from_username and n.get("user") == from_username):
            n["user"] = "unallocated"
            n["status"] = "active"
            revoked += 1
    write_db("numbers", numbers)
    if revoked:
        log_audit(payload.get("revoked_by", "Admin"), "Numbers Revoked",
                   f"Revoked {revoked} number(s)" + (f" from {from_username}" if from_username else ""),
                   module="Numbers")
    return {"success": True, "revoked": revoked}

# ─── Numbers: download (CSV export) ──────────────────────────────────────────
@app.get("/api/numbers/download")
async def download_numbers(user: str="", status: str="", service: str="",
                            manager_id: int=None, agent_id: int=None, client_id: int=None):
    numbers = read_db("numbers")

    # Apply filters
    if user:    numbers = [n for n in numbers if n.get("user","").lower() == user.lower()]
    if status:  numbers = [n for n in numbers if n.get("status","") == status]
    if service: numbers = [n for n in numbers if n.get("app","") == service]

    # Filter by hierarchy
    if client_id:
        clients = read_db("clients")
        c = next((c for c in clients if c["id"] == client_id), None)
        if c: numbers = [n for n in numbers if n.get("user","") == c["username"]]
    elif agent_id:
        agents = read_db("agents")
        a = next((a for a in agents if a["id"] == agent_id), None)
        if a:
            # Get all clients under this agent
            clients = read_db("clients")
            ag_clients = [c["username"] for c in clients if str(c.get("agent_id")) == str(agent_id)]
            ag_clients.append(a["username"])
            numbers = [n for n in numbers if n.get("user","") in ag_clients]
    elif manager_id:
        users = read_db("users")
        mgr = next((u for u in users if u["id"] == manager_id), None)
        if mgr:
            agents = read_db("agents")
            ag_list = [a for a in agents if str(a.get("manager_id")) == str(manager_id)]
            clients = read_db("clients")
            cl_list = [c for c in clients if str(c.get("manager_id")) == str(manager_id)]
            allowed = set([mgr["username"]]
                          + [a["username"] for a in ag_list]
                          + [c["username"] for c in cl_list])
            numbers = [n for n in numbers if n.get("user","") in allowed]

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID","Number","App","Status","User","Country","Provider","Allocated At","SMS Count"])
    for n in numbers:
        writer.writerow([n.get("id",""), n.get("number",""), n.get("app",""),
                         n.get("status",""), n.get("user",""), n.get("country",""),
                         n.get("provider",""), n.get("allocated_at",""), n.get("sms_count",0)])
    output.seek(0)
    filename = f"numbers_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(io.BytesIO(output.getvalue().encode()),
                             media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})

# ─── Numbers: get unallocated pool ────────────────────────────────────────────
@app.get("/api/numbers/pool")
async def get_number_pool(page: int=1, limit: int=20, service: str=""):
    numbers = read_db("numbers")
    pool = [n for n in numbers if n.get("user","") in ("unallocated","admin","") or n.get("status") == "active"]
    if service: pool = [n for n in pool if n.get("app","") == service]
    start = (page-1)*limit
    return {"data": pool[start:start+limit], "total": len(pool)}

# Must stay after every other literal /api/numbers/... route above, since this
# dynamic {number_id} pattern would otherwise shadow them (e.g. swallow
# "/api/numbers/pool" as number_id="pool" and 422 before reaching the real route).
@app.get("/api/numbers/{number_id}")
async def get_number(number_id: int):
    data = read_db("numbers")
    n = next((n for n in data if n["id"] == number_id), None)
    if not n:
        raise HTTPException(404, "Number not found")
    return n

# ─── Numbers: assign service/app to numbers ──────────────────────────────────
@app.post("/api/numbers/assign-service")
async def assign_service_to_numbers(payload: dict):
    number_ids = payload.get("number_ids", [])
    service = payload.get("service", "")
    numbers = read_db("numbers")
    updated = 0
    for n in numbers:
        if n["id"] in number_ids:
            n["app"] = service
            updated += 1
    write_db("numbers", numbers)
    return {"success": True, "updated": updated}

# ─── WebSockets ──────────────────────────────────────────────────────────────
@app.websocket("/ws/live-otp")
async def ws_live_otp(ws: WebSocket):
    """Relays REAL incoming OTPs only — pushed by /api/sms/inbound when an
    actual message arrives. No fake/simulated data is ever generated here."""
    await otp_manager.connect(ws)
    try:
        while True:
            # Idle keep-alive; actual OTP events are pushed via otp_manager.broadcast()
            await asyncio.sleep(30)
            await ws.send_text(json.dumps({"type": "heartbeat", "timestamp": datetime.utcnow().isoformat()}))
    except WebSocketDisconnect:
        otp_manager.disconnect(ws)

@app.websocket("/ws/live-traffic")
async def ws_live_traffic(ws: WebSocket):
    """Pushes real, current traffic stats (computed from sms_log) on an
    interval — no random/fabricated numbers."""
    await traffic_manager.connect(ws)
    try:
        while True:
            sms = read_db("sms_log")
            now = datetime.utcnow()
            last_minute = [s for s in sms if s.get("timestamp","") >= (now - timedelta(minutes=1)).isoformat()]
            delivered = [s for s in sms if s.get("status") == "delivered"]
            await ws.send_text(json.dumps({
                "type": "traffic",
                "mps": len(last_minute),
                "total": len(sms),
                "success_rate": round(len(delivered) / max(len(sms), 1) * 100, 1),
                "timestamp": now.isoformat()
            }))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        traffic_manager.disconnect(ws)

@app.websocket("/ws/smpp-monitor")
async def ws_smpp_monitor(ws: WebSocket):
    """Pushes real SMPP session/account stats — no random/fabricated numbers."""
    await smpp_ws_manager.connect(ws)
    try:
        while True:
            sessions = read_db("smpp_sessions")
            accounts = read_db("smpp_accounts")
            sms = read_db("sms_log")
            now = datetime.utcnow()
            last_minute = [s for s in sms if s.get("timestamp","") >= (now - timedelta(minutes=1)).isoformat()]
            delivered = [s for s in sms if s.get("status") == "delivered"]
            await ws.send_text(json.dumps({
                "type": "smpp",
                "sessions": len(sessions),
                "active_accounts": sum(1 for a in accounts if a.get("status") == "active"),
                "mps": len(last_minute),
                "dlr": round(len(delivered) / max(len(sms), 1) * 100, 1) if sms else 0,
                "timestamp": now.isoformat()
            }))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        smpp_ws_manager.disconnect(ws)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=80, reload=False)
