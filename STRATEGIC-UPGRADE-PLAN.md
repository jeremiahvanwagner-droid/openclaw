# OpenClaw: 50 Strategic Upgrades, Enhancements & Optimizations

> **Comprehensive Analysis Report**
> Generated: March 18, 2026 | Senior Architecture Review
> Scope: Full-stack analysis of 90-agent, 200+ skill, multi-division AI orchestration platform

---

## Executive Summary

OpenClaw is a sophisticated multi-agent AI orchestration platform operating 90 agents across 7 divisions with 200+ skills, backed by Supabase pgvector, Inngest event orchestration, and an LLM routing layer (Anthropic + OpenAI). The platform currently runs on a Hostinger VPS with Caddy reverse proxy, Prometheus/Grafana monitoring, and a Next.js 14 dashboard.

This analysis identifies **50 high-impact upgrades** organized into **5 priority tiers** spanning security hardening, performance optimization, architectural improvements, operational excellence, and growth enablement. Each item includes severity, current state assessment, expected impact, and implementation guidance.

**Key Findings:**
- **12 items already partially addressed** by previous implementation plan (Sprint 1–3 overlap)
- **8 net-new critical findings** not covered in existing plans
- **15 performance optimizations** with measurable latency/cost reduction potential
- **10 architectural upgrades** enabling 10x scale-out
- **5 operational excellence** improvements reducing MTTR by ~60%

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `DONE` | Already implemented in codebase |
| `PARTIAL` | Partially implemented, gaps remain |
| `NEW` | Not in any existing plan |
| `PLANNED` | In IMPLEMENTATION-PLAN.md but not started |
| `BLOCKED` | Waiting on external dependency |

---

## Tier 1: Critical Security & Reliability (Ship This Week)

### 1. Shell Injection Remediation in Webhook Handler
- **Severity:** CRITICAL | **Status:** PARTIAL
- **Current State:** `lib/safe-exec.mjs` exists with `execFile()` pattern, but `ghl-webhook-handler.mjs` (lines 87–93) still uses `execAsync()` with string interpolation for `sendTelegramAlert()` and `sendTeamsAlert()`. The `escapedMessage` pattern is bypassable.
- **Gap:** Root webhook handler still has the vulnerable code path. Skills using `execAsync()` need an audit sweep.
- **Fix:** Replace all `execAsync(\`openclaw send ... "${escaped}"\`)` with `execFile('openclaw', ['send', '--agent', agent, ...])` using the established `safe-exec.mjs` patterns.
- **Impact:** Eliminates command injection via crafted webhook payloads — the highest-severity attack vector.

### 2. Webhook Secret Hardcoded Fallback
- **Severity:** CRITICAL | **Status:** PARTIAL
- **Current State:** `ghl-webhook-handler.mjs` line 43: `const WEBHOOK_SECRET = process.env.OPENCLAW_GHL_WEBHOOK_SECRET || 'replace-with-32byte-random-secret'`. The fallback string means the handler operates with a known secret if the env var is missing.
- **Fix:** Remove the fallback. If `OPENCLAW_GHL_WEBHOOK_SECRET` is not set, refuse to start. Add startup validation for all required env vars.
- **Impact:** Prevents unauthenticated webhook processing if deployment misconfiguration occurs.

### 3. Credential Inventory Gaps
- **Severity:** HIGH | **Status:** PARTIAL
- **Current State:** `deploy/hostinger/credential-inventory.csv` has empty `Created Date`, `Rotate By`, `Last Rotated`, and `Revoke Procedure` columns for all 6 credentials. `ROTATION-CHECKLIST.md` identifies 5 tokens that were in plaintext config.
- **Fix:** Populate all CSV fields immediately. Establish 90-day rotation policy. Automate rotation reminders via cron Telegram alert.
- **Impact:** Compliance readiness and reduced blast radius of credential leaks.

### 4. Rate Governor In-Memory State Loss
- **Severity:** HIGH | **Status:** NEW
- **Current State:** `api-rate-governor.ts` stores all state (token buckets, circuit breaker state, budget counters, concurrency semaphores) in-memory JavaScript Maps. A gateway restart resets ALL rate limits, reopens all circuit breakers, and zeroes budget tracking.
- **Fix:** Persist critical state (daily budget spent, circuit breaker state) to a file or Redis. On startup, rehydrate from the persisted state. Budget counters should survive restarts to prevent overspend after a crash-restart cycle.
- **Impact:** Prevents budget overruns and eliminates the "restart to bypass rate limits" loophole.

