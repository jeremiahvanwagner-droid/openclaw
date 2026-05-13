# REGGIE-STATE.md
# Runtime Engine Governing Global Integrations & Execution
# Truth J Blue LLC — OpenClaw Platform

> MANDATORY FIRST READ FOR EVERY AI SESSION, EVERY CODEX PROMPT,
> AND EVERY DEVELOPER TOUCHING THIS REPO.
>
> This file is a repo-verified audit artifact. Do not treat older reports,
> planning docs, or stale README text as runtime truth.
>
> If the repo contradicts this file, stop and update this file first.

---

## 1. IDENTITY

| Field | Value |
|---|---|
| Owner | Jeremiah Van Wagner (Truth J Blue LLC) |
| Governed by | MIKE (Modular Intelligence & Knowledge Engine) |
| Repo | `github.com/jeremiahvanwagner-droid/openclaw` |
| Production host | Hostinger VPS — 177.7.32.224 |
| OpenClaw release tag | `2026.4.29` (commit `a448042`) — running as systemd service |
| `package.json` version | `1.0.0` |
| Deployment shape | systemd (`/etc/systemd/system/openclaw.service`) — NOT Docker Compose on VPS production |
| Last state update | 2026-05-13 (metrics endpoint confirmed absent + symlink blocker — r14/r15) UTC |
| Sweep version | `2026-05-05-sweep` (Phase 1–5 complete) |
| Last audit entry | `r15-2026-05-13-browser-automation-symlink-broken` |

---

## 2. ACTIVE INFRASTRUCTURE

### 2.1 Runtime — VPS (177.7.32.224)

Verified by `ss -tlnp` and `curl` probes 2026-05-13.

| Process | PID | Port | Status |
|---|---|---|---|
| `node` (gateway / Control UI) | 141406 | `127.0.0.1:18789` + `[::1]:18789` | LIVE — `/healthz` returns `{"ok":true,"status":"live"}` |
| `node` (webhook handler) | 93133 | `127.0.0.1:8788` | LIVE — 401 on unauthenticated probe (expected) |

> **NOTE:** Prior REGGIE entries referenced `openclaw-bot` and `openclaw-webhook` Docker containers.
> Production VPS now runs openclaw via **systemd** (`openclaw.service`) — Docker containers are
> stopped orphans with `restart: "no"`. This is the canonical production shape as of r12.

### 2.2 Compose files (reference — NOT active on VPS prod)

| Path | Role |
|---|---|
| `C:\Users\JeremiahVanWagner\.openclaw\docker-compose.yml` | LOCAL dev |
| `/root/openclaw/docker-compose.yml` | VPS dev (NOT used in prod) |
| `/root/openclaw/deploy/docker-compose.prod.yml` | VPS prod build reference only |
| `/root/openclaw/deploy/monitoring/docker-compose.monitoring.yml` | Prometheus/Grafana — NOT currently running |

### 2.3 Network surface

- Gateway listens on `:18789` (localhost only — Tailscale/Caddy fronted)
- Webhook handler listens on `:8788` (signed webhooks only, P8 idempotency enforced)
- **Prometheus scrape targets DISABLED** — openclaw does NOT expose `/metrics` on any port
  (confirmed 2026-05-13: `:18789/metrics` → 404, no other metrics port listening)
  See r14 audit entry and `deploy/monitoring/prometheus/prometheus.yml` (dead targets commented out)
- Prometheus monitoring stack is NOT currently running on VPS

### 2.4 `.env` variable names (key names only — no values, per P7)

Captured from VPS `/root/openclaw/.env`:

```
CANVA_BRAND_KIT_ID
CANVA_CLIENT_ID
CANVA_CLIENT_SECRET
GDRIVE_BASE_FOLDER_ID
GHL_EMAIL
GHL_LOCATION_ID
GHL_LOCATION_ID_TJB
GHL_PASSWORD
GHL_PRIVATE_INTEGRATION_TOKEN
GHL_PRIVATE_INTEGRATION_TOKEN_TJB
GHL_TOKEN
OPENAI_API_KEY
OPENCLAW_ALERT_TELEGRAM_CHAT_ID
OPENCLAW_DATA_DIR
OPENCLAW_GATEWAY_AUTH_TOKEN
OPENCLAW_GHL_WEBHOOK_HOST
OPENCLAW_GHL_WEBHOOK_PORT
OPENCLAW_GHL_WEBHOOK_SECRET
OPENCLAW_OPENAI_CODEX_MANUAL_TOKEN
OPENCLAW_REPORT_TZ
OPENCLAW_TELEGRAM_BOT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
TELEGRAM_ALERT_CHAT_ID
TELEGRAM_BOT_TOKEN
YOUTUBE_CHANNEL_ID
```

