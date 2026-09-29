# 👨‍💼 Agent Panel — Complete Guide

## Access

**URL:** `http://localhost:8000/agent`

**Login:** `agent1 / agent123` (or any agent1-15)

---

## Agent Features

### 📱 IPRN SMS MODULE
- **SMS Ranges** — View available IPRN ranges with cost/payout
- **My SMS Numbers** — Pool of assigned numbers (200+ numbers)
- **SMS RateCard** — Buy/sell rates by country & provider

### 🧪 SMS TEST PANEL
- **Send Test SMS** — Test single OTP delivery
- **Bulk Test** — Test multiple numbers at once (up to 20)
- **Live Log** — Real-time test results with latency

### 👥 MY CLIENTS
- View all clients assigned to you
- **Balance Adjustment** — Add/subtract/set client balance
- **Client Details** — View service, limits, SMS count
- **Status Management** — Monitor client status & usage

### 📊 SMS CDR & STATISTICS
1. **Detailed SMS Reports** — Full CDR with date filters & export
2. **Summary SMS Reports** — Monthly totals & hourly traffic charts
3. **Client SMS Stats** — Per-client SMS usage with progress bars
4. **SMS Range Stats** — Performance per range with revenue
5. **SMS Number Stats** — Per-number performance tracking

### 💰 FINANCIAL
- **My Credit Notes** — Commission & bonus credits (5 sample notes)
- **Payment Requests** — Withdraw earnings (min $50)
  - USDT (TRC-20/ERC-20)
  - Bank Transfer
  - PayPal / Wise
- **Bank Accounts** — Manage payment methods

### 📄 STATEMENTS
- **EUR Statements** — Monthly balance statements in EUR (€)
- **GBP Statements** — Monthly balance statements in GBP (£)
- **USD Statements** — Monthly balance statements in USD ($)
- Download PDF for each month

### 📰 NEWS FOR CLIENTS
- Platform announcements
- System maintenance notices
- New features

### 👤 ACCOUNT
- **My Profile** — Change password, setup 2FA
- **My Earnings** — Commission overview with 30-day chart

---

## Agent Hierarchy

```
Manager (manager2)
  └─ Agent (agent1)
       └─ Clients (client1, client15, client16)
```

**agent1** belongs to **manager2** and has **3 clients** assigned.

---

## Test Accounts

| Username | Password | Manager | Clients | Login URL |
|----------|----------|---------|---------|-----------|
| `agent1` | `agent123` | manager2 | 3 | `/agent` |
| `agent2` | `agent123` | manager2 | 6 | `/agent` |
| `agent6` | `agent123` | manager3 | 3 | `/agent` |
| `agent7` | `agent123` | manager3 (suspended) | 3 | `/agent` |

---

## Features Summary

✅ **Dashboard** — Stats, traffic charts, quick actions  
✅ **SMS Ranges** — Cost/payout per country/provider  
✅ **My Numbers** — 200+ virtual numbers with search/export  
✅ **Test Panel** — Single + bulk SMS testing with live logs  
✅ **Client Management** — View, balance adjust, status  
✅ **Detailed Reports** — Full CDR with date filters  
✅ **Summary Reports** — Monthly totals & hourly charts  
✅ **Client SMS Stats** — Usage % with progress bars  
✅ **Credit Notes** — Commission history  
✅ **Payment Requests** — Withdraw to USDT/bank/PayPal  
✅ **Bank Accounts** — Manage payment methods  
✅ **Statements** — EUR/GBP/USD monthly statements with PDF download  
✅ **Earnings** — 30-day chart with daily breakdown  
✅ **News** — Platform announcements  

---

## Color Theme

**Agent Panel:** Cyan/Turquoise (`#06b6d4`)  
**Manager Panel:** Purple (`#7c3aed`)  
**Admin Panel:** Blue (`#4c6ef5`)

---

## Quick Start

```bash
# Login as agent
http://localhost:8000/agent

Username: agent1
Password: agent123
```

Agent panel থেকে সব features test করতে পারবেন। Client balance adjust, SMS test, payment request — সব কাজ করে।

**Admin থেকে দেখতে:**
- Management Group → Agents → All agents listed
- Management Group → Hierarchy → Full tree view

---

**সব রেডি!** 🚀
