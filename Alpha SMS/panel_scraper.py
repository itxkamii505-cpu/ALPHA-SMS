import sys
import json
import os
import re
import hashlib
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from login_panel_client import PanelSession, pick_fields, extract_otp, map_by_headers

def do_test(panel):
    sess = PanelSession(panel["panel_url"], panel.get("username", ""), panel.get("password", ""), timeout=int(panel.get("timeout") or 18))
    sess.login()
    headers, rows = sess.fetch_table(panel["data_url"], limit=10)
    mapping = panel.get("columns") or map_by_headers(headers) or None
    preview = [pick_fields(r, mapping) for r in rows[:10]]
    for p in preview:
        if not p.get("otp"):
            p["otp"] = extract_otp(p.get("message", ""))
    return {"success": True, "rows": len(rows), "headers": headers, "preview": preview}

def do_poll(panel):
    limit = int(panel.get("rows") or 200)
    sess = PanelSession(panel["panel_url"], panel.get("username", ""), panel.get("password", ""), timeout=int(panel.get("timeout") or 18))
    headers, rows = sess.fetch_table(panel["data_url"], limit=limit)
    mapping = panel.get("columns") or map_by_headers(headers) or None
    parsed_rows = []
    for r in rows:
        f = pick_fields(r, mapping)
        if f.get("number") and f.get("message"):
            if not f.get("otp"):
                f["otp"] = extract_otp(f.get("message", ""))
            parsed_rows.append(f)
    return {"success": True, "headers": headers, "count": len(rows), "rows": parsed_rows}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: panel_scraper.py <test|poll> [payload_json_or_file]"}))
        sys.exit(1)

    cmd = sys.argv[1].lower()
    raw_json = ""
    if len(sys.argv) >= 3:
        arg = sys.argv[2]
        if os.path.isfile(arg):
            with open(arg, "r", encoding="utf-8") as f:
                raw_json = f.read()
        else:
            raw_json = arg
    else:
        raw_json = sys.stdin.read()

    try:
        panel_data = json.loads(raw_json)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON payload: {str(e)}"}))
        sys.exit(1)

    try:
        if cmd == "test":
            res = do_test(panel_data)
        elif cmd == "poll":
            res = do_poll(panel_data)
        else:
            res = {"success": False, "error": f"Unknown command: {cmd}"}
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(0)
