# OpenClaw: Master Implementation Plan

> **50 Gap Fills, Enhancements & Optimizations**
> Generated: March 16, 2026 | Estimated Sprints: 10 (2-week cycles)

---

## Execution Philosophy

This plan is organized into **10 two-week sprints** across **4 phases**. Each sprint has
a clear theme, concrete deliverables, and acceptance criteria. Dependencies flow
top-to-bottom — no sprint requires work from a future sprint.

**Principles:**
- Security fixes ship first — they block everything else
- Each sprint produces a deployable, testable increment
- Infrastructure changes land before the features that depend on them
- No sprint exceeds what one focused engineer can deliver in 2 weeks

---

## Phase 1: Harden (Sprints 1–3)

*Goal: Eliminate security vulnerabilities, establish testing baseline, and add
the foundational tooling everything else builds on.*

---

### Sprint 1 — Critical Security Fixes

**Theme:** Stop the bleeding. Fix every exploitable vulnerability before adding features.

#### Task 1.1 — Fix Shell Injection (#1)
**Files:** `handlers/ghl-webhook-handler.mjs`, `skills/webhook-resilience.mjs`
**What:**
- Replace all `execAsync(\`openclaw send ... "${escaped}"\`)` calls with
  `execFile('openclaw', ['send', '--agent', agent, '--channel', channel, '--to', chatId, message])`
  using Node.js `child_process.execFile` (no shell interpretation).
- Remove the broken `escapeMessage` pattern entirely — `execFile` doesn't need it.
- Add the same fix to every skill that calls `execAsync()` (grep for all usages).

**Acceptance:** No shell metacharacters in any `exec*` call site. Manually test
Telegram delivery with a payload containing backticks, `$()`, and `${}`.

#### Task 1.2 — Externalize Hardcoded Secrets (#2)
**Files:** `handlers/ghl-webhook-handler.mjs`, `.env.example`
**What:**
- Replace hardcoded `GHL_LOCATION_ID`, `WEBHOOK_SECRET`, `TELEGRAM_CHAT_ID`,
  `TEAMS_CHANNEL_ID` with `process.env.*` lookups.
- Add startup validation: if any required env var is missing, log a clear error
  and `process.exit(1)`.
- Update `.env.example` with the new required variables and comments.

**Acceptance:** Handler refuses to start when any required env var is absent.
No secrets appear in source code (grep confirms zero matches).

#### Task 1.3 — Webhook Payload Validation (#3)
**Files:** `handlers/ghl-webhook-handler.mjs`
**What:**
- Install `zod` (add to a new root `package.json` — see Task 2.1).
- Define Zod schemas for each accepted GHL event type:
  `contact.created`, `opportunity.stage_changed`, `appointment.scheduled`,
  `conversation.message_received`.
- Reject unknown event types with HTTP 422 + structured error body.
- Log rejected payloads (without PII) for monitoring.

**Acceptance:** Malformed JSON and unknown event types return 422.
Valid events process normally. A manual test with garbage payloads confirms rejection.

#### Task 1.4 — Request Size Limits (#4)
**Files:** `handlers/ghl-webhook-handler.mjs`
**What:**
- Add body-size limiting middleware: reject any request body > 1 MB with HTTP 413.
- Use Node.js built-in stream consumption with a byte counter (no new dependency).

**Acceptance:** A 2 MB POST to the webhook endpoint returns 413.

#### Task 1.5 — HMAC Signature Verification (#7)
**Files:** `handlers/ghl-webhook-handler.mjs`
**What:**
- Read GHL's `X-GHL-Signature` header on every inbound request.
- Compute HMAC-SHA256 of the raw body using `WEBHOOK_SECRET`.
- Reject with HTTP 401 if signature is missing or doesn't match.
- Use `crypto.timingSafeEqual()` to prevent timing attacks.

**Acceptance:** Requests without valid HMAC signatures are rejected.
A cURL test with a correct signature succeeds; one with a wrong signature returns 401.

#### Task 1.6 — Gateway API Authentication (#5)
**Files:** `handlers/ghl-webhook-handler.mjs` (gateway middleware layer)
**What:**
- Gate all non-health endpoints behind `Authorization: Bearer <OPENCLAW_GATEWAY_AUTH_TOKEN>`.
- `/health` remains public (for monitoring).
- Return HTTP 401 for missing/invalid tokens.

**Acceptance:** `curl localhost:18789/health` returns 200.
`curl localhost:18789/api/agents` without token returns 401.