### 5. Missing `/metrics` Endpoint Exposure
- **Severity:** HIGH | **Status:** PARTIAL
- **Current State:** `lib/metrics.ts` defines a Prometheus registry with counters/histograms/gauges, but the gateway binary (OpenClaw CLI) must expose `/metrics`. The dashboard `/metrics` route returns 404 per the metrics-dashboard-plan repo memory note.
- **Fix:** Verify the gateway exposes the Prometheus registry at `GET /metrics`. If not, add an HTTP handler in the webhook server to serve `registry.metrics()`. Dashboard metrics page is also missing (planned for March 22 week).
- **Impact:** Without the endpoint, the entire Prometheus/Grafana stack collects no data.

---

## Tier 2: Performance & Cost Optimization (Next 2 Weeks)

### 6. LLM Model Tiering Optimization
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** `llm-router.ts` MODEL_MAP assigns `claude-opus-4` to executives and `gpt-4o-mini` to routine tasks. However, many cron jobs (e.g., sentinel checks, lead scoring) use full agent sessions that inherit the agent's default model — often Sonnet/Opus for tasks that only need GPT-4o-mini.
- **Fix:** Add model override at the cron job level (`payload.model`) so batch jobs can specify a cheaper model. Add `lightContext: true` (already used by some jobs) as the default for all cron payloads.
- **Impact:** Estimated 30-40% reduction in daily LLM costs for cron workloads.

### 7. Embedding Model Upgrade: ada-002 → text-embedding-3-small
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** `agent-memory.ts` uses `text-embedding-ada-002` (1536 dimensions). OpenAI's `text-embedding-3-small` is 5x cheaper ($0.02 vs $0.10 per 1M tokens), supports dimensionality reduction (512 dims sufficient for most use cases), and has better retrieval quality.
- **Fix:** Migrate to `text-embedding-3-small` with 512 or 1024 dimensions. Requires re-embedding existing memories (batch job) and updating the pgvector index dimensions.
- **Caveats:** Mixed-dimension queries won't work — needs a full re-index migration with downtime window.
- **Impact:** ~80% cost reduction on embedding operations. Smaller vectors = faster similarity search.

### 8. Cron Job Payload Optimization
- **Severity:** MEDIUM | **Status:** PARTIAL
- **Current State:** Cron jobs send full `agentTurn` messages with verbose prompt text (e.g., `critical-incident-sentinel` has a 400+ char message). Each execution creates an LLM session that processes this prompt. Some jobs like sentinel checks return blank most of the time.
- **Fix:** For sentinel/monitoring jobs that usually return blank, implement a two-phase approach: (1) lightweight script-only check (no LLM), (2) only invoke LLM if the script returns non-blank. Use `wakeMode: "script"` if supported, or a shell pre-check in the payload.
- **Impact:** Eliminates unnecessary LLM calls for ~40% of cron executions.

### 9. Connection Pool Singleton for Supabase
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** Each module (`agent-memory.ts`, `llm-router.ts`, Inngest functions) creates its own `createClient()` Supabase instance. Under load (50+ concurrent operations), this can exhaust connection limits.
- **Fix:** Create `lib/supabase.ts` singleton client with connection pooler URL. All modules import from this shared client.
- **Impact:** Prevents connection exhaustion under load. Reduces Supabase connection overhead by ~80%.

### 10. Browser Dependency Consolidation
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** Skills depend on both Playwright (`^1.48.0`) AND Puppeteer (`^24.39.1`). Combined disk footprint: ~800MB of Chromium binaries. `browser-core.mjs` supports both engines.
- **Fix:** Standardize on Playwright. Remove Puppeteer from dependencies. Update `browser-core.mjs`, `browser-pool-manager.mjs`, `browser-automation.mjs`, and `browser-controller.mjs`.
- **Impact:** ~400MB disk reduction. Single browser automation API. Simplified debugging.

### 11. Dead Letter Queue Rotation
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** `constants.ts` defines `DLQ_MAX_SIZE_BYTES = 100MB` and `DLQ_MAX_ROTATED_FILES = 3`, but rotation logic is not yet implemented in the skills that write to DLQ files.
- **Fix:** Implement DLQ rotation in `skills/ghl-api.mjs` and any skill writing to `dead-letter-queue.json`. Check size before append, rotate if exceeded.
- **Impact:** Prevents unbounded disk growth on production VPS.

### 12. GHL API Retry-After Header Compliance
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** GHL skill rate limiting uses hardcoded 3-second spacing and exponential backoff on 429, but does not read `Retry-After` header from GHL responses.
- **Fix:** Parse `Retry-After` header on 429 responses. Use the server-specified delay instead of the hardcoded backoff.
- **Impact:** Faster recovery from rate limits. Avoids unnecessarily long waits or too-short retries.

---

## Tier 3: Architectural Improvements (Sprints 3–6)

