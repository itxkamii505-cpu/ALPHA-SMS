# MAIT SMS ADMIN PANEL 

A complete admin panel for OTP/virtual number management.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
sudo python3 main.py
```

Then open **http://YOUR_PUBLIC_IP** in your browser. The server listens on HTTP port 80, so no port number is needed in the URL.

Or just double-click **start.bat** on Windows.

## Features

All modules implemented:
- Numbers Group (My Numbers, Bulk Allocation, History, Ranges, Rate Card, Search, Live Access, Upload, Blacklist, Revoke, Test)
- SMS Group (My SMS, Profit Stats, Live OTP Feed, Analytics, Search, Delivery Logs, Failed SMS, Live Traffic)
- SMPP Server (Dashboard, Accounts, Sessions, Connected Clients, DLR Monitor, Throughput, Security, Connection Logs)
- Requests Group (Registration Requests, Payout Requests)
- Management Group (Users, Account Balances, Audit Logs, Permissions)
- HTTP Providers (Overview, Standard Webhook, Custom Postback, Field Mapping, Test Endpoint)
- API Group (Tokens, Playground, Live Test, Webhook Config, Documentation)
- Communication (Announcements, Support Tickets)
- Account (Profile, Payouts)
- Security Center (Firewall Dashboard, Blocked IPs, Events, Rate Limits)
- Settings (General, Security, SMPP Settings, Backup & Restore)

## Tech Stack

- **Backend**: Python FastAPI
- **Frontend**: HTML5 / CSS3 / Vanilla JS
- **Charts**: Chart.js
- **Icons**: Font Awesome 6
- **Real-time**: WebSockets

## Production Notes

Replace in-memory mock data with a real database (PostgreSQL + Redis recommended).
