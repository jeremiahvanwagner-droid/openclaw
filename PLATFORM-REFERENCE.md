# OpenClaw Platform — Reference Guide

> **Audience:** Engineers, agent operators, and AI assistants picking up work on the platform.
> **Owner:** Jeremiah Van Wagner — Truth J Blue LLC
> **Last verified:** 2026-05-11
> **Governing artifact:** `REGGIE-STATE.md` is the runtime source of truth — if this file disagrees with it, REGGIE wins.

---

## 1. What OpenClaw Is

OpenClaw is a self-hosted multi-agent operations platform that runs Truth J Blue's 10-business portfolio. It combines:

- **A workforce of ~108 named agents** organized into 9 divisions + shared services + 10 business-pod leads.
- **A skills registry of 291 capabilities** (folder-style SKILL.md modules + .mjs executable modules).
- **A Supabase-backed control plane** for state, events, and the dashboard.
- **A GoHighLevel (GHL) integration surface** for CRM, pipelines, messaging, calendars, and webhooks.
- **A Next.js dashboard** ("Command Center") deployed on Vercel for human oversight.
- **A Docker-based runtime** on a Hostinger VPS that hosts the gateway, webhook handler, and Caddy ingress.

The system is governed by a doctrine called **REGGIE** (Runtime Engine Governing Global Integrations & Execution) and operated by an LLM persona called **MIKE** (Modular Intelligence & Knowledge Engine).

---

## 2. Two-Repo Architecture

| Repo | Purpose | Path |
|------|---------|------|
| `github.com/jeremiahvanwagner-droid/openclaw` | Runtime: agents, skills, gateway, dashboard, handlers, Docker stack | `C:\Users\JeremiahVanWagner\.openclaw` |
| `github.com/jeremiahvanwagner-droid/tjb-umbrella` | Database: Supabase migrations, seed data, webhook server, adapters, tests | `C:\Users\JeremiahVanWagner\tjb-umbrella` |

**Rule:** Schema changes go in `tjb-umbrella`. Runtime/agent/skill/UI changes go in `openclaw`. Do NOT mix.

---

## 3. Infrastructure

### 3.1 Production VPS (Hostinger)

| Field | Value |
|------|-------|
| Host | `177.7.32.224` |
| OS user | `openclaw` |
| App root | `/opt/openclaw/.openclaw/` (live config), `/root/openclaw/` (compose) |
| Process manager | systemd unit `openclaw.service` |
| Ingress | Caddy fronting signed webhook endpoints only |
| Gateway port | `:18789` (Tailscale-only, **no public surface**) |
| Webhook port | `:8788` (signed only, idempotent) |
| Monitoring | Prometheus + Grafana (`deploy/monitoring/`) |
| Release tag | `2026.4.29` (commit `a448042`) |

**Critical systemd note:** `Type=simple` + `WatchdogSec=` is **broken** for this build — the openclaw dist has no `sd_notify` calls. Do NOT re-add `WatchdogSec` without first switching to `Type=notify` and patching upstream. False SIGABRT loops are guaranteed otherwise.

### 3.2 Containers

| Container | Image | Ports | Role |
|-----------|-------|-------|------|
| `openclaw-bot` | `openclaw-bot` | `18789` | Gateway / agent runtime |
| `openclaw-webhook` | `openclaw-webhook` | `8788` | GHL webhook handler |

Compose files:
- LOCAL dev: `C:\Users\JeremiahVanWagner\.openclaw\docker-compose.yml`
- LOCAL prod: `deploy/docker-compose.prod.yml`
- VPS: `/root/openclaw/docker-compose.yml`

### 3.3 Dashboard (Vercel)

| Field | Value |
|------|-------|
| Repo source | `openclaw/dashboard/` (Next.js 14) |
| URL | `openclaw-dashboard.vercel.app` |
| Auth | Supabase email magic-link → cookie session |
| Admin gate | `DASHBOARD_ADMIN_EMAILS` env var (comma-separated) |
| Vercel root directory | Must be `dashboard` (subdirectory of monorepo) |

**Required Vercel env vars:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ← needed for RLS bypass on server routes
- `DASHBOARD_ADMIN_EMAILS`