26 variables. Rotation policy: GHL PIT ≤90 days (P6), Supabase service keys ≤180 days, all rotations logged in `audit_events`.

### 2.5 Workforce

- Configured agents: **103** (`config/agents_config.json`)
- Runtime entries: **107** (`config/openclaw.prod.json`, `openclaw.json`)
- Runtime aliases: `main`, `marketing`, `sales`, `support`
- Divisions: **9** (D1–D9 per Block 8 of doctrine)
- Generated workforce snapshot: `AGENTS.md` (root, 2,213 B)

### 2.6 Local Models (VPS — confirmed 2026-05-13)

Ollama running at `127.0.0.1:11434`:

| Model | Role |
|---|---|
| `qwen3.6:latest` | Tier 1 workhorse (replaces Anthropic Sonnet in Phase 9) |
| `qwen3:8b` | Tier 2 fast loops (replaces Anthropic Haiku) |
| `kimi-k2.5:cloud` | Long-context overflow — remote-proxied via ollama.com (NOT fully local) |

---

## 3. ACTIVE SKILLS REGISTRY

### 3.1 Repo skills (`skills/` in `github.com/jeremiahvanwagner-droid/openclaw`)

- 165 folder-style skills (each with `SKILL.md`)
- 125 `.mjs` skill modules
- 2 `.json` skill descriptors
- **Skill audit allowlist**: `skills/.audit-allowlist.json` — **MISSING** (P4 audit gate not yet initialized) → Open Item #1
- **Skill audit manifest**: `skills/.audit-manifest.json` — **MISSING** → Open Item #1

Top namespaces (folder-style):

| Prefix | Skills |
|---|---:|
| `community-` | 14 |
| `affiliate-` | 14 |
| `ghl-` | 13 |
| `finance-` | 12 |
| `education-` | 12 |
| `ecommerce-` | 12 |
| `digital-` | 12 |
| `coaching-` | 12 |
| `brand-` | 12 |
| `aisaas-` | 12 |
| `agency-` | 12 |
| `content-` | 8 |
| `webhook-` | 5 |
| `funnel-` | 5 |
| `browser-` | 5 |

### 3.2 User-scoped REGGIE doctrine skills (`C:\Users\JeremiahVanWagner\.openclaw\skills\`)

Verified present in LOCAL filesystem (Phase 1 manifest scan):

| Skill | Status |
|---|---|
| `reggie-doctrine-recall` | VERIFIED (canonical doctrine — Block 1–7) |
| `reggie-tier-router` | VERIFIED (Tier 0/1/2 fast routing test) |
| `reggie-state-audit-entry` | VERIFIED (8-rule append-only validation) |
| `reggie-supabase-ops` | VERIFIED (DB1/DB2, P3, P7 declarative migrations) |
| `reggie-ghl-operations` | VERIFIED (35-namespace / 413-op map, Channel Authority) |
| `reggie-skill-audit-gate` | VERIFIED (P4 manifest enforcement) |
| `reggie-phase-ritual` | VERIFIED (phase-gate enforcement) |

### 3.3 User-scoped TJB workflow skills

Verified present in LOCAL filesystem:

| Skill | Status |
|---|---|
| `tjb-context-frontloader` | VERIFIED |
| `tjb-precision-prompt` | VERIFIED |
| `tjb-prophetic-voice` | VERIFIED |
| `tjb-refinement-loop` | VERIFIED |
| `tjb-session-memory` | VERIFIED |
| `tjb-tool-orchestrator` | VERIFIED |
| `tjb-trend-sensor` | VERIFIED |
| `tjb-workflow-decomposer` | VERIFIED |
| `tjb-multimodal-reel-pipeline` | VERIFIED |
| `tjb-autonomous-deploy` | VERIFIED |

---

## 4. ACTIVE AGENT PROFILE

