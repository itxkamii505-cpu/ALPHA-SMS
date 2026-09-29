# 🎯 OTP Admin — Hierarchy System

## Structure

```
Admin
  └── Manager
       └── Agent
            └── Client
```

---

## Roles & Access

### **Admin** (You)
- **Login**: `/` (main admin panel)
- **Powers**:
  - Create/manage Managers
  - View all Managers, Agents, Clients
  - Full system control
  - Hierarchy view
  - All numbers, SMS, SMPP, firewall, settings

### **Manager**
- **Login**: `/manager` (manager dashboard)
- **Powers**:
  - Create/manage Agents (under them)
  - Create/manage Clients (under their agents)
  - View their agents & clients only
  - Assign numbers to clients
  - View SMS stats for their team
  - Monitor traffic
- **Restrictions**: Cannot see other managers' data

### **Agent**
- **Login**: `/manager` (same panel as manager, but limited view)
- **Powers**:
  - View their assigned clients only
  - Edit client limits/balance
  - View SMS for their clients
- **Restrictions**: Cannot create agents, cannot see other agents' clients

### **Client**
- **Login**: External API or future client panel
- **Powers**: Use numbers, send SMS (via API)

---

## Test Accounts

All passwords: `admin123 / manager123 / agent123 / client123`

| Username | Role | Login URL | Notes |
|----------|------|-----------|-------|
| `admin` | Admin | `/` | Full control |
| `manager2` | Manager | `/manager` | Has 10 agents (agent1–5, agent11–15) |
| `manager3` | Manager | `/manager` | Has 5 agents (agent6–10) |
| `agent1` | Agent | `/manager` | Under manager2, has 3 clients |
| `agent6` | Agent | `/manager` | Under manager3, has 3 clients |
| `agent7` | Agent | `/manager` | **Suspended** — test account |
| `client1` | Client | (API only) | Under agent2, manager2 |
| `client8` | Client | (API only) | **Suspended** — test account |

---

## Files Created

### Backend
- `data/agents.json` — 15 agents
- `data/clients.json` — 30 clients
- `generate_data.py` — Data generator script

### Frontend
- `static/manager.html` — Manager/Agent panel UI
- `static/js/manager.js` — Manager panel logic

### API Routes
```
GET  /api/agents?manager_id=X           # Get agents by manager
POST /api/agents                        # Create agent
PATCH /api/agents/{id}                  # Update agent
DELETE /api/agents/{id}                 # Delete agent

GET  /api/clients?agent_id=X&manager_id=Y   # Get clients
POST /api/clients                           # Create client
PATCH /api/clients/{id}                     # Update client
DELETE /api/clients/{id}                    # Delete client

GET /api/manager/{id}/stats             # Manager dashboard stats
GET /api/hierarchy                      # Full hierarchy tree
```

---

## How to Use

### 1. **Admin creates Manager**
- Go to `/` → Management Group → **Managers** → **Add Manager**
- Manager can login at `/manager`

### 2. **Manager creates Agent**
- Manager logs in at `/manager`
- Go to **Agents** → **Add Agent**
- Agent inherits manager_id automatically

### 3. **Manager creates Client** (via Agent)
- Go to **Clients** → **Add Client**
- Select which agent to assign
- Client inherits both agent_id and manager_id

### 4. **Admin views everything**
- `/` → Management Group → **Hierarchy View**
- See full tree: Admin → Managers → Agents → Clients

---

## Key Features

✅ **Role-based login redirect**: Manager → `/manager`, Admin → `/`  
✅ **Manager dashboard**: Purple theme, agent/client management  
✅ **Agent performance**: Leaderboard, client counts  
✅ **Client limits**: Daily/monthly SMS quotas  
✅ **Client balances**: Adjust balance (add/subtract/set)  
✅ **Live traffic**: Real-time SMS chart  
✅ **Hierarchy view**: Visual tree in admin panel  
✅ **Test accounts**: Pre-populated with 2 managers, 15 agents, 30 clients  

---

## Database

All data is stored in JSON:
- `data/users.json` — Admin + Managers
- `data/agents.json` — Agents (linked via manager_id)
- `data/clients.json` — Clients (linked via agent_id + manager_id)

Changes auto-save. Restart server to persist.

---

**সব সেটআপ হয়ে গেছে!** 🎉

Login করুন:
- Admin: `admin / admin123` at **http://localhost:8000**
- Manager: `manager2 / manager123` at **http://localhost:8000/manager**