---

## 4. Database (Supabase)

### 4.1 Projects

| Alias | Project ID | Role |
|-------|-----------|------|
| **DB1** | `aagqvfwuixpxtdcrdxmv` | **Source of truth — single production DB** |
| ~~DB2~~ | `dbapisqoajswktxohfby` | **Deleted 2026-05-09** — do not reference |

Per REGGIE doctrine P2: DB1 is the only canonical store. All migrations apply here.

### 4.2 Core Tables (DB1)

| Table | Purpose | Row count (2026-05-11) |
|-------|---------|------------------------|
| `agents` | Agent registry (109 rows, 103 active) | 109 |
| `agent_events` | Per-event execution log | 108 |
| `agent_errors` | Error capture | — |
| `business_registry` | 10-business GHL portfolio config | 10 |
| `healing_circuit_breaker` | Self-healing throttle (RLS enabled 2026-05-11) | — |
| `ghl_tenant_mappings` | GHL location/account mappings | — |
| `notifications` | Outbound notification queue | — |
| `projects`, `generated_content`, `email_logs`, `assets`, `ghl_sync` | AI engine pipeline (added 2026-05-11) | — |
| `audit_events` | Append-only audit log | — |

### 4.3 RLS Policy Pattern

Every table uses the same pattern:
```sql
CREATE POLICY "Service role full access on <table>"
  ON public.<table>
  FOR ALL
  USING (auth.role() = 'service_role');
```

**Implication:** Anon key returns 0 rows silently. All data reads must go through server-side routes using `SUPABASE_SERVICE_ROLE_KEY`. Browser-direct queries WILL appear empty with no error.

### 4.4 Business Registry Scope Mapping

JSON `ghl_scope_type` values are mapped to DB CHECK constraint values:

| JSON value | DB value |
|-----------|----------|
| `shared_tjb_subaccount`, `shared_msl_subaccount` | `shared_subaccount` |
| `shared_incubator_subaccount` | `shared_incubator_subaccount` |
| `internal_operations_subaccount` | `internal_operations_subaccount` |

Raw JSON values preserved in `metadata->ghl_scope_raw`.

---

## 5. Workforce (Agents)

### 5.1 Counts

- **108** agent directories on disk (`agents/<id>/agent/`)
- **107** runtime entries (`openclaw.json` + `openclaw.prod.json`)
- **103** configured agents (`config/agents_config.json`)
- **109** rows in DB1 `agents` (103 active, 6 inactive)
- **9** divisions (D1–D9)

### 5.2 Division Breakdown

| Code | Division | Purpose |
|------|----------|---------|
| D1 | Core Operations | CEO, CMO, CTO, customer success, DevOps, fullstack, product, sales mgr, UX, data analyst |
| D2 | eCommerce | Director, store manager, web dev, copywriter, designer, paid ads, SEO, inventory, customer service |
| D3 | Consulting | CEO, biz dev, lead strategist, sales closer, client relations, ops, brand, thought leadership, analyst, admin |
| D4 | Coaching | CVO, lead coach, enrollment, curriculum, community, client experience, funnel, social, video, tech automation |
| D5 | Publishing | Publisher, managing editor, acquisitions, author relations, marketing, copy, cover art, distribution, PR, sales/affiliate |
| D6 | Nonprofit | Exec director, board liaison, COO, dev director, grant writer, finance, communications, program, outreach, volunteer |
| D7 | (Shared services — see below) | — |
| D8 | SaaS Operations | SaaS director, platform architect, automation, integration, marketing, CRM, content, compliance, community, customer success, funnel, revenue ops, membership |
| D9 | Online Store | Store director, web designer, WP dev, merchandiser, offer strategist, sales copy, SEO, social, analytics, CX |

### 5.3 Shared & Special Agents

- `shared_master_orchestrator` — top-level orchestration
- `shared_exec_orchestrator` — executive routing
- `shared_api_gateway` — external API surface
- `shared_data_analytics`, `shared_data_control`
- `shared_knowledge_base` — RAG / memory
- `shared_legal_compliance`
- `shared_runtime_ops` — DevOps for the platform itself
- `biz_01_pod_lead` through `biz_10_pod_lead` — per-business operators (10)
- `browser_primary`, `browser_secondary` — browser-automation agents
- `main`, `marketing`, `sales`, `support`, `store` — legacy aliases