#### Task 1.7 — Dashboard Security Headers (#6)
**Files:** `dashboard/next.config.mjs`
**What:**
- Add `headers()` config returning:
  - `Content-Security-Policy`: restrict to self + Supabase domain
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Referrer-Policy: strict-origin-when-cross-origin`

**Acceptance:** Browser dev tools confirm all headers present on dashboard pages.

---

### Sprint 2 — Tooling Foundation

**Theme:** Set up the development infrastructure that every future sprint depends on.

#### Task 2.1 — Root `package.json` + Workspaces (#12)
**Files:** New `package.json` at repo root
**What:**
- Create root `package.json` with pnpm workspaces:
  ```json
  {
    "name": "openclaw",
    "private": true,
    "workspaces": ["dashboard", "lib", "inngest", "scripts"]
  }
  ```
- Add shared devDependencies: `typescript`, `vitest`, `eslint`, `prettier`, `zod`.
- Add root scripts: `"test"`, `"lint"`, `"format"`, `"validate"`.
- Run `pnpm install` to generate lockfile.

**Acceptance:** `pnpm install` from root resolves all workspace deps.
`pnpm -r run build` builds all workspaces without errors.

#### Task 2.2 — ESLint + Prettier Configuration (#11)
**Files:** New `.eslintrc.cjs`, `.prettierrc`, `.editorconfig` at root
**What:**
- ESLint config: `@typescript-eslint/recommended` + `eslint:recommended`.
  - Rule: `no-eval`, `no-implied-eval` (prevents future shell injection).
  - Rule: `no-console` as warning (encourages structured logging transition).
- Prettier config: 2-space indent, single quotes, trailing commas, 100 char width.
- `.editorconfig` for cross-editor consistency.
- Add `"lint"` and `"format"` scripts to root `package.json`.

**Acceptance:** `pnpm lint` runs without config errors (warnings OK for existing code).
`pnpm format --check` reports current formatting state.

#### Task 2.3 — Test Framework Setup (#8)
**Files:** New `vitest.config.ts`, `lib/__tests__/`, `inngest/__tests__/`
**What:**
- Install Vitest + `@vitest/coverage-v8`.
- Configure with path aliases matching `tsconfig.json`.
- Create test scaffold with mocks:
  - `lib/__tests__/api-rate-governor.test.ts` — token bucket, circuit breaker, budget ceiling.
  - `lib/__tests__/llm-router.test.ts` — provider routing, model selection, rate governance.
  - `lib/__tests__/agent-memory.test.ts` — embed/store/query with mocked Supabase + OpenAI.
- Target: **≥80% line coverage for `lib/`** in this sprint.

**Acceptance:** `pnpm test` runs 20+ tests with all passing.
Coverage report shows ≥80% for `lib/*.ts`.

#### Task 2.4 — Inngest Function Tests (#9)
**Files:** `inngest/__tests__/agent-orchestrator.test.ts`, `inngest/__tests__/d8-saas-operations.test.ts`
**What:**
- Use `inngest/test` utilities (or manual step mocking).
- Test scenarios:
  - `agentInvoke`: Routes to correct pod lead; autonomy gating escalates sensitive actions.
  - `agentEscalate`: Retries 3 times then falls back to CEO.
  - `agentHealthCheck`: Correctly identifies stale supervisors.
  - `saasClientSignup`: Provisions subaccount + creates contact + notifies.
  - `saasPaymentFailed`: Triggers dunning; alerts on ≥$500.

**Acceptance:** 15+ Inngest function tests passing. Critical paths covered.

#### Task 2.5 — Shared Constants Module (#49)
**Files:** New `lib/constants.ts`
**What:**
- Extract into one file:
  - Retry counts, timeout durations (fetch: 30s, webhook: 60s)
  - Rate limits per provider (from `api-rate-governor.ts`)
  - DLQ thresholds, alert thresholds
  - Budget ceilings
- Update `api-rate-governor.ts`, `webhook-resilience.mjs`, `ghl-api.mjs`,
  `ghl-webhook-handler.mjs` to import from this file.

**Acceptance:** `grep -r "3000\|MIN_CALL_SPACING\|DLQ_ALERT_THRESHOLD"` shows
all values sourced from `lib/constants.ts`.

---

### Sprint 3 — Reliability Hardening

**Theme:** Fix error handling gaps and add resilience patterns across the stack.

#### Task 3.1 — Fetch Timeouts Everywhere (#14)
**Files:** `skills/ghl-api.mjs`, `skills/backup-manager.mjs`, `lib/llm-router.ts`,
`lib/agent-memory.ts`, + any skill using `fetch()`
**What:**
- Create a shared `lib/safe-fetch.ts` utility:
  ```typescript
  export async function safeFetch(url: string, opts: RequestInit & { timeoutMs?: number }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  ```
- Replace bare `fetch()` calls across the codebase with `safeFetch()`.

**Acceptance:** A test that points `safeFetch` at a non-responding server confirms
it throws after 30s. No bare `fetch()` calls remain (grep confirms).

#### Task 3.2 — Inspect Promise.allSettled Results (#15)
**Files:** `handlers/ghl-webhook-handler.mjs`
**What:**
- After every `Promise.allSettled()`, iterate results and log/alert on `rejected` entries.
- Pattern:
  ```javascript
  const results = await Promise.allSettled(tasks);
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) logger.warn('Partial alert failure', { failures });
  ```

**Acceptance:** A test that simulates one channel failing confirms the failure is logged
with structured context.

#### Task 3.3 — Transaction Safety for Saas Workflows (#16)
**Files:** `inngest/functions/d8-saas-operations.ts`
**What:**
- Wrap `saasClientSignup` in an Inngest step-based saga:
  - Step 1: Provision subaccount → on failure, stop.
  - Step 2: Create CRM contact → on failure, rollback subaccount.
  - Step 3: Notify director → on failure, log warning (non-critical).
- Use Inngest's `step.run()` + `step.sendEvent()` for compensation.

**Acceptance:** Simulating a step 2 failure triggers step 1 rollback.
No orphaned subaccounts.

#### Task 3.4 — DLQ Size Cap (#17)
**Files:** `skills/webhook-resilience.mjs`
**What:**
- Before appending to DLQ file, check `fs.statSync(dlqPath).size`.
- If > 100 MB, rotate: rename to `dlq-YYYY-MM-DD.jsonl.old`, start fresh file.
- Keep max 3 rotated files; delete oldest.

**Acceptance:** A test that writes 101 MB to DLQ confirms rotation occurs.

#### Task 3.5 — Respect Retry-After Headers (#19)
**Files:** `skills/ghl-api.mjs`
**What:**
- On HTTP 429, read `response.headers.get('Retry-After')`.
- If present, parse as seconds (integer) or HTTP-date and wait accordingly.
- Fall back to exponential backoff only if header is absent.

**Acceptance:** A mock 429 response with `Retry-After: 5` causes a 5-second wait.

#### Task 3.6 — Structured Logging (#23)
**Files:** New `lib/logger.ts`, then update all modules incrementally
**What:**
- Install `pino` (fast, JSON-native, 0 deps in production).
- Create `lib/logger.ts`:
  ```typescript
  import pino from 'pino';
  export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: { level: (label) => ({ level: label }) },
  });
  export const childLogger = (context: Record<string, unknown>) => logger.child(context);
  ```
- In this sprint: migrate `lib/*.ts`, `inngest/functions/*.ts`, and
  `handlers/ghl-webhook-handler.mjs` from `console.*` to `logger.*`.
- Add `requestId` / `correlationId` to log context where available.

**Acceptance:** Log output from gateway is valid JSON with `level`, `msg`, `time`,
and `requestId` fields. `grep "console.log" lib/ inngest/ handlers/` returns zero hits.

---

## Phase 2: Observe (Sprints 4–5)

*Goal: Build the monitoring, alerting, and observability stack so you can see
what's happening before you optimize it.*

---

### Sprint 4 — Observability Stack

#### Task 4.1 — Prometheus Metrics Export (#25)
**Files:** New `lib/metrics.ts`, update `lib/api-rate-governor.ts`, Inngest functions
**What:**
- Install `prom-client`.
- Expose `/metrics` endpoint on the gateway (port 18789).
- Instrument:
  - `openclaw_llm_request_duration_seconds` (histogram, labels: provider, model, agent)
  - `openclaw_llm_request_total` (counter, labels: provider, status)
  - `openclaw_event_processed_total` (counter, labels: event_type, status)
  - `openclaw_circuit_breaker_state` (gauge, labels: provider)
  - `openclaw_budget_used_dollars` (gauge, labels: provider)
  - `openclaw_agent_health` (gauge, labels: agent_id, pod_id)
  - `openclaw_memory_query_duration_seconds` (histogram)

**Acceptance:** `curl localhost:18789/metrics` returns valid Prometheus exposition format.

#### Task 4.2 — Grafana Dashboard + Alerts (#25 cont.)
**Files:** New `deploy/monitoring/docker-compose.monitoring.yml`,
`deploy/monitoring/grafana/dashboards/openclaw.json`,
`deploy/monitoring/prometheus/prometheus.yml`
**What:**
- Add Prometheus + Grafana as Docker services on the Hostinger VPS.
- Prometheus scrapes `localhost:18789/metrics` every 15s.
- Grafana dashboard with 6 panels:
  1. LLM request rate + latency (p50/p95/p99)
  2. Event throughput by type
  3. Circuit breaker state timeline
  4. Daily cost burn vs. budget
  5. Agent health heatmap (by division)
  6. Memory query latency

- Alert rules:
  - LLM p99 > 10s → warning
  - Circuit breaker OPEN > 5 min → critical
  - Budget > 90% → critical
  - Any supervisor unhealthy > 15 min → critical

**Acceptance:** Grafana dashboard loads with live data. Alert fires when a test
circuit breaker opens.

#### Task 4.3 — Centralized Log Aggregation (#24)
**Files:** `deploy/monitoring/docker-compose.monitoring.yml` (add Loki + Promtail),
`deploy/hostinger/openclaw.service`, `deploy/hostinger/webhook.service`
**What:**
- Add Grafana Loki + Promtail to monitoring stack.
- Promtail tails systemd journals for `openclaw` and `openclaw-webhook` units.
- Loki stores 30 days of logs.
- Add Loki as data source in Grafana.
- Create log dashboard with filters: level, agent_id, correlation_id.

**Acceptance:** Grafana Explore → Loki shows structured JSON logs from both services.
Filtering by `correlation_id` returns all steps of a single event flow.

#### Task 4.4 — Cross-Division Event Tracing (#33)
**Files:** `inngest/client.ts`, `inngest/functions/agent-orchestrator.ts`
**What:**
- Generate a `trace_id` (UUIDv4) at the entry point of every external event
  (GHL webhook, cron trigger, manual invocation).
- Propagate `trace_id` through all `step.sendEvent()` calls in Inngest.
- Store `trace_id` in `agent_events.metadata` JSONB column.
- Add `trace_id` to Pino log context.

**Acceptance:** Following a GHL webhook through to its final agent action,
all log lines and database records share the same `trace_id`.

#### Task 4.5 — Fallback Alerting Channel (#20)
**Files:** `lib/alerting.ts` (new), update all alert call sites
**What:**
- Create `lib/alerting.ts` with `sendAlert(message, severity)`:
  1. Try Telegram (primary).
  2. On Telegram failure, try email via Nodemailer (SMTP config from env).
  3. On email failure, write to `alerts-fallback.log` on disk.
- Severity levels: `info`, `warning`, `critical`.
- For `critical`, attempt all channels simultaneously (don't wait for one to fail).
- Update all existing alert call sites to use this module.

**Acceptance:** Simulating Telegram API failure causes email delivery.
Simulating both Telegram + email failure writes to disk log.

---

### Sprint 5 — Dashboard Evolution

#### Task 5.1 — Dashboard Authentication (#41)
**Files:** `dashboard/app/`, new `dashboard/middleware.ts`
**What:**
- Install `@supabase/auth-helpers-nextjs`, `@supabase/ssr`.
- Add Supabase Auth with magic-link login.
- Create `middleware.ts` that redirects unauthenticated users to `/login`.
- Create `/login` page with email input + magic link flow.
- Protect all routes except `/login`.

**Acceptance:** Visiting `/` without a session redirects to `/login`.
Clicking the magic link logs in and redirects to dashboard.

#### Task 5.2 — Real-Time Agent Status (#42)
**Files:** `dashboard/app/agents/page.tsx`, `dashboard/app/supabase.ts`
**What:**
- Replace 60-second polling with Supabase Realtime subscriptions.
- Subscribe to `agents` table changes (UPDATE on `status`, `last_heartbeat`).
- Agent cards update immediately when status changes.
- Add visual pulse animation for "just updated" agents.

**Acceptance:** Changing an agent's status in Supabase causes the dashboard card
to update within 2 seconds without page refresh.

#### Task 5.3 — Cost Tracking Panel (#45)
**Files:** New `dashboard/app/costs/page.tsx`, new Supabase migration for cost data
**What:**
- Create `agent_costs` table (or add to `agent_metrics`): agent_id, provider,
  model, tokens_in, tokens_out, cost_usd, recorded_at.
- Update `lib/llm-router.ts` to log token usage + calculated cost after each call.
- Dashboard `/costs` page with:
  - Daily burn rate chart (Recharts area chart)
  - Per-division cost breakdown (stacked bar)
  - Per-agent top-10 spenders (table)
  - Budget utilization gauge (current vs. ceiling)

**Acceptance:** After 24h of operation, `/costs` shows accurate per-agent cost data
matching Anthropic/OpenAI billing.

#### Task 5.4 — Event Replay UI (#44)
**Files:** `dashboard/app/events/page.tsx`, new API route `dashboard/app/api/replay/route.ts`
**What:**
- Add "Replay" button on failed events in the Events table.
- API route reads event payload from `agent_events`, re-publishes to Inngest.
- Requires authenticated session (from Task 5.1).
- Log replay action with user email + original event correlation_id.

**Acceptance:** Clicking "Replay" on a failed event re-fires it through Inngest.
The replayed event appears in the events table with a new correlation_id
linked to the original.

#### Task 5.5 — Admin CRUD Operations (#43)
**Files:** `dashboard/app/api/agents/route.ts`, `dashboard/app/agents/[id]/page.tsx`
**What:**
- Add API routes (service_role key, server-side only):
  - `POST /api/agents/:id/invoke` — trigger manual agent run
  - `POST /api/agents/:id/quarantine` — quarantine/unquarantine a pod
  - `PATCH /api/agents/:id` — update agent config (model, status, skills)
- Add agent detail page with edit form + action buttons.
- All actions require authenticated admin session.
- Audit log: every action written to `agent_events` with `source: 'dashboard'`.

**Acceptance:** Admin can quarantine a pod, change an agent's model assignment,
and trigger a manual run — all from the dashboard with audit trail.

---

## Phase 3: Optimize (Sprints 6–8)

*Goal: Performance tuning, architecture improvements, and cost reduction.*

---

### Sprint 6 — Agent Architecture

#### Task 6.1 — Agent Task Deduplication (#30)
**Files:** `inngest/functions/agent-orchestrator.ts`
**What:**
- Use Inngest's `idempotencyKey` on `agent/invoke` events:
  ```typescript
  inngest.createFunction(
    { id: 'agent-invoke', idempotency: 'event.data.idempotency_key' },
    ...
  );
  ```
- Generate idempotency key at event source: `${event_type}:${entity_id}:${timestamp_minute}`.
- Duplicate events within the same minute window are silently deduplicated.

**Acceptance:** Sending the same event twice within 60s results in only one execution.

#### Task 6.2 — Per-Agent Circuit Breaker (#32)
**Files:** `lib/api-rate-governor.ts`
**What:**
- Add an agent-level circuit breaker map alongside the existing provider-level one.
- If a single agent causes 5+ consecutive LLM failures, circuit-break that agent
  (not the entire provider).
- The agent is quarantined for 5 minutes, then half-opened for 1 test call.
- Emit `agent/health.degraded` event when an agent circuit breaker opens.

**Acceptance:** An agent in a failure loop is isolated. Other agents on the same
provider continue working.

#### Task 6.3 — Agent Versioning (#31)
**Files:** New Supabase migration, update `inngest/functions/training-protocol.ts`
**What:**
- Add `agent_versions` table: `id`, `agent_id`, `version`, `soul_md`, `config_snapshot`,
  `changed_by`, `change_reason`, `created_at`.
- Thursday SOUL.md refinement writes a version record before applying changes.
- Dashboard agent detail page shows version history with diff viewer.
- Add `rollback` endpoint: restores agent to a previous version.

**Acceptance:** After SOUL refinement runs, version history shows the diff.
Rolling back to version N-1 restores the previous SOUL.md content.

#### Task 6.4 — Priority Preemption (#34)
**Files:** `lib/api-rate-governor.ts`, `inngest/functions/agent-orchestrator.ts`
**What:**
- When system load > 80% (concurrency slots near max):
  - P0 events bypass the queue entirely.
  - P3 events are paused until load drops below 60%.
  - P2 events get 2x backoff multiplier (already exists, verify enforcement).
- Add a `system_load` gauge metric for Prometheus.

**Acceptance:** Under simulated high load (load-test.mjs), P0 events execute
within 5s while P3 events are deferred.

#### Task 6.5 — Skill Dependency Validation (#35)
**Files:** New `scripts/validate-skills.mjs`
**What:**
- Read `agents_config.json`, extract all `tools_required` arrays.
- For each referenced skill, verify:
  1. The `.mjs` file exists in `skills/`.
  2. The file exports the expected function (dynamic `import()` check).
  3. No circular dependencies between skills.
- Run at startup (development mode only) and in CI.
- Output: list of missing/broken skill references.

**Acceptance:** Removing a skill file and running `pnpm validate-skills` reports
the broken reference with the agent(s) affected.

#### Task 6.6 — Skill Interface Contract (#50)
**Files:** New `lib/skill-interface.ts`, update core skills
**What:**
- Define the interface:
  ```typescript
  export interface SkillManifest {
    name: string;
    version: string;
    description: string;
    execute: (context: SkillContext) => Promise<SkillResult>;
  }
  export interface SkillContext {
    agentId: string;
    correlationId: string;
    params: Record<string, unknown>;
    logger: Logger;
  }
  export interface SkillResult {
    success: boolean;
    data?: unknown;
    error?: string;
  }
  ```
- Migrate 10 core skills (ghl-api, agent-coordinator, content-writer, backup-manager,
  anomaly-detection, churn-prevention, delivery-system, webhook-resilience,
  browser-core, access-control-manager) to conform.
- `validate-skills.mjs` also checks interface conformance.

**Acceptance:** The 10 migrated skills pass interface validation.

---

### Sprint 7 — Memory & Data Optimization

#### Task 7.1 — pgvector Benchmarking + HNSW Migration (#36)
**Files:** New `scripts/benchmark-memory.mjs`, Supabase migration
**What:**
- Create benchmark script that:
  1. Seeds 100K test memories across all scopes.
  2. Runs 1000 `match_agent_memories()` queries measuring p50/p95/p99 latency.
  3. Reports recall accuracy at different `similarity_threshold` values.
- If IVFFlat p99 > 100ms at 100K rows, create migration to switch to HNSW index:
  ```sql
  DROP INDEX idx_agent_memory_embedding;
  CREATE INDEX idx_agent_memory_embedding ON agent_memory
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
  ```

**Acceptance:** Benchmark report shows p99 < 100ms for semantic search at 100K rows.

#### Task 7.2 — Memory TTL Enforcement Cron (#37)
**Files:** New Supabase migration (pg_cron), `inngest/client.ts`
**What:**
- Option A (preferred): Enable pg_cron in Supabase and schedule:
  ```sql
  SELECT cron.schedule('cleanup-expired-memories', '0 3 * * *',
    $$DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < NOW()$$);
  ```
- Option B (if pg_cron unavailable): Add Inngest cron function at `0 3 * * *`
  that calls Supabase RPC to delete expired entries.

**Acceptance:** Inserting a memory with `expires_at = NOW() - interval '1 day'`
confirms it's deleted by the next cron run.

#### Task 7.3 — Per-Agent Memory Quotas (#38)
**Files:** `lib/agent-memory.ts`, new quota check
**What:**
- Before `embedAndStore()`, count existing rows for the agent.
- If count ≥ 10,000, delete the oldest 500 entries (FIFO eviction).
- Make the limit configurable via `lib/constants.ts` (`MEMORY_QUOTA_PER_AGENT`).
- Log eviction events with agent_id and count evicted.

**Acceptance:** An agent with 10,000 memories auto-evicts oldest 500 on next store.

#### Task 7.4 — Embedding Cache (#39)
**Files:** `lib/agent-memory.ts`
**What:**
- Add an LRU cache (Map-based, max 1000 entries) for query embeddings.
- Cache key: SHA-256 hash of the query text.
- Cache value: the 1536-dim float array.
- TTL: 1 hour (queries for the same text within an hour skip the embedding API).
- Track cache hit/miss ratio in Prometheus metrics.

**Acceptance:** Querying the same text twice shows a cache hit on the second call.
OpenAI embedding API is called only once.

#### Task 7.5 — Supabase Connection Pooling (#40)
**Files:** `lib/agent-memory.ts`, `lib/supabase.ts` (new shared client)
**What:**
- Create `lib/supabase.ts` with a singleton Supabase client using connection
  pooler URL (port 6543 instead of 5432).
- Update all Supabase imports to use this shared client.
- Configure pool size based on deployment:
  - Dev: max 5 connections
  - Prod: max 20 connections

**Acceptance:** Under load test (50 concurrent queries), no connection timeout errors.

---

### Sprint 8 — Infrastructure Resilience

#### Task 8.1 — Staging Environment (#21)
**Files:** New `deploy/staging/docker-compose.staging.yml`,
new `.github/workflows/deploy-staging.yml`
**What:**
- Provision a second Hostinger VPS (CX11 — smaller is fine for staging).
- Create separate Supabase project for staging.
- New GitHub Actions workflow: deploys to staging on pushes to `develop` branch.
- Staging uses `.env.staging` with separate tokens/keys.
- Add `staging.truthjblue.dev` subdomain in Caddy.

**Acceptance:** Pushing to `develop` deploys to staging VPS.
Staging dashboard accessible at `staging.truthjblue.dev`.

#### Task 8.2 — CI Test Gate (#10)
**Files:** `.github/workflows/deploy-bot.yml`, `.github/workflows/deploy-dashboard.yml`
**What:**
- Add a `test` job that runs before `deploy`:
  ```yaml
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v2
        - run: pnpm install --frozen-lockfile
        - run: pnpm test
        - run: pnpm lint
    deploy:
      needs: test
      ...
  ```
- Dashboard workflow also runs `npm test` and `next lint` before deploy.

**Acceptance:** A failing test blocks deployment. The deploy job does not run
until tests pass.

#### Task 8.3 — Post-Deploy Smoke Tests (#13)
**Files:** New `scripts/smoke-test.mjs`, update deploy workflows
**What:**
- Script tests (run on VPS after deploy):
  1. `GET /health` returns 200 on both services.
  2. Supabase connectivity: can read `agents` table.
  3. Inngest: send test event, verify it's received.
  4. Telegram: send test message, verify delivery.
- Add to deploy workflow as final step.
- On failure: send Telegram alert + mark deployment as failed (but don't rollback
  automatically — see Task 8.4).

**Acceptance:** Smoke test reports pass/fail for each check. A broken Supabase
connection is caught within 30s of deploy.

#### Task 8.4 — Deployment Rollback (#18)
**Files:** `deploy/hostinger/deploy.sh`, `.github/workflows/deploy-bot.yml`
**What:**
- Before deploying, `deploy.sh` records the current commit SHA in `/opt/openclaw/.last-good-deploy`.
- After deploy, if smoke tests fail:
  1. `git checkout <last-good-sha>`
  2. Rebuild and restart services.
  3. Send critical alert: "Deployment rolled back from {new} to {old}".
- Add `--rollback` flag to `deploy.sh` for manual rollback.

**Acceptance:** A deliberate bad deploy (broken config) triggers automatic rollback.
Services return to the previous working state.

#### Task 8.5 — Supabase Backups to Object Storage (#27)
**Files:** New `deploy/hostinger/backup-supabase.sh`, cron entry
**What:**
- Daily `pg_dump` of Supabase database (via connection string from env).
- Compress with `gzip`, upload to Backblaze B2 (or Hostinger Object Storage).
- Keep 30 days of backup retention.
- Schedule via cron at 4 AM (after local backup at 3 AM).
- Verify restore: monthly test restore to staging Supabase project.

**Acceptance:** B2 bucket contains daily Supabase backups. A test restore
to staging produces a working database.

---

## Phase 4: Scale (Sprints 9–10)

*Goal: Prepare the system for growth — multi-region, TypeScript migration,
and operational cleanup.*

---

### Sprint 9 — Code Quality & Cleanup

#### Task 9.1 — Remove Dead Files (#48)
**Files:** Root directory cleanup
**What:**
- Delete: `tmp_agent_memory_cleanup.py`, `tmp_inspect_memory_dbs.py`,
  `tmp_inspect_schema.py`, `tmp_memory_stats.py`, `tmp_orphan_check.py`.
- Move `agents_config.backup-pre-d8.json` to `config/backups/agents_config.backup-pre-d8.json`.
- Delete `Running a SaaS Business with GoHighLevel.md` from repo root
  (move to `docs/` if still needed).

**Acceptance:** Repo root contains only: `docker-compose.yml`, `Dockerfile`,
`README.md`, `package.json`, config files, and directories.

#### Task 9.2 — Consolidate Browser Dependencies (#46)
**Files:** Skills `package.json` (or root), browser-related skills
**What:**
- Audit browser skills usage:
  - `browser-core.mjs` supports both Playwright and Puppeteer.
  - `browser-pool-manager.mjs` uses Playwright.
  - `browser-automation.mjs`, `browser-controller.mjs` — check which engine.
- Standardize on **Playwright** (better API, built-in stealth mode with
  `playwright-extra` + `stealth` plugin).
- Remove `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth` from deps.
- Update `browser-core.mjs` to Playwright-only.

**Acceptance:** `pnpm list puppeteer` returns nothing. All browser automation
tests pass with Playwright only. ~400 MB dependency reduction.

#### Task 9.3 — Begin TypeScript Migration for Core Skills (#47)
**Files:** 10 core skills renamed `.mjs` → `.ts`
**What:**
- Priority skills to migrate (highest-traffic, most complex):
  1. `ghl-api.mjs` → `ghl-api.ts`
  2. `agent-coordinator.mjs` → `agent-coordinator.ts`
  3. `delivery-system.mjs` → `delivery-system.ts`
  4. `webhook-resilience.mjs` → `webhook-resilience.ts`
  5. `anomaly-detection.mjs` → `anomaly-detection.ts`
  6. `backup-manager.mjs` → `backup-manager.ts`
  7. `content-writer.mjs` → `content-writer.ts`
  8. `churn-prevention.mjs` → `churn-prevention.ts`
  9. `browser-core.mjs` → `browser-core.ts`
  10. `access-control-manager.mjs` → `access-control-manager.ts`
- Add proper types for all function signatures, return values, and config objects.
- Use `SkillManifest` interface from Task 6.6.

**Acceptance:** 10 skills compile with `tsc --strict`. No `any` types except at
external API boundaries.

#### Task 9.4 — Agent Warm-Up / Context Caching (#29)
**Files:** `lib/llm-router.ts`, `inngest/functions/agent-orchestrator.ts`
**What:**
- For always-on supervisors (11 agents), pre-cache their SOUL.md content
  in an in-memory Map at startup.
- When `agentComplete()` is called, check the cache before reading SOUL.md from disk.
- Cache invalidation: on Inngest `training.soul_refinement` completion, bust the
  cache for affected agents.
- Measure: compare cold-start vs. cached agent response latency in metrics.

**Acceptance:** Supervisor agent invocations skip disk reads. Prometheus shows
reduced p50 latency for cached agents.

---

### Sprint 10 — Scale & Harden

#### Task 10.1 — High-Availability Setup (#22)
**Files:** New `deploy/hostinger/haproxy.cfg`, update provisioning
**What:**
- Provision second Hostinger VPS (CX21) in different datacenter zone.
- Add Hostinger Load Balancer in front of both VPS instances.
- Both run identical `openclaw` and `openclaw-webhook` services.
- Supabase is already shared (cloud-hosted, no change).
- Inngest is already shared (cloud-hosted, no change).
- Load balancer health check: `/health` on both services.
- DNS: update `api.truthjblue.dev` to point to load balancer IP.

**Acceptance:** Stopping one VPS causes zero downtime. Load balancer routes
all traffic to the healthy instance within 10s.

#### Task 10.2 — Automated Credential Rotation (#26)
**Files:** New `.github/workflows/rotate-credentials.yml`, update `.env` handling
**What:**
- Monthly cron workflow (1st of each month):
  1. Rotate `OPENCLAW_GATEWAY_AUTH_TOKEN` (generate new 64-char hex).
  2. Update GitHub Secrets via API.
  3. Deploy to both VPS instances with new token.
  4. Verify health checks pass with new token.
  5. Send rotation confirmation to Telegram.
- For GHL/Supabase/OpenAI tokens: create rotation runbook (manual, triggered
  by workflow_dispatch with checklist output).

**Acceptance:** Monthly rotation runs without human intervention.
Old token stops working; new token works immediately.

#### Task 10.3 — Containerize Production (#28)
**Files:** `deploy/docker-compose.prod.yml` (rewrite), update deploy scripts
**What:**
- Rewrite `docker-compose.prod.yml` with all production services:
  ```yaml
  services:
    gateway:
      build: .
      command: openclaw serve
      deploy:
        resources:
          limits: { memory: 2G, cpus: '1.5' }
      healthcheck: ...
    webhook:
      build: .
      command: node handlers/ghl-webhook-handler.mjs
      deploy:
        resources:
          limits: { memory: 512M, cpus: '0.5' }
      healthcheck: ...
    prometheus: ...
    grafana: ...
    loki: ...
    promtail: ...
  ```
- Update `deploy.sh` to use `docker compose up -d --build` instead of systemd.
- Keep systemd as a watchdog for docker compose only.

**Acceptance:** `docker compose up -d` starts all services. `docker compose ps`
shows all healthy. Same behavior as systemd but with resource limits.

#### Task 10.4 — Dashboard Admin Panel Finalization (#43 cont.)
**What:** Polish Sprint 5 admin features:
- Add confirmation dialogs for destructive actions (quarantine, config changes).
- Add RBAC: `admin` and `viewer` roles via Supabase Auth metadata.
- Viewers can see everything but can't invoke agents or change config.
- Audit log page: searchable table of all admin actions.

**Acceptance:** A `viewer` user sees all dashboards but action buttons are hidden.
An `admin` user can perform all actions with confirmation dialogs.

#### Task 10.5 — Documentation Update
**What:** Update all documentation to reflect the new architecture:
- `README.md`: Add sections for monitoring stack, testing, and CI/CD.
- `stack_setup.md`: Add Prometheus/Grafana/Loki setup instructions.
- `docs/deployment.md`: Add staging environment, rollback procedure, container mode.
- `docs/RUNBOOKS.md`: Add new runbooks for credential rotation, rollback, log search.
- `build_phases.md`: Mark Phase 1–3 complete, add Phase 4 (this plan) as tracked.

**Acceptance:** A new engineer can set up the full stack from documentation alone.

---

## Dependency Graph

```
Sprint 1 (Security)
  └─→ Sprint 2 (Tooling) ← no blocker, can start Day 1 of Sprint 2
        ├─→ Sprint 3 (Reliability) ← needs logger, test framework
        │     └─→ Sprint 6 (Agent Arch) ← needs structured logging
        │     └─→ Sprint 7 (Memory) ← needs test framework
        └─→ Sprint 4 (Observability) ← needs structured logging from S3
              └─→ Sprint 5 (Dashboard) ← needs metrics + auth patterns
              └─→ Sprint 8 (Infra) ← needs CI test gate, observability
                    └─→ Sprint 9 (Code Quality) ← needs stable CI
                          └─→ Sprint 10 (Scale) ← needs all prior
```

## Sprint Calendar

| Sprint | Dates               | Theme                  | Key Deliverables                          |
|--------|---------------------|------------------------|-------------------------------------------|
| 1      | Mar 16 – Mar 29     | Security               | Shell injection fix, secrets, validation  |
| 2      | Mar 30 – Apr 12     | Tooling Foundation     | Monorepo, ESLint, Vitest, 35+ tests      |
| 3      | Apr 13 – Apr 26     | Reliability            | Timeouts, transactions, structured logs   |
| 4      | Apr 27 – May 10     | Observability          | Prometheus, Grafana, Loki, tracing        |
| 5      | May 11 – May 24     | Dashboard              | Auth, real-time, costs, replay, admin     |
| 6      | May 25 – Jun 7      | Agent Architecture     | Dedup, circuit breakers, versioning       |
| 7      | Jun 8 – Jun 21      | Memory Optimization    | pgvector benchmark, TTL, quotas, caching  |
| 8      | Jun 22 – Jul 5      | Infrastructure         | Staging, CI gate, rollback, DB backups    |
| 9      | Jul 6 – Jul 19      | Code Quality           | Cleanup, TS migration, browser consolidation |
| 10     | Jul 20 – Aug 2      | Scale                  | HA, credential rotation, containerization |

## Risk Register

| Risk                                           | Mitigation                                       |
|------------------------------------------------|--------------------------------------------------|
| Shell injection exploited before Sprint 1 done | Deploy Task 1.1 as a hotfix within 48 hours      |
| pgvector performance degrades at scale         | Sprint 7 benchmark informs HNSW migration timing |
| LLM costs exceed budget during buildout        | Rate governor budget ceiling already in place     |
| Single VPS failure before Sprint 10            | Daily backups + fast provision script (~30 min)   |
| Supabase outage                                | Backups to B2 (Sprint 8), manual restore runbook  |
| CI false-positive blocks deploy                | `workflow_dispatch` manual override always works  |

---

> **Next action:** Start Sprint 1, Task 1.1 — fix shell injection in
> `handlers/ghl-webhook-handler.mjs` and `skills/webhook-resilience.mjs`.