### 13. Event Schema Validation with Zod
- **Severity:** HIGH | **Status:** PLANNED
- **Current State:** Webhook handler processes JSON payloads with no schema validation. Unknown event types fall through to a `console.warn()`. Malformed payloads could cause runtime errors in handler functions.
- **Fix:** Define Zod schemas for each GHL event type. Validate at ingestion. Reject unknown/malformed events with HTTP 422. Log rejected payloads for monitoring.
- **Impact:** Prevents malformed data from propagating through the agent network.

### 14. Inngest Idempotency Keys
- **Severity:** HIGH | **Status:** PLANNED
- **Current State:** No deduplication on `agent/invoke` events. If a webhook fires twice (common with GHL), the same task runs twice.
- **Fix:** Add `idempotencyKey` to all Inngest function definitions. Generate key as `${event_type}:${entity_id}:${timestamp_minute}`.
- **Impact:** Eliminates duplicate task execution. Reduces wasted LLM spend.

### 15. Agent-Level Circuit Breaker
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** Circuit breakers operate at the provider level only. If one agent enters a failure loop (e.g., bad SOUL.md prompt), it can exhaust the provider's failure budget and circuit-break ALL agents on that provider.
- **Fix:** Add per-agent circuit breaker map. 5 consecutive failures → quarantine that agent for 5 minutes. Emit `agent/health.degraded` event.
- **Impact:** Fault isolation. One bad agent can't take down the entire system.

### 16. Skill Interface Contract Standardization
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** 111 `.mjs` skill files have no standardized interface. Each has its own CLI parsing, error handling, and output format. This makes automated validation, testing, and orchestration unreliable.
- **Fix:** Define `SkillManifest` TypeScript interface. Migrate 10 core skills first. Add validation script.
- **Impact:** Enables automated skill testing, health checks, and dependency validation.

### 17. Saga Pattern for SaaS Provisioning
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** `d8-saas-operations.ts` `saasClientSignup` uses Inngest steps but lacks compensating transactions. A failure in step 2 (CRM contact creation) leaves an orphaned subaccount from step 1.
- **Fix:** Implement compensation logic: if step 2 fails, reverse step 1. Use Inngest step retry + explicit rollback functions.
- **Impact:** Prevents orphaned resources and ensures data consistency.

### 18. Centralized Error Taxonomy
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** Errors are inconsistently categorized across the codebase. Some use HTTP status codes, some use custom strings (`"idle"`, `"not-delivered"`, `"timeout"`), some use `lastErrorReason` free-text fields in cron jobs.
- **Fix:** Define an `ErrorCode` enum in `lib/constants.ts` with categories: `AUTH_EXPIRED`, `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_ERROR`, `VALIDATION_ERROR`, `INTERNAL_ERROR`. Use consistently across all modules.
- **Impact:** Enables automated error classification, alerting thresholds by category, and meaningful dashboards.

### 19. Event-Driven Credential Refresh
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** When GHL/OpenAI tokens expire, the circuit breaker opens and stays open until manual intervention. The 401/403 detection in `api-rate-governor.ts` logs and throws, but there's no automated recovery path.
- **Fix:** On auth-expired circuit, emit `credential/expired` Inngest event. Create a function that attempts token refresh via `ghl-oauth-manager.mjs` or flags the operator for manual rotation. Auto-close circuit after successful refresh.
- **Impact:** Reduces MTTR for credential expiry from hours (manual) to minutes (automated).

### 20. Webhook Handler to Express/Fastify Migration
- **Severity:** LOW | **Status:** NEW
- **Current State:** `ghl-webhook-handler.mjs` uses raw `http.createServer()` with manual body parsing, routing, and HMAC verification. This works but involves significant boilerplate and lacks middleware composition.
- **Fix:** Migrate to Fastify (lightweight, schema validation built-in, ~65K req/s). Add structured request logging, content-type negotiation, and graceful shutdown.
- **Impact:** Cleaner code, built-in validation, better error handling, and access to the Fastify plugin ecosystem.

### 21. Agent Configuration Hot-Reload
- **Severity:** LOW | **Status:** NEW
- **Current State:** Changing agent configuration requires modifying `agents_config.json` and restarting the gateway. In a 90-agent system, restart = brief downtime for all agents.
- **Fix:** Implement `fs.watch()` on `agents_config.json`. On change, diff the new config against the running state and apply changes incrementally (add/remove agents, update models, change skills) without restart.
- **Impact:** Zero-downtime configuration changes. Critical for rapid iteration.

