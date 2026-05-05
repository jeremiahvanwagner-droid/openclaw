# OpenClaw — Full Production Audit & Deployment Roadmap
> Generated: 2026-05-05 | Branch: `main` | Target: Hostinger VPS (Ubuntu 24.04) + Vercel Dashboard

---

## Executive Summary

The codebase is architecturally solid and the Anthropic migration is essentially complete.
Four issues will break production if deployed today. Eight more degrade reliability or
create operational landmines. All are fixable before the next deploy cycle.

---

## 🔴 CRITICAL BLOCKERS — Must fix before any production deploy

---

### BLOCKER 1 — TypeScript CI is failing (`lib/ollama-client.ts`) ✅ FIXED

**File:** `lib/ollama-client.ts`  
**Status:** Already patched in this session.

**Root cause:** Four `fetch()` calls passed `{ timeout: ... }` as a `RequestInit` property.
The WHATWG fetch spec (and Node 22's built-in types) do not include `timeout` in
`RequestInit`, so `tsc --noEmit` fails with `TS2769` at lines 65, 81, 118, 188.

**Fix applied:** Added a `fetchWithTimeout(url, options, timeoutMs)` helper using
`AbortController` + `setTimeout`, with `clearTimeout` in `.finally()` to prevent timer
leaks. All four call sites updated. No behavior change, no new dependencies.

**What to do:** Commit and push — CI should go green on this file.

---

### BLOCKER 2 — Self-healing Inngest functions are completely dead (not registered)

**Files:** `inngest/functions/self-healing-coding.ts`, `inngest/serve.ts`

**Root cause:** `self-healing-coding.ts` exports `selfHealingCodingFunctions` — an array of
6 Inngest functions:
- `selfHealingScheduled` (30-min cron healing loop)
- `selfHealingOnDemand`
- `supervisorIntegrationCheck`
- `healingEscalationHandler`
- `ciAutoFix`
- `ciDailyCheck`

**None of them appear in `inngest/serve.ts`.** The serve handler never imports this module,
so Inngest has no knowledge these functions exist. They will never fire — not on schedule,
not on events, not ever.

**Fix:** Add to `inngest/serve.ts`:

```ts
// Add to imports at the top of serve.ts:
import { selfHealingCodingFunctions } from "./functions/self-healing-coding";

// Add to the functions array in serve():
...selfHealingCodingFunctions,
```

**Verify after fix:**
```bash
curl -sf http://localhost:18789/api/inngest | jq '.fns[].id' | grep healing
# Should return 6 function IDs
```

---

### BLOCKER 3 — Circuit breaker table schema mismatch (DB column name wrong)

**Files:** `DEPLOY-CHECKLIST.md` (SQL), `inngest/functions/self-healing-coding.ts`

**Root cause:** The DEPLOY-CHECKLIST instructs you to create the Supabase table like this:

```sql
CREATE TABLE IF NOT EXISTS healing_circuit_breaker (
  key          TEXT PRIMARY KEY,   -- ← column named "key"
  ...
);
```

But `self-healing-coding.ts` queries the table using `circuit_key`:

```ts
.eq("circuit_key", "scheduled_healing")   // ← looks for column "circuit_key"
// and upserts with:
{ circuit_key: "scheduled_healing", ... }  // ← same wrong name
```

This means every circuit breaker read/write will throw a Supabase error
(`column "circuit_key" does not exist`) causing the self-healing cron to crash on every
invocation once the table is created per the checklist.

Additionally, the table is **not in any Supabase migration file** — it only exists as
manual SQL in `DEPLOY-CHECKLIST.md`, making it invisible to future developers and
untracked by the migration history.

**Fix — two parts:**

**Part A:** Add a proper migration file `supabase/migrations/20260506000011_healing_circuit_breaker.sql`:
```sql
CREATE TABLE IF NOT EXISTS healing_circuit_breaker (
  circuit_key  TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  open_until   TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO healing_circuit_breaker (circuit_key, failures)
VALUES ('scheduled_healing', 0)
ON CONFLICT (circuit_key) DO NOTHING;
```

**Part B:** Update DEPLOY-CHECKLIST.md to remove the manual SQL block and point to the
migration instead.

If the table was already created manually with column `key`, run in Supabase SQL editor:
```sql
ALTER TABLE healing_circuit_breaker RENAME COLUMN key TO circuit_key;
```

---

### BLOCKER 4 — Env file path inconsistency (deploy will silently fail to load secrets)

**Files:** `DEPLOY-CHECKLIST.md`, `deploy/hostinger/openclaw.service`,
`deploy/hostinger/webhook.service`, `deploy/hostinger/provision.sh`

**Root cause:** The DEPLOY-CHECKLIST tells you to populate:
```
.openclaw/openclaw.env   ← relative to /opt/openclaw
```

But every systemd service file loads:
```
EnvironmentFile=/etc/openclaw/.env   ← absolute system path
```

These are **different files**. If you follow DEPLOY-CHECKLIST, the services start with
no environment variables — no Anthropic API key, no Supabase credentials, no GHL tokens.
The gateway will start (it has `--allow-unconfigured`) but every agent call will fail.

Additionally, `install_webhook_service.sh` uses a third path: `/etc/openclaw-prod/`.

**Fix:** Pick one canonical path (`/etc/openclaw/.env` matches the systemd files) and
update DEPLOY-CHECKLIST step 5 to:

```bash
# Correct path (matches EnvironmentFile in openclaw.service):
sudo nano /etc/openclaw/.env

# Verify permissions:
sudo chmod 600 /etc/openclaw/.env
sudo ls -la /etc/openclaw/.env
```

Also update `ops/configs/openclaw.env.template` to reflect this path, and retire the
reference to `.openclaw/openclaw.env` in DEPLOY-CHECKLIST.

---

## 🟠 HIGH PRIORITY — Fix before stable production operation

---

### HIGH 1 — 3 skills hardcode `gpt-4o-mini` as the default model

**Files:**
- `skills/aisaas-autonomous-debugging/index.mjs:113`
- `skills/gh-address-comments/index.mjs:133`
- `skills/gh-fix-ci/index.mjs:169`

All three have:
```js
const model = options.model ?? 'gpt-4o-mini';
```

These will route to OpenAI in production if no model is passed by the caller. Since
`OPENAI_API_KEY` is now "embeddings only", and these skills do chat completions,
they'll either use a key that may not be provisioned for completions, or produce
unexpected costs if it is.

**Fix:** Change the default in each file:
```js
const model = options.model ?? 'claude-haiku-4-5';
```

---

### HIGH 2 — `LEGACY_STABLE_MODEL_BY_LLM` references a non-existent model

**File:** `lib/runtime-model-policy.mjs`

```js
export const LEGACY_STABLE_MODEL_BY_LLM = {
  "claude-opus-4":   "openai/gpt-5.3-codex",   // ← does not exist
  "claude-sonnet-4.5": "openai/gpt-5.3-codex", // ← does not exist
  "claude-haiku-4-5":  "openai/gpt-4o-mini",
};
```

`openai/gpt-5.3-codex` is a placeholder that never existed. If `rolloutMode === "canary"`
is ever used (it's the default in the deploy workflow dropdown), non-canary agents will
receive this string as their model, causing a runtime dispatch error.

**Fix:** Replace with real fallback models, or remove canary mode support entirely since
`rolloutMode: full` is the target:
```js
export const LEGACY_STABLE_MODEL_BY_LLM = {
  "claude-opus-4":     "anthropic/claude-opus-4-5",
  "claude-sonnet-4.5": "anthropic/claude-sonnet-4-5",
  "claude-haiku-4-5":  "anthropic/claude-haiku-4-5",
};
```

---

### HIGH 3 — Supabase `healing_circuit_breaker` migration missing

Covered in BLOCKER 3 above. Track it as both a schema mismatch (critical) and a missing
migration (high priority for ongoing DB hygiene).

---

### HIGH 4 — GitHub Actions `production` environment not verified

**File:** `.github/workflows/deploy-bot.yml`

The deploy job declares `environment: production`. GitHub enforces that:
1. The `production` environment exists in Settings → Environments
2. The following secrets are set under that environment:
   - `HOSTINGER_HOST`
   - `HOSTINGER_USER`
   - `HOSTINGER_SSH_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ALERT_CHAT_ID`

If any of these are missing or set at repo level instead of environment level, the
deploy job will fail silently at the SSH step or produce no Telegram notifications.

**Verify:** Go to `Settings → Environments → production` and confirm all 5 secrets are set.
The deploy workflow does explicitly validate `HOSTINGER_HOST`, `HOSTINGER_USER`, and
`HOSTINGER_SSH_KEY` at step `validate_ssh_secrets` — if they're missing, it will print a
clear error and exit 1 before touching the server.

---

## 🟡 MEDIUM PRIORITY — Operational hygiene before first stable week

---

### MEDIUM 1 — `install_webhook_service.sh` uses a different env path

**File:** `deploy/hostinger/install_webhook_service.sh`

Uses `/etc/openclaw-prod/openclaw-ghl-webhook.env` while everything else in the Hostinger
deploy uses `/etc/openclaw/.env`. This script appears to be a legacy artifact from an
earlier deployment approach. Confirm whether it's still in the deploy path; if not,
remove or archive it to avoid confusion.

---

### MEDIUM 2 — Dashboard Vercel environment variables not confirmed

**File:** `dashboard/vercel.json`, `.github/workflows/ci.yml`

The CI build supplies stub values for the dashboard (`https://your-project.supabase.co`,
`test_anon_key`) which is correct for build-time. But the live Vercel project needs real
values set in Vercel → Project Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` → your actual Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key

Without these, the dashboard will build but every page that calls Supabase will fail
with a client initialization error.

---

### MEDIUM 3 — Agent count is 103, parity gate was written for 107

**File:** `.github/workflows/deploy-bot.yml`

The runtime config parity check runs with `--expected-agent-count 107`. The actual
`config/agents_config.json` has 103 agents. The parity script currently passes
(`"ok": true`) because the count check doesn't block execution, but this drift signals
that 4 agents were either removed or never created. Confirm whether this is intentional
and update the `--expected-agent-count` flag to `103` to reflect reality, or add the
missing 4 agents.

---

### MEDIUM 4 — Redis confirmed not needed for Hostinger deploy (good — no action)

Redis is only declared in `docker-compose.yml` (dev environment). The Hostinger systemd
deploy does not provision or require Redis. The gateway and webhook handler use
Inngest for event queuing. No action needed.

---

### MEDIUM 5 — `openclaw-pre-start.sh` confirmed present and executable (good — no action)

The pre-start script that strips `agents.defaults.skills` exists at
`deploy/hostinger/openclaw-pre-start.sh` and is executable. No action needed.

---

## Deployment Roadmap — Ordered Steps to Production

Execute in this exact sequence. Each step is a gate for the next.

---

### Phase 1 — CI Green (do this first, today)

**Step 1.1** — Commit the `lib/ollama-client.ts` patch (already applied).
```bash
git add lib/ollama-client.ts
git commit -m "fix: implement fetch timeouts via AbortController in ollama-client"
git push origin main
```
Verify: CI `pnpm typecheck` passes.

**Step 1.2** — Fix self-healing Inngest registration.
In `inngest/serve.ts`, add the import and spread `selfHealingCodingFunctions` into the
functions array. Commit.
```bash
git add inngest/serve.ts
git commit -m "fix: register selfHealingCodingFunctions in Inngest serve handler"
```

**Step 1.3** — Fix the 3 skills with hardcoded `gpt-4o-mini`.
Update default model to `claude-haiku-4-5` in:
- `skills/aisaas-autonomous-debugging/index.mjs`
- `skills/gh-address-comments/index.mjs`
- `skills/gh-fix-ci/index.mjs`
```bash
git add skills/
git commit -m "fix: replace hardcoded gpt-4o-mini defaults with claude-haiku-4-5 in skills"
```

**Step 1.4** — Fix `LEGACY_STABLE_MODEL_BY_LLM` in `lib/runtime-model-policy.mjs`.
Replace `openai/gpt-5.3-codex` references with real Anthropic model strings.
```bash
git add lib/runtime-model-policy.mjs
git commit -m "fix: remove non-existent gpt-5.3-codex from legacy model map"
```
Verify: All CI checks pass on push to main.

---

### Phase 2 — Supabase Schema (before first deploy)

**Step 2.1** — Create the circuit breaker migration file at:
`supabase/migrations/20260506000011_healing_circuit_breaker.sql`
(use the SQL from BLOCKER 3 above with column `circuit_key`).

**Step 2.2** — Apply migration in Supabase:
- If using Supabase CLI: `supabase db push`
- If applying manually: paste into Supabase SQL Editor and run.

**Step 2.3** — If the table was already created with column `key`, rename it:
```sql
ALTER TABLE healing_circuit_breaker RENAME COLUMN key TO circuit_key;
```

**Step 2.4** — Verify circuit breaker is healthy:
```sql
SELECT * FROM healing_circuit_breaker;
-- Should return one row: circuit_key='scheduled_healing', failures=0
```

---

### Phase 3 — Server Environment (before first deploy)

**Step 3.1** — SSH into the Hostinger VPS as your deploy user.

**Step 3.2** — Confirm `/etc/openclaw/.env` exists and contains all required variables:
```bash
sudo ls -la /etc/openclaw/.env
# Should be: -rw------- 1 openclaw openclaw

sudo -u openclaw cat /etc/openclaw/.env | grep -E '^(ANTHROPIC|SUPABASE|GHL|OPENCLAW_GATEWAY)'
# Must have values (not placeholders) for:
#   ANTHROPIC_API_KEY_SOVEREIGN
#   ANTHROPIC_API_KEY_SHARED
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   OPENCLAW_GATEWAY_AUTH_TOKEN
#   OPENCLAW_GHL_WEBHOOK_SECRET
#   GHL_PRIVATE_INTEGRATION_TOKEN
#   GHL_LOCATION_ID
```

**Step 3.3** — Confirm GitHub Actions `production` environment secrets are set:
Settings → Environments → production → verify: `HOSTINGER_HOST`, `HOSTINGER_USER`,
`HOSTINGER_SSH_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`.

**Step 3.4** — Confirm Vercel dashboard environment variables are set for the
`dashboard` project: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

### Phase 4 — First Production Deploy

**Step 4.1** — Trigger deploy from GitHub Actions:
- Go to Actions → `Deploy Bot to Hostinger VPS (Manual)` → Run workflow
- Set `rollout_mode: full` (not canary — canary still has the legacy model map issue)
- Set `upgrade_cli: false` (unless you know the CLI version needs bumping)

**Step 4.2** — Monitor the deploy steps in GitHub Actions. Watch for:
- SSH secret validation ✅
- `pnpm lint:ci` ✅
- `tsc --noEmit` ✅
- `pnpm test` ✅
- Runtime config parity gate ✅ (will pass with 103 agents)
- SSH deploy + service restart ✅
- Health check polling ✅

**Step 4.3** — After deploy completes, run smoke tests from the VPS:
```bash
# Gateway health
curl -sf http://localhost:18789/health

# Webhook handler health
curl -sf http://localhost:8788/health

# Inngest function registration — confirm healing functions appear
curl -sf http://localhost:18789/api/inngest | jq '.fns[].id'

# Service restart stability (should be < 5 restarts in last hour)
journalctl -u openclaw -n 50 --no-pager | grep -c "Started\|Stopped"
```

**Step 4.4** — Confirm Anthropic API is live:
```bash
journalctl -u openclaw --since "5 minutes ago" | grep -i 'anthropic\|claude'
# Should show model routing to claude-* models, zero gpt-* references
```

---

### Phase 5 — Post-Deploy Cleanup (within first week)

- Update `--expected-agent-count` from `107` → `103` in deploy-bot.yml (or add the 4 missing agents)
- Archive or remove `deploy/hostinger/install_webhook_service.sh` if it's no longer in the deploy path
- Update DEPLOY-CHECKLIST.md to remove the manual circuit breaker SQL (now tracked as a migration)
- Add `@types/node` explicitly to devDependencies (it's currently only transitive)

---

## Quick Reference — Blocker Status

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | `ollama-client.ts` TS error (fetch timeout) | 🔴 Critical | ✅ Fixed |
| 2 | Healing functions not in Inngest serve.ts | 🔴 Critical | ❌ Needs fix |
| 3 | Circuit breaker schema mismatch + missing migration | 🔴 Critical | ❌ Needs fix |
| 4 | Env file path mismatch (checklist vs systemd) | 🔴 Critical | ❌ Needs fix |
| 5 | 3 skills hardcode gpt-4o-mini | 🟠 High | ❌ Needs fix |
| 6 | `gpt-5.3-codex` in legacy model map | 🟠 High | ❌ Needs fix |
| 7 | GitHub Actions `production` environment secrets | 🟠 High | ⚠️ Verify |
| 8 | Dashboard Vercel env vars | 🟡 Medium | ⚠️ Verify |
| 9 | Agent count drift (103 vs 107 in CI gate) | 🟡 Medium | ❌ Update flag |
| 10 | `install_webhook_service.sh` wrong env path | 🟡 Medium | ❌ Cleanup |
