# OpenClaw Architecture Enhancements

This directory contains code fixes and architectural improvements derived from the full audit of the OpenClaw Multi-Agent Network codebase. Each artifact addresses one or more audit findings documented in `audit-findings.md`.

---

## Priority Order and Estimated Effort

| Priority | File | Audit Finding(s) | Severity | Effort |
|----------|------|-----------------|----------|--------|
| 1 | `fix-deploy-secrets.sh` | SEC-01 | **CRITICAL** | 1 hour |
| 2 | `fix-rls-policies.sql` | SEC-02, DB-02 | **CRITICAL** | 30 min |
| 3 | `fix-webhook-secret.patch` | SEC-03 | HIGH | 30 min |
| 4 | `fix-budget-constants.ts` | PERF-01 | HIGH | 2 hours |
| 5 | `supabase-singleton.ts` | PERF-02 | MEDIUM | 2 hours |
| 6 | `inngest-idempotency.ts` | PERF-03 | HIGH | 3 hours |
| 7 | `fix-prometheus.yml` | DEPLOY-04 | MEDIUM | 15 min |
| 8 | `skill-interface.ts` | ARCH-04 | HIGH | 1 week |
| 9 | `data-retention.sql` | PERF-05, DB-04 | MEDIUM | 2 hours |

> **Do the CRITICAL items (1–3) first, in order.** They address active security exposures. The rest are ordered by impact-to-effort ratio.

---

## Artifact Details

---

### 1. `fix-deploy-secrets.sh` — Deploy Script Hardening

**Fixes:** SEC-01 (Hardcoded Supabase anon key in deploy.sh)

**What it does:**
The current `deploy/hostinger/deploy.sh` lines 91–93 hardcode the Supabase project URL (`https://aagqvfwuixpxtdcrdxmv.supabase.co`) and anon JWT directly in the script, which is committed to git. Anyone with repository read access has these credentials.

This replacement script:
- Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `/etc/openclaw/secrets` (restricted file, not in git)
- Validates that both variables are set before building
- Refuses to deploy if the known-compromised key is still in use
- Includes basic URL format validation as a sanity check

**How to apply:**
```bash
# 1. Rotate the leaked key in Supabase Dashboard → Settings → API → Regenerate anon key

# 2. Create the secrets file on the server
sudo mkdir -p /etc/openclaw
sudo touch /etc/openclaw/secrets
sudo chmod 600 /etc/openclaw/secrets
sudo chown root:root /etc/openclaw/secrets

# Add secrets (use the NEW rotated key):
echo 'NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co' | sudo tee -a /etc/openclaw/secrets
echo 'NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-anon-key>' | sudo tee -a /etc/openclaw/secrets

# 3. Replace the dashboard build block in deploy.sh (lines 82-98) with:
#    source /opt/openclaw/enhanced-artifacts/fix-deploy-secrets.sh
#    build_dashboard
```

**Effort:** 1 hour (includes key rotation and server setup)

---

### 2. `fix-rls-policies.sql` — Row-Level Security Hardening

**Fixes:** SEC-02 (RLS policy allows unauthenticated full read), DB-02 (agent_costs wide-open policy)

**What it does:**
Four tables currently use `USING (true)` policies, meaning any caller — including unauthenticated anonymous requests — can read all data. The `agent_costs` table uses `FOR ALL USING (true)` meaning anyone can also write.

This migration:
- Drops all `USING (true)` policies
- Creates `service_role`-only write policies for all four tables (`agent_costs`, `agents`, `agent_events`, `agent_metrics`)
- Creates `authenticated`-only read policies for dashboard users
- Leaves anonymous callers with zero access

**How to apply:**
```bash
psql $DATABASE_URL -f enhanced-artifacts/fix-rls-policies.sql
```

Or paste into Supabase Dashboard → SQL Editor.