### 22. Typed Event Schema Generation
- **Severity:** LOW | **Status:** NEW
- **Current State:** `inngest/client.ts` manually defines TypeScript event schemas (~150 lines). These can drift from what handlers actually emit/consume.
- **Fix:** Generate event schemas from a single YAML/JSON source of truth. Use code generation to produce the TypeScript types AND Zod validators. Validate at both emit and consume boundaries.
- **Impact:** Eliminates event schema drift. Single source of truth for all 77-agent event contracts.

---

## Tier 4: Observability & Operational Excellence (Sprints 4–8)

### 23. Prometheus Scrape Target for Gateway
- **Severity:** HIGH | **Status:** PARTIAL
- **Current State:** `prometheus.yml` only scrapes `openclaw-webhook:8788`. The gateway (port 18789) is not in the scrape config. Agent health, LLM latency, and circuit breaker metrics from the gateway are not collected.
- **Fix:** Add `openclaw-gateway:18789` as a second scrape target in `prometheus.yml`. Verify the gateway exposes a `/metrics` endpoint.
- **Impact:** Doubles the observable surface area. Gateway metrics are where most agent activity happens.

### 24. Grafana Dashboard Gaps
- **Severity:** MEDIUM | **Status:** PARTIAL
- **Current State:** `deploy/monitoring/grafana/dashboards/openclaw.json` exists but needs validation. Alert rules defined in `openclaw.yml` cover 4 scenarios only (latency, circuit breaker, budget, supervisor health).
- **Fix:** Add alert rules for: DLQ growth rate, cron job consecutive failures, memory query latency p99, credential expiry countdown, agent quarantine events. Add dashboard panels for: cron job execution timeline, per-agent cost burn, GHL API call rate, event processing funnel.
- **Impact:** Proactive alerting catches issues before they become outages.

### 25. Structured Log Correlation
- **Severity:** MEDIUM | **Status:** PARTIAL
- **Current State:** `lib/logger.ts` provides Pino structured logging with child loggers. However, not all modules use it — skills (`.mjs` files) still use `console.log()`/`console.warn()`.
- **Fix:** Create `lib/logger.mjs` wrapper for ESM skills (already exists). Migrate the top 20 highest-traffic skills from `console.*` to structured logger. Enforce `correlation_id` propagation.
- **Impact:** End-to-end traceability across webhook → agent → skill → API call chain.

### 26. Health Check Depth
- **Severity:** MEDIUM | **Status:** PARTIAL
- **Current State:** `deploy/hostinger/health-check.sh` checks basic HTTP 200 on `/health` endpoints. It does not verify Supabase connectivity, LLM provider availability, or cron scheduler state.
- **Fix:** Implement a deep health check endpoint (`/health/deep`) that verifies: Supabase read, LLM provider reachability (lightweight ping), cron scheduler running, no circuits open. Return structured JSON with per-subsystem status.
- **Impact:** Catches "running but broken" states that shallow health checks miss.

### 27. Cron Job Observability Dashboard
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** Cron job status is only visible in `cron/jobs.json` file. No dashboard view, no historical execution tracking, no alert on consecutive failures beyond the per-job `failureAlert` config.
- **Fix:** Add a `/cron` dashboard page showing: job list with last run status, execution timeline (Gantt-style), consecutive error counts, average duration trends. Source data from `cron/jobs.json` (read via API) or persist to Supabase.
- **Impact:** Immediate visibility into cron health. No more SSH-and-grep to check job status.

### 28. Deployment Audit Trail
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** `deploy.sh` runs `git reset --hard` on the production server. There's no record of who deployed what, when, or from which commit. No pre/post-deploy verification log.
- **Fix:** Before deploying, log: commit SHA, deployer (from SSH user), timestamp, and previous SHA to a `deploy-log.json`. After deploy, append health check results. Send Telegram notification with deployment summary.
- **Impact:** Accountability and fast rollback identification.

### 29. Supabase RLS Policy Audit
- **Severity:** HIGH | **Status:** PARTIAL
- **Current State:** `20260314000004_dashboard_rls_policies.sql` adds RLS for dashboard access. However, the `agent_costs` table migration (`20260316_create_agent_costs.sql`) enables RLS but only grants `service_role` access. Dashboard reads of cost data may fail with anon key.
- **Fix:** Audit all tables for RLS policy completeness. Ensure `agent_costs`, `agent_metrics`, `agent_events`, and `agents` all have `SELECT` policies for the `anon` role (dashboard reads) and `INSERT/UPDATE` for `service_role` (backend writes).
- **Impact:** Prevents dashboard data access failures and ensures principle of least privilege.

