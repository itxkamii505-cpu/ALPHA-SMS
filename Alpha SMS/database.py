"""
JSON File-Based Database
All data is stored in /data/*.json files.
Auto-creates files with seed data on first run.
"""

import json
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
import random
import string

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

_locks: dict[str, threading.Lock] = {}

def _get_lock(name: str) -> threading.Lock:
    if name not in _locks:
        _locks[name] = threading.Lock()
    return _locks[name]

# ── Core read/write ──────────────────────────────────────────────────────────

def read_db(name: str) -> list | dict:
    """Read a JSON database file. Returns [] or {} if missing."""
    path = DATA_DIR / f"{name}.json"
    with _get_lock(name):
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

def write_db(name: str, data: list | dict) -> None:
    """Write data to a JSON database file (atomic)."""
    path = DATA_DIR / f"{name}.json"
    tmp  = DATA_DIR / f"{name}.tmp.json"
    with _get_lock(name):
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        tmp.replace(path)

def next_id(data: list) -> int:
    """Get next auto-increment ID for a list of dicts."""
    if not data:
        return 1
    return max((item.get("id", 0) for item in data), default=0) + 1

# ── Seed helpers ─────────────────────────────────────────────────────────────

def _rand_ip():
    return f"{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"

def _ago(**kw):
    return (datetime.utcnow() - timedelta(**kw)).isoformat()

def _future(**kw):
    return (datetime.utcnow() + timedelta(**kw)).isoformat()

APPS      = ["WhatsApp","Telegram","Google","Amazon","Facebook","Twitter","Instagram","Netflix","Uber","Discord"]
COUNTRIES = ["US","UK","IN","DE","FR","AU","CA","BR","JP","KR"]
PROVIDERS = ["Twilio","Vonage","Plivo","Bandwidth","Telnyx"]

# ── Seed functions ───────────────────────────────────────────────────────────

def seed_users():
    """Only the real Admin account — no fake/demo Manager, Reseller, or
    User rows. Managers/Agents/Clients get added for real from the admin
    panel as needed."""
    return [
        {
            "id": 1,
            "username": "Kamran_Bhatti",
            "password": "Kamran_Bhatti",
            "role": "Owner",
            "email": "kamran@speedsms.com",
            "balance": 0,
            "status": "active",
            "numbers": 0,
            "created": _ago(days=0),
            "last_login": None,
            "company": None,
            "phone": "",
            "two_fa": False,
            "notes": "System Owner"
        }
    ]

def seed_testpanel_credentials():
    """No demo credentials."""
    return []

def seed_numbers():
    """No fake/demo numbers — real numbers get added for real via the
    admin panel (or SMPP allocation), never fabricated on first run."""
    return []

def seed_sms_log():
    """No fake/demo SMS traffic — every row here should be a real OTP
    delivery logged by the live webhook, never fabricated on first run."""
    return []

def seed_smpp_accounts():
    """No fake/demo SMPP provider accounts — added for real by the admin."""
    return []

def seed_smpp_sessions():
    """No fake/demo SMPP sessions — populated only by real connections."""
    return []

def seed_allocation_history():
    """No fake/demo allocation history — built up from real allocations."""
    return []

def seed_registration_requests():
    """No fake/demo signup requests — populated only by real signups."""
    return []

def seed_payout_requests():
    """No fake/demo payout requests — populated only by real agent/client
    withdrawal requests."""
    return []

def seed_audit_logs():
    """No fake/demo audit trail — built up only from real actions."""
    return []

def seed_blacklist():
    """No fake/demo blacklist entries — added for real by the admin."""
    return []

def seed_blocked_ips():
    """No fake/demo blocked IPs — populated only by real blocks."""
    return []

def seed_firewall_events():
    """No fake/demo firewall events — populated only by real traffic."""
    return []

def seed_api_tokens():
    """No fake/demo API tokens — generated for real by the admin."""
    return []