**After applying:** The dashboard client in `dashboard/app/supabase.ts` (which uses the anon key) will receive empty result sets. All dashboard reads must go through server-side authenticated routes. Verify the login flow works correctly.

**Effort:** 30 minutes (including dashboard testing)

---

### 3. `fix-webhook-secret.patch` — Webhook Authentication Enforcement

**Fixes:** SEC-03 (WEBHOOK_SECRET defaults to empty string)

**What it does:**
`handlers/ghl-webhook-handler.mjs` line 87 sets:
```js
const WEBHOOK_SECRET = process.env.OPENCLAW_GHL_WEBHOOK_SECRET || '';
```
An empty string silently disables HMAC authentication, allowing any unauthenticated caller to inject arbitrary webhook events.

The patch replaces this with an IIFE that:
- Exits with a fatal error on startup if the secret is missing in production (`NODE_ENV !== 'development'`)
- Warns but continues in development/test environments
- Validates that the secret is at least 32 characters for adequate entropy

**How to apply:**
```bash
cd /opt/openclaw
patch -p1 < enhanced-artifacts/fix-webhook-secret.patch

# Generate a strong secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set in the webhook systemd service:
# /etc/systemd/system/openclaw-webhook.service
# Environment="OPENCLAW_GHL_WEBHOOK_SECRET=<your-secret>"

systemctl daemon-reload && systemctl restart openclaw-webhook
```

**Effort:** 30 minutes

---

### 4. `fix-budget-constants.ts` — Unified Budget Configuration

**Fixes:** PERF-01 (Budget constants drift between two files)

**What it does:**
`lib/constants.ts` declares budgets of $50/$40/$30 per day for `openai-codex`/`anthropic`/`openai`. `lib/api-rate-governor.ts` enforces $25/$20/$15 — exactly half. This creates confusion about what limits are actually active, and makes tests unreliable (they assert different values depending on which file they import from).

This file becomes the single authoritative source for all budget values. Both `constants.ts` and `api-rate-governor.ts` import from it.

**The conservative values ($25/$20/$15) are kept as the default.** Read the comments at the top of the file to understand why, and see the "MIGRATION GUIDE" section to raise limits when appropriate.

**How to apply:**
```bash
cp enhanced-artifacts/fix-budget-constants.ts lib/budget-constants.ts

# Then update lib/constants.ts:
#   Replace DAILY_BUDGETS definition with:
#   export { DAILY_BUDGETS, BUDGET_WARNING_PCT } from './budget-constants';

# Update lib/api-rate-governor.ts:
#   import { BUDGET_CONFIG } from './budget-constants';
#   Replace hardcoded dailyBudgetCents values with BUDGET_CONFIG[provider].dailyBudgetCents
```

**Effort:** 2 hours (includes updating import sites and updating tests)

---

### 5. `supabase-singleton.ts` — Shared Supabase Client

**Fixes:** PERF-02 (No Supabase client singleton)

**What it does:**
Multiple modules each call `createClient()` independently, creating separate connections for every module that imports them. Under concurrent Inngest function execution (e.g., 10 parallel `agent/invoke` events), this multiplies connection overhead.

This module exports `getSupabase()` which lazily initializes a single client on first call and returns the same instance on subsequent calls.

**How to apply:**
```bash
cp enhanced-artifacts/supabase-singleton.ts lib/supabase-singleton.ts

# Replace createClient() calls in backend files:
# - inngest/functions/agent-orchestrator.ts
# - inngest/functions/d8-saas-operations.ts
# - inngest/functions/training-protocol.ts
#
# Change:
#   const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
# To:
#   import { getSupabase } from '../../lib/supabase-singleton';
#   const supabase = getSupabase();
#
# Note: Also fixes env var name inconsistency (SERVICE_KEY → SERVICE_ROLE_KEY)
```

**Effort:** 2 hours (replacing call sites + verifying no connection issues)

---

### 6. `inngest-idempotency.ts` — Idempotent Inngest Functions

