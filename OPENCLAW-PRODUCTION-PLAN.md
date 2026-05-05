# OpenClaw — Comprehensive Production Deployment Plan

> **Prepared:** 2026-05-05  
> **Repo:** `jeremiahvanwagner-droid/openclaw`  
> **Target Environment:** Hostinger VPS (Ubuntu 24.04 LTS) · Systemd · Node 22  
> **Dashboard:** Vercel  
> **Database:** Supabase (Postgres + pgvector)  
> **Event Bus:** Inngest  
> **AI Provider:** Anthropic (Claude) — primary; OpenAI — embeddings only  

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Architecture Overview](#2-architecture-overview)
3. [Complete Blocker Registry](#3-complete-blocker-registry)
4. [Phase 1 — CI Restoration](#4-phase-1--ci-restoration)
5. [Phase 2 — Code Fixes](#5-phase-2--code-fixes)
6. [Phase 3 — Supabase Schema](#6-phase-3--supabase-schema)
7. [Phase 4 — Server & Environment Setup](#7-phase-4--server--environment-setup)
8. [Phase 5 — GitHub Actions & Secrets](#8-phase-5--github-actions--secrets)
9. [Phase 6 — First Production Deploy](#9-phase-6--first-production-deploy)
10. [Phase 7 — Smoke Tests & Validation](#10-phase-7--smoke-tests--validation)
11. [Phase 8 — Post-Deploy Cleanup](#11-phase-8--post-deploy-cleanup)
12. [Rollback Procedure](#12-rollback-procedure)
13. [Ongoing Operational Runbook](#13-ongoing-operational-runbook)
14. [Master Checklist](#14-master-checklist)

---

## 1. Current State Assessment

### What Is Working

| Area | Status | Notes |
|---|---|---|
| TypeScript compilation | 🔴 Failing | `ollama-client.ts` timeout error — **patched in this session** |
| Vitest test suite | ✅ 160/160 passing | All unit tests green |
| Anthropic migration | ✅ Complete | 103 agents fully on Claude models |
| `agents_config.json` | ✅ Clean | Zero GPT model references |
| `config/openclaw.json` | ✅ Clean | Anthropic models throughout, no BOM |
| Config parity gate | ✅ Passing | Primary/secondary configs aligned |
| Systemd service files | ✅ Correct | Hardened, restart limits set |
| `openclaw-pre-start.sh` | ✅ Exists | Executable, strips invalid config keys |
| Inngest serve handler | 🔴 Broken | 6 healing functions never registered |
| Circuit breaker table | 🔴 Broken | Schema mismatch + not in migrations |
| Env file path | 🔴 Broken | Checklist contradicts systemd config |
| Webhook handler | ✅ Solid | HMAC, Zod validation, size limits all present |
| Docker (dev) | ✅ Working | Redis, Ollama, bot, webhook all compose |
| Redis (production) | ✅ Not needed | Systemd deploy uses Inngest, not Redis |

### Key Metrics

- **107** agents expected by CI parity gate · **103** actually in `agents_config.json`
- **6** Inngest healing functions exported but never registered
- **3** skills with hardcoded `gpt-4o-mini` defaults
- **4** critical blockers before production deploy
- **6** high/medium issues for stable operations
- **10** total issues resolved by this plan

---

## 2. Architecture Overview

Understanding how the pieces connect clarifies why each blocker matters.

```
┌──────────────────────────────────────────────────────────┐
│                    Hostinger VPS                           │
│                                                          │
│  ┌─────────────────────┐    ┌──────────────────────┐    │
│  │  openclaw.service   │    │ openclaw-webhook      │    │
│  │  (systemd)          │    │ .service (systemd)    │    │
│  │                     │    │                       │    │
│  │  Node 22            │    │  Node 22              │    │
│  │  openclaw gateway   │    │  handlers/            │    │
│  │  port 18789         │    │  ghl-webhook-handler  │    │
│  │                     │    │  .mjs port 8788       │    │
│  │  ┌───────────────┐  │    └──────────────────────┘    │
│  │  │ Inngest       │  │              │                  │
│  │  │ /api/inngest  │  │    GoHighLevel Webhooks ────────┤
│  │  │               │  │                                 │
│  │  │ ← 6 HEALING   │  │    ┌──────────────────────┐    │
│  │  │   FUNCTIONS   │  │    │  Caddy (TLS proxy)   │    │
│  │  │   MISSING!    │  │    │  port 443 → 18789    │    │
│  │  └───────────────┘  │    │             → 8788   │    │
│  └─────────────────────┘    └──────────────────────┘    │
│         │                                                │
│  /etc/openclaw/.env  ← MUST EXIST (not .openclaw/...)   │
└──────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
  ┌────────────┐      ┌──────────────────┐
  │  Supabase  │      │  Inngest Cloud   │
  │  Postgres  │      │  (event bus)     │
  │  pgvector  │      │                  │
  │            │      │  Triggers crons  │
  │  healing_  │      │  + event fns     │
  │  circuit_  │      └──────────────────┘
  │  breaker   │
  │  ← SCHEMA  │
  │    MISMATCH│      ┌──────────────────┐
  └────────────┘      │  Anthropic API   │
                      │  Claude Opus 4.5 │
         │            │  Sonnet 4.5      │
         ▼            │  Haiku 4.5       │
  ┌────────────┐      └──────────────────┘
  │  Vercel    │
  │  Dashboard │
  │  (Next.js) │
  │  port 3001 │
  └────────────┘
```

### Data & Secret Flow

```
GitHub Actions (production environment)
  ├── HOSTINGER_HOST / USER / SSH_KEY  → SSH into VPS
  ├── TELEGRAM_BOT_TOKEN             → deploy notifications
  └── TELEGRAM_ALERT_CHAT_ID         → deploy notifications

Hostinger VPS: /etc/openclaw/.env  (chmod 600, owned by openclaw)
  ├── ANTHROPIC_API_KEY_SOVEREIGN    → Tier 1 agents (Opus)
  ├── ANTHROPIC_API_KEY_SHARED       → Tier 2/3 agents (Sonnet, Haiku)
  ├── SUPABASE_URL                   → DB + vector search
  ├── SUPABASE_SERVICE_ROLE_KEY      → server-side DB writes
  ├── OPENCLAW_GATEWAY_AUTH_TOKEN    → bearer auth on gateway
  ├── OPENCLAW_GHL_WEBHOOK_SECRET    → HMAC verification
  ├── GHL_PRIVATE_INTEGRATION_TOKEN  → GHL API calls
  └── GHL_LOCATION_ID                → GHL sub-account
```

---

## 3. Complete Blocker Registry

### Severity Definitions

| Symbol | Severity | Impact |
|---|---|---|
| 🔴 | **Critical** | Deploy will fail OR production silently broken |
| 🟠 | **High** | Feature non-functional in production |
| 🟡 | **Medium** | Technical debt / operational landmine |
| ✅ | **Resolved** | Fixed or confirmed healthy |

### Full Issue Table

| ID | Description | Severity | Files Affected | Effort |
|---|---|---|---|---|
| B1 | `fetch timeout` TS error in `ollama-client.ts` | 🔴 Critical | `lib/ollama-client.ts` | ✅ Done |
| B2 | Healing functions not registered in Inngest | 🔴 Critical | `inngest/serve.ts` | 15 min |
| B3 | Circuit breaker schema mismatch + missing migration | 🔴 Critical | `supabase/migrations/`, `DEPLOY-CHECKLIST.md` | 30 min |
| B4 | Env file path mismatch (checklist vs systemd) | 🔴 Critical | `DEPLOY-CHECKLIST.md`, server setup | 20 min |
| H1 | 3 skills hardcode `gpt-4o-mini` | 🟠 High | 3 skill files | 10 min |
| H2 | `gpt-5.3-codex` in legacy model map | 🟠 High | `lib/runtime-model-policy.mjs` | 5 min |
| H3 | GitHub Actions `production` env secrets unverified | 🟠 High | GitHub Settings | 15 min |
| H4 | Vercel dashboard env vars unverified | 🟠 High | Vercel Settings | 10 min |
| M1 | Agent count drift (103 vs 107 in CI gate) | 🟡 Medium | `.github/workflows/deploy-bot.yml` | 5 min |
| M2 | `install_webhook_service.sh` wrong env path | 🟡 Medium | `deploy/hostinger/install_webhook_service.sh` | 5 min |

**Total estimated time to clear all blockers: ~2 hours**

---

## 4. Phase 1 — CI Restoration

*Goal: Get `pnpm typecheck` passing so the entire CI pipeline is green before anything touches the server.*

---

### 4.1 Fix: `lib/ollama-client.ts` TypeScript Timeout Error (B1) ✅ COMPLETE

**Status:** Already patched in this session. Commit and push.

**Root cause explained:** Node 22 implements the WHATWG `fetch` spec natively.
`RequestInit` is a strict TypeScript interface that contains no `timeout` property —
that was a non-standard extension in older polyfills like `node-fetch` v2. Passing
`{ timeout: 5000 }` causes `TS2769: Object literal may only specify known properties`.

**Solution:** A `fetchWithTimeout(url, options, timeoutMs)` helper wraps each call with
an `AbortController`. The timer is always cancelled in `.finally()` to prevent leaks
even when requests succeed or throw before the timeout fires.

**Commit:**
```bash
git add lib/ollama-client.ts
git commit -m "fix(ollama-client): implement fetch timeouts via AbortController (fixes TS2769)"
git push origin main
```

**Acceptance criteria:**
```bash
# Locally (once pnpm is available):
pnpm typecheck
# → No errors

# Or via CI:
# Check GitHub Actions → CI → Bot Checks → Type check → ✅ Pass
```

---

### 4.2 Verify the Full CI Pipeline Is Green

After pushing, confirm all CI steps pass before moving to Phase 2:

| CI Step | Command | Expected |
|---|---|---|
| Lint baseline gate | `pnpm lint:ci` | ✅ Pass |
| Type check | `pnpm typecheck` | ✅ Pass |
| Unit tests | `pnpm test` | ✅ 160/160 |
| Dashboard build | `pnpm --dir dashboard run build` | ✅ Pass |
| Dashboard typecheck | `pnpm --dir dashboard run typecheck` | ✅ Pass |

Do not proceed to Phase 2 until the CI badge on `main` is green.

---

## 5. Phase 2 — Code Fixes

*Goal: Fix all code-level issues that require commits to main.*

---

### 5.1 Fix: Register Self-Healing Inngest Functions (B2)

**File:** `inngest/serve.ts`

**Root cause explained:** `inngest/functions/self-healing-coding.ts` exports an array
called `selfHealingCodingFunctions` containing 6 Inngest functions. The Inngest
`serve()` handler in `serve.ts` imports and registers functions from every other
module (agent orchestrator, training, D8 SaaS, etc.) but **completely omits**
`self-healing-coding.ts`. Inngest has no record of these functions, so:

- The 30-minute healing cron (`selfHealingScheduled`) never fires
- The CI auto-fix function (`ciAutoFix`) never fires on GitHub workflow events
- On-demand healing (`selfHealingOnDemand`) silently does nothing
- The integration health check cron (`supervisorIntegrationCheck`) never fires
- Escalation handler (`healingEscalationHandler`) never runs
- Daily CI check (`ciDailyCheck`) never runs

The self-healing system — which was specifically built to prevent crash loops — has
been completely inert since it was written.

**The fix — edit `inngest/serve.ts`:**

Step 1: Add the import at the top with the other function imports:
```ts
import { selfHealingCodingFunctions } from "./functions/self-healing-coding";
```

Step 2: Spread the array into the `functions` array in the `serve()` call:
```ts
export const handler = serve({
  client: inngest,
  functions: [
    agentInvoke,
    agentEscalate,
    // ... all existing functions ...
    offerPerformanceCollected,

    // Self-healing & CI automation  ← ADD THIS
    ...selfHealingCodingFunctions,
  ],
});
```

**Commit:**
```bash
git add inngest/serve.ts
git commit -m "fix(inngest): register selfHealingCodingFunctions in serve handler

Six healing functions (cron, on-demand, CI fix, integration check,
escalation, daily check) were exported but never registered with Inngest.
They have been completely inactive since creation."
git push origin main
```

**Acceptance criteria (verify after deploy):**
```bash
curl -sf http://localhost:18789/api/inngest | jq '[.fns[].id]'
# Must contain all of:
# "openclaw/self-healing-scheduled"
# "openclaw/self-healing-on-demand"
# "openclaw/supervisor-integration-check"
# "openclaw/healing-escalation-handler"
# "openclaw/ci-auto-fix"
# "openclaw/ci-daily-check"
```

---

### 5.2 Fix: Replace Hardcoded `gpt-4o-mini` in 3 Skills (H1)

**Files:**
- `skills/aisaas-autonomous-debugging/index.mjs` (line 113)
- `skills/gh-address-comments/index.mjs` (line 133)
- `skills/gh-fix-ci/index.mjs` (line 169)

**Root cause explained:** All three skills use `gpt-4o-mini` as their default model
when no explicit `model` option is passed by the caller. Since `OPENAI_API_KEY` in
production is scoped to embeddings only (per the Anthropic migration), these skills
will either:
- Fail with an OpenAI auth/scope error if the key doesn't have chat completions access
- Silently route to OpenAI instead of Anthropic (undoing the migration for these skills)
- Incur unexpected OpenAI costs if the key is fully provisioned

**The fix** — in each of the three files, change the default:

```js
// BEFORE:
const model = options.model ?? 'gpt-4o-mini';

// AFTER:
const model = options.model ?? 'claude-haiku-4-5';
```

Apply to all three files:
```bash
sed -i "s/options\.model ?? 'gpt-4o-mini'/options.model ?? 'claude-haiku-4-5'/" \
  skills/aisaas-autonomous-debugging/index.mjs

sed -i "s/opts\.model ?? 'gpt-4o-mini'/opts.model ?? 'claude-haiku-4-5'/" \
  skills/gh-address-comments/index.mjs \
  skills/gh-fix-ci/index.mjs
```

Verify the replacement:
```bash
grep -rn 'gpt-4o-mini' skills/ --include="*.mjs"
# Expected: no output
```

**Commit:**
```bash
git add skills/aisaas-autonomous-debugging/index.mjs \
        skills/gh-address-comments/index.mjs \
        skills/gh-fix-ci/index.mjs
git commit -m "fix(skills): replace hardcoded gpt-4o-mini defaults with claude-haiku-4-5

Ensures all skill completions route through Anthropic per the migration.
OpenAI key is reserved for embeddings only."
git push origin main
```

---

### 5.3 Fix: Remove Non-Existent Model from Legacy Map (H2)

**File:** `lib/runtime-model-policy.mjs`

**Root cause explained:** `LEGACY_STABLE_MODEL_BY_LLM` maps logical model keys to
runtime model strings used when `rolloutMode === "canary"` and an agent is NOT in the
canary set. Two of its entries reference `openai/gpt-5.3-codex` — a placeholder string
that was never a real OpenAI model identifier and does not exist in any provider
catalog. Any non-canary agent in canary mode would receive this string as its model,
causing a dispatch error at runtime.

Additionally, the deploy workflow's default `rollout_mode` input is `canary`, meaning
this bug is one accidental dropdown selection away from breaking roughly 93 agents.

**Current broken state:**
```js
export const LEGACY_STABLE_MODEL_BY_LLM = {
  "claude-opus-4":     "openai/gpt-5.3-codex",  // ← does not exist
  "claude-sonnet-4.5": "openai/gpt-5.3-codex",  // ← does not exist
  "claude-haiku-4-5":  "openai/gpt-4o-mini",    // ← exists but wrong provider
};
```

**Fix** — Since the migration is complete and `rollout_mode: full` is the target,
update the legacy map to point to real Anthropic models (making canary and full
identical, which is the correct end state):
```js
export const LEGACY_STABLE_MODEL_BY_LLM = {
  "claude-opus-4":     "anthropic/claude-opus-4-5",
  "claude-sonnet-4.5": "anthropic/claude-sonnet-4-5",
  "claude-haiku-4-5":  "anthropic/claude-haiku-4-5",
};
```

**Commit:**
```bash
git add lib/runtime-model-policy.mjs
git commit -m "fix(runtime-model-policy): remove non-existent gpt-5.3-codex from legacy map

Canary fallback now routes to Anthropic models instead of a placeholder
that would cause dispatch errors at runtime. Migration is complete —
canary and full rollout modes now resolve identically."
git push origin main
```

---

### 5.4 Fix: Update Agent Count in Deploy CI Gate (M1)

**File:** `.github/workflows/deploy-bot.yml`

**Root cause explained:** The runtime config parity gate runs with
`--expected-agent-count 107`. The actual `config/agents_config.json` contains 103
agents. While the parity script currently returns `ok: true` (the count check is
informational, not a hard gate), this is a stale reference that signals 4 agents
are unaccounted for. It should either match reality or the 4 missing agents should
be created.

**Recommended fix** (update the flag to match reality):

In `.github/workflows/deploy-bot.yml`, find the parity step and change:
```yaml
# BEFORE:
run: node scripts/upgrade/runtime-config-parity.mjs --primary config/openclaw.prod.json --secondary config/openclaw.json --agents config/agents_config.json --rollout full --expected-agent-count 107 --strict

# AFTER:
run: node scripts/upgrade/runtime-config-parity.mjs --primary config/openclaw.prod.json --secondary config/openclaw.json --agents config/agents_config.json --rollout full --expected-agent-count 103 --strict
```

**Alternative:** If the 4 missing agents (IDs unknown) were intentionally removed,
leave the fix as above. If they need to be created, define them in
`config/agents_config.json` following the existing schema before updating the count.

**Commit:**
```bash
git add .github/workflows/deploy-bot.yml
git commit -m "ci: update expected-agent-count from 107 to 103 (reflects actual config)"
git push origin main
```

---

### 5.5 Fix: Correct DEPLOY-CHECKLIST.md Env File Path (B4)

**File:** `DEPLOY-CHECKLIST.md`

**Root cause explained:** Step 5 of DEPLOY-CHECKLIST.md instructs the operator to:
```bash
nano .openclaw/openclaw.env
```
This file path (`/opt/openclaw/.openclaw/openclaw.env`) is **not** the file that the
systemd services load. Every systemd service file (`openclaw.service`,
`webhook.service`, `openclaw-dashboard.service`, `openclaw-alert@.service`) declares:
```ini
EnvironmentFile=/etc/openclaw/.env
```

If the operator follows the checklist, they populate the wrong file and the services
start with no environment variables. The gateway starts (it uses `--allow-unconfigured`)
but every Anthropic call, Supabase query, and GHL request fails silently.

**Fix** — Update DEPLOY-CHECKLIST.md step 5:

```markdown
# BEFORE (wrong):
nano .openclaw/openclaw.env

# AFTER (correct — matches systemd EnvironmentFile):
sudo nano /etc/openclaw/.env

# Verify file permissions after editing:
sudo chmod 600 /etc/openclaw/.env
sudo chown openclaw:openclaw /etc/openclaw/.env
ls -la /etc/openclaw/.env
# Expected: -rw------- 1 openclaw openclaw
```

Also update the rollback section which references `sed -i ... .openclaw/openclaw.env`
to use `/etc/openclaw/.env`.

**Commit:**
```bash
git add DEPLOY-CHECKLIST.md
git commit -m "docs(deploy): correct env file path from .openclaw/openclaw.env to /etc/openclaw/.env

Systemd EnvironmentFile directive points to /etc/openclaw/.env.
Checklist was pointing to a different path causing services to start
with no environment variables."
git push origin main
```

---

## 6. Phase 3 — Supabase Schema

*Goal: Create the missing circuit breaker table with the correct schema so the self-healing system can actually write state to the database.*

---

### 6.1 Fix: Create `healing_circuit_breaker` Migration (B3)

**Root cause explained:**

The circuit breaker that protects the self-healing cron from runaway loops needs a
Supabase table to persist its state across Inngest function invocations.

**Problem 1 — Wrong column name in code:**
`self-healing-coding.ts` queries and upserts using the column name `circuit_key`:
```ts
.eq("circuit_key", "scheduled_healing")
// and:
{ circuit_key: "scheduled_healing", failures: ..., ... }
```

But the DEPLOY-CHECKLIST.md creates the table with column `key`:
```sql
CREATE TABLE IF NOT EXISTS healing_circuit_breaker (
  key TEXT PRIMARY KEY,  ← wrong name
  ...
);
```
Result: every circuit breaker DB operation throws `column "circuit_key" does not exist`.

**Problem 2 — Not in migrations:**
The table exists only as manual SQL in DEPLOY-CHECKLIST.md. It is not tracked in
`supabase/migrations/`. On a fresh environment (new Supabase project, staging, dev),
the table won't exist and the healing cron will silently fail every invocation.

**Fix — Create migration file:**

Create `supabase/migrations/20260506000011_healing_circuit_breaker.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- OpenClaw — Self-Healing Circuit Breaker State Table
-- Migration: 20260506000011_healing_circuit_breaker
-- Date: 2026-05-06
-- ═══════════════════════════════════════════════════════════════════

-- Prevents runaway healing loops by tracking consecutive failures.
-- Column is circuit_key (matches self-healing-coding.ts query patterns).

CREATE TABLE IF NOT EXISTS healing_circuit_breaker (
  circuit_key  TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  open_until   TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the default healing key in a clean state
INSERT INTO healing_circuit_breaker (circuit_key, failures)
VALUES ('scheduled_healing', 0)
ON CONFLICT (circuit_key) DO NOTHING;

-- RLS: service role has full access; anon has no access
ALTER TABLE healing_circuit_breaker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON healing_circuit_breaker
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**If the table was already created manually with column `key`:**
Run this one-time fix in Supabase SQL Editor before applying the migration:
```sql
-- Only run if table already exists with wrong column name:
ALTER TABLE healing_circuit_breaker RENAME COLUMN key TO circuit_key;
```

**Apply the migration:**
```bash
# Option A — Supabase CLI (recommended):
supabase db push

# Option B — Manual (paste into Supabase SQL Editor → Run):
# Copy the SQL above and execute in your project
```

**Verify:**
```sql
-- In Supabase SQL Editor:
SELECT * FROM healing_circuit_breaker;
-- Expected: 1 row with circuit_key='scheduled_healing', failures=0

-- Confirm column names:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'healing_circuit_breaker';
-- Expected: circuit_key, failures, open_until, last_failure, updated_at
```

**Commit the migration file:**
```bash
git add supabase/migrations/20260506000011_healing_circuit_breaker.sql
git commit -m "db: add healing_circuit_breaker migration with correct circuit_key column

Fixes schema mismatch between DEPLOY-CHECKLIST (column: key) and
self-healing-coding.ts (queries column: circuit_key).
Also tracks the table in migrations so it's applied on all environments."
git push origin main
```

---

## 7. Phase 4 — Server & Environment Setup

*Goal: Ensure the Hostinger VPS is correctly configured before the first automated deploy runs.*

---

### 7.1 Verify `/etc/openclaw/.env` Exists and Is Complete

SSH into the VPS as your deploy user:

```bash
ssh <HOSTINGER_USER>@<HOSTINGER_HOST>
```

**Check the file exists with correct permissions:**
```bash
sudo ls -la /etc/openclaw/.env
# Required output: -rw------- 1 openclaw openclaw <size> <date> /etc/openclaw/.env
# If missing:
sudo mkdir -p /etc/openclaw
sudo touch /etc/openclaw/.env
sudo chown openclaw:openclaw /etc/openclaw/.env
sudo chmod 600 /etc/openclaw/.env
```

**Populate all required variables** (edit as `openclaw` user or via sudo):
```bash
sudo nano /etc/openclaw/.env
```

Required variables — do not proceed without all of these having real values:

```bash
# ── Anthropic (REQUIRED — Primary AI Provider) ──────────────────
ANTHROPIC_API_KEY_SOVEREIGN=sk-ant-api03-XXXXXXXX
ANTHROPIC_API_KEY_SHARED=sk-ant-api03-XXXXXXXX

# ── OpenAI (EMBEDDINGS ONLY — text-embedding-3-small) ─────────
OPENAI_API_KEY=sk-proj-XXXXXXXX

# ── Supabase ──────────────────────────────────────────────────
SUPABASE_URL=https://XXXXXXXX.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.XXXXXXXX

# ── OpenClaw Gateway ─────────────────────────────────────────
OPENCLAW_GATEWAY_AUTH_TOKEN=<64-character-random-hex>
OPENCLAW_GHL_WEBHOOK_SECRET=<32-character-random-hex>

# ── GoHighLevel ──────────────────────────────────────────────
GHL_PRIVATE_INTEGRATION_TOKEN=pit-XXXXXXXX
GHL_LOCATION_ID=XXXXXXXX
GHL_PRIVATE_INTEGRATION_TOKEN_TJB=pit-XXXXXXXX
GHL_LOCATION_ID_TJB=XXXXXXXX
GHL_PRIVATE_INTEGRATION_TOKEN_MSL=pit-XXXXXXXX
GHL_LOCATION_ID_MSL=XXXXXXXX

# ── Telegram ─────────────────────────────────────────────────
OPENCLAW_ALERT_TELEGRAM_CHAT_ID=XXXXXXXX

# ── Runtime ──────────────────────────────────────────────────
OPENCLAW_GHL_WEBHOOK_PORT=8788
OPENCLAW_GHL_WEBHOOK_HOST=0.0.0.0
HOME=/opt/openclaw
OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw
NODE_ENV=production
DRY_RUN=false
```

**Validation check — run this to confirm no placeholder values remain:**
```bash
sudo -u openclaw grep -E 'XXXXXXXX|your-|example|placeholder|sk-ant-your|pit-your' \
  /etc/openclaw/.env
# Expected: no output (zero matches)
```

---

### 7.2 Verify the OpenClaw CLI Is Installed

The systemd service `ExecStart` calls `openclaw gateway`. Confirm the CLI is installed:
```bash
which openclaw
# Expected: /usr/bin/openclaw  or  /usr/local/bin/openclaw  or  /usr/lib/node_modules/openclaw/...

openclaw --version
# Expected: a version string (current npm version: 2026.5.4)

# If not installed:
sudo npm install -g openclaw@latest
```

---

### 7.3 Verify Service Files Are Installed and Up to Date

```bash
sudo ls -la /etc/systemd/system/openclaw.service
sudo ls -la /etc/systemd/system/openclaw-webhook.service

# If service files need updating from the repo:
sudo cp /opt/openclaw/deploy/hostinger/openclaw.service /etc/systemd/system/openclaw.service
sudo cp /opt/openclaw/deploy/hostinger/webhook.service /etc/systemd/system/openclaw-webhook.service
sudo systemctl daemon-reload

# Verify the watchdog and restart limits are correct:
sudo systemctl cat openclaw.service | grep -E 'RestartSec|StartLimit|WatchdogSec'
# Expected:
#   RestartSec=10
#   StartLimitIntervalSec=3600
#   StartLimitBurst=100
#   WatchdogSec=300
```

---

### 7.4 Verify `jq` Is Installed (Required by Pre-Start Script)

`openclaw-pre-start.sh` uses `jq` to strip invalid config keys:
```bash
which jq
# Expected: /usr/bin/jq

# If missing:
sudo apt-get install -y jq
```

---

### 7.5 Verify `openclaw-pre-start.sh` Is in Place and Executable

```bash
ls -la /opt/openclaw/deploy/hostinger/openclaw-pre-start.sh
# Expected: -rwx------ 1 openclaw openclaw ... openclaw-pre-start.sh

# If not executable:
sudo chmod +x /opt/openclaw/deploy/hostinger/openclaw-pre-start.sh
```

---

### 7.6 Verify `openclaw.json` Config Is in Place

The gateway needs a config file at `/opt/openclaw/.openclaw/openclaw.json`:
```bash
sudo -u openclaw ls -la /opt/openclaw/.openclaw/openclaw.json
# Expected: file exists

# If missing, copy from the production config:
sudo -u openclaw cp /opt/openclaw/config/openclaw.prod.json \
  /opt/openclaw/.openclaw/openclaw.json
```

---

## 8. Phase 5 — GitHub Actions & Secrets

*Goal: Confirm all GitHub and Vercel secrets are in place so automated deploys work.*

---

### 8.1 Configure GitHub Actions `production` Environment Secrets (H3)

The deploy workflow (`deploy-bot.yml`) uses `environment: production`. GitHub enforces
that this named environment exists and that its secrets are configured.

**Navigate to:** `github.com/jeremiahvanwagner-droid/openclaw`  
→ Settings → Environments → `production`

If the environment doesn't exist, create it with no protection rules (or add a required
reviewer if you want manual approval before deploy).

**Required secrets** (set under the `production` environment, NOT at repo level):

| Secret Name | Description | Example Format |
|---|---|---|
| `HOSTINGER_HOST` | VPS IP address or hostname | `123.45.67.89` |
| `HOSTINGER_USER` | SSH username on VPS | `deploy` or `root` |
| `HOSTINGER_SSH_KEY` | Private SSH key (full PEM content) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for deploy alerts | `1234567890:ABCdef...` |
| `TELEGRAM_ALERT_CHAT_ID` | Telegram chat ID for deploy alerts | `-100123456789` |

**Verify the SSH key works:**
```bash
# On your local machine:
echo "-----BEGIN..." > /tmp/test_key
chmod 600 /tmp/test_key
ssh -i /tmp/test_key -o StrictHostKeyChecking=no <HOSTINGER_USER>@<HOSTINGER_HOST> "echo OK"
# Expected: OK
rm /tmp/test_key
```

**Verify the deploy user has passwordless sudo** (required by `deploy.sh`):
```bash
ssh <HOSTINGER_USER>@<HOSTINGER_HOST> "sudo -n true && echo 'sudo OK' || echo 'sudo FAILED'"
# Expected: sudo OK
```

---

### 8.2 Configure Vercel Dashboard Environment Variables (H4)

The Next.js dashboard at `dashboard/` is deployed to Vercel. The build uses stub
Supabase values in CI (fine for builds), but the **live Vercel deployment** needs real
values or every page will fail with a Supabase initialization error.

**Navigate to:** Vercel dashboard → Your openclaw dashboard project  
→ Settings → Environment Variables

**Set these variables for Production (and Preview) environments:**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://XXXXXXXX.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase project anon key (from Supabase → Settings → API) |

Note: Use the **anon key** (not the service role key) — the dashboard is a browser
client and must never receive the service role key.

**Verify by visiting the live dashboard URL** after the next Vercel deployment and
checking the browser console for Supabase connection errors.

---

## 9. Phase 6 — First Production Deploy

*Goal: Execute the first clean automated deploy to production.*

---

### 9.1 Pre-Deploy Local Verification

Before triggering the GitHub Actions deploy, run this locally (or confirm CI is passing):

```bash
# 1. TypeScript clean
pnpm typecheck
# Expected: 0 errors

# 2. All tests pass
pnpm test
# Expected: 160/160 (or more if new tests added)

# 3. Zero GPT refs in runtime code
grep -rn 'gpt-4o\|gpt-5\|openai/gpt' \
  --include="*.ts" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=backups .
# Expected: only matches in comments, test files, and cost-tracking constants
# (llm-router.ts has legacy cost entries — these are pricing references, not model dispatches)

# 4. Config parity
node scripts/upgrade/runtime-config-parity.mjs \
  --primary config/openclaw.prod.json \
  --secondary config/openclaw.json \
  --agents config/agents_config.json \
  --rollout full \
  --expected-agent-count 103 \
  --strict
# Expected: "ok": true
```

---

### 9.2 Trigger Deploy via GitHub Actions

**Navigate to:** Actions → `Deploy Bot to Hostinger VPS (Manual)` → Run workflow

**Inputs:**
| Input | Value | Reason |
|---|---|---|
| `upgrade_cli` | `false` | Keep current CLI unless specifically upgrading |
| `rollout_mode` | `full` | Canary mode still has legacy model map issues; full is the target |
| `clean_server_checkout` | `false` | Only set to `true` if VPS has uncommitted changes |

**Monitor the workflow — expected step sequence:**
1. ✅ `Run Tests` — lint, typecheck, unit tests, parity gate
2. ✅ `Validate SSH secrets` — confirms all 3 SSH secrets are set
3. ✅ `Preflight server checkout state` — confirms VPS working tree is clean
4. ✅ `Validate sudo access` — confirms deploy user can run passwordless sudo
5. ✅ `Deploy via SSH` — runs `deploy.sh --rollout full` on VPS
6. ✅ `Health Check` — polls `/health` on port 18789 and 8788
7. ✅ `Notify Telegram` — sends success/failure message

**If step 5 fails:** The workflow automatically runs `Collect service diagnostics` which
dumps the last 200 lines of both service journals to the Actions log. Check there first.

---

### 9.3 Manual Deploy (Alternative — if automated deploy is not yet wired up)

SSH into the VPS and run deploy directly:

```bash
ssh <HOSTINGER_USER>@<HOSTINGER_HOST>

cd /opt/openclaw

# Pull latest code
sudo -u openclaw git fetch origin main
sudo -u openclaw git pull --ff-only origin main

# Run deploy script
sudo bash deploy/hostinger/deploy.sh --rollout full

# Check services started
systemctl status openclaw --no-pager -l
systemctl status openclaw-webhook --no-pager -l
```

---

## 10. Phase 7 — Smoke Tests & Validation

*Goal: Confirm every layer of the stack is working before declaring production stable.*

---

### 10.1 Gateway Health

```bash
# Basic health
curl -sf http://localhost:18789/health
# Expected: HTTP 200, JSON body with status

# Auth gate is working (should be rejected without token)
curl -sf http://localhost:18789/api/agents
# Expected: HTTP 401

# Auth gate passes with token
curl -sf -H "Authorization: Bearer ${OPENCLAW_GATEWAY_AUTH_TOKEN}" \
  http://localhost:18789/api/agents
# Expected: HTTP 200 with agent list
```

---

### 10.2 Webhook Handler Health

```bash
curl -sf http://localhost:8788/health
# Expected: HTTP 200

# Confirm HMAC rejection (no signature)
curl -sf -X POST http://localhost:8788/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"contact.created","contact":{"id":"test"}}'
# Expected: HTTP 401 (signature verification failed)
```

---

### 10.3 Inngest Function Registration

```bash
curl -sf http://localhost:18789/api/inngest | jq '[.fns[].id]'
```

Expected output must include all of the following:

```json
[
  "openclaw/agent-invoke",
  "openclaw/agent-escalate",
  "openclaw/agent-health-check",
  "openclaw/telegram-alert",
  "openclaw/pod-quarantine",
  "openclaw/pod-restore",
  "openclaw/credential-health-check",
  "openclaw/book-launch-ready",
  "openclaw/training-weekly-review",
  "openclaw/training-skill-development",
  "openclaw/training-cross-division",
  "openclaw/training-soul-refinement",
  "openclaw/training-performance-review",
  "openclaw/training-memory-consolidation",
  "openclaw/training-health-check",
  "openclaw/saas-client-signup",
  "openclaw/saas-payment-failed",
  "openclaw/saas-payment-received",
  "openclaw/saas-client-churn",
  "openclaw/saas-subscription-cancelled",
  "openclaw/saas-usage-threshold",
  "openclaw/saas-funnel-published",
  "openclaw/weekly-inter-division-meeting",
  "openclaw/on-demand-meeting",
  "openclaw/scope-audit-scheduled",
  "openclaw/scope-drift-detected",
  "openclaw/scope-violation-attempted",
  "openclaw/integration-health-check",
  "openclaw/integration-failure-detected",
  "openclaw/integration-healed",
  "openclaw/integration-escalation",
  "openclaw/qa-scheduled-audit",
  "openclaw/qa-funnel-published",
  "openclaw/qa-compliance-alert",
  "openclaw/qa-tracking-broken",
  "openclaw/revenue-daily-collection",
  "openclaw/revenue-anomaly-detected",
  "openclaw/revenue-briefing-ready",
  "openclaw/journey-touchpoint-recorded",
  "openclaw/journey-stall-detection",
  "openclaw/journey-high-intent",
  "openclaw/journey-next-offer-triggered",
  "openclaw/command-center-daily-briefing",
  "openclaw/command-center-weekly-digest",
  "openclaw/command-center-critical-alert",
  "openclaw/ghl-build-create-requested",
  "openclaw/ghl-snapshot-created",
  "openclaw/ghl-rollback-requested",
  "openclaw/experiment-created",
  "openclaw/experiment-evaluation-scheduled",
  "openclaw/experiment-significant",
  "openclaw/experiment-promoted",
  "openclaw/campaign-idea-submitted",
  "openclaw/campaign-bundle-ready",
  "openclaw/campaign-approved",
  "openclaw/campaign-performance-collect",
  "openclaw/offer-analysis-scheduled",
  "openclaw/offer-optimization-suggested",
  "openclaw/offer-performance-collected",
  "openclaw/self-healing-scheduled",        ← NEW (was missing)
  "openclaw/self-healing-on-demand",        ← NEW (was missing)
  "openclaw/supervisor-integration-check",  ← NEW (was missing)
  "openclaw/healing-escalation-handler",    ← NEW (was missing)
  "openclaw/ci-auto-fix",                   ← NEW (was missing)
  "openclaw/ci-daily-check"                 ← NEW (was missing)
]
```

---

### 10.4 Anthropic API Connectivity

```bash
# Trigger a test completion through the gateway and confirm Claude responds
journalctl -u openclaw --since "2 minutes ago" | grep -i 'anthropic\|claude\|model'
# Expected: log lines showing model=anthropic/claude-* with no errors

# Confirm zero OpenAI completions (embeddings OK)
journalctl -u openclaw --since "2 minutes ago" | grep -i 'gpt-4o\|gpt-5\|openai.*complet'
# Expected: no output
```

---

### 10.5 Circuit Breaker State

```bash
# Query Supabase directly to confirm circuit breaker is healthy
# (via Supabase SQL Editor or MCP connection):
SELECT circuit_key, failures, open_until, updated_at
FROM healing_circuit_breaker;
# Expected: circuit_key='scheduled_healing', failures=0, open_until=NULL
```

---

### 10.6 Service Stability Check (Run After 10 Minutes)

```bash
# Restart count should be 0 or very low
systemctl show openclaw --property=NRestarts
# Healthy: NRestarts=0 or NRestarts=1

# No crash-loop pattern in last 10 minutes
journalctl -u openclaw --since "10 minutes ago" | grep -c "Started\|Stopped"
# Healthy: < 3
```

---

## 11. Phase 8 — Post-Deploy Cleanup

*After stable operation is confirmed, complete these housekeeping tasks.*

---

### 11.1 Archive `install_webhook_service.sh` (M2)

`deploy/hostinger/install_webhook_service.sh` uses the path `/etc/openclaw-prod/` instead
of `/etc/openclaw/` used everywhere else. If this script is no longer in the active
deploy path (it appears to be a legacy artifact), move it:

```bash
git mv deploy/hostinger/install_webhook_service.sh \
       deploy/hostinger/_archive/install_webhook_service.sh.legacy
git commit -m "chore: archive legacy install_webhook_service.sh (uses wrong env path)"
```

---

### 11.2 Add `@types/node` to devDependencies

`@types/node` is currently only available as a transitive dependency. Our
`fetchWithTimeout` helper in `ollama-client.ts` relies on `AbortController`,
`RequestInit`, and `Response` being typed — all of which come from `@types/node`.
Make this explicit:

```bash
pnpm add -D @types/node
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @types/node to explicit devDependencies"
```

---

### 11.3 Remove Manual SQL from DEPLOY-CHECKLIST.md

Now that the `healing_circuit_breaker` table is tracked in migrations, remove the
manual SQL block from `DEPLOY-CHECKLIST.md` and replace with:

```markdown
## Server — Supabase Circuit Breaker Table

This table is now managed via Supabase migrations. Apply migrations before first deploy:

```bash
supabase db push
```

Or apply manually in Supabase SQL Editor (see `supabase/migrations/20260506000011_healing_circuit_breaker.sql`).
```

---

### 11.4 Set Canary Mode Warning in Deploy Workflow

Until canary mode is fully validated, add a comment to the deploy workflow to warn
operators:

In `.github/workflows/deploy-bot.yml`, add to the `rollout_mode` input description:
```yaml
rollout_mode:
  description: "Deployment rollout mode (use 'full' — canary maps non-canary agents to Anthropic models)"
```

---

## 12. Rollback Procedure

If a deploy goes wrong, execute this sequence immediately:

```bash
ssh <HOSTINGER_USER>@<HOSTINGER_HOST>

cd /opt/openclaw

# 1. Identify the last known-good commit
git log --oneline -10

# 2. Roll back to the prior commit
sudo -u openclaw git checkout <PRIOR_COMMIT_SHA>

# 3. Confirm config files are intact
sudo -u openclaw ls -la .openclaw/openclaw.json
sudo ls -la /etc/openclaw/.env

# 4. Restart services
sudo systemctl reset-failed openclaw openclaw-webhook 2>/dev/null || true
sudo systemctl restart openclaw openclaw-webhook

# 5. Confirm health
sleep 10
curl -sf http://localhost:18789/health
curl -sf http://localhost:8788/health

# 6. Check for stability
sleep 60
systemctl show openclaw --property=NRestarts
```

If services still fail after rollback, check the environment file:
```bash
sudo -u openclaw env | grep -E 'ANTHROPIC|SUPABASE|GHL' | grep -v '^$'
# If empty, the env file is not loading — verify /etc/openclaw/.env exists and is readable
```

---

## 13. Ongoing Operational Runbook

---

### Checking Service Health

```bash
# Quick status
systemctl status openclaw openclaw-webhook --no-pager

# Live logs
journalctl -u openclaw -f --no-pager

# Restart count
systemctl show openclaw --property=NRestarts

# Recent errors only
journalctl -u openclaw --since "1 hour ago" -p err --no-pager
```

---

### Manually Triggering Self-Healing

```bash
# Via Inngest dashboard (recommended):
# 1. Go to your Inngest Cloud dashboard
# 2. Functions → openclaw/self-healing-on-demand
# 3. Send event → trigger manually

# Via gateway API:
curl -X POST http://localhost:18789/api/inngest \
  -H "Authorization: Bearer ${OPENCLAW_GATEWAY_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"openclaw/self-healing.triggered","data":{}}'
```

---

### Rotating Secrets

When rotating API keys:

```bash
sudo nano /etc/openclaw/.env
# Update the relevant key

# Restart both services to pick up new env
sudo systemctl restart openclaw openclaw-webhook

# Verify the new key is active in logs
journalctl -u openclaw --since "1 minute ago" | grep -i 'key\|auth\|anthropic'
```

---

### Deploying Code Updates After This Stabilization

For all future deploys:

```bash
# Push code to main → CI runs automatically
# When CI is green, trigger manual deploy:
# Actions → Deploy Bot to Hostinger VPS (Manual) → Run workflow
# rollout_mode: full | upgrade_cli: false
```

---

## 14. Master Checklist

Use this as the go/no-go checklist before declaring production stable. Every box must be
checked before the system is considered production-ready.

### Code Commits

- [ ] `lib/ollama-client.ts` — `fetchWithTimeout` patch committed and pushed *(done this session)*
- [ ] `inngest/serve.ts` — `selfHealingCodingFunctions` imported and registered
- [ ] `skills/aisaas-autonomous-debugging/index.mjs` — default model changed to `claude-haiku-4-5`
- [ ] `skills/gh-address-comments/index.mjs` — default model changed to `claude-haiku-4-5`
- [ ] `skills/gh-fix-ci/index.mjs` — default model changed to `claude-haiku-4-5`
- [ ] `lib/runtime-model-policy.mjs` — `gpt-5.3-codex` replaced with real Anthropic models
- [ ] `DEPLOY-CHECKLIST.md` — env file path corrected to `/etc/openclaw/.env`
- [ ] `.github/workflows/deploy-bot.yml` — `--expected-agent-count` updated to `103`
- [ ] `supabase/migrations/20260506000011_healing_circuit_breaker.sql` — created and committed

### CI Gate

- [ ] GitHub Actions CI on `main` branch: all steps green
  - [ ] Lint baseline gate ✅
  - [ ] TypeScript typecheck ✅
  - [ ] Unit tests (160+) ✅
  - [ ] Dashboard build ✅
  - [ ] Dashboard typecheck ✅

### Database

- [ ] `healing_circuit_breaker` table exists in Supabase with column `circuit_key`
- [ ] Seed row present: `circuit_key='scheduled_healing', failures=0`
- [ ] RLS enabled with service role policy
- [ ] All other migrations applied (`supabase db push` confirmed clean)

### Server Environment

- [ ] `/etc/openclaw/.env` exists, `chmod 600`, owned by `openclaw:openclaw`
- [ ] All required env vars set (no placeholder values)
- [ ] `openclaw` CLI installed and on PATH
- [ ] `jq` installed on VPS
- [ ] `openclaw-pre-start.sh` executable at `/opt/openclaw/deploy/hostinger/openclaw-pre-start.sh`
- [ ] `/opt/openclaw/.openclaw/openclaw.json` present
- [ ] Systemd service files installed and up to date
- [ ] `sudo -n true` succeeds for deploy user

### GitHub / Vercel

- [ ] GitHub `production` environment exists in repo Settings
- [ ] `HOSTINGER_HOST` secret set under `production` environment
- [ ] `HOSTINGER_USER` secret set under `production` environment
- [ ] `HOSTINGER_SSH_KEY` secret set under `production` environment
- [ ] `TELEGRAM_BOT_TOKEN` secret set under `production` environment
- [ ] `TELEGRAM_ALERT_CHAT_ID` secret set under `production` environment
- [ ] Vercel project has `NEXT_PUBLIC_SUPABASE_URL` set to real value
- [ ] Vercel project has `NEXT_PUBLIC_SUPABASE_ANON_KEY` set to real value

### Smoke Tests (Post-Deploy)

- [ ] `curl -sf http://localhost:18789/health` returns 200
- [ ] `curl -sf http://localhost:8788/health` returns 200
- [ ] Inngest function list includes all 6 healing functions
- [ ] Service restart count is 0 or 1 after 10 minutes
- [ ] No `gpt-4o` or `gpt-5` model strings in runtime logs
- [ ] Circuit breaker Supabase row shows `failures=0` after first cron run

### Post-Deploy Cleanup (Within First Week)

- [ ] `@types/node` added to explicit devDependencies
- [ ] `install_webhook_service.sh` archived or removed
- [ ] Manual SQL block removed from `DEPLOY-CHECKLIST.md`
- [ ] Canary mode warning added to deploy workflow

---

*End of OpenClaw Production Deployment Plan*

> **Estimated time to clear all blockers and deploy:** 3–4 hours  
> **Estimated time for smoke tests and validation:** 30–60 minutes  
> **Total time to first stable production state:** Half a day
