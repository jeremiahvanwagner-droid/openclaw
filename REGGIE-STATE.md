# REGGIE-STATE.md
# Runtime Engine Governing Global Integrations & Execution
# Truth J Blue LLC — OpenClaw Platform

> ⚠️ MANDATORY FIRST READ FOR EVERY AI SESSION, EVERY CODEX PROMPT,
> AND EVERY DEVELOPER TOUCHING THIS REPO.
>
> DO NOT BUILD. DO NOT PLAN. DO NOT GENERATE CODE.
> READ THIS FILE FIRST. VERIFY IT MATCHES THE REPO. THEN ACT.
>
> If anything in this file contradicts what you see in the live repo,
> STOP and update this file BEFORE doing anything else.
> The loop breaks here.

---

## WHAT IS REGGIE

REGGIE is the operational name for the entire OpenClaw platform
deployed for Truth J Blue LLC.

**REGGIE = Runtime Engine Governing Global Integrations & Execution**

REGGIE is NOT a single agent.  
REGGIE IS the complete OpenClaw runtime — all 103 agents, all 9
divisions, all skills, all integrations, all infrastructure.

| Field | Value |
|---|---|
| **Owner** | Jeremiah Van Wagner (Truth J Blue) |
| **Governed by** | MIKE (Modular Intelligence & Knowledge Engine) |
| **Repo** | github.com/jeremiahvanwagner-droid/openclaw |
| **Production host** | Hetzner VPS |

---

## LAST VERIFIED STATE

| Field | Value |
|---|---|
| **Last audit commit** | `dc22a1e` (April 1, 2026) |
| **Prior baseline commit** | `ecd5fb3` (March 30, 2026) |
| **Last human-verified date** | April 1, 2026 |
| **Audit source** | Codex live repo scan + runtime tooling |
| **Tests passing** | 117 core Vitest tests ✅ |
| **Dashboard build** | Green ✅ |
| **GHL auth — TJB tenant** | 200 OK ✅ (with env drift warning) |
| **GHL auth — MSL tenant** | 200 OK ✅ (with env drift warning) |
| **Governance drift** | Clean ✅ |
| **Deployment verdict** | ⚠️ DEPLOY WITH CONTROLS (not full production) |

---

## VERIFIED ARCHITECTURE — DO NOT CONTRADICT WITHOUT PROOF

### Agent Workforce

- **Configured agents:** 103 (source: `config/agents_config.json`)
- **Runtime entries:** 107 (source: `config/openclaw.prod.json`)
  — 4 extra aliases: `main`, `marketing`, `sales`, `support`
- **Supabase `agents` table:** 109 rows (6 ghost IDs — DB drift, not config drift)
- **Divisions:** 9 (fully configured and internally consistent)

> ❌ STALE: `README.md` says 75 agents / 7 divisions — DO NOT TRUST  
> ❌ STALE: Training system files say 75 agents / 7 divisions — DO NOT TRUST  
> ✅ TRUTH: `AGENTS.md` correctly shows 103 agents / 9 divisions

### The 9 Divisions

| ID | Name | Agents |
|---|---|---|
| D1 | Core Operations (Truth J Blue LLC HQ) | 10 |
| D2 | eCommerce Operations | 10 |
| D3 | Consulting Practice | 10 |
| D4 | Coaching & Community (BTV / DPW) | 10 |
| D5 | Publishing (Books & Media) | 10 |
| D6 | Nonprofit (Inspire Build Motivate, Inc.) | 10 |
| D7 | Shared Services & Runtime Supervisors | 20 |
| D8 | SaaS Operations (GHL Enablement) | 13 |
| D9 | Online Store (store.truthjblue.com) | 10 |

### LLM Routing Layer

- **All 103 agent configs:** Fully Anthropic
  — 74 Sonnet, 22 Haiku, 7 Opus
  — 0 references to `gpt-4o`, `gpt-4o-mini`, `openai-codex` in agent configs
- **5-tier migration status:** ACTIVE but INCOMPLETE
  — Only 14 of 103 agents explicitly assigned to a tier
  — 89 agents on fallback assignment
  — `sovereign_isolation_verified: false`