### 30. Backup Verification Testing
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** `deploy/hostinger/backup.sh` creates daily tarballs but never verifies them. No restore test exists. Backup integrity is assumed.
- **Fix:** After creating the backup, run a verification step: extract to a temp directory, check file count against manifest, verify JSON parsability of config files. Monthly: full restore test to staging.
- **Impact:** Guarantees recoverability. Untested backups are not backups.

---

## Tier 5: Growth & Scale Enablement (Sprints 8–10)

### 31. CI/CD Pipeline (GitHub Actions)
- **Severity:** HIGH | **Status:** PLANNED
- **Current State:** No CI/CD pipeline. Deployment is via `deploy.sh` with `git reset --hard`. No automated testing before deploy.
- **Fix:** Create `.github/workflows/ci.yml` with: checkout → install → lint → test → build. Create `deploy.yml` with: CI pass → build Docker image → push to registry → SSH deploy to VPS. Gate deploy on all tests passing.
- **Impact:** Prevents broken code from reaching production. Automated quality gate.

### 32. Staging Environment
- **Severity:** HIGH | **Status:** PLANNED
- **Current State:** No staging. All changes go directly to production.
- **Fix:** Provision second Hostinger VPS (CX11). Separate Supabase project. Deploy from `develop` branch. Subdomain: `staging.truthjblue.dev`.
- **Impact:** Safe testing ground. Zero-risk validation of changes before production.

### 33. Migration to text-embedding-3-large for Critical Memories
- **Severity:** LOW | **Status:** NEW
- **Current State:** All memory embeddings use the same model regardless of importance.
- **Fix:** Implement tiered embedding: `text-embedding-3-small` (512 dims) for division/ephemeral memories, `text-embedding-3-large` (3072 dims) for global/permanent memories. Store dimension info in metadata for query routing.
- **Impact:** Better retrieval quality for critical institutional knowledge while keeping costs low for transient data.

### 34. Agent Versioning & Rollback
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** Agent SOUL.md files are modified in place with no version history. If a training protocol refinement degrades an agent's performance, there's no rollback path.
- **Fix:** Create `agent_versions` table. Snapshot SOUL.md + config before each training modification. Dashboard shows version history with diff. One-click rollback.
- **Impact:** Safe agent evolution with rollback capability.

### 35. High-Availability Multi-Node
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** Single VPS (Hostinger). Total failure = total outage.
- **Fix:** Second VPS in different availability zone. Hostinger Load Balancer fronting both. Shared Supabase + Inngest (already cloud-hosted). DNS + Caddy update.
- **Impact:** Zero-downtime resilience. Sub-10s failover.

