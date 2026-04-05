# OpenClaw / REGGIE

> Truth J Blue LLC | 103 configured agents across 9 divisions

## Overview

OpenClaw is the multi-agent operating system for Truth J Blue LLC. In repo terms, `REGGIE` is the full runtime: agent workforce, routing, skills, GHL integration, memory, deployment, and monitoring.

This README is operator-facing and repo-verified. For the current audit record, read [REGGIE-STATE.md](REGGIE-STATE.md) first.

## Repo-Verified Architecture

- `103` configured agents in `config/agents_config.json`
- `107` runtime entries in `config/openclaw.prod.json` and `openclaw.json`
- `4` runtime aliases: `main`, `marketing`, `sales`, `support`
- `9` divisions, documented in [AGENTS.md](AGENTS.md)
- Anthropic runtime model assignments aligned between `config/openclaw.prod.json` and `openclaw.json`
- OpenAI remains only for `memorySearch` embeddings
- Split local/runtime topology:
  - gateway: `18789`
  - webhook handler: `8788`
  - monitoring stack: `deploy/monitoring`

## Sources Of Truth

- [REGGIE-STATE.md](REGGIE-STATE.md): current audit artifact and runtime posture
- [AGENTS.md](AGENTS.md): generated workforce snapshot
- `config/agents_config.json`: authoritative agent/division/governance config
- `config/openclaw.prod.json`: production runtime rollout config
- `openclaw.json`: local runtime config, kept in parity for agent/model assignment

## Quick Start

### Local Development With Docker

```bash
git clone https://github.com/truthjblue/openclaw.git
cd openclaw
cp .env.example .env
# Fill in real credentials

powershell -ExecutionPolicy Bypass -File scripts/sync-local-ghl-env.ps1 -PrimaryTenant TJB
node scripts/check-ghl-auth.mjs
docker compose up
```

Endpoints:

- gateway: `http://localhost:18789`
- webhook handler: `http://localhost:8788`

### Local Development Without Docker

```bash
npm install -g openclaw@latest
corepack enable
corepack pnpm install --frozen-lockfile
cp .env.example .env

powershell -ExecutionPolicy Bypass -File scripts/sync-local-ghl-env.ps1 -PrimaryTenant TJB
node scripts/check-ghl-auth.mjs
npx supabase db push
node scripts/generate-workspaces.mjs
node scripts/register-agents.mjs
powershell -ExecutionPolicy Bypass -File scripts/restart-local.ps1 -PrimaryTenant TJB
node --env-file=.env handlers/ghl-webhook-handler.mjs
```

Notes:

- Use `corepack pnpm ...` at the repo root.
- Do not use repo-root `node.cmd` or `node.json` shims on Windows.

## GHL Webhook Runtime

The webhook handler supports three auth modes:

- `X-GHL-Signature` for HighLevel platform webhooks
- `Authorization: Bearer <OPENCLAW_GATEWAY_AUTH_TOKEN>` for workflow custom webhooks
- `X-OpenClaw-Signature` for OpenClaw HMAC testing/fallback flows

Required env vars for webhook/HMAC paths:

- `OPENCLAW_GHL_WEBHOOK_SECRET`
- `OPENCLAW_GATEWAY_AUTH_TOKEN`
- `OPENCLAW_PUBLIC_WEBHOOK_BASE_URL`

Repo-verified hardening:

- the webhook handler fails closed if `OPENCLAW_GHL_WEBHOOK_SECRET` is unset
- webhook registration tooling now requires an explicit non-placeholder HMAC secret
- Hetzner webhook install tooling now fails if the secret is missing or placeholder-shaped

## Deployment

Production shape in the repo:

- bot/gateway runtime on Hetzner VPS
- webhook handler on the same host
- Caddy in front of runtime services
- dashboard deployed separately under `dashboard/`
- monitoring stack under `deploy/monitoring/`

Current CI/CD workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-bot.yml`

There is no repo-verified staging environment at this time.

## Monitoring

Monitoring assets live under `deploy/monitoring/`:

- Prometheus
- Grafana
- Loki
- Promtail

Repo-verified scrape targets:

- webhook handler: `host.docker.internal:8788`
- gateway: `host.docker.internal:18789`

Bring up the monitoring stack with:

```bash
docker compose -f deploy/monitoring/docker-compose.monitoring.yml up -d
```

Current limitation:

- this repo now contains the gateway scrape config, but live `UP` status and `:18789/metrics` reachability still need verification on a running stack

## Operator Access

### Dashboard

- URL: `https://truthjblue.dev/login`
- Recommended flow: magic link

### Remote Gateway Control

- URL: `https://api.truthjblue.dev`
- Preferred launcher:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/open-remote-control.ps1
```

### First-Time Device Pairing

```powershell
powershell -ExecutionPolicy Bypass -File scripts/approve-remote-device.ps1 -ListOnly
powershell -ExecutionPolicy Bypass -File scripts/approve-remote-device.ps1
```

### Host-Side Checks

```powershell
openclaw health
openclaw gateway status
```

If remote access fails, inspect the Hetzner host directly:

```powershell
ssh -i $env:USERPROFILE\\.ssh\\openclaw_hetzner root@87.99.138.98 "journalctl -u openclaw -n 100 --no-pager"
ssh -i $env:USERPROFILE\\.ssh\\openclaw_hetzner root@87.99.138.98 "journalctl -u caddy -n 100 --no-pager"
```

## Known Current Gaps

- no repo-verified staging environment
- no repo-verified `/health/deep` endpoint
- OpenAI embeddings are still retained for memory search
- historical planning/training docs still exist and should not be treated as live architecture

## Documentation Status

Current operator/runtime docs:

- [REGGIE-STATE.md](REGGIE-STATE.md)
- [AGENTS.md](AGENTS.md)
- [SOUL.md](SOUL.md)
- [MEMORY.md](MEMORY.md)
- [TOOLS.md](TOOLS.md)

Historical or planning docs now explicitly marked as stale/historical:

- `build_phases.md`
- `training/README.md`
- `training/OPENCLAW-AGENT-TRAINING-PLAN.md`
- `docs/OPEN-CLAW-STRATEGIC-REPORT.md`

## Project Layout

```text
openclaw/
├── config/                 authoritative config
├── handlers/               webhook handlers
├── lib/                    runtime libraries
├── skills/                 skill modules
├── inngest/                orchestration functions
├── dashboard/              Next.js dashboard
├── deploy/                 deployment and monitoring assets
├── scripts/                operational scripts
├── training/               historical training artifacts
└── docs/                   supporting documentation
```