| Field | Value |
|---|---|
| Agent auth profile | Not located in repo or VPS scan — see Open Item #2 |
| Sanitizer script (canonical) | `/root/openclaw/deploy/sanitize-runtime-config.py` (2,514 B, 2026-05-01 17:57) |
| Repo equivalent | **MISSING** — `deploy/sanitize-runtime-config.py` not in repo (GHOST REFERENCE → Open Item #3) |
| Runtime config parity check | `scripts/upgrade/runtime-config-parity.mjs` (8,440 B) — present in repo and VPS |
| Runtime rollout config builder | `scripts/upgrade/build-runtime-rollout-config.mjs` (4,095 B) — present in repo and VPS |
| GHL OAuth manager | `skills/ghl-oauth-manager.mjs` — initialized at webhook startup |
| Webhook handler | `handlers/ghl-webhook-handler.mjs` (sole handler) |
| Inngest event surface | `inngest/client.ts` — 60 typed GHL event definitions |

### 4.1 Models wired (Phase 9 target — local-first)

- **Primary workhorse**: `qwen3.6:latest` (replaces Anthropic Sonnet 78 agents)
- **Fast loops**: `qwen3:8b` (replaces Anthropic Haiku 22 agents)
- **Long-context overflow**: `kimi-k2.5:cloud` (remote-proxied, not local)
- **Opus (7 agents)**: TIER0_SPEND audit required per Block 6 before any Opus call
- OpenAI present for `memorySearch` embeddings only

### 4.2 Gateway

- Mode: gateway-only on `:18789` (no public surface — P7)
- Bind: localhost only, Caddy fronts only signed webhook endpoints
- Auth: `OPENCLAW_GATEWAY_AUTH_TOKEN`
- `/healthz` → `{"ok":true,"status":"live"}` (verified 2026-05-13)
- `/metrics` → **404** — does not exist (confirmed 2026-05-13)

---

## 5. OPEN ITEMS (BLOCKERS ONLY — MAX 10)

| # | Blocker | Impact | First seen | Status |
|---|---|---|---|---|
| 1 | `skills/.audit-allowlist.json` and `skills/.audit-manifest.json` missing | P4 skill audit gate cannot run | 2026-05-05 sweep | OPEN |
| 2 | Agent auth profile location not identified | Cannot verify P5 per-agent least-privilege | 2026-05-05 sweep | OPEN |
| 3 | GHOST REFERENCE — `deploy/sanitize-runtime-config.py` on VPS but not in repo | Drift risk on next deploy | 2026-05-05 sweep | OPEN |
| 4 | ~~Live gateway metrics not verified~~ | CLOSED — confirmed absent. `/metrics` returns 404. Prometheus scrape targets disabled (r14) | 2026-04-06 | **CLOSED r14** |
| 5 | ~~Live Prometheus/Grafana target health not verified~~ | CLOSED — monitoring stack not running. Config cleaned (r14) | 2026-04-06 | **CLOSED r14** |
| 6 | `/health/deep` endpoint absent | Only `/healthz` exists; no "running but broken" detection | 2026-04-06 | OPEN |
| 7 | No staging environment | Repo deploys without verified staging layer | 2026-04-06 | OPEN |
| 8 | ~~LOCAL and VPS REGGIE-STATE.md were divergent~~ | CLOSED — single canonical file in repo | 2026-05-05 sweep | **CLOSED** |
| 9 | `plugin-skills/browser-automation` symlink points to Windows path | BROKEN on VPS — any skill resolving browser-automation fails with ENOENT | 2026-05-13 | **OPEN — Phase 9 BLOCKER** |

---

## 6. NEXT ACTIONS (MAX 5)

1. **Fix the broken browser-automation symlink (Open Item #9 — Phase 9 BLOCKER).**
   Remove `plugin-skills/browser-automation`, re-create as relative symlink to
   `/opt/openclaw/.openclaw/plugin-runtime-deps/openclaw-2026.4.29-4eca5026e977/dist/extensions/browser/skills/browser-automation`,
   commit to repo. Then add a post-update hook or stable `/opt/openclaw/current` alias
   to prevent version-stamp breakage on next openclaw upgrade.

2. **Initialize the P4 skill audit gate (Open Item #1).**
   Run `audit-skills.mjs` to generate `skills/.audit-allowlist.json` and `skills/.audit-manifest.json`.
   Required before any new skill ships.

3. **Bring `deploy/sanitize-runtime-config.py` into the repo (Open Item #3).**
   Copy from VPS, commit to `deploy/`. Prevents CI from reverting VPS-only changes.

4. **Locate or create agent auth profile (Open Item #2).**
   Identify where per-agent least-privilege scope is declared. If undocumented,
   create `config/agent-auth-profiles.json`.

5. **Phase 9 pre-flight: verify `models.json` schema.**
   Run `grep -r "models.json" /root/openclaw --include="*.ts" --include="*.mjs" --include="*.js" | head -20`
   to confirm the schema OpenClaw expects before finalizing the Phase 9 model config.

---

## 7. CHANGE LOG (LAST 5 ENTRIES)

> Append-only — never edit prior entries. Corrections are new entries with `Status=ROLLED_BACK` referencing the prior Entry ID.

### r15 AUDIT ENTRY — browser-automation symlink broken (Windows path on Linux VPS) — 2026-05-13

| Field | Value |
|---|---|
| Date | 2026-05-13 17:41 UTC |
| Author | agent:MIKE + human:jeremiah-vanwagner |
| Change Type | FINDING (no change applied yet — fix pending operator execution) |
| Status | OPEN — blocker for Phase 9 |
| Parent Entry | `r14-2026-05-13-metrics-endpoint-confirmed-missing` |
| Impacted Divisions | shared_runtime_ops, browser-automation plugin consumers |
| Entry ID | `r15-2026-05-13-browser-automation-symlink-broken` |

**Finding.** `plugin-skills/browser-automation` committed to repo as a symlink pointing to:
```
C:/Users/JeremiahVanWagner/AppData/Roaming/npm/node_modules/openclaw/dist/extensions/browser/skills/browser-automation
```
This is a **Windows absolute path**. It resolves to `ENOENT` on the VPS (Linux). Any agent or skill
that imports or references `plugin-skills/browser-automation` will fail silently or throw at runtime.

**`git rm` failed** with `fatal: pathspec did not match any files` — git may have the symlink stored
as a blob or the path is not tracked cleanly. Use `git ls-files plugin-skills/browser-automation` to
check tracking state, then `git rm -f` or `rm -f` as appropriate.

**Correct target on VPS (two candidates found via `find`):**

| Path | Use? |
|---|---|
| `/root/.npm/_npx/.../browser-automation` | ❌ Temp npx cache — will disappear |
| `/opt/openclaw/.openclaw/plugin-runtime-deps/openclaw-2026.4.29-4eca5026e977/dist/extensions/browser/skills/browser-automation` | ✅ Production runtime install |

**Fix commands (to be executed by operator):**
```bash
git ls-files plugin-skills/browser-automation
git rm -f plugin-skills/browser-automation 2>/dev/null || rm -f plugin-skills/browser-automation
ln -s /opt/openclaw/.openclaw/plugin-runtime-deps/openclaw-2026.4.29-4eca5026e977/dist/extensions/browser/skills/browser-automation plugin-skills/browser-automation
ls -la plugin-skills/browser-automation/
# If ls lists files: git add plugin-skills/browser-automation && git commit && git push
```

**Long-term risk:** The path contains a version stamp (`openclaw-2026.4.29-4eca5026e977`). On the next
openclaw upgrade, this symlink will break again. A stable alias at `/opt/openclaw/current` pointing to
the active version should be created and used as the symlink target instead. Flag for Phase 9 parallel task.

**Rollback:** Delete the new symlink and recreate with the Windows path to restore prior (broken) state.
Not recommended — prior state was already broken.

**Mission Alignment Test (P10):** Fix advances Restore (browser skills can execute) and
Recognize (broken paths are visible before they silently fail production). Mission alignment confirmed.

---

### r14 AUDIT ENTRY — Prometheus scrape targets disabled (metrics endpoint confirmed absent) — 2026-05-13

| Field | Value |
|---|---|
| Date | 2026-05-13 17:34 UTC |
| Author | agent:MIKE + human:jeremiah-vanwagner |
| Change Type | CONFIG_FIX (Prometheus scrape config — dead targets commented out) |
| Status | APPLIED — commit `52d99f2f7ac2b75eba2e39aa8845de93fb836192` |
| Parent Entry | `r13-2026-05-12-inngest-v4-createfunction-migration` |
| Impacted Divisions | shared_runtime_ops, observability |
| Rollback Plan | Uncomment the two scrape jobs in `deploy/monitoring/prometheus/prometheus.yml` and run `curl -X POST http://127.0.0.1:9090/-/reload`. Only valid once openclaw upstream adds a real `/metrics` endpoint. |
| Rollback Tested | NO |
| Next Audit Due | 2026-08-13 |
| Entry ID | `r14-2026-05-13-metrics-endpoint-confirmed-missing` |

**Summary.** Live VPS probe confirmed that `http://127.0.0.1:18789/metrics` returns **404** — openclaw
does not expose a Prometheus-format metrics endpoint on the gateway port. Additionally, no other metrics
port was found listening (`:9090` and `:18790` both refused connection — Prometheus monitoring stack is
not running on VPS at all).

Probe results:
```
curl http://127.0.0.1:18789/metrics       → 404 (endpoint does not exist)
curl http://127.0.0.1:18789/healthz       → {"ok":true,"status":"live"} (gateway alive)
curl http://127.0.0.1:8788/healthz        → 401 (auth required — expected, not broken)
curl http://127.0.0.1:9090/metrics        → connection refused (Prometheus not running)
curl http://127.0.0.1:18790/metrics       → connection refused (no such port)
ss -tlnp | grep 18789                     → node PID 141406 listening (gateway confirmed)
ss -tlnp | grep 8788                      → node PID 93133 listening (webhook confirmed)
```

`deploy/monitoring/prometheus/prometheus.yml` had both `openclaw-gateway` (`:18789/metrics`) and
`openclaw-webhook` (`:8788/metrics`) scrape jobs. Both return 404. Prometheus would have logged
continuous scrape parse errors had it been running. Both jobs commented out with restoration
instructions. Prometheus self-monitoring (`localhost:9090`) retained for when stack is restarted.

Operator selected Option A (clean up config now, fix properly when upstream adds `/metrics`).

**Closes Open Items #4 and #5.**

**Impacted Files**
- `deploy/monitoring/prometheus/prometheus.yml` — two dead scrape jobs commented out (commit `52d99f2`)
- `REGGIE-STATE.md` — this entry; Section 2.3 and Section 5 updated

**Validation Steps Performed**
- `ss -tlnp` output reviewed — only `:18789` and `:8788` listening
- `curl` probes run against all candidate ports
- `git pull` confirmed clean fast-forward (34 files, commit `52d99f2`)
- `pnpm install --frozen-lockfile` ran clean in 2.6s post-pull
- Gateway `/healthz` confirmed live post-pull
- Channel Authority (P1) — not impacted
- DB1 source-of-truth (P2) — not impacted
- Declarative schema (P3) — not impacted
- Skill audit gate (P4) — not impacted
- Per-agent least privilege (P5) — not impacted
- Token hygiene (P6) — not impacted
- No public surface (P7) — unchanged
- Idempotency (P8) — not impacted
- HITL (P9) — not applicable
- Mission Alignment Test (P10) — confirmed: removes false confidence in observability
  (Recognize), stops Prometheus logging noise on next start (Restore), leaves commented
  restoration path for when upstream adds metrics support (Re-engage).

**Open Items NOT closed by this entry**
- `plugin-skills/browser-automation` Windows symlink — see r15
- Prometheus monitoring stack is not running — no observability on VPS until started
- When openclaw upstream adds a `/metrics` endpoint, uncomment the two scrape jobs and verify

---

### 7.0a AUDIT ENTRY — Inngest v4 createFunction migration — 2026-05-12

| Field | Value |
|---|---|
| Date | 2026-05-12 22:18 UTC |
| Author | agent:claude-code (opus-4.7) + human:jeremiah-vanwagner |
| Change Type | CODE_FIX (TypeScript build break / CI red 4 commits running) |
| Status | APPLIED, pushed to `main` as commit `579da3c` |
| Parent Entry | `r12-2026-05-10-canary-stabilize` |
| Entry ID | `r13-2026-05-12-inngest-v4-createfunction-migration` |

**Summary.** Two breaking changes in inngest v4: (a) `createFunction(config, trigger, handler)` collapsed to `createFunction(config, handler)` with triggers moved inside config as `triggers: [...]`; (b) `EventSchemas` removed from public exports. 36 createFunction call sites migrated total. `pnpm lint:ci` (59 warnings baseline), `pnpm typecheck` clean, `pnpm test` 239/239 passing.

**Outstanding debt:** `OpenClawEvent` union not wired into Inngest typing — handlers see untyped `event`. Re-introduce via `staticSchema<Record>()` after converting union to record-shaped event map. Note left at `inngest/client.ts:1287`.

---

### 7.0 AUDIT ENTRY — Canary stabilization (watchdog + telegram + heartbeat) — 2026-05-10

| Field | Value |
|---|---|
| Date | 2026-05-10 16:35 UTC |
| Author | agent:claude-code-ide + human:jeremiah-vanwagner |
| Change Type | CONFIG_INTEGRITY |
| Status | APPLIED |
| Entry ID | `r12-2026-05-10-canary-stabilize` |

**Summary (3 fixes):**
1. Removed `WatchdogSec=300` from `openclaw.service` — `Type=simple` + WatchdogSec causes SIGABRT every 5 min because openclaw dist lacks `sd_notify`. Anti-regression comment added.
2. Telegram kept disabled in repo (`channels.telegram.enabled: false`) until fresh BotFather token verified.
3. Heartbeat throttled to `every: "168h"` — default 30-min polling was burning ~$150/mo in idle Anthropic cache-write costs.

**Post-fix state:** gateway PID 101616 active, `WatchdogUSec=0`, `[gateway] ready` in 12s, no errors.

---

### 7.1 AUDIT ENTRY — Local rig model lineup + native-Ollama path repair — 2026-05-09

| Field | Value |
|---|---|
| Date | 2026-05-09 18:30 UTC |
| Author | agent:claude-code-ide + human:jeremiah-vanwagner |
| Change Type | CONFIG_INTEGRITY |
| Status | APPLIED |
| Entry ID | `r11-2026-05-09-local-models` |

**Summary.** `agents/main/agent/models.json` updated to real pulled lineup (`qwen3:8b`, `qwen3:14b`, `nomic-embed-text`). `docker-compose.override.yml` fixed to disable in-compose ollama service and point bot at native Windows Ollama via `host.docker.internal:11434`. `OLLAMA_MODELS` env var repaired from broken FAT32 `F:\` path to NTFS `C:\Users\JeremiahVanWagner\.ollama\models`.

---

## 8. UNVERIFIED RUNTIME CLAIMS

Do not state any of the following as fact without a fresh live-system check:

| Claim | Current status |
|---|---|
| Hostinger gateway and webhook services are healthy | **VERIFIED 2026-05-13** — `/healthz` returns `{"ok":true,"status":"live"}` |
| Grafana is receiving gateway metrics in live operation | **CONFIRMED FALSE** — openclaw has no `/metrics` endpoint. Prometheus not running. |
| Prometheus shows both gateway and webhook scrape targets as `UP` | **CONFIRMED FALSE** — monitoring stack not running; scrape targets disabled (r14) |
| `plugin-skills/browser-automation` symlink is valid on VPS | **CONFIRMED BROKEN** — points to Windows path (r15) |
| Live TJB and MSL auth health is `200 OK` today | Not re-run in this audit |
| Current Supabase row counts, ghost IDs, and business-schema presence | Not re-verified in this audit |
| Deployed webhook secret value on the live host is rotated and current | Not re-verified in this audit |

---

## 9. OPERATOR RULE

Before making runtime claims, prefer this order of trust:

1. Current repo evidence
2. Current validator/test output
3. Fresh live-system checks
4. Older reports and planning documents

If an older doc conflicts with this file, this file wins until a new audit proves otherwise.

---

## 10. DOCTRINE QUICK-REFERENCE

- **6R Doctrine** — Receive · Recognize · Respond · Record · Re-engage · Restore
- **P1** Channel Authority — REGGIE stands down 30 min after GHL AI Employee replies on a native channel
- **P2** Single source of truth = DB1 (`aagqvfwuixpxtdcrdxmv`); DB2 retired
- **P3** Declarative schema only; CI fails if `supabase db diff --linked` is non-empty
- **P4** Skill audit gate — `skills/.audit-manifest.json` required (Open Item #1)
- **P5** Per-agent least privilege (Open Item #2)
- **P6** Token hygiene — GHL PIT ≤90d, Supabase service key ≤180d, log all rotations
- **P7** No public internet surface for the gateway — localhost only, Caddy/Tailscale fronted
- **P8** Idempotent webhooks — `(provider, event_id)` UNIQUE INDEX
- **P9** Human-in-the-loop on payments / deletions / mass-broadcasts / account closure
- **P10** Mission Alignment — every initiative must shorten the distance between expressed intent and meaningful response

**Tier routing default:** Tier 2 (Ollama local). Promotion requires irreversible, leaves-TJB-surface, or 8K+ context. Tier 0 (Opus) requires written `TIER0_SPEND` audit entry.