- **Legacy OpenAI NOT fully removed:**
  — `openai-codex` provider blocks still in `openclaw.json`
  — `memorySearch` still uses `text-embedding-3-small` (OpenAI)
  — Legacy `ANTHROPIC_API_KEY` call paths remain in:
    - `lib/anthropic-client.ts`
    - `lib/llm-router.ts`
    - `lib/self-healing-supervisor.ts`
    - `scripts/validate-env.mjs`
    - `scripts/upgrade/probe-anthropic-key.mjs`

### Memory Architecture

- **pgvector:** Enabled ✅
- **Business memory schemas (`ghl_leads`, `btv_clients`, `dpw_members`, `content_log`):** ❌ NOT LIVE IN SUPABASE
  — These exist in planning docs but are NOT in the live DB
  — Live tables are: `agents`, `agent_memory`, `agent_events`, `agent_metrics`, `agent_sessions`, `agent_heartbeat_log`
- **Memory that survives restart:** SQLite (`memory/*.sqlite`), Supabase rows, rate-governor file state
- **Memory lost on restart:** In-process response cache, unsaved transient state in `llm-router.ts`

### GHL Integration Layer

- **GHL connectivity:** Live for both TJB and MSL tenants ✅
- **Env drift warning:** Missing `GHL_LOCATION_ID`, literal `${...}` alias in `GHL_TOKEN`
- **GHL API implementation:** 8 namespaces, 55 methods
  (NOT the claimed 39 endpoint groups — that was a planning doc figure)
- **Active webhook event types:** 14 unique types
  (NOT the claimed 50 — that was a planning doc figure)
- **Active Inngest outbound webhooks:** 134 across 14 event types
- **Webhook handler recognized events:** 15 keys
- **Named pipelines in code:** ❌ NOT VERIFIABLE
  — Divine Seeker Journey, Active Mentorship, Alumni Network
    exist in planning docs but NOT as explicit code objects
  — Active wiring is generic webhook/workflow routing only
- **Speed-to-Lead chain:** Routes `contact.created` directly to `marketing` alias — NOT via COMMUNICATOR tier

### Infrastructure Layer

- **Docker stack:** Split (not single-stack)
  — `docker-compose.yml` + `docker-compose.prod.yml`: bot/gateway on 18789, webhook on 8788
  — `docker-compose.monitoring.yml`: Prometheus, Grafana, Loki, Promtail (separate stack)
- **Inngest:** 65 function definitions, 50 unique event-triggered names, 13 cron schedules
  (NOT the claimed 77 event types)
- **CI/CD:** 2 workflows (NOT 3)
  — `ci.yml` ✅ (lint, typecheck, test, dashboard build)
  — `deploy-bot.yml` ✅ (tests, parity, health checks, Telegram)
  — `deploy-dashboard.yml` ❌ DOES NOT EXIST
- **Staging environment:** ❌ DOES NOT EXIST — all deploys go directly to production

### Skills

- **Total skill modules:** 134 `.mjs` files under `/skills`
  (NOT the claimed 111 under `/lib`)
- **Clean scan passing:** 122 of 134
- **Confirmed incomplete (stubs/TODOs):**
  — `backup-manager.mjs`
  — `browser-controller.mjs`
  — `content-to-campaign-factory/index.mjs`
  — `gh-fix-ci/index.mjs`
  — `self-healing-integrations/index.mjs`
  — `social-media-publisher.mjs`
  — `social-poster.mjs`
  — `traffic-coordinator.mjs`

---

## WHAT IS CONFIRMED WORKING (GREEN)

- ✅ Shell injection patched — `safe-exec.mjs` uses `execFile`
- ✅ Webhook secret hardcoded fallback removed — gateway exits if `OPENCLAW_GHL_WEBHOOK_SECRET` unset
- ✅ Credential inventory dates populated
- ✅ GHL auth live for TJB and MSL tenants
- ✅ Rate governor state persists across restarts (local file `data/rate-governor-state.json`)
- ✅ 122/134 skills clean
- ✅ 117 Vitest tests passing
- ✅ Governance drift validation clean
- ✅ GHL scope enforcer implemented and tested
- ✅ Anthropic-first routing + split-key tier policy in place
- ✅ Next.js dashboard builds green
- ✅ `worker-environment-map.json` exists
- ✅ SOUL.md governance layer current

---

## ACTIVE BLOCKERS (P0 — NOTHING GOES LIVE UNTIL FIXED)

### P0-1: Legacy Anthropic credential path