### 5.4 Agent Directory Layout

Each agent lives at `agents/<agent_id>/`:
```
agents/<agent_id>/
├── agent/        # Agent definition, prompts, role config
└── sessions/     # Runtime session state
```

### 5.5 Model Tiers

| Tier | Model | Count | Use |
|------|-------|------:|-----|
| 0 | Claude Opus | 7 | Strategic, irreversible decisions (TIER0_SPEND audit required) |
| 1 | Claude Sonnet | 78 | Workhorse — most agents |
| 1 | Claude Haiku | 22 | Fast loops, low-latency |
| Phase 9 | Ollama (qwen3:14b, etc.) | TBD | Migrating most agents off Anthropic |

**Cost-sensitive defaults:**
- `agents.defaults.heartbeat = {"every":"168h"}` — weekly (was 30 min ≈ $150/mo idle)
- Telegram channel: **disabled** until BotFather token reverified via `getMe` (2026 March incident: bad token retry-loop cost hundreds in API spend)

---

## 6. Skills Registry

### 6.1 Counts (under `skills/`)

- **165** folder-style skills (each with `SKILL.md` + optional `index.mjs`)
- **125** `.mjs` skill modules at the root
- **2** `.json` skill descriptors
- **Total: 291**

### 6.2 Top Namespaces

| Prefix | Count | Domain |
|--------|------:|--------|
| `community-` | 14 | Community ops |
| `affiliate-` | 14 | Affiliate/SEO automation |
| `ghl-` | 13 | GoHighLevel ops |
| `finance-` | 12 | Finance/billing |
| `education-` | 12 | Curriculum / coaching |
| `ecommerce-` | 12 | Store ops |
| `digital-` | 12 | Digital products |
| `coaching-` | 12 | Coaching pipelines |
| `brand-` | 12 | Brand mgmt |
| `aisaas-` | 12 | AI SaaS ops |
| `agency-` | 12 | Agency workflows |
| `content-` | 8 | Content ops |
| `webhook-` | 5 | Webhook handlers |
| `funnel-` | 5 | Funnel ops |
| `browser-` | 5 | Browser automation |

### 6.3 Skill File Format

```
skills/<skill-name>/
├── SKILL.md      # YAML frontmatter (name, description) + procedure markdown
└── index.mjs     # Optional executable
```

`SKILL.md` example:
```markdown
---
name: affiliate-seo-onpage-optimization
description: Optimize on-page SEO elements for crawlability...
---

# On-page SEO Optimization
1. Audit title, headings, metadata...
2. Improve semantic coverage...
```

### 6.4 REGGIE Doctrine Skills (User-Scoped)

