import json
import os
from datetime import datetime, timedelta

now = datetime.utcnow()
data_dir = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(data_dir, exist_ok=True)

# ─────────────────────────────────────────────
#  FILE 1 – agents.json
# ─────────────────────────────────────────────
agents = []
for i in range(1, 16):
    # manager_id: agents 1-5 → 2, agents 6-10 → 3, agents 11-15 → 2
    if 1 <= i <= 5:
        manager_id = 2
    elif 6 <= i <= 10:
        manager_id = 3
    else:
        manager_id = 2

    status = "suspended" if i in (7, 14) else "active"

    agent = {
        "id": i,
        "username": f"agent{i}",
        "password": "agent123",
        "role": "Agent",
        "email": f"agent{i}@example.com",
        "full_name": f"Agent {i} Name",
        "phone": f"+1202555{i:04d}",
        "manager_id": manager_id,
        "status": status,
        "balance": 0.0,
        "commission_rate": 5.0,
        "clients_count": i * 3,
        "numbers_assigned": i * 10,
        "created": (now - timedelta(days=i * 10)).isoformat() + "Z",
        "last_login": (now - timedelta(hours=i * 2)).isoformat() + "Z",
        "notes": ""
    }
    agents.append(agent)

agents_path = os.path.join(data_dir, "agents.json")
with open(agents_path, "w", encoding="utf-8") as f:
    json.dump(agents, f, indent=2)

print(f"✓  agents.json  written  ({len(agents)} records) → {agents_path}")

# ─────────────────────────────────────────────
#  FILE 2 – clients.json
# ─────────────────────────────────────────────
services = ["WhatsApp", "Telegram", "Google", "Amazon", "Facebook"]
clients = []

for i in range(1, 31):
    agent_id = (i % 15) + 1  # cycles 2,3,...,15,1,2,...

    if 1 <= agent_id <= 5:
        manager_id = 2
    elif 6 <= agent_id <= 10:
        manager_id = 3
    else:
        manager_id = 2

    status = "suspended" if i in (8, 22) else "active"
    service = services[(i - 1) % len(services)]

    client = {
        "id": i,
        "username": f"client{i}",
        "password": "client123",
        "role": "Client",
        "email": f"client{i}@example.com",
        "full_name": f"Client {i} Name",
        "phone": f"+1305555{i:04d}",
        "agent_id": agent_id,
        "manager_id": manager_id,
        "status": status,
        "balance": round(i * 50.25, 2),
        "numbers_assigned": i * 5,
        "daily_limit": 100,
        "monthly_limit": 3000,
        "service": service,
        "created": (now - timedelta(days=i * 7)).isoformat() + "Z",
        "last_active": (now - timedelta(hours=i * 4)).isoformat() + "Z",
        "total_sms": i * 45,
        "notes": ""
    }
    clients.append(client)

clients_path = os.path.join(data_dir, "clients.json")
with open(clients_path, "w", encoding="utf-8") as f:
    json.dump(clients, f, indent=2)

print(f"✓  clients.json written  ({len(clients)} records) → {clients_path}")
print("\nDone.")