**Files:** `lib/anthropic-client.ts`, `lib/llm-router.ts`, `lib/self-healing-supervisor.ts`, `scripts/validate-env.mjs`  
**Impact:** Breaks sovereign/shared isolation contract  
**Fix:** Remove all `ANTHROPIC_API_KEY` (singular) references; route all calls through split-key model  
**Est:** 4–6 hours

### P0-2: GHL OAuth auto-refresh not implemented

**File:** `skills/ghl-oauth-manager.mjs`  
**Impact:** 36 downstream skills silently fail on token expiry  
**Fix:** Add scheduled auto-refresh cron via Inngest, pre-expiry refresh + failure alert to Telegram  
**Est:** 6–8 hours

### P0-3: Missing `security_policy` in agents_config.json

**File:** `config/agents_config.json`  
**Impact:** `validate-security-hardening.mjs` fails  
**Fix:** Add required `security_policy` block to agent config schema  
**Est:** 2–3 hours

### P0-4: GHL env drift

**Files:** `.env`, `scripts/check-ghl-auth.mjs`, `scripts/validate-env.mjs`  
**Impact:** `GHL_LOCATION_ID` missing; `GHL_TOKEN` is a literal `${...}` string — auth works but is fragile  
**Fix:** Normalize env contract, remove literal alias  
**Est:** 1–2 hours

---

## OPEN GAPS BY PRIORITY

### P1 — Required for Reliable Operation

| Gap | File(s) | Impact |
|---|---|---|
| Hardcoded Telegram chat ID fallback in 3+ skills | `ab-testing.mjs`, `predictive-scoring.mjs`, `webhook-resilience.mjs` | Alert misdelivery |
| 5-tier Anthropic assignment incomplete (89 fallbacks) | `anthropic-tier-assignment.json` | Inconsistent LLM cost/performance |
| OpenAI embedding still active | `openclaw.json` (memorySearch) | Mixed provider, cost inefficiency |
| Supabase client not singleton everywhere | `self-healing-supervisor.ts`, Inngest functions | Connection exhaustion risk |
| Per-agent circuit breakers absent | `api-rate-governor.ts` | One bad agent can exhaust all provider budget |
| Agent config hot-reload absent | `agents_config.json` watcher | Every config change requires full restart |
| Gateway (18789) not in Prometheus scrape | `deploy/monitoring/prometheus/prometheus.yml` | All agent/LLM metrics invisible to Grafana |
| `/health/deep` endpoint absent | `handlers/ghl-webhook-handler.mjs` | Can't detect "running but broken" state |
| Cron observability dashboard missing | `deploy/monitoring/grafana/dashboards/` | No visibility into scheduled operations |
| Inngest idempotency keys absent | All `inngest/functions/` | Duplicate GHL webhooks = duplicate task execution |
| Zod validation absent on webhook payloads | `handlers/ghl-webhook-handler.mjs` | Malformed payloads cause unguarded runtime errors |
| Missing data files (3 of 4) | `data/` directory | Validation gates fail |
| Rollout registry misaligned with launch calendar | `data/business-registry.json` | BTV in wave 2, DPW in wave 3 vs. April live dates |
| Rate governor not multi-process durable | `lib/api-rate-governor.ts` | File state only — not safe for future scaling |

### P2 — Required for Universe Mode

| Gap | Notes |
|---|---|
| Staging environment | No staging compose or workflow exists |
| Prompt versioning | No implementation found anywhere in repo |
| Agent versioning + rollback | No `agent_versions` migration exists |
| Horizontal scaling | Single `bot` + single `webhook` service only |
| OpenTelemetry | Absent from all runtime code |
| DLQ rotation inconsistency | `lib/ghl-api.mjs` writes DLQ without rotation |
| Browser isolation (4 profiles) | Defined in config; runtime defaults to `chrome-relay` |
| README accuracy | Still says 75 agents / 7 divisions |
| Business memory schemas | `ghl_leads`, `btv_clients`, `dpw_members`, `content_log` not yet in live Supabase |
| Named pipeline code objects | Divine Seeker, BTV, Alumni not modeled in code |

---

## UNIVERSE MODE SCORECARD (April 1, 2026)