Located under `C:\Users\JeremiahVanWagner\.openclaw\skills\`:
- `reggie-doctrine-recall` — canonical doctrine (Blocks 1–7)
- `reggie-tier-router` — Tier 0/1/2 routing test
- `reggie-state-audit-entry` — 8-rule append-only validation
- `reggie-supabase-ops` — DB1 ops, P3/P7 declarative migrations
- `reggie-ghl-operations` — 35-namespace / 413-op GHL map
- `reggie-skill-audit-gate` — P4 manifest enforcement
- `reggie-phase-ritual` — phase-gate enforcement

### 6.5 TJB Workflow Skills

- `tjb-context-frontloader`, `tjb-precision-prompt`, `tjb-prophetic-voice`
- `tjb-refinement-loop`, `tjb-session-memory`, `tjb-tool-orchestrator`
- `tjb-trend-sensor`, `tjb-workflow-decomposer`
- `tjb-multimodal-reel-pipeline`, `tjb-autonomous-deploy`

### 6.6 Skill Audit Gate (P4)

**Open item:** `skills/.audit-allowlist.json` and `skills/.audit-manifest.json` are **missing**. P4 gate cannot run until first manifest is generated via `audit-skills.mjs`. Every skill is technically "unaudited" until then.

---

## 7. The Dashboard (Command Center)

### 7.1 Path Structure

```
dashboard/
├── app/
│   ├── page.tsx              # Main "Portfolio Operations Overview"
│   ├── api/
│   │   ├── dashboard/        # /api/dashboard — agents + events (admin-gated)
│   │   ├── portfolio/        # /api/portfolio — business_registry (open)
│   │   ├── agents/           # admin-only
│   │   ├── events/, costs/, replay/, system/, approvals/, auth/
│   ├── supabase.ts           # client-side anon client (legacy)
│   └── supabase-server.ts    # SSR cookie-based anon client
├── lib/
│   ├── server-auth.ts        # getServiceSupabase(), requireAdminUser()
│   └── admin.ts              # isUserAdmin() — checks DASHBOARD_ADMIN_EMAILS
├── middleware.ts             # Auth redirect to /login + admin path gating
├── next.config.mjs
└── vercel.json               # minimal, just schema ref
```

### 7.2 Auth Chain

```
Browser → middleware.ts (Supabase cookie check) → redirect to /login if no user
       ↓
       /api/dashboard → requireAdminUser() → 403 if user.email not in DASHBOARD_ADMIN_EMAILS
       ↓
       getServiceSupabase() → tries SUPABASE_SERVICE_ROLE_KEY, falls back to anon
       ↓
       DB1 query (returns 0 rows if anon — RLS filter)
