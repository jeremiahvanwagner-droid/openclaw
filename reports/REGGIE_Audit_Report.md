# OpenClaw (REGGIE) — System Audit Report
**Audit Date:** April 1, 2026
**Repo HEAD:** `dc22a1e` (descendant of baseline `ecd5fb3` — March 30, 2026)
**Audit Verdict:** ❌ NOT READY FOR UNSUPERVISED GHL DEPLOYMENT

> **Runtime Status at Audit:** Governance drift clean · GHL auth `healthy_with_drift` · Next.js dashboard build ✅ · 117 Vitest tests passing

---

## Table of Contents

1. [Architecture: What REGGIE Is](#section-1--architecture-what-reggie-is)
2. [Strengths: What REGGIE Does Well](#section-2--strengths-what-reggie-does-well)
3. [Weaknesses & Gaps](#section-3--weaknesses--gaps)
4. [GHL Deployment Readiness Checklist](#section-4--ghl-deployment-readiness-checklist)
5. [Next Steps: REGGIE's Deployment Sequence](#section-5--next-steps-reggies-deployment-sequence)
6. [REGGIE's Role as the GHL Runtime Governing Engine](#section-6--reggies-role-as-the-ghl-runtime-governing-engine)

---

## Section 1 — Architecture: What REGGIE Is

### 1. Agent Workforce

| Metric | Count | Source |
|---|---|---|
| Configured agents | 103 | `agents_config.json` |
| Runtime entries | 107 | `openclaw.prod.json` |
| Divisions | 9 | `agents_config.json` |
| Live Supabase rows | 109 | Runtime DB (drift) |

- **Extra runtime aliases:** `main`, `marketing`, `sales`, `support`
- **Division 7 Shared Services** agents fully present: `biz_01_pod_lead` through `biz_10_pod_lead`, `browser_primary`, `browser_secondary`, `shared_api_gateway`, `shared_data_analytics`, `shared_data_control`, `shared_exec_orchestrator`, `shared_knowledge_base`, `shared_legal_compliance`, `shared_master_orchestrator`, `shared_runtime_ops`
- **Governance drift:** Clean — no missing mappings, no orphan policies, no empty tool allowlists (`check-governance-drift.mjs`)
- ⚠️ **[CONTRADICTION]** Live Supabase `agents` table has `109` rows with 6 extra IDs not in config — this is **runtime DB drift**, not config drift

---

### 2. LLM Routing Layer

| Model | Agent Config | Runtime |
|---|---|---|
| Claude Sonnet | 74 | 78 |
| Claude Haiku | 22 | 22 |
| Claude Opus | 7 | 7 |
| OpenAI (gpt-4o, gpt-4o-mini, openai-codex) | 0 | 0 |

- **5-tier migration** (`anthropic-tier-assignment.json`): Only `14` of 103 agents explicitly assigned; `~89` fallback assignments; `sovereign_isolation_verified: false` ⚠️
- **Legacy OpenAI** still present in `openclaw.json`: `openai-codex` provider blocks and `memorySearch` using `text-embedding-3-small`
- ⚠️ **[CONTRADICTION]** Legacy `ANTHROPIC_API_KEY` call paths remain in: `anthropic-client.ts`, `llm-router.ts`, `self-healing-supervisor.ts`, `validate-env.mjs`, `probe-anthropic-key.mjs`

---

### 3. Memory Architecture

- **Business schemas NOT live:** `ghl_leads`, `btv_clients`, `dpw_members`, `content_log` are absent from the live Supabase project ⚠️ **[CONTRADICTION]**
- **Live tables:** `agents`, `agent_memory`, `agent_events`, `agent_metrics`, `agent_sessions`, `agent_heartbeat_log`
- **pgvector** enabled (`20260312000003_agent_tables.sql`) and upgraded (`20260318000006_embedding_model_upgrade.sql`)
- **Memory access rules** documented only for alias agents (`main`, `marketing`, `sales`, `support`); executable ACL in `agent-memory.ts` uses generic `private/division/global` scope — not per-schema business ACLs for all 103 agents

| Memory State | Survives Restart? |
|---|---|
| File-backed SQLite (`memory/*.sqlite`) | ✅ Yes |
| Supabase rows | ✅ Yes |
| Rate-governor file state | ✅ Yes |
| In-process response cache | ❌ No |
| Unsaved transient state in `llm-router.ts` | ❌ No |

---

### 4. GHL Integration Layer

- **Connectivity:** Live for both tenants — `check-ghl-auth.mjs` returned `200 OK` for TJB and MSL
- **Env drift:** Missing `GHL_LOCATION_ID`; literal `${...}` alias in `GHL_TOKEN`
- ⚠️ **[CONTRADICTION]** Claimed `39` API endpoint groups — verified: `8` top-level namespaces, `55` callable methods in `ghl-client.mjs`
- ⚠️ **[CONTRADICTION]** Three named pipelines (`Divine Seeker Journey`, `Active Mentorship`, `Alumni Network`) are not verifiable by code search — active wiring is generic webhook/workflow routing
- ⚠️ **[CONTRADICTION]** Claimed `50` webhook event types — verified: `134` outbound webhooks over `14` unique event types; handler recognizes `15` event keys

---

### 5. Infrastructure Layer

| Component | Reality |
|---|---|
| Docker topology | Split-stack: `bot`/gateway on `18789`, `webhook` on `8788`, monitoring separate |
| Inngest functions | 65 definitions, 50 unique event-triggered names, 13 cron schedules |
| CI/CD workflows | 2 (not 3): `ci.yml` + `deploy-bot.yml`; `deploy-dashboard.yml` absent |

- **CI gates** (`ci.yml`): lint, typecheck, test, dashboard build, dashboard typecheck
- **Production deploy gates** (`deploy-bot.yml`): tests, runtime config parity, SSH secret validation, remote checkout cleanliness, sudo validation, gateway/webhook health checks, Telegram notification
- ⚠️ **[CONTRADICTION]** Claimed `77` Inngest event types — verified: `50` unique event-triggered names + `13` cron schedules

---

## Section 2 — Strengths: What REGGIE Does Well

### 1. Production-Grade Core Runtime Capabilities

- **Signed inbound webhook ingestion**, normalized event routing, health, and Prometheus metrics — `ghl-webhook-handler.mjs`, `metrics.mjs`
- **Anthropic-first routing**, split-key tier policy, and tier tests — `claw-router.json`, `anthropic-tier-assignment.json`, `anthropic-tier-routing.test.ts`
- **GHL client scope enforcement** implemented and tested — `ghl-client.mjs`, `ghl-scope-enforcer.mjs`, `ghl-scope-enforcer.test.ts`
- **Rate limiting and circuit state persistence** — `api-rate-governor.ts`
- **Governance/parity validation** mature — `check-governance-drift.mjs`, `runtime-config-parity.mjs`

---

### 2. Skill Module Health

- **Total skill modules:** `134` `.mjs` files under `/skills` (not `111` under `/lib` as claimed)
- **Clean scan:** `122` of `134` passed static analysis

**Incomplete Skills (explicit TODO/stub markers found):**

| Skill File | Status |
|---|---|
| `backup-manager.mjs` | Incomplete |
| `browser-controller.mjs` | Incomplete |
| `content-to-campaign-factory/index.mjs` | Incomplete |
| `gh-fix-ci/index.mjs` | Incomplete |
| `self-healing-integrations/index.mjs` | Incomplete |
| `social-media-publisher.mjs` | Incomplete |
| `social-poster.mjs` | Incomplete |
| `traffic-coordinator.mjs` | Incomplete |

---

### 3. Universe Mode Condition Scores

| Capability | Score | Notes |
|---|---|---|
| Total Autonomy | 3/5 | 13 cron schedules exist; OAuth refresh & cron observability not autonomous |
| Real-Time Responsiveness | 3/5 | Lead/no-show webhooks fire immediately; `<5 min` E2E not verified |
| Predictive Intelligence | 2/5 | Intelligence modules exist; business memory schemas not live |
| Full Lifecycle Control | 2/5 | Appointments/payments/subscriptions wired; named pipelines unverifiable |
| Unified Ecosystem Integration | 3/5 | GHL/Supabase/Inngest/dashboard/Telegram/browser exist; some bridges incomplete |
| Executive-Level Reporting | 3/5 | Dashboard + Grafana exist; gateway metrics not scraped |
| Continuous Evolution | 2/5 | CI/tests/manual deploy exist; no staging/prompt versioning/agent rollback |

---

### 4. Strongest Operational Playbook (Today)

REGGIE's strongest verified playbook is **inbound GHL event handling**:

```
Signed Webhook Receipt
  → Event Normalization
    → Scoped Action Selection
      → Agent Dispatch
        → Metrics Logging
```

Files: `ghl-webhook-handler.mjs`, `ghl-webhook.mjs`, `ghl-scope-enforcer.mjs`

---

### 5. Structural Advantage Over a Manual GHL Operator

REGGIE can **in one governed runtime loop** correlate:
- Live GHL events
- Cross-division routing
- LLM tier selection
- Rate governance
- Memory
- Human-in-the-loop approvals
- Non-GHL channels (Telegram, browser)

A human operator and native GHL automation cannot natively combine `claw-router.json`, `api-rate-governor.ts`, `browser-profiles.json`, `deploy-bot.yml`, and Inngest orchestration into a single governed runtime.

---

## Section 3 — Weaknesses & Gaps

### 1. Security Gaps

#### ✅ Closed Checks
- **Shell injection patched** — `ghl-webhook-handler.mjs` dispatches through `safe-exec.mjs` using `execFile`, not `exec`
- **Hardcoded webhook secret fallback removed** — handler exits if `OPENCLAW_GHL_WEBHOOK_SECRET` is unset
- **Credential inventory dates populated** — `credential-inventory.csv`

#### ❌ Open Issues

| Priority | Issue | Affected Files |
|---|---|---|
| P0 | Legacy `ANTHROPIC_API_KEY` path still exists — breaks sovereign/shared isolation | `anthropic-client.ts`, `llm-router.ts`, `self-healing-supervisor.ts`, `validate-env.mjs` |
| P1 | Security hardening schema incomplete — `agents_config.json` missing required `security_policy` | `validate-security-hardening.mjs`, `agents_config.json` |
| P1 | Hardcoded Telegram chat ID fallbacks in skills — alert misdelivery risk | `ab-testing.mjs`, `predictive-scoring.mjs`, `webhook-resilience.mjs` |

---

### 2. Runtime Stability Gaps (P1)

| Priority | Issue | Affected Files |
|---|---|---|
| P0 | GHL OAuth refresh is **manual** — `36` downstream skill consumers at risk | `ghl-oauth-manager.mjs` |
| P1 | Rate governor persists only to local file — not multi-process durable | `api-rate-governor.ts` |
| P1 | Supabase client usage inconsistent — multiple new clients created instead of singleton | `self-healing-supervisor.ts`, `inngest/functions` |
| P1 | Per-agent circuit breakers absent — only provider-level breakers exist | `api-rate-governor.ts` |
| P1 | Agent config hot-reload absent — no SIGHUP/watcher path | `agents_config.json` |

---

### 3. Observability Gaps (P1)

| Priority | Issue | Affected Files |
|---|---|---|
| P1 | Gateway `18789` not in Prometheus scrape config | `prometheus.yml` |
| P1 | Gateway `/metrics` not repo-verified | `ghl-webhook-handler.mjs` |
| P1 | Grafana dashboards cannot receive gateway metrics | `openclaw.json` (Grafana dashboard) |
| P1 | Cron-job observability dashboard missing | `openclaw.json` (Grafana dashboard) |
| P1 | `/health/deep` absent — only `/health` exists | `ghl-webhook-handler.mjs` |

---

### 4. Integration Completeness Gaps (P1–P2)

| Priority | Issue | Affected Files |
|---|---|---|
| P1 | Missing source-of-truth files | `tjb-offer-matrix.json`, `ghl-funnel-paths.json`, `recovery-automation-policies.json` |
| P1 | GHL webhook payloads not Zod-validated — direct `JSON.parse` on inbound bodies | `ghl-webhook-handler.mjs` |
| P1 | Inngest idempotency keys absent from runtime code | `inngest/functions` |
| P1 | Speed-to-Lead: routes `contact.created` to alias `marketing`, not claimed Inngest → COMMUNICATOR chain | `ghl-webhook-handler.mjs` |
| P1 | Rollout registry misaligned — BTV in wave 2, DPW in wave 3 | `business-registry.json` |
| P1 | Webhook coverage: 14 unique event types, not 50 | `generated-ghl-workflow-webhook-plan.json` |
| P2 | No-show recovery logic unverified end-to-end | `ghl-webhook-handler.mjs` |
| P2 | Three named pipelines not explicitly modeled in code | `generated-ghl-workflow-webhook-plan.json`, `ghl-client.mjs` |

---

### 5. Architecture Evolution Gaps (P2)

| Priority | Issue | Affected Files |
|---|---|---|
| P2 | Staging environment absent — direct prod deploy | `deploy/staging`, `.github/workflows` |
| P2 | Prompt versioning absent — no `prompt_versions` implementation | `lib`, `supabase/migrations`, `dashboard` |
| P2 | Agent versioning and rollback absent — no `agent_versions` migration | `supabase/migrations` |
| P2 | Memory cleanup never scheduled — retention rules partially enforced | `MEMORY.md`, `agent-memory.ts` |
| P2 | Horizontal scaling not implemented — single `bot` + single `webhook` services | `docker-compose.yml`, `docker-compose.prod.yml` |
| P2 | OpenTelemetry absent from active runtime | `lib`, `scripts`, `deploy`, `dashboard` |
| P2 | DLQ rotation inconsistent — `ghl-api.mjs` writes without rotation | `ghl-api.mjs`, `webhook-resilience.mjs` |
| P2 | Browser isolation relay scripts default to `chrome-relay` | `relay-preflight.ps1`, `relay-single-tab-lock.ps1` |
| P2 | `README.md` stale — says `75` agents; `AGENTS.md` correctly shows `103` | `README.md` |

---

## Section 4 — GHL Deployment Readiness Checklist

> **Legend:** ✅ READY · ❌ BLOCKED · ⚠️ PARTIAL

### Security

| Status | Check | Reference |
|---|---|---|
| ✅ READY | Webhook secret is env-injected, no hardcoded fallback | `ghl-webhook-handler.mjs` |
| ✅ READY | Shell injection patched — dispatch uses `execFile` | `safe-exec.mjs` |
| ❌ BLOCKED | GHL OAuth tokens auto-refresh without manual intervention | `ghl-oauth-manager.mjs` |
| ⚠️ PARTIAL | API scopes minimized per skill | `ghl-scope-enforcer.mjs` |
| ⚠️ PARTIAL | `SOUL.md` hard limits current and migration-aligned | `SOUL.md`, `agents_config.json` |

---

### Runtime

| Status | Check | Reference |
|---|---|---|
| ✅ READY | Rate governor state persists across restarts | `api-rate-governor.ts` |
| ❌ BLOCKED | Per-agent circuit breakers active | `api-rate-governor.ts` |
| ❌ BLOCKED | Agent config changes do not require full gateway restart | `agents_config.json` |
| ⚠️ PARTIAL | Supabase connection pool is a singleton | `agent-memory.ts`, `self-healing-supervisor.ts` |
| ❌ BLOCKED | All legacy `ANTHROPIC_API_KEY` refs migrated to split model | `anthropic-client.ts`, `llm-router.ts`, `self-healing-supervisor.ts` |

---

### LLM Architecture

| Status | Check | Reference |
|---|---|---|
| ✅ READY | All 103 agents on Anthropic — zero OpenAI model refs | `agents_config.json` |
| ⚠️ PARTIAL | 5-tier model assignment complete — only 14 explicit assignments | `anthropic-tier-assignment.json` |
| ⚠️ PARTIAL | `ANTHROPIC_API_KEY_SOVEREIGN` set and routed correctly | `claw-router.json` |
| ⚠️ PARTIAL | `ANTHROPIC_API_KEY_SHARED` set and routed correctly | `claw-router.json` |

---

### GHL Integration

| Status | Check | Reference |
|---|---|---|
| ✅ READY | GHL auth verified — TJB tenant | `check-ghl-auth.mjs` |
| ✅ READY | GHL auth verified — MSL tenant | `check-ghl-auth.mjs` |
| ❌ BLOCKED | All 3 pipelines connected and data-flowing | `ghl-client.mjs` |
| ❌ BLOCKED | 50 webhook event types subscribed and routing | `generated-ghl-workflow-webhook-plan.json` |
| ⚠️ PARTIAL | Contact-level custom field routing enforced | `ghl-client.mjs` |
| ❌ BLOCKED | Speed-to-Lead chain verified E2E (`< 5 min`) | `ghl-webhook-handler.mjs` |
| ⚠️ PARTIAL | No-show recovery automation verified as live | `ghl-webhook-handler.mjs` |

---

### Observability

| Status | Check | Reference |
|---|---|---|
| ❌ BLOCKED | Gateway (`18789`) in Prometheus scrape config | `prometheus.yml` |
| ❌ BLOCKED | `/metrics` endpoint returns data (not 404) | Gateway |
| ❌ BLOCKED | Grafana dashboards receiving gateway metrics | `openclaw.json` (Grafana) |
| ❌ BLOCKED | Cron job observability dashboard exists | `openclaw.json` (Grafana) |
| ❌ BLOCKED | Deep health check (`/health/deep`) operational | `ghl-webhook-handler.mjs` |

---

### Data & Integration

| Status | Check | Reference |
|---|---|---|
| ✅ READY | `data/worker-environment-map.json` exists | `worker-environment-map.json` |
| ❌ BLOCKED | `data/tjb-offer-matrix.json` exists | Missing |
| ❌ BLOCKED | `data/ghl-funnel-paths.json` exists | Missing |
| ❌ BLOCKED | `data/recovery-automation-policies.json` exists | Missing |
| ❌ BLOCKED | Inngest idempotency keys implemented | `inngest/functions` |
| ❌ BLOCKED | Zod schema validation on webhook payloads active | `ghl-webhook-handler.mjs` |
| ❌ BLOCKED | Rollout registry aligned with April launch calendar | `business-registry.json` |

---

### Evolution

| Status | Check | Reference |
|---|---|---|
| ❌ BLOCKED | Staging environment exists | Repo |
| ❌ BLOCKED | CI/CD deploys to staging before production | `deploy-bot.yml` |
| ❌ BLOCKED | Prompt versioning implemented | Active code |
| ⚠️ PARTIAL | Browser isolation fully wired (all 4 profiles) | `browser-profiles.json`, relay scripts |
| ⚠️ PARTIAL | `AGENTS.md` and `README` reflect 103-agent architecture | `AGENTS.md` ✅, `README.md` ❌ |

---

## Section 5 — Next Steps: REGGIE's Deployment Sequence

### Phase 1 — Unblock
> **Target completion: Before April 6, 2026**

| Priority | Task | Files | Est. Time | Dependency |
|---|---|---|---|---|
| P0 | Remove legacy Anthropic key dependency; force all callers through split-key routing | `anthropic-client.ts`, `llm-router.ts`, `self-healing-supervisor.ts`, `validate-env.mjs`, `probe-anthropic-key.mjs` | 4–6h | None |
| P0 | Implement automatic GHL OAuth refresh with pre-expiry refresh + failure alerts | `ghl-oauth-manager.mjs`, `agent-orchestrator.ts`, `api-rate-governor.ts` | 6–8h | Tenant auth stays green |
| P0 | Add missing `security_policy` block so hardening validation passes | `agents_config.json`, `generate-governance-docs.mjs` | 2–3h | None |
| P0 | Normalize env contract for tenant tokens + locations | `check-ghl-auth.mjs`, `validate-env.mjs`, `.env.example` | 1–2h | None |
| P1 | Remove hardcoded Telegram chat ID fallbacks; require env-backed alert routing | `ab-testing.mjs`, `predictive-scoring.mjs`, `webhook-resilience.mjs` + others | 2–4h | Env contract cleanup |

---

### Phase 2 — Integrate
> **Target completion: Before broad live GHL rollout**

| Priority | Task | Files | Est. Time | Dependency |
|---|---|---|---|---|
| P1 | Complete explicit 5-tier assignment for all 103 agents; remove OpenAI embedding dependency | `anthropic-tier-assignment.json`, `claw-router.json`, `openclaw.prod.json`, `openclaw.json` | 6–10h | Phase 1 split-key routing |
| P1 | Add idempotency keys to webhook-driven Inngest flows | Create `lib/inngest-idempotency.ts`; update `agent-orchestrator.ts`, `d8-saas-operations.ts`, `phase1-foundation.ts`, `phase2-intelligence.ts`, `phase3-execution.ts` | 6–8h | None |
| P1 | Move rate-governor persistence from local file to shared DB | `api-rate-governor.ts` + new Supabase migration | 4–6h | Supabase singleton cleanup |
| P1 | Make Supabase access singleton across runtime and Inngest | `self-healing-supervisor.ts`, `agent-memory.ts`, `agent-orchestrator.ts`, `d8-saas-operations.ts`, `training-protocol.ts`, `weekly-meeting.ts` | 4–6h | None |
| P1 | Add missing source-of-truth data files + validators | Create `tjb-offer-matrix.json`, `ghl-funnel-paths.json`, `recovery-automation-policies.json`; update `validate-offer-matrix.mjs` | 4–8h | Business owner signoff |
| P1 | Add Zod validation to GHL webhook ingestion; verify Speed-to-Lead/no-show E2E with tests | `ghl-webhook-handler.mjs`; create `ghl-webhook-schema.mjs`; extend `ghl-webhook.test.ts` | 6–8h | Source-of-truth data files |
| P1 | Align rollout registry with April launch reality | `business-registry.json`, regenerate `generated-ghl-workflow-webhook-plan.json` | 2–3h | Launch owner confirmation |

---

### Phase 3 — Optimize
> **After Phase 2 stabilization**

| Priority | Task | Files | Est. Time | Dependency |
|---|---|---|---|---|
| P1 | Make gateway observable | `prometheus.yml`, `docker-compose.prod.yml`; optionally create `gateway-metrics-proxy.mjs` | 4–6h | Phase 2 stability |
| P1 | Implement per-agent circuit breakers/quarantine | `api-rate-governor.ts`, `security-governance.mjs`, `agent-orchestrator.ts` | 6–8h | Shared persistence |
| P2 | Add staging before production | Create `docker-compose.staging.yml`, `deploy-staging.yml`; update `docs/deployment.md` | 1–2d | Stable prod deploy path |
| P2 | Add deep health check + cron observability dashboard | Create `deep-health.mjs`; update or create Grafana dashboards | 4–6h | Gateway observability |
| P2 | Implement prompt/agent versioning and hot-reload | New Supabase migrations; create `runtime-config-watcher.ts`; update dashboard | 1–2d | Staging |
| P2 | Fully wire browser isolation; normalize away `chrome-relay` | `browser-profiles.json`, `platform-ops-governance.mjs`, `relay-preflight.ps1`, `relay-single-tab-lock.ps1` | 4–6h | Staging |
| P2 | Standardize DLQ rotation + add OpenTelemetry | `ghl-api.mjs`; create `telemetry.ts`; update `package.json` | 6–10h | Gateway observability |

---

## Section 6 — REGGIE's Role as the GHL Runtime Governing Engine

### 1. In Plain Terms

REGGIE turns raw GHL events into governed, cross-system action. It can:

1. Authenticate the inbound event
2. Normalize the payload
3. Decide which tier and agent should act
4. Enforce API scopes and rate limits
5. Persist context to memory
6. Emit structured metrics
7. Escalate to Telegram or browser automation lanes

> Native GHL automation cannot do this across `ghl-webhook-handler.mjs`, `claw-router.json`, `api-rate-governor.ts`, and `browser-profiles.json` in a single governed loop.

---

### 2. Highest-Impact Division Right Now

**Division 8 — SaaS Operations** is the only division explicitly centered on shared GHL enablement, CRM ops, funnels, automation, revenue ops, compliance, and integration engineering.

---

### 3. Single Most Valuable Autonomous Action Today

The `contact.created` speed-to-lead kickoff in `ghl-webhook-handler.mjs`:

> REGGIE immediately turns a new lead into a concrete follow-up instruction — with timing, tagging, and pipeline movement intent.

---

### 4. Full Universe Mode — Operational Reality

> ⚠️ The following is **inferred from current architecture**, not a live-verified state. Based on: `claw-router.json`, `browser-profiles.json`, `phase1-foundation.ts`, `phase2-intelligence.ts`, `phase3-execution.ts`, `ghl-webhook-handler.mjs`

**What fires automatically without human input:**
- Lead intake and webhook normalization
- Scoring and tier routing
- Nurture assignment
- No-show and inactivity detection
- Anomaly alerts and executive summaries

**What Jeremiah sees in Telegram each morning:**
- Deployment health
- Credential expiry warnings
- Lead and revenue anomalies
- Backlog / DLQ alerts
- Top-priority follow-ups
- Blocked approvals

**Lead journey from `ContactCreate` to booking:**
```
Signed Webhook Intake
  → Immediate Scoring + Tagging
    → Communicator-Tier Outreach
      → Pipeline Stage Movement
        → Follow-Up Reminders
          → Booking Escalation (if no response)
```

**When a BTV client misses a session:**
- `appointment.noshow` triggers recovery outreach
- Reschedule intent sent
- Risk tagging applied
- Escalation to the right operator lane

**When a DPW member goes 14 days dark:** *(inferred target state — not live-verified)*
- Inactivity detection fires
- Churn-risk flag set
- Re-communication through communicator lane
- Escalation if re-engagement fails

---

### 5. The One Capability REGGIE Must Have Before Unsupervised GHL Governance

> **Autonomous GHL credential continuity.**

Until OAuth refresh is automatic and verified, REGGIE cannot be trusted to govern GHL without human supervision — too much of the action surface can silently stall if tokens expire.

---

## Deployment Verdict

> ### ❌ NOT READY FOR LIVE GHL GOVERNANCE

The live repo on **April 1, 2026** is materially stronger than the March 30, 2026 baseline on security hardening and Anthropic migration. However, REGGIE is not yet safe for full live GHL governance.

**Blocking issues are not theoretical:**

| Blocker | Status |
|---|---|
| Legacy `ANTHROPIC_API_KEY` paths still violate the split-key architecture | ❌ Open |
| GHL OAuth refresh is manual | ❌ Open |
| Four business memory schemas are not live | ❌ Open |
| Three named pipelines are not code-verifiable | ❌ Open |
| Webhook coverage is 14 unique event types (not 50) | ❌ Open |
| Gateway observability is incomplete | ❌ Open |
| Multiple repo facts still contradict the MIKE brief | ❌ Open |

**Recommended action:** Complete **Phase 1** before April 6, 2026, then complete **Phase 2** integration before any broad live GHL rollout.

---

*Audit conducted on HEAD `dc22a1e` · April 1, 2026 · OpenClaw / REGGIE System Audit*