def seed_rate_limits():
    return {
        "login":       {"limit": 5,    "window": 60,   "enabled": True},
        "signup":      {"limit": 3,    "window": 3600, "enabled": True},
        "api_calls":   {"limit": 1000, "window": 60,   "enabled": True},
        "page_visits": {"limit": 200,  "window": 60,   "enabled": False}
    }

def seed_settings():
    return {
        "otp_limit": 5,
        "payout_rate": 0.85,
        "min_payout": 10.0,
        "monthly_min_settlement": 50.0,
        "two_fa_enabled": True,
        "maintenance_mode": False,
        "default_currency": "USD",
        "timezone": "UTC",
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "admin_email": "admin@example.com",
        "site_name": "OTP Admin",
        "max_sessions": 3,
        "session_timeout": 60,
        "smpp_host": "0.0.0.0",
        "smpp_port": 2775,
        "smpp_max_connections": 100,
        "smpp_max_mps": 500,
        "smpp_global_max_mps": 5000,
        "webhook_url": "",
        "webhook_secret": "",
        "webhook_retry": 3,
        "webhook_timeout": 30
    }

def seed_sms_ranges():
    return [
        {
            "id": i,
            "country": COUNTRIES[i % len(COUNTRIES)],
            "provider": PROVIDERS[i % len(PROVIDERS)],
            "prefix": f"+{i + 1}",
            "cost": round(0.001 + i * 0.0005, 4),
            "payout": round(0.0008 + i * 0.0004, 4),
            "active": True,
            "created": _ago(days=i * 5)
        }
        for i in range(1, 11)
    ]

def seed_rate_card():
    return [
        {
            "id": i,
            "country": COUNTRIES[i % len(COUNTRIES)],
            "provider": PROVIDERS[i % len(PROVIDERS)],
            "buy_rate": round(0.003 + i * 0.001, 4),
            "sell_rate": round(0.005 + i * 0.0015, 4),
            "margin": f"{20 + i}%",
            "active": True,
            "created": _ago(days=i * 3)
        }
        for i in range(1, 16)
    ]

def seed_announcements():
    return [
        {
            "id": 1,
            "title": "System Maintenance Scheduled",
            "body": "Scheduled maintenance on Jan 22 from 02:00–04:00 UTC. Expect brief downtime.",
            "type": "warning",
            "created": _ago(days=2),
            "author": "admin",
            "pinned": True
        },
        {
            "id": 2,
            "title": "New Feature: Bulk Allocation",
            "body": "Bulk number allocation now supports CSV range import.",
            "type": "info",
            "created": _ago(days=7),
            "author": "admin",
            "pinned": False
        },
        {
            "id": 3,
            "title": "API v2 Released",
            "body": "New API version with improved throughput and field mapping.",
            "type": "success",
            "created": _ago(days=14),
            "author": "admin",
            "pinned": False
        }
    ]

def seed_support_tickets():
    """No fake/demo support tickets — populated only by real tickets."""
    return []

def seed_webhook_config():
    return {
        "url": "",
        "method": "POST",
        "secret": "",
        "events": ["otp_received", "number_allocated", "user_created"],
        "headers": {"Content-Type": "application/json"},
        "retry": 3,
        "timeout": 30,
        "active": False
    }

def seed_permissions():
    return {
        "Admin":    {"Numbers":1,"SMS":1,"SMPP":1,"Users":1,"Finance":1,"API":1,"Settings":1,"Security":1},
        "Manager":  {"Numbers":1,"SMS":1,"SMPP":1,"Users":1,"Finance":1,"API":0,"Settings":0,"Security":0},
        "Reseller": {"Numbers":1,"SMS":1,"SMPP":0,"Users":0,"Finance":1,"API":1,"Settings":0,"Security":0},
        "User":     {"Numbers":1,"SMS":1,"SMPP":0,"Users":0,"Finance":0,"API":1,"Settings":0,"Security":0},
    }

# ── New seed functions ─────────────────────────────────────────────────────────