```

### 7.3 Admin-Only Paths (middleware)

```
/agents, /events, /costs, /api/agents, /api/replay, /api/costs
```

The dashboard page `/` is NOT admin-gated in middleware — but its data API (`/api/dashboard`) IS. So a non-admin sees the page render with all zeros + an error banner.

### 7.4 Failure Modes Cheat Sheet

| Symptom | Cause |
|---------|-------|
| All zeros, no error banner | `SUPABASE_SERVICE_ROLE_KEY` not set → anon key used → RLS filters everything |
| Zeros with red error banner | `requireAdminUser()` returning 403 (email not in `DASHBOARD_ADMIN_EMAILS`) |
| Page redirects to /login | Auth cookie missing/expired |
| Build fails on Vercel | Root Directory wrong (must be `dashboard`, not `./`) |
| Portfolio works, agents zero | Admin auth issue only — service key is fine |

---

## 8. Webhook & Integration Surface

### 8.1 GoHighLevel (GHL)

| Component | Path / Value |
|-----------|--------------|
| Handler | `handlers/ghl-webhook-handler.mjs` (sole handler) |
| Inngest events | `inngest/client.ts` — 60 typed GHL event definitions |
| OAuth manager | `skills/ghl-oauth-manager.mjs` (init at webhook startup) |
| Webhook port | `:8788` (signed only, P8 idempotency required) |
| Webhook secret | `OPENCLAW_GHL_WEBHOOK_SECRET` |
| PIT rotation | ≤90 days (P6) |
| Locations | `GHL_LOCATION_ID` (default), `GHL_LOCATION_ID_TJB` (TJB sub-account) |
| Skill map | 35 namespaces / 413 operations (see `reggie-ghl-operations`) |

### 8.2 Environment Variables (VPS `.env`)

26 vars total. Names only (P7 forbids logging values):

```
CANVA_BRAND_KIT_ID, CANVA_CLIENT_ID, CANVA_CLIENT_SECRET,
GDRIVE_BASE_FOLDER_ID,
GHL_EMAIL, GHL_LOCATION_ID, GHL_LOCATION_ID_TJB, GHL_PASSWORD,
GHL_PRIVATE_INTEGRATION_TOKEN, GHL_PRIVATE_INTEGRATION_TOKEN_TJB, GHL_TOKEN,
OPENAI_API_KEY,
OPENCLAW_ALERT_TELEGRAM_CHAT_ID, OPENCLAW_DATA_DIR, OPENCLAW_GATEWAY_AUTH_TOKEN,
OPENCLAW_GHL_WEBHOOK_HOST, OPENCLAW_GHL_WEBHOOK_PORT, OPENCLAW_GHL_WEBHOOK_SECRET,
OPENCLAW_OPENAI_CODEX_MANUAL_TOKEN, OPENCLAW_REPORT_TZ, OPENCLAW_TELEGRAM_BOT_TOKEN,
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL,
TELEGRAM_ALERT_CHAT_ID, TELEGRAM_BOT_TOKEN,
YOUTUBE_CHANNEL_ID
```

Rotation policy: GHL PIT ≤90d, Supabase keys ≤180d. All rotations logged in `audit_events`.

---

## 9. Data Files (`data/`)

Static config consumed by skills/agents:

| File | Purpose |
|------|---------|
| `business-registry.json` | 10-business portfolio config (also seeded into DB1) |
| `auth-profiles.json` | Per-agent auth scope (referenced; location flagged as Open Item #2) |
| `models.json` | Model registry |
| `tjb-offer-matrix.json` | Offer catalog for D4/D5 |
| `ghl-funnel-paths.json` | GHL funnel mapping |
| `ghl-api-schemas/` | GHL API request/response schemas |
| `workflow-webhook-registry.json` | Webhook→workflow routing |
| `recovery-automation-policies.json` | Self-healing policies |
| `abandoned-carts.json`, `churn-interventions.json` | eCommerce state |
| `saas-instances.json`, `subscribers.json` | SaaS subscriber state |
| `social-metrics.json`, `social-sessions/` | Social channel state |
| `content-queue.json` | Outbound content queue |
| `worker-environment-map.json` | Worker→env mapping |
| `anomalies.json`, `anomaly-metrics.json` | Detection state |
| `dead-letter-queue.json` | Failed event capture |
| `browser-accounts.json`, `browser-sessions/`, `cookies/`, `screenshots/` | Browser-automation state |
| `runtime/` | Live runtime state |

---

## 10. REGGIE Doctrine — Operating Principles

The doctrine defines guardrails (P-series) that every change must respect:

| Principle | Meaning |
|-----------|---------|
| **P1** | Append-only audit — never edit prior REGGIE-STATE entries |
| **P2** | DB1 is single source of truth (DB2 retired 2026-05-09) |
| **P3** | Declarative migrations only — no manual SQL on prod |
| **P4** | Skill audit gate — every skill must be in `.audit-allowlist.json` |
| **P5** | Per-agent least-privilege auth scopes |
| **P6** | Credential rotation policy (GHL ≤90d, Supabase ≤180d) |
| **P7** | No secrets in logs, no public surface on gateway (Tailscale only) |
| **P8** | Webhook idempotency required |

Blocks 1–7 of the doctrine cover identity, runtime, workforce, skills, agent profile, model tiers, and gateway posture. Block 8 defines the 9-division org structure.

### 10.1 Tier 0 Spend Guard

Any use of an Opus model fires a `TIER0_SPEND` audit event. Strategic/irreversible decisions only. Default to Sonnet.

### 10.2 Phase Ritual

Changes ship in phases. Phases 1–5 of the 2026-05-05 sweep are complete. Phase 6 (Supabase circuit-breaker / `rate_governor_state`) is next. Phase 9 is the Ollama migration (most agents move off Anthropic; only opus lanes stay).

### 10.3 Cost Vectors to Watch

- **Heartbeat agent**: Default 30-min polling = ~$150/mo idle. Throttled to `168h` (weekly) on 2026-05-10.
- **Telegram retry-loop**: Bad bot token → 401 storm. Verify token via `/getMe` before re-enabling channel.

---

## 11. Open Items (as of 2026-05-11)

| # | Blocker | Impact |
|---|---------|--------|
| 1 | `skills/.audit-allowlist.json` + `.audit-manifest.json` missing | P4 gate offline |
| 2 | Agent auth profile location unverified | Can't audit P5 least-privilege |
| 3 | `deploy/sanitize-runtime-config.py` on VPS but not in repo | Drift risk |
| 4 | Gateway `:18789/metrics` reachability unverified | Prom scrape unconfirmed |
| 5 | Prometheus/Grafana target health unverified | — |
| 6 | `/health/deep` endpoint absent | Running-but-broken undetectable |
| 7 | No staging environment | Direct-to-prod risk |
| 8 | (RESOLVED) REGGIE-STATE LOCAL/VPS divergence | Sync ritual now in NEXT ACTIONS |
| 9 | (NEW 2026-05-11) Dashboard shows all zeros | Vercel env config — see `HANDOFF-MIKE-20260511.md` |

---

## 12. Key File Paths Quick Reference

| Path | What |
|------|------|
| `.openclaw/REGGIE-STATE.md` | Runtime source of truth |
| `.openclaw/openclaw.json` | Agent runtime config (107 entries) |
| `.openclaw/agents_config.json` | Configured agent registry (103) |
| `.openclaw/agents/<id>/agent/` | Agent definition dirs (108) |
| `.openclaw/skills/<name>/` | Skill folders (291 total) |
| `.openclaw/handlers/ghl-webhook-handler.mjs` | GHL webhook handler |
| `.openclaw/inngest/client.ts` | 60 typed GHL events |
| `.openclaw/dashboard/` | Next.js Command Center |
| `.openclaw/data/business-registry.json` | 10-business config |
| `.openclaw/data/auth-profiles.json` | Per-agent scopes |
| `.openclaw/data/models.json` | Model registry |
| `.openclaw/docker-compose.yml` | LOCAL dev stack |
| `.openclaw/deploy/docker-compose.prod.yml` | LOCAL prod build |
| `.openclaw/deploy/hostinger/openclaw.service` | systemd unit (mirrors VPS) |
| `tjb-umbrella/supabase/migrations/` | DB1 schema migrations |
| `tjb-umbrella/supabase/seed.sql` | DB1 seed data |
| `tjb-umbrella/webhook-server/` | Standalone webhook server |
| `tjb-umbrella/adapters/` | DB adapters |

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **REGGIE** | Runtime Engine Governing Global Integrations & Execution — the doctrine |
| **MIKE** | Modular Intelligence & Knowledge Engine — the operator persona |
| **DB1** | Production Supabase project (`aagqvfwuixpxtdcrdxmv`) |
| **DB2** | Retired Supabase project (deleted 2026-05-09) |
| **TJB** | Truth J Blue LLC — the parent company |
| **MSL** | Co-brand sub-account (Beyond the Veil / Divine Path Walkers / nonprofit) |
| **PIT** | Private Integration Token (GHL) |
| **Pod** | A business unit within the 10-business portfolio |
| **Division** | One of 9 functional org groupings (D1–D9) |
| **Tier 0/1** | Model spend tier — Opus is Tier 0, Sonnet/Haiku are Tier 1 |
| **P-series (P1–P8)** | REGGIE guardrail principles |
| **Sweep** | A versioned audit/cleanup pass (current: `2026-05-05-sweep`) |
| **Phase** | Doctrinal change unit. Phases 1–5 complete; Phase 6 next |

---

## 14. Where to Start (by Role)

**New engineer:**
1. Read `REGGIE-STATE.md` end-to-end.
2. Read this file.
3. Read `AGENTS.md` for the workforce snapshot.
4. Read `SOUL.md` and `TOOLS.md` for cultural/tooling context.
5. Skim `docs/` for handoffs and recent decisions.

**Agent operator (LLM session):**
1. Check `MEMORY.md` index for prior context.
2. Recall REGGIE doctrine via `reggie-doctrine-recall` skill.
3. Verify Tier (Block 6) before any model upgrade.
4. Use `reggie-state-audit-entry` to log changes.

**Dashboard debugger:**
- See `HANDOFF-MIKE-20260511.md` for the live "all zeros" issue.

**Database operator:**
- All migrations land in `tjb-umbrella/supabase/migrations/`.
- Use the Supabase MCP `apply_migration` tool against project `aagqvfwuixpxtdcrdxmv`.
- Never touch DB2 references — it's gone.

**Webhook/integration engineer:**
- Handler lives at `handlers/ghl-webhook-handler.mjs`.
- Events typed in `inngest/client.ts`.
- Test signatures with `OPENCLAW_GHL_WEBHOOK_SECRET`.

---

**End of reference. If this file disagrees with `REGGIE-STATE.md` or actual runtime, REGGIE-STATE wins — and this file should be updated.**