**Fixes:** PERF-03 (No idempotency keys on Inngest functions)

**What it does:**
Inngest retries failed function runs. Without idempotency keys, a transient error during an agent invocation causes duplicate processing: double LLM calls (cost amplification), duplicate `agent_events` rows, and worst-case, duplicate GHL contact creation or SaaS signups.

This module provides:
- `createIdempotentFunction()` — drop-in replacement for `inngest.createFunction()` with automatic idempotency keying on `event.data.correlation_id`
- `createAgentTaskFunction()` — pre-tuned for high-throughput agent events (concurrency: 10)
- `createLlmFunction()` — lower concurrency for expensive LLM-heavy operations (concurrency: 3)
- `createSaasOperationFunction()` — strict deduplication for business-critical SaaS events
- `withCorrelationId()` — utility to ensure events always carry a `correlation_id`

**How to apply:**
```bash
cp enhanced-artifacts/inngest-idempotency.ts inngest/idempotency.ts

# Update inngest/functions/agent-orchestrator.ts:
#   import { createAgentTaskFunction } from '../idempotency';
#   export const agentInvoke = createAgentTaskFunction(
#     { id: 'agent-invoke', event: 'agent/invoke' },
#     async ({ event, step }) => { ... }
#   );

# Update inngest/functions/d8-saas-operations.ts:
#   import { createSaasOperationFunction } from '../idempotency';
#   export const saasClientSignup = createSaasOperationFunction(...)
```

**Effort:** 3 hours (replacing all function definitions + testing retry behavior)

---

### 7. `fix-prometheus.yml` — Complete Prometheus Scrape Config

**Fixes:** DEPLOY-04 (Prometheus only scrapes webhook handler)

**What it does:**
The current `monitoring/prometheus.yml` only monitors the webhook handler on port 8788. The gateway (port 18789) and dashboard (port 3001) have zero metrics visibility — no alerting possible for outages on those services.

The fixed config adds scrape targets for all three services, per-service intervals, relabeling for consistent `instance` labels, example alerting rules, and a note about the port conflict with DEPLOY-01 (Grafana and dashboard both on port 3001).

**How to apply:**
```bash
cp enhanced-artifacts/fix-prometheus.yml monitoring/prometheus.yml

# Fix DEPLOY-01 port conflict at the same time:
# In deploy/docker-compose.monitoring.yml, change Grafana port from 3001 to 3002:
#   ports:
#     - "127.0.0.1:3002:3000"   # was 3001, conflicts with Next.js dashboard

docker compose -f deploy/docker-compose.monitoring.yml restart prometheus
```

**Effort:** 15 minutes

---

### 8. `skill-interface.ts` — Skill Interface Contract

**Fixes:** ARCH-04 (Skills have no interface contract)

**What it does:**
116 skill files exist with no shared type contract. Some are 3–4 line stubs. There is no way to:
- Validate a skill file's structure at load time
- Enumerate available skills and their required tools programmatically
- Test a skill in isolation
- Generate documentation or a skill capability manifest

This file defines:
- `SkillManifest` — metadata for a skill (ID, version, category, required tools, dependencies, permissions, input/output JSON schemas)
- `SkillContext` — runtime context injected into `execute()` (memory, LLM, GHL API, Supabase)
- `Skill` — the primary interface with `manifest`, `execute()`, optional `validate()`, and `healthCheck()`
- `isValidSkill()` — runtime type guard for the skill loader to validate loaded modules
- `createStubSkill()` — helper for gradual migration of existing stubs

**How to apply:**
```bash
cp enhanced-artifacts/skill-interface.ts lib/skill-interface.ts

# Update the skill loader in handlers/ghl-webhook-handler.mjs:
#   import { isValidSkill } from '../lib/skill-interface.js';
#   // After import:
#   if (!isValidSkill(mod.default)) {
#     log.warn({ label }, 'Skill does not implement Skill interface');
#     return null;
#   }

# Migrate skills progressively:
#   1. Start with the most-invoked skills
#   2. Add a manifest object and ensure execute() matches the signature
#   3. Use createStubSkill() for placeholder migration of low-priority stubs
```