def seed_services():
    service_list = [
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
    ]
    return [
        {"id":i+1,"name":n,"icon":ic,"color":cl,"description":desc,"payout_rate":pr,
         "active":True,"created":datetime.utcnow().isoformat()}
        for i,(n,ic,cl,desc,pr) in enumerate(service_list)
    ]

def seed_number_transfers():
    return []

def seed_payout_rates():
    return {
        "admin_to_manager": {"default_rate": 0.05, "description": "Admin pays manager per OTP delivered", "currency": "USD"},
        "manager_to_agent": {"default_rate": 0.03, "description": "Manager pays agent per OTP delivered", "currency": "USD"},
        "service_rates": {
            "WhatsApp":  {"admin_to_manager": 0.05,  "manager_to_agent": 0.03},
            "Telegram":  {"admin_to_manager": 0.04,  "manager_to_agent": 0.025},
            "Google":    {"admin_to_manager": 0.06,  "manager_to_agent": 0.035},
            "Facebook":  {"admin_to_manager": 0.045, "manager_to_agent": 0.028},
            "Amazon":    {"admin_to_manager": 0.055, "manager_to_agent": 0.032},
            "Aadhaar":   {"admin_to_manager": 0.08,  "manager_to_agent": 0.05},
            "TikTok":    {"admin_to_manager": 0.04,  "manager_to_agent": 0.025},
            "Twitter":   {"admin_to_manager": 0.035, "manager_to_agent": 0.022},
            "Instagram": {"admin_to_manager": 0.04,  "manager_to_agent": 0.025},
            "Netflix":   {"admin_to_manager": 0.05,  "manager_to_agent": 0.03},
            "Discord":   {"admin_to_manager": 0.03,  "manager_to_agent": 0.018},
            "Snapchat":  {"admin_to_manager": 0.035, "manager_to_agent": 0.022},
            "LinkedIn":  {"admin_to_manager": 0.05,  "manager_to_agent": 0.03},
            "Microsoft": {"admin_to_manager": 0.055, "manager_to_agent": 0.033},
            "Uber":      {"admin_to_manager": 0.035, "manager_to_agent": 0.022},
        }
    }

# ── Auto-seed on import ───────────────────────────────────────────────────────

def seed_cr_api_connections():
    return []

SEEDS = {
    "users":                  seed_users,
    "testpanel_credentials":  seed_testpanel_credentials,
    "numbers":                seed_numbers,
    "sms_log":                seed_sms_log,
    "smpp_accounts":          seed_smpp_accounts,
    "cr_api_connections":     seed_cr_api_connections,
    "smpp_sessions":          seed_smpp_sessions,
    "allocation_history":     seed_allocation_history,
    "registration_requests":  seed_registration_requests,
    "payout_requests":        seed_payout_requests,
    "audit_logs":             seed_audit_logs,
    "blacklist":              seed_blacklist,
    "blocked_ips":            seed_blocked_ips,
    "firewall_events":        seed_firewall_events,
    "api_tokens":             seed_api_tokens,
    "rate_limits":            seed_rate_limits,
    "settings":               seed_settings,
    "sms_ranges":             seed_sms_ranges,
    "rate_card":              seed_rate_card,
    "announcements":          seed_announcements,
    "support_tickets":        seed_support_tickets,
    "webhook_config":         seed_webhook_config,
    "permissions":            seed_permissions,
    "services":               seed_services,
    "number_transfers":       seed_number_transfers,
    "payout_rates":           seed_payout_rates,
}

def init_db():
    """Create all JSON files if they don't exist."""
    created = []
    for name, seed_fn in SEEDS.items():
        path = DATA_DIR / f"{name}.json"
        if not path.exists():
            write_db(name, seed_fn())
            created.append(name)
    if created:
        print(f"[DB] Created {len(created)} database files: {', '.join(created)}")
    else:
        print(f"[DB] All {len(SEEDS)} database files already exist.")

# Run on import
init_db()