### 36. Horizontal Agent Scaling via Worker Queues
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** Agent concurrency is limited by `maxConcurrent: 6 agents, 8 subagents` in `openclaw.json`. All agent work runs in a single Node.js process.
- **Fix:** Introduce a worker queue (BullMQ + Redis, or Inngest's built-in concurrency) where agent tasks are dequeued by multiple worker processes. Each worker handles N agents. Scale workers independently.
- **Impact:** Breaks the single-process bottleneck. Enables scaling agent work across multiple cores/containers.

### 37. Webhook Replay & Audit Log
- **Severity:** MEDIUM | **Status:** PARTIAL
- **Current State:** Dashboard has a `/api/replay` route stub and events page. However, full webhook payload archival for forensic replay is not implemented.
- **Fix:** Store raw webhook payloads (encrypted at rest) in Supabase or object storage. Dashboard events page shows full payload (redacted PII). Replay button re-ingests with new correlation ID.
- **Impact:** Complete audit trail. Ability to replay and debug any past event.

### 38. Multi-Region LLM Routing
- **Severity:** LOW | **Status:** NEW
- **Current State:** LLM router has a static provider configuration. If Anthropic US goes down, all Claude calls fail.
- **Fix:** Add provider region awareness. Configure fallback regions or alternate endpoints. On provider circuit-break, automatically route to backup model/provider (e.g., Claude failure → GPT-4o escalation for critical tasks).
- **Impact:** LLM availability resilience. No single provider failure takes down agent intelligence.

### 39. TypeScript Migration for Core Skills
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** 111 skills are `.mjs` files with no type safety. Runtime errors from type mismatches are only caught in production.
- **Fix:** Migrate top 10 highest-traffic skills to TypeScript with strict types. Add to tsconfig.json includes. Use `SkillManifest` interface.
- **Impact:** Compile-time error detection. Better IDE support for skill development.

### 40. Dashboard RBAC
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** Dashboard middleware checks for authentication but not authorization. Any authenticated user has full access to all features including replay and agent invocation.
- **Fix:** Add role metadata to Supabase Auth users (admin/viewer). `viewer` sees dashboards but can't trigger actions. `admin` has full access. Check role in middleware + API routes.
- **Impact:** Principle of least privilege for dashboard access.

---

## Tier 5+: Innovation & Future-Proofing

### 41. Semantic Memory Deduplication
- **Severity:** LOW | **Status:** NEW
- **Current State:** Agents can store duplicate or near-duplicate memories. Over time, the `agent_memory` table grows with redundant entries, slowing queries and increasing storage costs.
- **Fix:** Before storing a new memory, run a similarity check (threshold > 0.95). If a near-duplicate exists, update the existing entry's timestamp instead of inserting a new one. Add a background dedup job.
- **Impact:** Reduced memory table bloat. Faster queries. Lower storage costs.

### 42. Prompt Template Versioning & A/B Testing
- **Severity:** LOW | **Status:** NEW
- **Current State:** Agent SOUL.md and prompt templates are static files. No mechanism to test whether a prompt change improves agent performance.
- **Fix:** Store prompt templates in Supabase with version ID. Support A/B assignment (50/50 split by correlation_id hash). Track output quality metrics per version. Auto-promote winners after N samples.
- **Impact:** Data-driven prompt optimization. Measurable agent improvement.

### 43. Webhook Payload Encryption at Rest
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** Webhook payloads containing customer PII (contact info, payment data) are logged and stored in plaintext in Supabase `agent_events.payload` JSONB column.
- **Fix:** Encrypt PII-containing payload fields before storage using AES-256-GCM with a key from env. Decrypt on read. Add `encrypted: true` field to metadata. Apply to: `contact.created`, `payment.received`, `form.submitted` events.
- **Impact:** GDPR/CCPA compliance. Reduces breach impact.

### 44. OpenTelemetry Integration
- **Severity:** LOW | **Status:** NEW
- **Current State:** Custom Prometheus metrics + Pino logging provide observability. Traces are manual (correlation_id propagation). No distributed tracing standard.
- **Fix:** Add OpenTelemetry SDK. Auto-instrument HTTP calls, Supabase queries, and LLM requests. Export traces to Grafana Tempo (add to monitoring stack). Replaces manual correlation_id with standard W3C trace context.
- **Impact:** Industry-standard observability. Automatic span creation. Visual trace waterfall in Grafana.

### 45. Skill Marketplace / Registry API
- **Severity:** LOW | **Status:** NEW
- **Current State:** Skills are files on disk. Adding a new skill requires file creation, agent config update, and gateway restart. No discovery or metadata API.
- **Fix:** Create `GET /api/skills` endpoint that reads skill manifests. Dashboard skills page for browsing, enabling/disabling, and assigning skills to agents. Hot-load new skills without restart.
- **Impact:** Self-service skill management. Faster skill development iteration.

### 46. Agent Performance Benchmarking Suite
- **Severity:** LOW | **Status:** NEW
- **Current State:** `scripts/load-test.mjs` tests event throughput but not agent quality. No measurement of whether agents produce correct outputs.
- **Fix:** Create a benchmark suite with known-good test cases per agent type. Run weekly. Score: accuracy, latency, cost, hallucination rate. Track over time in dashboard. Flag agents whose scores degrade.
- **Impact:** Objective agent quality measurement. Catches degradation early.

### 47. GHL OAuth Token Auto-Refresh
- **Severity:** HIGH | **Status:** BLOCKED
- **Current State:** GHL OAuth tokens in `credentials/ghl-oauth-tokens.json` expire and require manual refresh via `ghl-oauth-manager.mjs`. 35 skills depend on OAuth tokens. Token expiry = 35 skills broken.
- **Fix:** Implement automatic OAuth refresh flow. Before each GHL API call, check token expiry. If within 10 minutes of expiry, refresh proactively. Store refreshed tokens back to credential file.
- **Impact:** Eliminates the #1 cause of GHL skill failures.

### 48. Memory Retention Policies by Scope
- **Severity:** LOW | **Status:** NEW
- **Current State:** `constants.ts` defines `MEMORY_MIN_SIMILARITY = 0.7` but no differentiated retention by scope. Private memories live forever (or until quota eviction). No aging or relevance decay.
- **Fix:** Define retention policies: private = 30 days, division = 90 days, global = permanent. Apply via pg_cron or scheduled Inngest function. Add relevance decay: reduce older memories' similarity score by 0.01/day in query results.
- **Impact:** Keeps memory store lean and relevant. Prevents stale context from polluting agent decisions.

### 49. Dual Node.js Installation Cleanup
- **Severity:** MEDIUM | **Status:** NEW
- **Current State:** Per overload-prevention repo memory: "Two Node.js installs: NVM at `C:\nvm4w\nodejs\` (24.12.0) and `C:\Program Files\nodejs\` (25.7.0)". This causes `gateway.cmd` path confusion and periodic breaks when gateway install regenerates with the wrong Node path.
- **Fix:** Uninstall the standalone Node.js 25.7.0 from `C:\Program Files\nodejs\`. Standardize on NVM-managed Node.js 24.12.0. Update PATH. Regenerate `gateway.cmd`.
- **Impact:** Eliminates a class of "it works on my machine but not after gateway install" issues.

### 50. Documentation & Runbook Overhaul
- **Severity:** MEDIUM | **Status:** PLANNED
- **Current State:** `README.md`, `stack_setup.md`, `build_phases.md` exist but are not kept current. No runbooks for common operational scenarios. `ROTATION-CHECKLIST.md` has empty procedures.
- **Fix:** Create `docs/runbooks/` with: credential-rotation.md, incident-response.md, agent-quarantine.md, deployment-rollback.md, cron-recovery.md, circuit-breaker-reset.md. Update README with architecture diagram and quick-start.
- **Impact:** Reduces onboarding time. Codifies operational knowledge.

---

## Strategic Implementation Roadmap

### Phase 1: Immediate Hardening (Week 1–2)
| # | Item | Priority | Effort |
|---|------|----------|--------|
| 1 | Shell Injection Remediation | CRITICAL | 4h |
| 2 | Webhook Secret Hardcoded Fallback | CRITICAL | 1h |
| 3 | Credential Inventory Population | HIGH | 2h |
| 4 | Rate Governor State Persistence | HIGH | 8h |
| 5 | Metrics Endpoint Verification | HIGH | 4h |
| 29 | Supabase RLS Policy Audit | HIGH | 4h |
| 49 | Dual Node.js Cleanup | MEDIUM | 1h |

**Deliverable:** Zero critical vulnerabilities. Rate limits survive restarts. Metrics flowing.

### Phase 2: Performance & Cost (Week 3–4)
| # | Item | Priority | Effort |
|---|------|----------|--------|
| 6 | LLM Model Tiering for Cron | MEDIUM | 4h |
| 7 | Embedding Model Upgrade | MEDIUM | 12h |
| 8 | Cron Payload Optimization | MEDIUM | 6h |
| 9 | Supabase Connection Singleton | MEDIUM | 4h |
| 10 | Browser Dependency Consolidation | MEDIUM | 8h |
| 11 | DLQ Rotation Implementation | MEDIUM | 4h |
| 12 | Retry-After Header Compliance | MEDIUM | 2h |
| 47 | GHL OAuth Auto-Refresh | HIGH | 8h |

**Deliverable:** 30-40% LLM cost reduction. 80% embedding cost reduction. GHL reliability.

### Phase 3: Architecture & Reliability (Week 5–8)
| # | Item | Priority | Effort |
|---|------|----------|--------|
| 13 | Zod Schema Validation | HIGH | 8h |
| 14 | Inngest Idempotency | HIGH | 4h |
| 15 | Agent-Level Circuit Breaker | MEDIUM | 8h |
| 16 | Skill Interface Contract | MEDIUM | 16h |
| 17 | Saga Compensation Pattern | MEDIUM | 8h |
| 18 | Error Taxonomy | MEDIUM | 4h |
| 19 | Event-Driven Credential Refresh | MEDIUM | 8h |
| 20 | Fastify Migration | LOW | 16h |
| 21 | Agent Config Hot-Reload | LOW | 8h |
| 22 | Typed Event Schema Generation | LOW | 8h |

**Deliverable:** Fault-isolated agents. Schema-validated events. Standardized error handling.

### Phase 4: Observability & Operations (Week 9–12)
| # | Item | Priority | Effort |
|---|------|----------|--------|
| 23 | Prometheus Gateway Scrape | HIGH | 2h |
| 24 | Grafana Dashboard Expansion | MEDIUM | 8h |
| 25 | Structured Log Migration | MEDIUM | 12h |
| 26 | Deep Health Checks | MEDIUM | 6h |
| 27 | Cron Observability Dashboard | MEDIUM | 8h |
| 28 | Deployment Audit Trail | MEDIUM | 4h |
| 30 | Backup Verification | MEDIUM | 4h |
| 31 | CI/CD Pipeline | HIGH | 12h |
| 32 | Staging Environment | HIGH | 8h |

**Deliverable:** Full-stack observability. Automated deployments. Staging environment.

### Phase 5: Scale & Innovation (Week 13–20)
| # | Item | Priority | Effort |
|---|------|----------|--------|
| 33 | Tiered Embedding Models | LOW | 12h |
| 34 | Agent Versioning | MEDIUM | 12h |
| 35 | High-Availability | MEDIUM | 16h |
| 36 | Horizontal Worker Scaling | MEDIUM | 16h |
| 37 | Webhook Replay & Audit | MEDIUM | 8h |
| 38 | Multi-Region LLM Routing | LOW | 8h |
| 39 | TypeScript Migration | MEDIUM | 24h |
| 40 | Dashboard RBAC | MEDIUM | 8h |
| 41 | Memory Deduplication | LOW | 8h |
| 42 | Prompt A/B Testing | LOW | 12h |
| 43 | Payload Encryption at Rest | MEDIUM | 8h |
| 44 | OpenTelemetry | LOW | 12h |
| 45 | Skill Marketplace | LOW | 16h |
| 46 | Agent Benchmarking Suite | LOW | 12h |
| 48 | Memory Retention Policies | LOW | 6h |
| 50 | Documentation Overhaul | MEDIUM | 12h |

**Deliverable:** Production-grade scale. Data-driven optimization. Complete documentation.

---

## Impact Matrix

| Category | Items | Est. Cost Reduction | Est. Reliability Gain | Est. Dev Velocity |
|----------|-------|--------------------|-----------------------|-------------------|
| Security | 1,2,3,29,43 | — | HIGH (eliminates attack vectors) | — |
| Performance | 6,7,8,9,10 | **40-60%** LLM, **80%** embedding | MEDIUM | — |
| Reliability | 4,11,12,14,15,17,19,47 | — | **HIGH** (fault isolation, dedup) | — |
| Observability | 5,23,24,25,26,27,28 | — | HIGH (MTTR reduction ~60%) | MEDIUM |
| Architecture | 13,16,18,20,21,22 | — | MEDIUM | **HIGH** |
| Scale | 31,32,35,36 | — | HIGH (zero-downtime) | HIGH |
| Innovation | 33,41,42,44,45,46 | MEDIUM | LOW | HIGH |

---

## Quick Wins (< 4 hours each, high impact)

1. **Item 2** — Remove webhook secret fallback (1h)
2. **Item 3** — Populate credential inventory (2h)
3. **Item 49** — Remove duplicate Node.js (1h)
4. **Item 23** — Add gateway to Prometheus scrape (2h)
5. **Item 12** — Retry-After header compliance (2h)
6. **Item 14** — Inngest idempotency keys (4h)
7. **Item 18** — Error taxonomy enum (4h)
8. **Item 28** — Deployment audit trail (4h)

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Shell injection exploited before fix | HIGH | CRITICAL | Deploy item #1 as emergency hotfix |
| Embedding migration causes query failures | MEDIUM | HIGH | Run parallel (old + new) during migration |
| LLM cost spike during optimization work | LOW | MEDIUM | Budget ceiling already enforced |
| Single VPS failure before HA | MEDIUM | HIGH | Daily backups + 30-min provision script |
| GHL OAuth token blocks 35 skills | HIGH | HIGH | Item #47 is highest-impact single fix |
| Cron thundering herd recurrence | LOW | MEDIUM | Stagger anchors already in place |
| Dashboard auth bypass | LOW | HIGH | Supabase SSR middleware already enforced |

---

## Dependencies Between Items

```
Items 1,2 (Security) ──→ Item 13 (Schema Validation) ──→ Item 20 (Fastify)
Item 4 (State Persistence) ──→ Item 15 (Agent Circuit Breaker)
Item 5 (Metrics) ──→ Item 23 (Prometheus Scrape) ──→ Item 24 (Grafana)
Item 7 (Embedding Upgrade) ──→ Item 33 (Tiered Embeddings) ──→ Item 41 (Dedup)
Item 9 (Supabase Singleton) ──→ Item 17 (Saga) ──→ Item 36 (Horizontal Scale)
Item 13 (Zod) ──→ Item 22 (Typed Events) ──→ Item 14 (Idempotency)
Item 16 (Skill Interface) ──→ Item 39 (TypeScript) ──→ Item 45 (Marketplace)
Item 18 (Error Taxonomy) ──→ Item 19 (Credential Refresh) ──→ Item 47 (OAuth Auto)
Item 25 (Structured Logs) ──→ Item 44 (OpenTelemetry)
Item 31 (CI/CD) ──→ Item 32 (Staging) ──→ Item 35 (HA)
Item 34 (Versioning) ──→ Item 42 (A/B Testing)
```

---

> **Recommended First Actions:**
> 1. Deploy items #1 and #2 as emergency hotfixes (same day)
> 2. Begin Phase 1 hardening sprint (items 3, 4, 5, 29, 49)
> 3. Schedule item #47 (GHL OAuth auto-refresh) as a high-priority standalone task
> 4. Begin Phase 2 cost optimization in parallel with Phase 1 completion