**Effort:** 1 week (designing manifests for 116 skills + updating skill loader)

---

### 9. `data-retention.sql` — Data Retention Policies

**Fixes:** PERF-05 (agent_events unbounded growth), DB-04 (no data retention on high-volume tables)

**What it does:**
Four tables (`agent_events`, `agent_metrics`, `agent_costs`, `api_call_log`) grow indefinitely with no cleanup. Dashboard COUNT queries scan the full table as it grows. At high event volumes, this will cause slow queries and storage exhaustion within months.

This migration:
- Creates partitioned versions of `agent_events` and `agent_metrics` (partitioned by month)
- Creates `openclaw_create_monthly_partitions()` to generate new partitions automatically
- Creates `openclaw_cleanup_old_data(retention_days, batch_size, dry_run)` for configurable cleanup
- Schedules daily cleanup at 2 AM UTC via `pg_cron`
- Schedules monthly partition creation on the 1st of each month
- Includes a safe cutover plan for replacing unpartitioned tables without data loss

**How to apply:**
```bash
# First run in dry_run mode to preview:
psql $DATABASE_URL -c "SELECT * FROM openclaw_cleanup_old_data(90, 10000, TRUE);"

# Apply the migration:
psql $DATABASE_URL -f enhanced-artifacts/data-retention.sql

# Verify cron jobs were scheduled:
psql $DATABASE_URL -c "SELECT jobname, schedule FROM cron.job;"
```

**Note:** `pg_cron` requires Supabase Pro or a self-hosted Postgres instance with the extension installed. If unavailable, add a GitHub Actions cron workflow or systemd timer to call `openclaw_cleanup_old_data()` daily.

**Effort:** 2 hours (migration + monitoring setup; full cutover to partitioned tables adds 1–2 hours)

---

## Cross-Cutting Notes

### Env Var Inconsistency
Several files use `SUPABASE_SERVICE_KEY` while others use `SUPABASE_SERVICE_ROLE_KEY`. The standard Supabase name is `SUPABASE_SERVICE_ROLE_KEY`. Standardize all files to `SUPABASE_SERVICE_ROLE_KEY` when updating import sites for the singleton.

### DEPLOY-01 Port Conflict
Grafana in `docker-compose.monitoring.yml` is mapped to `127.0.0.1:3001:3000`, conflicting with the Next.js dashboard also on port 3001. Change Grafana to port 3002 when applying `fix-prometheus.yml`.

### Agent Count Discrepancy (ARCH-01)
`agents_config.json` defines 103 agents. Various migration comments reference 72, 75, or 90 agents. This is not addressed by the artifacts in this directory — it requires a documentation/config audit pass to establish the canonical count.

### Dual Orchestration Planes (ARCH-02)
The Python `ops_control.py` (2,376 lines) and the Node.js Inngest system both handle event routing and retry logic independently. This is a significant architectural risk but requires a larger refactor effort beyond what these targeted fixes address.

---

## Testing After Applying Fixes

After applying fixes 1–3 (the critical security fixes):

```bash
# 1. Verify RLS denies anon access (run from psql):
SET ROLE anon;
SELECT COUNT(*) FROM agent_costs;   -- should return 0 or permission denied
SELECT COUNT(*) FROM agents;        -- should return 0 or permission denied
RESET ROLE;

# 2. Verify webhook handler rejects missing secret:
OPENCLAW_GHL_WEBHOOK_SECRET="" NODE_ENV=production \
  node handlers/ghl-webhook-handler.mjs
# Expected: process exits with FATAL message

# 3. Verify dashboard build fails with missing/compromised keys:
bash enhanced-artifacts/fix-deploy-secrets.sh
# Expected: error messages listing missing secrets
```