| Condition | Score | Status |
|---|---|---|
| Total Autonomy | 3/5 | 13 crons exist; OAuth + observability not autonomous |
| Real-Time Responsiveness | 3/5 | Webhooks fire; E2E <5min not verified |
| Predictive Intelligence | 2/5 | Intelligence modules exist; business schemas not live |
| Full Lifecycle Control | 2/5 | Payments/appts wired; named pipelines not in code |
| Unified Ecosystem Integration | 3/5 | GHL+Supabase+Inngest connected; bridges incomplete |
| Executive-Level Reporting | 3/5 | Dashboard + Grafana exist; gateway metrics blind |
| Continuous Evolution | 2/5 | CI + tests exist; no staging, versioning, or rollback |

**Universe Mode Declaration Target: July–August 2026**  
(Original May 15 target was based on planning doc assumptions, not verified repo state)

---

## DEPLOYMENT DECISION HISTORY

| Date | Verdict | Authority |
|---|---|---|
| March 31, 2026 | ⚠️ DEPLOY WITH CONTROLS | Codex audit (commit ecd5fb3) |
| April 1, 2026 | ❌ NOT READY for full production | Codex audit (commit dc22a1e) |
| April 2026 | Foundation + Soft Launch only | MIKE operational directive |

---

## PLANNING DOCUMENTS — READ WITH CAUTION

The following documents describe **VISION STATE**, not current state.  
Do not treat any number or claim in these docs as verified without checking against this file first:

- `OpenClaw_True_Current_State_Architecture_March_30_2026.md`
  — Some figures are planning-doc numbers, not code-verified
- `OpenClaw × GoHighLevel Master of HighLevel Universe Mode.md`
  — Universe Mode architecture; not yet fully built
- `Premium and Professional Open Claw Architectures.md`
  — Design reference; partially implemented
- `STRATEGIC-UPGRADE-PLAN.md`
  — 50-item roadmap; check item status before assuming complete
- **Any document claiming 39 API endpoint groups, 50 webhook types, 77 Inngest events, 111 skills, or 4 live business memory schemas**
  — ALL OF THESE ARE PLANNING FIGURES. Verified reality is lower.

---

## MISSING FILES (Must Be Created Before Phase 2)

| File | Status | Blocks |
|---|---|---|
| `data/tjb-offer-matrix.json` | ❌ ABSENT | `validate-offer-matrix.mjs`, revenue automation |
| `data/ghl-funnel-paths.json` | ❌ ABSENT | Funnel telemetry, pipeline routing |
| `data/recovery-automation-policies.json` | ❌ ABSENT | No-show, cold lead recovery governance |
| Business memory schemas (Supabase migrations) | ❌ NOT LIVE | Lead tracking, BTV tracking, DPW tracking |

---

## RULES FOR EVERY AI SESSION WORKING ON REGGIE

1. **Read this file before writing a single line of code.**

2. **Every number you use must come from the VERIFIED ARCHITECTURE section above — not from any planning document.**

3. **If you find a contradiction between this file and the live repo, STOP. Update this file. Then continue.**

4. **Do not regenerate what already exists.**
   Before building anything, grep the repo to confirm it doesn't already exist.
   If it exists and is working, leave it alone.

5. **Do not delete working code to replace it with a "better" version unless you have run the tests first and confirmed they still pass.**

6. **No direct production deploys without:**
   - Tests passing
   - This file updated to reflect the change
   - A Telegram notification sent to Jeremiah

7. **The business memory schemas (`ghl_leads`, `btv_clients`, `dpw_members`, `content_log`) are NOT live. Do not write code that assumes they exist. Create the migrations first.**

8. **REGGIE is at Month 6+ of development. It is not Week 1. Do not rebuild the foundation. Fix the gaps. Ship the blockers.**

---

## HOW TO UPDATE THIS FILE

After any meaningful change to the repo, update:

- `## LAST VERIFIED STATE` — new commit hash and date
- `## WHAT IS CONFIRMED WORKING` — add newly completed items
- `## ACTIVE BLOCKERS` — remove resolved P0 items
- `## OPEN GAPS BY PRIORITY` — mark resolved items, add new ones
- `## UNIVERSE MODE SCORECARD` — update scores if warranted

**Commit this file with every meaningful PR.**  
Treat it as the repo's single source of truth.

---

*REGGIE-STATE.md | Truth J Blue LLC | OpenClaw Platform*  
*Maintained by MIKE — Executive Systems Architect*  
*Last updated: April 1, 2026 | Commit: dc22a1e*
