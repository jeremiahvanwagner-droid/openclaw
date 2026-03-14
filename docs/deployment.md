# OpenClaw Deployment Guide

## Architecture Overview

```
┌──────────────┐     ┌─────────────────────────────────────────────┐
│   Telegram   │     │        Hetzner VPS (24/7)                   │
│   Bot Users  │◄───►│  ┌─────────┐  ┌───────────────────────┐    │
└──────────────┘     │  │  Caddy   │  │   OpenClaw Gateway    │    │
                     │  │  (TLS)   │─►│   Port 18789          │    │
┌──────────────┐     │  │          │  │   - 75 AI Agents      │    │
│  GHL CRM     │     │  │  :443    │  │   - Cron Jobs         │    │
│  Webhooks    │────►│  │  :80     │  │   - Telegram Bot      │    │
└──────────────┘     │  │          │  └───────────────────────┘    │
                     │  │          │  ┌───────────────────────┐    │
                     │  │          │─►│  GHL Webhook Handler  │    │
                     │  └─────────┘  │  Port 8788             │    │
                     │               └───────────────────────┘    │
                     └─────────────────────────────────────────────┘
                                          │
                     ┌────────────────────┼────────────────────┐
                     ▼                    ▼                    ▼
              ┌──────────┐      ┌──────────────┐    ┌──────────────┐
              │ Supabase │      │   Inngest    │    │  LLM APIs    │
              │ (DB +    │      │ (Event Bus)  │    │ (Claude/GPT) │
              │ pgvector)│      └──────────────┘    └──────────────┘
              └──────────┘
                     ▲
              ┌──────────┐
              │  Vercel  │
              │Dashboard │
              │ (Next.js)│
              └──────────┘
```

## Prerequisites

- **Hetzner VPS** — CX21 or better (2 vCPU, 4GB RAM, ~€5/mo)
- **Domain name** — with DNS A records for `api.` and `webhook.` subdomains
- **GitHub account** — for private repo + Actions CI/CD
- **Vercel account** — paid tier for dashboard
- **Service accounts:** Supabase, Inngest, Anthropic, OpenAI, GHL, Telegram

---

## Quick Start — Local Development

```bash
# 1. Clone the repo
git clone https://github.com/truthjblue/openclaw.git
cd openclaw

# 2. Copy environment template and fill in values
cp .env.example .env
# Edit .env with your actual API keys

# 3. Run with Docker Compose
docker compose up

# Gateway: http://localhost:18789
# Webhook: http://localhost:8788
```

---

## Production Deployment — Hetzner VPS

### 1. Create the VPS

Create an Ubuntu 22.04 VPS on Hetzner Cloud (CX21 recommended). Note the IP address.

### 2. Point DNS

Create A records pointing to your VPS IP:
```
api.yourdomain.com     → VPS_IP
webhook.yourdomain.com → VPS_IP
```

### 3. Run Provisioning Script

```bash
# SSH into the VPS
ssh root@YOUR_VPS_IP

# Download and run the provisioning script
curl -sSL https://raw.githubusercontent.com/truthjblue/openclaw/main/deploy/hetzner/provision.sh | bash
```

This installs Node.js 22.x, OpenClaw CLI, Caddy, creates the `openclaw` system user, clones the repo, installs systemd services, and configures the firewall.

### 4. Configure Environment

```bash
# Edit with your real API keys
sudo nano /etc/openclaw/.env
```

All variables from `.env.example` must be filled in. Critical ones:
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `GHL_PRIVATE_INTEGRATION_TOKEN` — from GoHighLevel
- `SUPABASE_URL` + keys — from Supabase dashboard
- `OPENAI_API_KEY` — from OpenAI platform
- `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` — from Inngest dashboard

### 5. Configure Caddy

```bash
# Replace YOUR_DOMAIN with your actual domain
sudo sed -i 's/YOUR_DOMAIN/yourdomain.com/g' /etc/caddy/Caddyfile
```

### 6. Start Services

```bash
sudo systemctl start caddy
sudo systemctl start openclaw
sudo systemctl start openclaw-webhook

# Verify
sudo systemctl status openclaw
sudo systemctl status openclaw-webhook
curl http://localhost:18789/health
```

### 7. Setup Monitoring

```bash
# Add health check cron (runs every 5 minutes)
sudo crontab -e
# Add: */5 * * * * /opt/openclaw/deploy/hetzner/health-check.sh

# Add daily backup (runs at 3 AM)
# Add: 0 3 * * * /opt/openclaw/deploy/hetzner/backup.sh
```

---

## CI/CD — GitHub Actions

### Required GitHub Secrets

Go to **Settings → Secrets and variables → Actions** in your GitHub repo:

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | VPS IP address |
| `HETZNER_USER` | SSH user (e.g., `root` or `openclaw`) |
| `HETZNER_SSH_KEY` | Private SSH key for VPS access |
| `TELEGRAM_BOT_TOKEN` | For deploy notifications |
| `TELEGRAM_ALERT_CHAT_ID` | Chat ID for notifications |
| `VERCEL_TOKEN` | Vercel deployment token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL for dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for dashboard |

### How It Works

- **Push to `main`** (non-dashboard files) → auto-deploys bot to Hetzner VPS
- **Push to `main`** (dashboard files) → auto-deploys dashboard to Vercel
- **Manual trigger** → deploy with optional CLI upgrade via GitHub Actions UI

---

## Dashboard — Vercel

### Setup

1. Create a new project on [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Set **Root Directory** to `dashboard`
4. Set **Framework Preset** to Next.js
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Deploy

After initial setup, pushes to `dashboard/**` auto-deploy via GitHub Actions.

---

## Service Management

```bash
# Check status
sudo systemctl status openclaw
sudo systemctl status openclaw-webhook

# View logs
journalctl -u openclaw -f           # Follow gateway logs
journalctl -u openclaw-webhook -f   # Follow webhook logs
journalctl -u openclaw --since today # Today's logs

# Restart
sudo systemctl restart openclaw
sudo systemctl restart openclaw-webhook

# Manual deploy
cd /opt/openclaw
sudo bash deploy/hetzner/deploy.sh           # Pull + restart
sudo bash deploy/hetzner/deploy.sh --upgrade # Also update CLI
```

---

## Credential Rotation

See [deploy/hetzner/ROTATION-CHECKLIST.md](../deploy/hetzner/ROTATION-CHECKLIST.md) for the full checklist.

Quick reference:
1. Update the value in `/etc/openclaw/.env` on the VPS
2. Update the corresponding GitHub Secret
3. Restart services: `sudo systemctl restart openclaw openclaw-webhook`
4. Verify: `curl http://localhost:18789/health`

---

## Troubleshooting

| Issue | Command |
|-------|---------|
| Gateway won't start | `journalctl -u openclaw -n 50 --no-pager` |
| Webhook errors | `journalctl -u openclaw-webhook -n 50 --no-pager` |
| TLS cert issues | `sudo caddy reload --config /etc/caddy/Caddyfile` |
| Service keeps crashing | `systemctl show openclaw --property=NRestarts` |
| Disk space | `df -h /opt/openclaw` |
| Memory usage | `systemctl show openclaw --property=MemoryCurrent` |
| Port conflicts | `ss -tlnp | grep -E '18789|8788'` |
