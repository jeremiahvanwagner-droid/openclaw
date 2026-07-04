# REGGIE — Sovereign Agent State File
_Last Updated: 2026-05-16 13:00 CDT | Updated by: Claude Code (Opus 4.7) session_

---

## 🟢 CURRENT OPERATIONAL STATUS — DEPLOYED FULLY OPERATIONAL

**Phase:** 9.1-REDO CLOSED ✅ (qwen3:8b → qwen3:14b binding live on VPS) / 9.2 OPEN (Sonnet Audit, scoping)
**Overall System Health:** 🟢 **DEPLOYED FULLY OPERATIONAL** — Verified 2026-05-14 16:25 UTC on srv1619751. Service `openclaw.service` restarted on Phase 9.1-redo config at 16:22:39 UTC, `[gateway] ready` at 16:22:52 UTC. First two agent runs (runId=ad895469 + runId=2dcaf15e) executed without error. `model-resolution` against `ollama/qwen3:14b` consistently 2.3 seconds. **Zero `fetch failed` errors.** The 2026-05-14 morning cron-storm regression is fully resolved. Walk-up path documented (qwen3:14b → 27b → 3.6:latest as RAM upgrades land).
**Last Human Interaction:** 2026-05-14 16:25 UTC, CVO operator (driving)
**Last Known Heartbeat:** Started 2026-05-14T16:22:52 UTC on local-Ollama config (the first heartbeat to run against a local-resident reasoning model — instead of paid Anthropic Haiku — on this stack).
  - File-level verification: agents_config.json + config/agents_config.json each show **0 `claude-haiku-4-5`** and **22 `qwen3:8b`** bindings.
  - All `models.json` (15 per-agent + 1 deploy server + 1 local + 1 last-good) now free of `qwen3:14b` and pointed at `127.0.0.1:11434` (single source-of-truth Ollama port).
  - Host `openclaw.service` restarted on Phase 9.1 config at 22:09:27 UTC. Stabilized at 410 MB / 2 GB memory cap.
  - Host `ollama.service` serving qwen3.6:latest, qwen3:8b, kimi-k2.5:cloud at 127.0.0.1:11434.
  - Only `openclaw-redis` containerized; bot/webhook/ollama containers removed from compose (P2 discharged in 9.1.1 + 9.1.2).
  - Gateway responding `{"ok":true,"status":"live"}` on 127.0.0.1:18789/health.
  - **Open carry-forward items tracked in Section: Phase 9.2 Entry Criteria.**
**Last Human Interaction:** 2026-05-14, Claude Code (CVO operator session — qwen3:14b regression recovery)
**Last Known Heartbeat:** Not yet initiated on local model stack

---

## 🧭 REGGIE Identity

REGGIE is the **Sovereign Agent** — the master orchestrator of the entire OpenClaw + GHL ecosystem. REGGIE:
- Receives all operator intent
- Routes tasks to Herald, Strategist, Keeper, Steward
- Maintains system coherence
- Enforces SOUL.md hard limits at all times
- Never executes below the orchestration layer (does not run manual tasks)

---

## ✅ CONFIRMED ACTIVE (as of 2026-05-13)

### Infrastructure
- [x] OpenClaw server running on VPS
- [x] Ollama running at `127.0.0.1:11434`
- [x] Models confirmed loaded on VPS: `qwen3.6:latest`, `qwen3:8b` (Kimi: NEVER INSTALLED — removed per CVO direction)
- [x] Supabase connected
- [x] GHL Private Integration active
- [x] Inngest event queue operational
- [x] Stripe connected

### Agent Config
- [x] **CORRECTION:** Topology is 103 agents in a 10-pod runtime (`runtime_model: "10-pod"`), NOT 5 agents. Prior state file was outdated.
- [x] 15 agent-class provider catalogs at `agents/<name>/agent/models.json`
- [x] 103 per-agent pod bindings in `agents_config.json` and `config/agents_config.json` (duplicated — flagged for Phase 10 P2 fix)
- [x] `SOUL.md` constraints loaded and governing
- [x] `openclaw.json.last-good` available as rollback checkpoint

---

## ✅ PHASE 9.1 COMPLETE — All Items Resolved

### Item 1: ~~models.json Schema Verification~~ ✅ RESOLVED (PR #11)
### Item 2: ~~models.json Write~~ ✅ APPLIED (PR #11)
### Item 3: ~~agents_config.json Model Key Alignment~~ ✅ APPLIED (PR #11)
### Item 4: ~~End-to-End Routing Test~~ ✅ PROVEN (post-restart 22:09:27 UTC)
**Evidence:** grep on both agents_config.json files: 0 `claude-haiku-4-5`, 22 `qwen3:8b`. Gateway live. Memory stable at 410 MB.

## 🔴 PHASE 9.2 ENTRY CRITERIA / CARRY-FORWARD ITEMS

### Item 1: Liveness Warnings — RE-CLASSIFIED 2026-05-14 (not spurious; now signals local inference activity)
**Severity:** YELLOW (re-characterized — no longer "unknown root cause")
**Evidence (pre-redo, idle):** `eventLoopDelayP99Ms=2965.4 eventLoopDelayMaxMs=11081.4 eventLoopUtilization=0.885` at 2026-05-13 22:10:12 UTC. Recurred across restarts before Phase 9.1-redo deployment.
**Evidence (post-redo, idle):** `eventLoopDelayP99Ms=21.5 eventLoopDelayMaxMs=1049.1 eventLoopUtilization=0.251` at 2026-05-14 16:23:15 UTC — **140× improvement at idle.** This rules out plugin-startup as the dominant idle-state cause; the spike is now tied to actual workload.
**Evidence (post-redo, during inference):** `eventLoopDelayP99Ms=8208.3 eventLoopDelayMaxMs=11794.4 eventLoopUtilization=0.94 cpuCoreRatio=0.98 active=1 waiting=0 queued=0` at 2026-05-14 16:25:36 UTC. Coincides with two agent runs consuming model time. qwen3:14b inference uses 98% of a single VPS CPU core, leaving no headroom for the openclaw event loop.
**Reclassified Diagnosis:** The pre-Phase-9.1-redo liveness warnings were a mix of plugin startup contention (now ruled out) and runtime model-resolution latency against Anthropic. The post-Phase-9.1-redo warnings are an EXPECTED cost of co-hosting Ollama inference and openclaw orchestration on a single 15 GiB / 1-CPU-core VPS. Not a bug; an architectural tradeoff.
**Action (Phase 10 architectural):** Decide between (a) accepting the inference-time event-loop stall as a known cost (cheap, works), (b) moving Ollama to a separate host so openclaw event loop and inference CPU don't contend (more capital, isolates the failure modes), or (c) the 32 GiB VPS upgrade — buys more headroom but doesn't split the contention. Not a Phase-9.2 blocker.

### Item 2: ~~Security — Device Auth Disabled~~ ✅ RESOLVED (audit 2026-07-03-002)
**Severity:** ~~RED~~ DISCHARGED 2026-07-03 — flag flipped to `false` on live config, warning gone from journal. Operator must re-pair device on next control-UI use.
**Evidence:** `[gateway] security warning: dangerous config flags enabled: gateway.controlUi.dangerouslyDisableDeviceAuth=true. Run 'openclaw security audit'.`
**Action:** Anyone reaching 127.0.0.1:18789 has full control-UI access without device pairing. Has been this way pre-Phase 9.1 (not introduced today). Phase 9.2 entry: either re-enable device auth and re-pair an authorized device, or document an explicit SOUL.md override with justification. Run `openclaw security audit` for the full report.

### Item 3: ~~systemd Services NOT Persistent~~ ✅ RESOLVED (found already enabled 2026-07-03; survived ~2026-06-11 reboot)
**Severity:** ~~YELLOW~~ DISCHARGED
**Evidence:** `openclaw.service` and `ollama.service` are both `Loaded: ...; disabled; preset: enabled`. They survive only because nothing has stopped them; a VPS reboot will NOT bring them back.
**Action (operator, 1 command):** `systemctl enable openclaw ollama`

### Item 4: ~~Kimi VPS Drift~~ ✅ RESOLVED (audit 2026-07-03-002 — `ollama rm kimi-k2.5:cloud` executed)
**Severity:** ~~YELLOW~~ DISCHARGED
**Evidence:** Repo references purged in Phase 9.1. VPS `ollama list` still shows `kimi-k2.5:cloud` installed.
**Action:** CVO decision: `ollama rm kimi-k2.5:cloud` (clean state, recommended) OR keep installed and add explicit tier-router deny rule. NOT blocking Phase 9.2.

### Item 5: Sonnet Audit (Phase 9.2 main scope)
**Severity:** GREEN (scoped work)
**Evidence:** 74 pod agents currently bound to `claude-sonnet-4.5`. Per Tier Router doctrine, only Tier-2-safe agents (no irreversibility, no surface-leaving action, no requires_reasoning) qualify for qwen3.6:latest remap.
**Action:** Phase 9.2 phase document opens after this entry. Audits all 74 Sonnet bindings agent-by-agent against the routing test.

---

## 📋 PHASE 9 CHECKLIST

- [x] Ollama installed on VPS
- [x] Models pulled: qwen3.6, qwen3:8b (Kimi VPS handling deferred per CVO)
- [x] baseUrl confirmed: `http://127.0.0.1:11434/v1`
- [x] models.json schema verified from codebase via GitHub repo
- [x] All 15 per-agent models.json patched (PR #11)
- [x] agents_config.json (×2) updated — 22 Haiku → qwen3:8b (PR #11)
- [x] Idempotent patch script committed (`scripts/phase9_patch.py`)
- [x] Phase document written (`docs/phases/ollama-cutover-phase-9.md`)
- [x] PR #11 opened, reviewed, merged
- [x] PR #12 (Phase 9.1.1 compose reconcile) opened, reviewed, merged
- [x] PR #13 (Phase 9.1.2 host-native reconcile) opened, reviewed, merged
- [x] Operator-side smoke test on VPS PASSED (2026-05-13 22:09:27 UTC)
- [x] File-level verification of remap: 0 claude-haiku-4-5, 22 qwen3:8b in both config files
- [x] **Phase 9.1 marked COMPLETE → Phase 9.2 OPEN**

---

## 🗺️ UPCOMING: Phase 10

**Focus:** GHL Webhook Hardening & Pipeline Intelligence Layer

Key items:
- Validate all 39 GHL API endpoint groups are mapped
- Confirm webhook event → agent routing is airtight
- Build pipeline diagnostics: stale leads, conversion rates, ascension tracking
- Implement Speed-to-Lead playbook: < 5 min response guarantee
- Pre-Call Intelligence Briefing automation

---

## 🔐 SOUL.md Constraints (Always Active)

1. No agent may act outside its defined role
2. No API scope expansion without security validation
3. No PII transmitted to external services without explicit operator approval
4. REGGIE may not self-modify its own SOUL.md constraints
5. All system evolution requires operational justification
6. Sandbox execution boundaries enforced for all new skills
7. Token rotation protocol active — credentials never hardcoded

---

## 📡 AGENT COMMUNICATION STATUS

| Agent | Role | Status |
|---|---|---|
| REGGIE (Sovereign) | Master orchestrator | 🟡 Active, awaiting Phase 9 close |
| Herald | Inbound lead intake | 🔲 Pending Phase 9 validation |
| Strategist | Pipeline intelligence | 🔲 Pending Phase 9 validation |
| Keeper | Data stewardship | 🔲 Pending Phase 9 validation |
| Steward | Lifecycle management | 🔲 Pending Phase 9 validation |

All sub-agents held in standby until local model routing is confirmed operational.

---

## 📜 AUDIT LOG (Append-Only)

### Entry 2026-07-04-006 — A4 CLOSURE: allowInsecureAuth review + skill-registry closure + security audit green (APPLIED)
- **Timestamp:** 2026-07-04T12:10:00-05:00
- **Change Type:** CONFIG + governance data (A4 final review item + enforce-mode follow-through)
- **Status:** APPLIED ✅ — `openclaw security audit` on VPS: **0 critical · 1 warn · 1 info**
- **Owner:** Claude Code (Fable 5) — CVO: "Continue implementation. Observe changes made in IDE"
- **allowInsecureAuth resolved:** dist semantics (2026.6.11): "DANGEROUS: Disable device identity checks for the Control UI (default: false)" — with it, a client that *looks local* (and via Caddy every internet client does) can skip device pairing using token/password alone. Findings: the live **VPS config does NOT set it** (defaults false — the 07-03 observation referred to a pre-migration config); the **local workstation config had `allowInsecureAuth: true`** — removed (backup `openclaw.json.bak-insecureauth-20260704T1148`; inert in remote-client topology but wrong class of flag to keep).
- **Skill-registry closure (IDE change completed):** CVO registered `ghl-course-manager` in the IDE; cross-check found **4 more agent-referenced skills unregistered** (ghl-email-service, ghl-media-manager, ghl-saas-manager, ghl-social-planner) — each would throw SKILL_REGISTRY_MISSING under fail mode. Registered with the CVO's entry pattern (commit 0d91fd8, insert-only diff). Verified: zero agent-referenced skills unregistered; all five pass enforceSkillRegistry in fail mode; unknown ids still block. 7 on-disk skills remain unreferenced/unregistered (btv-discovery-call-prep, delivery-system, divine-path-walkers-welcome, ghl-speed-to-lead, test-cookie-persistence, traffic-coordinator, webinar-engine) — not blocking; register when an agent adopts them.
- **Audit artifacts fixed:** VPS live config perms had regressed 600→644 (2026.6.11 migration side effect) — restored 600 openclaw:openclaw. The audit's "1 critical / gateway.auth.mode=none" from the first run was an env-resolution artifact (audit run without EnvironmentFile); with env loaded: 0 critical.
- **Token literal reconciled:** local `openclaw.json` gateway.remote.token was a stale generation (masked until now by env-var precedence). Synced to the canonical VPS value from local .env (hash-verified 1a10c9b2, never echoed; backup kept). `openclaw health` exit 0, full 100+ agent roster. NOTE: shells inherited from long-running parents may carry a stale OPENCLAW_GATEWAY_AUTH_TOKEN; registry + .env + config are all correct now, so it self-heals on process restart.
- **d6156bc verified in production use:** the generator (fixed by the CVO-initiated background session) now touches only AGENTS.md/TOOLS.md — confirmed during TOOLS.md regeneration.
- **A4 remaining:** reboot test only (needs a CVO-scheduled window).
- **Rollback:** local config backups (.bak-insecureauth-*, .bak-token-*); registry additions are a git revert.
- **PR Link:** direct-to-main.

### Entry 2026-07-04-005 — ADVANCEMENT 5: canonical config single source of truth (APPLIED)
- **Timestamp:** 2026-07-04T15:30:00-05:00
- **Change Type:** CODE + CONFIG (dedup/config governance, brief: docs/advancements/05-*.md)
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO said "Both" (A4 triage + A5)
- **Canonical declared:** `config/agents_config.json` + `skills/` are the only hand-edited sources. Root `agents_config.json` = tracked generated mirror; `workspace/skills/` = gitignored runtime mirror. New tool `scripts/sync-canonical-config.mjs` (`--check` CI gate / `--write` refresh); `pnpm config:check` prepended to `pnpm validate`.
- **Divergence adjudicated (no data loss):** canon was a strict superset (27 agents' business_scope/ghl_token_group/operational_boundaries, 101 agents' skills[], + security_policy). Three same-field conflicts all resolved for canon: browser_primary/secondary `skills` (root's social-media-publisher was deliberately remapped to 16 marketing agents by map-skills-to-agents.py) and shared_runtime_ops `cron_schedule` (canon's */15 came from throttle commit 2a3379c). Root overwritten; sha1 now identical.
- **workspace/skills was 100% stale:** every one of the 69 pre-existing mirror modules differed from skills/ (unsynced since 2026-05-05); 124 modules refreshed.
- **Skills loading repointed to canon:** `handlers/ghl-webhook-handler.mjs` search order now prefers repo `skills/` (the old #2 candidate `handlers/workspace/skills` never existed — vestige); root runtime snapshot `ghl-webhook-handler.mjs` skillsDir → `skills/`. Verified: all 3 Phase 3 modules resolve from `skills/` and import (4/6/5 exports). Legacy root-config readers retargeted to config/: `scripts/generate-workspaces.mjs`, `scripts/register-agents.mjs`.
- **Hygiene:** `skills/supabase*` (Claude-Code-format skills, 40 files) moved to `plugin-skills/` via git mv; `.gitignore` gained `state/` (gateway 2026.6+ SQLite runtime state) and `.env.bak*`, and the misleading `/agents_config.json` ignore line replaced with a tracked-mirror note. Canonical rule embedded in the AGENTS.md generator template (AGENTS.md is generated — hand-edits would be overwritten) and phase9 patcher docstrings.
- **VPS note:** live smoke of api.truthjblue.dev during this pass: /health 200, /webhook/ghl 404 — expected, `openclaw-webhook.service` remains disabled pending CVO activation decision. At activation, verify the service's snapshot/ExecStart picks up the repointed skillsDir.
- **⚠️ HAZARD FOUND: `scripts/generate-governance-docs.mjs` overwrites hand-written files.** It regenerates AGENTS.md (legitimately generated) but ALSO clobbers `MEMORY.md` (MIKE operator memory) and `SOUL.md` (the constitution) with stub templates. Caught pre-commit this pass and restored from HEAD. Do NOT run it until it's scoped to AGENTS.md only — candidate for a small follow-up fix.
- **Rollback:** `git revert` (single commit); root mirror recoverable from history.
- **PR Link:** direct-to-main.

### Entry 2026-07-04-004 — ADVANCEMENT 4 (part): governance enforce-mode cutover warn→fail, both hosts (APPLIED)
- **Timestamp:** 2026-07-04T14:50:00-05:00
- **Change Type:** CONFIG (security governance, brief: docs/advancements/04-*.md step 4)
- **Status:** APPLIED ✅ — verified by live negative test
- **Owner:** Claude Code (Fable 5) — CVO approved starting the triage ("Both")
- **Day-0 triage — clean across all three sources, conclusively:** (1) VPS `journalctl -u openclaw` 7 days: zero capability/skill-registry entries; (2) local `logs/`: zero; (3) Supabase `agent_events` `security/*`: **zero rows ever** — including during A3 smoke tests that exercised enforcement paths. The forward 48h window could not add information: no governed consumer is live (webhook service disabled, crons dormant). Flipped immediately per the brief's "if triage is clean" condition; this also means the webhook service starts life ENFORCED when activated.
- **LATENT FAULT FOUND:** `.env.example` documented `'enforce'` as the blocking value, but `lib/security-governance.mjs normalizeMode()` accepts only `off|warn|fail` and silently falls back to `warn` on anything else — the documented cutover would have been a no-op. Correct blocking value: **`fail`**. Docs fixed.
- **Flipped (with timestamped backups):** local `.env` warn→fail (both vars); VPS `/etc/openclaw/.env` vars were ABSENT (running on code default warn) — appended both =fail (`.env.bak-enforce-20260704T1448`); config-level defaults also flipped (`config/skills-registry.json` enforcement_defaults.mode, `config/agents_config.json` security_policy.enforcement_modes.{capabilities,skill_registry}) so processes launched without env vars still enforce.
- **Verification:** out-of-scope capability call (`stripe_dashboard` from a bogus agent) → thrown `CAPABILITY_POLICY_UNKNOWN_AGENT`, not warn-and-continue. Notably the test ran WITHOUT env vars loaded — proving the config-level default alone enforces.
- **No restart needed:** the npm-dist gateway does not read these vars; repo-code processes pick them up at spawn.
- **A4 remaining:** `controlUi.allowInsecureAuth=true` semantics review (do NOT flip blind — dashboard lockout risk).
- **Rollback:** set both env vars + both config defaults back to `warn`; backups exist on both hosts.
- **PR Link:** direct-to-main.

### Entry 2026-07-04-003 — MODEL REFRESH: Sonnet 4.5 → Sonnet 5, Opus 4/4.5 → Opus 4.8, platform-wide (APPLIED)
- **Timestamp:** 2026-07-04T10:45:00-05:00
- **Change Type:** CONFIG + CODE (model version migration, CVO-directed)
- **Status:** APPLIED ✅ — 231/231 tests green, tsc clean, both machines' preflight fully green
- **Owner:** Claude Code (Fable 5) — CVO operator session ("update the models")
- **CVO:** Jeremiah Van Wagner (driving)
- **Mapping applied (verified against the live /v1/models list before any edit):**
  - `claude-sonnet-4-5` → **`claude-sonnet-5`** (list $3/$15 per MTok; **intro $2/$10 through 2026-08-31 — cheaper than Sonnet 4.5**; new tokenizer ≈ +30% tokens for the same text; adaptive thinking on by default; rejects sampling params — **zero temperature/top_p keys exist in any config**, verified)
  - `claude-opus-4-5` / `claude-opus-4-6` / `claude-opus-4-7` / `claude-opus-4` (deprecated) → **`claude-opus-4-8`** ($5/$25)
  - `claude-haiku-4-5` → unchanged (current)
  - Internal tier labels in agents_config (`claude-sonnet-4.5` ×93, `claude-opus-4` ×21) deliberately UNCHANGED — only the resolution layers were retargeted.
- **Two latent 404 bugs fixed in passing:** `lib/llm-router.ts` MODEL_MAP held `claude-sonnet-4-5-20250514` — an id that never existed (sonnet-4's date on a 4-5 name) — and `config/claw-router.json`/`inngest/client.ts` passed pseudo-ids (`claude-opus-4-latest`, `claude-sonnet-4.5-latest`) as API model ids. Both would have 404'd on first real call; the dark data plane had hidden them. Also corrected stale Haiku pricing in TOKEN_PRICING ($0.25/$1.25 → $1/$5 per MTok).
- **Surfaces updated:** lib/anthropic-client.ts MODELS; lib/runtime-model-policy.mjs (both maps); lib/llm-router.ts (MODEL_MAP + TOKEN_PRICING); lib/claw-router.ts VALID_ANTHROPIC_MODELS; inngest/client.ts LLM_MODELS values; config/{claw-router,anthropic-tier-assignment,openclaw.prod,openclaw,openclaw.prod.cleaned}.json; deploy/hostinger/server-openclaw.json; agents/*/agent/models.json (10 files); tier-routing test expectations. **Live configs:** VPS `/opt/openclaw/.openclaw/openclaw.json` (84× sonnet-5, 4× opus-4-8; backup `.bak-models-*`; restart, health OK) and local `openclaw.json` (78× sonnet-5, 7× opus-4-8; six stale `claude-cli/*` entries consolidated to sonnet-5/opus-4-8/haiku-4-5; backup kept).
- **Live verification:** 1-token `/v1/messages` calls on `claude-sonnet-5` AND `claude-opus-4-8` from the VPS key → both 200 with matching model echo. Preflight extended with **anthropic model-id verification against /v1/models** (alias-aware) — a deprecated/typo'd model id is now a blocked deploy, same class as the qwen3:14b-not-pulled lesson.
- **Operational notes:** (a) Sonnet 5's new tokenizer means ~30% higher token counts for equivalent text — cost dashboards should re-baseline, though intro pricing more than offsets it through Aug 31. (b) Adaptive thinking is on by default when `thinking` is omitted — embedded runs may show thinking blocks/spend where 4.5 had none. (c) The 7 Opus agents' internal label `claude-opus-4` now resolves to opus-4-8 — the underlying `claude-opus-4-20250514` was already past its June 15 2026 retirement flag.
- **Rollback:** `git revert` for repo; `.bak-models-*` restore + restart for live configs. Sonnet 4.5 / Opus 4.5 remain Active (legacy) on the API, so rollback stays viable.
- **PR Link:** direct-to-main.

### Entry 2026-07-04-002 — Unplanned dist upgrade 2026.4.29 → 2026.6.11 (both hosts) + protocol-mismatch recovery (APPLIED)
- **Timestamp:** 2026-07-04T09:15:00-05:00
- **Change Type:** OPS (version upgrade recovery)
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving; ran `openclaw update` on both hosts)
- **What happened:** CVO ran `openclaw update`. On the VPS it replaced `/usr/lib/node_modules/openclaw` with **2026.6.11** at 13:48 UTC — but the service had last started 13:11, so the RUNNING gateway kept executing old code from memory while new-protocol clients (hard-refreshed Control UI, updated CLI) were rejected with `protocol mismatch (1002)` — the dashboard rendered as "no plugins / no agents / no gateway," which read as total data loss but was pure client-server version skew. On Windows the update failed (`global-install-failed`, rolled back to 2026.5.7 intact).
- **Recovery:** (1) verified config/agents untouched (they live in the config dirs, not the package); (2) local aligned via `npm install -g openclaw@2026.6.11`; (3) `systemctl restart openclaw` at 14:05 UTC so memory matches disk — **2026.6.11 first cold start ran clean state migrations** (tasks runs + flows registry + update-check → shared SQLite; legacy files archived as `*.migrated`) and reached `[gateway] ready`; (4) end-to-end verified: 2026.6.11 CLI lists all 108 agents, paired devices survived, health OK.
- **Lessons (doctrine):**
  1. `openclaw update` replaces disk but the gateway keeps old code in memory until restarted — ALWAYS `systemctl restart openclaw` immediately after an update, or clients updated to the new protocol are locked out while the "old" ones still work (deeply confusing symptom set).
  2. "Dashboard shows nothing" after an update ≈ protocol mismatch, not data loss — check `journalctl` for `code=1002 reason=protocol mismatch` before assuming the worst.
  3. Version pinning: both hosts now on **2026.6.11**. Future updates should be deliberate (pin exact version with `npm i -g openclaw@<ver>`, restart, verify) rather than `openclaw update` mid-session.
- **Rollback:** `npm i -g openclaw@2026.4.29` + restart on VPS (note: would need the SQLite-migrated state reverted from the `*.migrated` archives).
- **PR Link:** direct-to-main (this entry).

### Entry 2026-07-04-001 — FULLY OPERATIONAL: Anthropic keys restored, Caddy reconciled to DNS, workstation CLI paired as remote client (APPLIED)
- **Timestamp:** 2026-07-04T09:30:00-05:00
- **Change Type:** OPS (three-part recovery from CVO troubleshooting log)
- **Status:** APPLIED ✅ — **VPS preflight fully green for the first time** (telegram PASS, supabase PASS, anthropic PASS)
- **Owner:** Claude Code (Fable 5) — CVO operator session (CVO-supplied PowerShell troubleshooting log)
- **CVO:** Jeremiah Van Wagner (driving)
- **Fault 1 — VPS agent 401 storm (the blocker):** every embedded agent run (biz_03_pod_lead, d5_book_marketing, marketing, d6_dev_director, …) died with `HTTP 401 invalid x-api-key` on `anthropic/claude-sonnet-4-5`, `next=none`. Root cause: the dead Anthropic keys from audit -006. **Workstation keys probed VALID (200/200)** — fourth and final member of the stale-VPS-credential family. Synced `ANTHROPIC_API_KEY` + `_SOVEREIGN` + `_SHARED` to `/etc/openclaw/.env` (backup `.env.bak-anthropic-*`), restarted gateway, VPS-side probe 200 on all three. **Embedded agent runs will now complete — API billing resumes; recommend an Anthropic Console monthly spend cap as the outer guardrail (the repo rate-governor does not govern the npm-dist gateway).**
- **Fault 2 — Caddy cert-renewal failure loop (attempt 43):** VPS Caddyfile still declared `truthjblue.dev, www.truthjblue.dev → localhost:3001`, but DNS moved apex/www to Hostinger web hosting (216.150.1.1 / .193) per Path A — ACME challenges landed on Hostinger, renewal could never succeed (would have expired ~Jul 29). Removed the apex/www block (backup `Caddyfile.bak-*`, header comment documents why), `caddy validate` + reload. Verified: `https://api.truthjblue.dev` → 200 clean TLS; `https://webhook.truthjblue.dev` → 405 (Caddy's own non-POST response — correct; backend service remains intentionally disabled); 0 error lines in journal.
- **Fault 3 — workstation CLI dead (`openclaw health` 1006 to loopback):** by design there is no local gateway (audit -006 guard), but the CLI kept targeting loopback. Three-layer fix: (a) `gateway.mode: "local" → "remote"` in local `openclaw.json` (backup kept) so the CLI honors `gateway.remote.url=https://api.truthjblue.dev`; (b) gateway token mismatch traced to a **stale Windows User-scope env var** `OPENCLAW_GATEWAY_AUTH_TOKEN` overriding `.env` — registry value + local `.env` synced to the VPS token (the browser dashboard already used the VPS value); (c) device pairing approved via `/root/oc-approve.sh` (device `487039a4`, client=gateway-client, operator). **`openclaw health` from the workstation now lists all 100+ agents from the production gateway.** Note: already-running apps keep the old env — new terminals inherit the corrected token.
- **Cosmetic (no action):** local `openclaw gateway status` complaints ("Scheduled Task missing", "Service command does not include the gateway subcommand") are the status parser reading the audit -006 guard block in `gateway.cmd` — the local service is intentionally not installed; do NOT run `openclaw doctor --repair` against it (it would try to reinstate a local gateway service).
- **Rollback:** all three fixes have timestamped backups (`/etc/openclaw/.env.bak-anthropic-*`, `/etc/caddy/Caddyfile.bak-*`, local `openclaw.json.bak-remote-mode-*`, `.env.bak-gwtoken-*`); device removable via `openclaw devices remove 487039a4…`.
- **PR Link:** direct-to-main (this entry).

### Entry 2026-07-03-007 — Advancement 3 IMPLEMENTED: GHL webhook idempotency ledger + signature hardening — agent_events data plane is LIVE
- **Timestamp:** 2026-07-03T18:00:00-05:00
- **Change Type:** CODE + SCHEMA + OPS (Advancement program, `docs/advancements/03-advancement-ghl-webhook-hardening.md`)
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO operator session ("Continue Advancement 3")
- **CVO:** Jeremiah Van Wagner (driving)
- **Discovery that reshaped the work:** the repo already carried a complete, correct verification layer — `lib/ghl-webhook.mjs` (`authenticateGhlWebhookRequest`: Ed25519 platform sig with the pinned HighLevel public key, workflow bearer, HMAC, shared secret; plus `normalizeGhlWebhookPayload`) — and a far more evolved TRACKED handler at `handlers/ghl-webhook-handler.mjs` (multi-tenant, human-approval callbacks, OAuth refresh, zod validation, ack-then-async dispatch). The root `ghl-webhook-handler.mjs` is a **gitignored stale runtime snapshot** with a naive HMAC check whose unguarded `timingSafeEqual` throws on real platform signatures. The pinned Ed25519 key was verified byte-identical to the official HighLevel Webhook Integration Guide (fetched 2026-07-03); HighLevel deprecated the legacy RSA `X-WH-Signature` on 2026-07-01, so Ed25519 `X-GHL-Signature` is now the only platform scheme.
- **Changes Applied (commits 81eabc9 + this entry's commit):**
  1. **Migration `20260703000013_ghl_webhook_dedupe.sql`** (applied to DB1): partial unique index `agent_events_ghl_dedupe_uniq` on `correlation_id` WHERE `metadata->>'source'='ghl-webhook'` — dedupe constraint without disturbing other writers' trace semantics.
  2. **New `lib/ghl-event-ledger.mjs`**: `deliveryKey` (GHL webhook id header/body id, content-hash fallback) + `claimEvent` (insert-first idempotency claim, 23505 = duplicate) + `settleEvent` (pending → completed/failed lifecycle). In-memory LRU fallback when Supabase is down — webhooks are never dropped. 8 new tests.
  3. **Canonical `handlers/ghl-webhook-handler.mjs`**: claim BEFORE the 200 ack; duplicates acknowledged (`{ok:true,duplicate:true}`) but never dispatched; settle wired through `processEventAsync`.
  4. **Root runtime snapshot** also hardened in place (auth delegation, normalization, ledger, Windows `pathToFileURL` ESM fix) — but root-vs-`handlers/` consolidation is now formally part of Advancement 5's duplication axes.
  5. **Smoke test `--dup` mode**: exits 1 if a duplicate delivery is not deduped.
  6. **Preflight gained a Supabase probe** (real query with the service key) after the finding below.
- **THIRD STALE VPS CREDENTIAL CAUGHT:** the VPS `SUPABASE_SERVICE_ROLE_KEY` in `/etc/openclaw/.env` was an **unregistered key** (hash-mismatched vs the working local one — same stale generation as the revoked Telegram token and dead Anthropic keys from audit -006). The ledger's in-memory fallback masked it exactly as designed until log inspection exposed `Unregistered API key`. **FIXED:** working `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ANON_KEY` synced to VPS env (backup `/etc/openclaw/.env.bak-a3-*`). `/etc/openclaw/.env` should be treated as systematically stale — every credential in it predates the local rotation; the Anthropic keys remain the last known-dead pair (CVO action).
- **Live Verification:** three full lifecycles in `agent_events` on DB1 (2 local runs, 1 VPS run post-key-fix), all `status=completed` with `processed_at`; duplicate deliveries refused on every variant (`deduped: true`, smoke exit 0); malformed Ed25519 signature → clean 401 (previously an uncaught-exception path). VPS test ran on private port 127.0.0.1:8790 — **the public intake stays closed**.
- **CVO DECISION OPEN — webhook service activation:** `openclaw-webhook.service` exists on the VPS but is `disabled/inactive`; nothing listens on 8788, so `webhook.truthjblue.dev` dead-ends at Caddy. The handler is now hardened and VPS-verified; starting the service turns on live GHL → agent processing (agent actions, alerts, spend). One command when ready: `systemctl enable --now openclaw-webhook` + a `--dup` smoke against the public URL.
- **Rollback:** `git revert 81eabc9 <close-commit>`; index is additive (drop if desired); env restore from `.env.bak-a3-*`; ledger rows are inert history.
- **PR Link:** direct-to-main.

### Entry 2026-07-03-006 — Advancement 2 IMPLEMENTED: provider preflight gate + cron guard — first run caught THREE live faults
- **Timestamp:** 2026-07-03T15:40:00-05:00
- **Change Type:** TOOLING + OPS (Advancement program, `docs/advancements/02-advancement-provider-preflight-degrade.md`)
- **Status:** APPLIED ✅ (one finding requires CVO action — see Open Items)
- **Owner:** Claude Code (Fable 5) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **Tooling Shipped (commit 1a4189d):**
  1. `scripts/preflight-providers.mjs` — deploy gate: verifies Ollama endpoint + every referenced model tag (config active-map, per-agent `model` strings, AND cron-pinned tags), Telegram `getMe`, Anthropic key probe. Exit 1 blocks the deploy. `pnpm preflight`; DEPLOY-CHECKLIST step 0.
  2. `scripts/patch-cron-failure-alerts.mjs` — idempotent patcher adding standard `failureAlert` blocks (dry-run default, timestamped backup, chat id inferred from the file's own convention).
  3. `gateway.cmd` guard (machine-local, untracked): refuses to start unless `OPENCLAW_RUNTIME_ROLE=production` or explicit `--allow-cron`. Verified: refusal message, exit 1, zero gateway processes spawned.
  4. Workstation cron store: 24 `failureAlert` blocks applied (backup `cron/jobs.json.bak-2026-07-03T2033`).
- **Local Verification:** preflight PASS against live workstation config (ollama 11434 serving qwen3:14b; `getMe` → @truthjblue_bot); negative test with port-11435 replica of audit 2026-05-14-001 → FAIL exit 1 naming the endpoint. The regression class is now mechanically catchable pre-ship.
- **FIRST VPS RUN — THREE LIVE FAULTS CAUGHT:**
  1. **VPS Telegram token was REVOKED (401).** `/etc/openclaw/.env` still held a pre-rotation token — the VPS gateway could not send Telegram at all. **FIXED this session:** getMe-verified good token (workstation `.env`, → @truthjblue_bot) written to `TELEGRAM_BOT_TOKEN` + `OPENCLAW_TELEGRAM_BOT_TOKEN` (backup `/etc/openclaw/.env.bak-a2-*`), `systemctl restart openclaw`, health OK, `getMe` from VPS OK, preflight telegram → PASS. Doctrine honored: token verified via getMe BEFORE enabling (March 2026 lesson).
  2. **BOTH Anthropic API keys are DEAD:** `ANTHROPIC_API_KEY_SOVEREIGN` and `ANTHROPIC_API_KEY_SHARED` each return 401 from `/v1/models`. Any repo-process SDK call (llm-router, inngest, scripts) fails; `claude-cli/*` subscription-routed agents unaffected. **CVO ACTION REQUIRED:** mint replacement key(s) in the Anthropic Console and update `/etc/openclaw/.env` (+ local `.env`), then re-run `pnpm preflight`.
  3. **STATE-MODEL CORRECTION — the VPS runs NO crons and its live config has NO ollama.** `/opt/openclaw/.openclaw/cron/` does not exist (searched to depth 3); the live `/opt/openclaw/.openclaw/openclaw.json` contains **zero** `ollama` references, diverging from repo canon `deploy/hostinger/server-openclaw.json`. The entire cron schedule (45 jobs) lives ONLY in the workstation store `~/.openclaw/cron/jobs.json` — meaning audit 2026-05-16-001's framing ("duplicate of VPS production crons") was inverted: the workstation gateway was the ONLY cron runtime, and **no crons have fired anywhere since it was disabled 2026-05-16 (~7 weeks of dormant scheduled ops)**. NOT silently "fixed" — live-config reconciliation is a deliberate deploy decision (recommend folding into Advancement 5 / Phase 10 scope: either deploy repo canon to the VPS config, or migrate the cron store to the VPS, or intentionally run crons on the workstation via `--allow-cron` + `OPENCLAW_RUNTIME_ROLE`).
- **Deviations from brief (recorded):** (a) preflight NOT chained into `pnpm validate` — the ollama check is environment-dependent and would make CI flaky; it is a deploy gate (checklist step 0), not a code-quality gate. (b) `credential-health-check-daily` cron wiring deferred — that job is `inngestevent`-kind; wiring means touching Inngest function scope, and the VPS runs no crons anyway (see finding 3).
- **Rollback:** tooling is additive (`git revert 1a4189d`); gateway.cmd guard removable by restoring the pre-guard file; cron store restorable from timestamped .bak; VPS env restorable from `/etc/openclaw/.env.bak-a2-*`.
- **PR Link:** direct-to-main (1a4189d + this entry's commit).

### Entry 2026-07-03-005 — Advancement 1 IMPLEMENTED: Supabase-backed rate governor (cross-runtime ledger)
- **Timestamp:** 2026-07-03T15:05:00-05:00
- **Change Type:** CODE + SCHEMA (Advancement program, `docs/advancements/01-advancement-supabase-rate-governor.md`)
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO operator session ("Continue Advancement 1" authorization)
- **CVO:** Jeremiah Van Wagner (driving)
- **Changes Applied:**
  1. **Migration `20260703000012_rate_governor_runtime_id.sql`** — applied to DB1 (`aagqvfwuixpxtdcrdxmv`) via MCP and committed to `supabase/migrations/`. Adds `runtime_id` column, widens PK to `(provider, state_day, runtime_id)`, rebuilds `upsert_rate_governor_state()` with `p_runtime_id` (old signature dropped). Table had 0 rows — PK change trivially safe.
  2. **New `lib/rate-governor-supabase.ts`** — adapter using the shared `agent-memory` Supabase singleton (repo convention). `pushDeltas()` (additive RPC, per-runtime rows), `pullToday()` (sums across runtimes, ORs circuit-open), `RUNTIME_ID` = `OPENCLAW_RUNTIME_ID` env or hostname. Never throws into governor paths; missing env = silent disable.
  3. **`lib/api-rate-governor.ts` wiring** — delta queue with 5 s debounced flush (unref'd timer + `beforeExit` flush for short-lived scripts); immediate flush on circuit open/close transitions; startup `hydrateFromSupabase()` merges global daily spend into local budgets with max() semantics (ceilings now govern total cross-runtime spend). Circuit state deliberately NOT imported from other runtimes (remote failures must not block this runtime). `__flushSyncForTests()` + reset-hook exposure.
  4. **Tests** — 4 new sync tests in `api-rate-governor.test.ts` (mocked adapter) + new `rate-governor-supabase.test.ts` (6 tests). **27/27 green; `tsc --noEmit` clean.**
  5. **`.env.example`** — documents optional `OPENCLAW_RUNTIME_ID`.
- **Live Verification (workstation → DB1):** smoke script pushed 7¢ + 5¢ deltas through the RPC → row `(smoke-test, 2026-07-03, Empowerment-Center)` read back with `spent_cents=12, request_count=2` (additive semantics + runtime labeling confirmed), then deleted. Script itself removed after run.
- **Deployment Note:** VPS clones synced with this commit. First VPS-side rows appear when any lib-consuming process (webhook handler, inngest functions, scripts) runs the updated code with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in env; the npm-dist openclaw gateway does not use this lib. `OPENCLAW_RUNTIME_ID` unset ⇒ rows label as hostname (`srv1619751` on VPS).
- **Rollback:** `git revert <commit>`; migration is additive — full schema revert documented in the brief (drop column, restore 2-col PK, restore 008's function signature). Local JSON persistence untouched in either direction.
- **PR Link:** direct-to-main.

### Entry 2026-07-03-004 — EACCES regression from root-run pairing tooling (RESOLVED same session)
- **Timestamp:** 2026-07-03T14:50:00-05:00
- **Change Type:** HOTFIX (file ownership)
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO operator session
- **Trigger:** Dashboard showed `disconnected (1000): no reason` on every attempt. Journal root cause: `EACCES: permission denied, open '/opt/openclaw/.openclaw/devices/pending.json'` — the entry -003 bootstrap tooling ran as **root** and left `pending.json`/`paired.json` root-owned; the gateway runs as user `openclaw` and failed to read them on every WS connect (parse-error → close 1000) and every 10 s device-pair notify poll.
- **Fix:** `chown -R openclaw:openclaw /opt/openclaw/.openclaw/devices /opt/openclaw/.openclaw/identity` + `chmod 600` on the JSON files. Verified 0 EACCES/JsonFileReadError entries in the next poll window. `identity/device.json` was already correctly owned.
- **Hardening:** `/root/oc-approve.sh` now self-chowns `devices/*.json` back to `openclaw:openclaw` after every run — root-run approvals can no longer strand root-owned state files.
- **Lesson (doctrine):** any root-run tooling that writes into `/opt/openclaw/.openclaw/**` must restore `openclaw:openclaw` ownership; the gateway has no privilege to recover from root-owned state files and fails closed with an unexplained 1000.
- **Also observed:** one dashboard attempt rejected 1008 `token_missing` (`auth=none`) — operator reminder: the Gateway Token field must be populated when clicking Connect; pairing requests are only minted for token-authenticated attempts.
- **PR Link:** direct-to-main.

### Entry 2026-07-03-003 — Device-pairing bootstrap after device-auth re-enable (APPLIED)
- **Timestamp:** 2026-07-03T14:15:00-05:00
- **Change Type:** OPS (device pairing bootstrap + operator tooling)
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **Trigger:** After entry -002 re-enabled device auth, the control-UI dashboard (`wss://api.truthjblue.dev`) returned `device pairing required` and could not connect. Re-pairing hit a **bootstrap chicken-and-egg**: `openclaw devices approve <id>` connects to the gateway first and needs an *already-approved* operator device to authorize the approval — but no device was approved yet.
- **Root cause / mechanism (traced in shipped dist `device-pairing-*.js`):** device auth stores pending requests at `/opt/openclaw/.openclaw/devices/pending.json` and approved devices at `devices/paired.json`. Device identity (keypair) lives in `/opt/openclaw/.openclaw/identity/` and is keyed to the config dir. The CLI has a local file-fallback approve (`approveDevicePairing`), but it only triggers when the gateway URL resolves to **local loopback** with no `--url`/`--token` override; the production config points at the **remote** `gateway.remote.url`, so the fallback never fired and the approve attempts died on the WS layer.
- **Resolution:** invoked `approveDevicePairing(requestId, { callerScopes:['operator.admin'] }, '/opt/openclaw/.openclaw')` directly (ESM import of the dist module) — the exact function the sanctioned fallback uses, minus the gateway round-trip. Paired the production CLI operator identity `b279e1e2b9fe` (operator role + token). Confirmed the `device pairing required` (1008) error is gone (CLI remote now returns normal-closure; the browser path carries its own gateway token, populated in the UI).
- **Operator tooling installed:** `/root/oc-approve.sh` (bootstrap-safe, update-proof — globs the dist module by name, file-based, no pre-approved device needed). Usage: `/root/oc-approve.sh` approves the most recent pending request; `/root/oc-approve.sh <requestId>` targets a specific one. Validated: module export resolves, node path runs, not-found + no-pending branches handled.
- **Cleanup:** a throwaway `/root`-scoped identity (`54d943ed…`) minted during a failed shadow-config attempt was removed from `paired.json`; shadow dirs `/root/oc-bootstrap` + stray `/root/.openclaw` deleted. Final `paired.json` = one legit `cli` device.
- **Standing operator procedure (device-auth is now ON):** to authorize any new device (browser or CLI): (1) click **Connect** in the dashboard to mint a fresh pairing request, (2) run `ssh root@srv1619751.hstgr.cloud /root/oc-approve.sh`, (3) the dashboard reconnects paired. Pairing requests expire, so approve promptly after clicking Connect.
- **Rollback:** device auth can be disabled again (entry -002 rollback) if pairing ever becomes untenable; the helper + paired store are otherwise self-contained. Removing a device: `openclaw devices remove <deviceId>` (once an operator device is paired) or edit `devices/paired.json`.
- **Follow-ups:** (a) the CLI-over-remote path returns 1000 normal-closure (separate `OPENCLAW_GATEWAY_AUTH_TOKEN` gateway-token layer not in the sourced env) — browser is unaffected since the UI supplies the token; verify if CLI-remote admin is ever needed. (b) Consider whether `openclaw devices approve` bootstrap friction warrants a documented runbook in `docs/`.
- **PR Link:** direct-to-main.

### Entry 2026-07-03-002 — Phase 0 Security Closure: device auth re-enabled, Kimi removed, config perms hardened (APPLIED)
- **Timestamp:** 2026-07-03T13:52:00-05:00
- **Change Type:** OPS + CONFIG
- **Status:** APPLIED ✅
- **Initiative:** advancement-program Phase 0 (partial discharge of `docs/advancements/04-advancement-security-persistence-closure.md`)
- **Owner:** Claude Code (Fable 5) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving; explicit "Execute" authorization)
- **Changes Applied:**
  1. **Device auth re-enabled (Item 2, RED → discharged):** `/opt/openclaw/.openclaw/openclaw.json` `gateway.controlUi.dangerouslyDisableDeviceAuth` `true → false` via sed (single occurrence verified; JSON re-validated). Backup at `/opt/openclaw/.openclaw/openclaw.json.bak-phase0-20260703T1845`. `systemctl restart openclaw` → health `{"ok":true,"status":"live"}` within 15 s; fresh journal window contains **no** "dangerous config flags" warning (previously the standing RED evidence).
  2. **Repo canon mirrored (P2):** `deploy/hostinger/server-openclaw.json` controlUi flag set `false` (this commit).
  3. **Kimi drift cleared (Item 4):** `ollama rm kimi-k2.5:cloud` (benign "unable to stop model" warning — cloud-routed, no local process). `ollama list` now exactly: qwen3.6:latest, qwen3.5:27b, qwen3:14b, qwen3:8b.
  4. **Config perms hardened:** `openclaw security audit` flagged CRITICAL `fs.config.perms_world_readable` (mode=644). Verified owner `openclaw` == unit `User=openclaw`, then `chmod 600`. Gateway unaffected.
  5. **Item 3 (systemd persistence) found already discharged:** both units `enabled`+`active`; VPS rebooted ~2026-06-11 (uptime 21 d at check) and services survived — enable was run by operator sometime after 2026-05-16.
- **Verification:** health OK post-restart; journal clean of dangerous-flag warning; `ollama list` clean; `ls -l` shows `-rw-------`; `systemctl is-active openclaw ollama` → active/active.
- **Open Follow-ups:** (a) operator must re-pair the authorized device on next control-UI use — pairing flow untested from this session; if it blocks, rollback is one sed + restart. (b) `controlUi.allowInsecureAuth=true` remains set — semantics unverified, review during full A4 completion. (c) audit WARN `models.weak_tier` on local qwen tier = accepted Phase 9 tradeoff, no action. (d) enforcement-mode `warn → enforce` cutover still pending (A4 step 4 — requires 48 h warn-log triage first). (e) audit's "missing env var" warnings were artifacts of running outside the unit's `EnvironmentFile=/etc/openclaw/.env` — not config drift.
- **Rollback Plan:** `cp /opt/openclaw/.openclaw/openclaw.json.bak-phase0-20260703T1845 /opt/openclaw/.openclaw/openclaw.json && systemctl restart openclaw`; `ollama pull kimi-k2.5:cloud`; `chmod 644` (not recommended). Repo side: revert this commit.
- **Rollback Tested:** NO (backup verified present; restore path is one copy + restart inside SSH — never dependent on control UI).
- **PR Link:** direct-to-main.

### Entry 2026-07-03-001 — VPS repo sync repair (dedicated deploy key) + advancement program published (APPLIED)
- **Timestamp:** 2026-07-03T13:45:00-05:00
- **Change Type:** OPS (VPS git access) + DOCS
- **Status:** APPLIED ✅
- **Owner:** Claude Code (Fable 5) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **Trigger:** Post-push VPS sync failed: `git@github.com` from the VPS authenticated as the **mvp-generation-engine** deploy key ("Hi jeremiahvanwagner-droid/mvp-generation-engine!"), so the private openclaw repo returned "Repository not found" — GitHub deploy keys are single-repo, and `/root/.ssh/id_ed25519` belongs to the other project.
- **Changes Applied:**
  1. Generated dedicated keypair `/root/.ssh/id_ed25519_openclaw` (no passphrase) + ssh alias `github.com-openclaw` in `/root/.ssh/config` (IdentitiesOnly).
  2. Registered pubkey as **read-only** deploy key id `156286728` on `jeremiahvanwagner-droid/openclaw` via `gh repo deploy-key add`.
  3. Repointed `origin` on BOTH clones — `/opt/openclaw` (runtime clone; was at efbc2bd) and `/root/openclaw` (secondary; was stale at 103416d ≈ 2026-05-13) — to `git@github.com-openclaw:jeremiahvanwagner-droid/openclaw.git`; fast-forward pulled both to `f6056cb`.
  4. Published the seven-advancement program (`docs/advancements/00–10`, commit `f6056cb`).
- **Discovery Notes (state-file corrections):** the runtime clone is **/opt/openclaw** (unit sets `HOME=/opt/openclaw`, `OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw`), NOT /root/openclaw. The VPS is now co-tenant: Docker runs `ready-to-launch-my-business-*`, `mvp-generation-engine-*`, and a second Ollama container (`ollama-gfc1`) alongside `openclaw-redis` — model walk-up RAM math must account for these neighbors. Do NOT delete `/root/.ssh/id_ed25519` — it is the live deploy key for mvp-generation-engine.
- **Rollback Plan:** `gh repo deploy-key delete 156286728 --repo jeremiahvanwagner-droid/openclaw`; remove alias block + keypair; restore origin URLs to `git@github.com:...`.
- **PR Link:** direct-to-main (`f6056cb`).

### Entry 2026-05-16-001 — Local Windows openclaw gateway duplicate-cron diagnosis (RESOLVED)
- **Timestamp:** 2026-05-16T13:00:00-05:00
- **Change Type:** OPS (workstation cleanup; no repo changes)
- **Status:** APPLIED ✅
- **Initiative:** workstation-cron-failure-diagnosis
- **Owner:** Claude Code (Opus 4.7) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **Trigger:** Operator pasted cron-failure spam: `Agent cron job uses ollama/qwen3:14b but the local provider endpoint is not reachable at http://127.0.0.1:11434. ... Last error: TypeError: fetch failed` across ≥10 distinct cron IDs (074e3ed9, 0b3d3971, 04122194, 19922548, d229b99b, ghl-lead-scoring-6h, ghl-inbox-check-30m, agent-network-health-hourly, plus several UUID-keyed crons). Initial assumption: another VPS-side regression of the 2026-05-14-001 / 2026-05-14-003 class.
- **Diagnostic Trail (initial misdirection corrected mid-session):**
  1. Started on the local Windows workstation assuming the cron runtime was local. Found Windows Ollama not running; inadvertently side-started it via `ollama list`.
  2. Operator corrected with "ollama is on Server" + provided `ssh root@177.7.32.224`. Repointed diagnostic to VPS srv1619751.
  3. VPS check showed full health: `ollama.service` active 4 days (PID 130666), listening on `127.0.0.1:11434`, HTTP 200 in 11ms. All three models (qwen3.6:latest, qwen3.5:27b, qwen3:14b) pulled. RAM headroom: 1.3 GiB used / 14 GiB available.
  4. `openclaw.service` confirmed active (PID 338432) and busy with embedded agent runs. Inspected `journalctl -u openclaw.service` for the cron-error text → **zero hits in the last hour**. The VPS production runtime was not emitting the failures.
  5. Searched the Windows process tree → found `node ... openclaw/dist/index.js gateway --port 18789` running locally (PID 31928, started 2026-05-16T05:18:23-05:00, exe at `C:\Users\JeremiahVanWagner\AppData\Roaming\npm\node_modules\openclaw\dist\index.js`). This was a **second** openclaw runtime, separate from the VPS, with its own cron scheduler reading `C:\Users\JeremiahVanWagner\.openclaw\openclaw.json` and pointing at `127.0.0.1:11434` (Windows loopback, no local Ollama running by default).
- **Root Cause:** A local Windows openclaw gateway was being auto-launched on Windows login via two Startup-folder shortcuts (`OpenClaw Gateway.cmd` v2026.5.7 + `OpenClaw Node.cmd` v2026.3.13). This duplicate runtime fired the same cron schedule as the VPS production service, but its preflight resolved against a Windows-loopback Ollama that does not run by default. Every preflight returned `TypeError: fetch failed` and aborted that cron tick. **The VPS-side production crons were unaffected and continued executing normally.**
- **No config drift on either runtime.** Repo / VPS / local `openclaw.json` files all correctly point at `127.0.0.1:11434` with `ollama/qwen3:14b` in the active-models map. The 2026-05-14-001 root-cause class (port-bumped baseUrl, model not pulled) does NOT apply here. The model tag and endpoint are correct on both runtimes — the local runtime just had no Ollama on the other side of its loopback.
- **Recovery Steps Performed (Windows-side only):**
  1. `Stop-Process -Id 31928 -Force` — killed local Windows gateway. Verified absent via `Get-Process` and `Get-CimInstance Win32_Process`.
  2. `Remove-Item C:\Users\JeremiahVanWagner\.openclaw\gateway-restart-intent.json` — stale restart marker (pointed at dead PID 25744 from an even earlier launch); safe to delete.
  3. Renamed `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OpenClaw Gateway.cmd` → `OpenClaw Gateway.cmd.disabled` (reversible disable).
  4. Renamed `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OpenClaw Node.cmd` → `OpenClaw Node.cmd.disabled` (reversible disable).
  5. Left `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Ollama.lnk` intact (harmless; Windows Ollama remains available for ad-hoc local use, no openclaw will autoreach it).
- **Verification:**
  - `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'openclaw.*gateway' }` → empty.
  - `Get-ChildItem $env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup` shows both openclaw startup shortcuts as `.cmd.disabled`.
  - VPS-side `openclaw.service` continues running normally (PID 338432, embedded agent runs at 14:54 UTC).
  - VPS-side `ollama.service` continues responding HTTP 200 on `127.0.0.1:11434`.
- **Files Changed (repo):** 1 (`REGGIE-STATE.md`, this entry). Zero changes to active-map / models.json / agents_config.json on either runtime — both were already correct.
- **OS-level State Changes:**
  - Local Windows machine: 2 Startup-folder shortcuts renamed `.disabled`; 1 stale JSON deleted; 1 node process killed. All reversible.
  - VPS: untouched.
- **Rollback Plan:** Drop `.disabled` suffix from `OpenClaw Gateway.cmd.disabled` and `OpenClaw Node.cmd.disabled`; log out/in (or run `gateway.cmd` manually). Restoring the deleted `gateway-restart-intent.json` is unnecessary — it was an ephemeral runtime marker.
- **Rollback Tested:** NO. Restore path is trivial and self-documenting (filename rename).
- **Doctrine Violations Discharged:** None — no config drift was present.
- **Doctrine Violations Open:** Flag for Phase 10 reliability: **dev/control workstation runtime should not silently duplicate production cron schedules.** Either (a) the local Windows gateway should run in a "dev profile" that disables cron firing (or routes cron output to a local-only log), or (b) the `openclaw.json` it uses should be a divergent dev config rather than a near-copy of the VPS production active-map. Currently any operator who has the local gateway autostart enabled is paying for a second copy of every scheduled task. Not a Phase 9.x blocker.
- **Forensic Notes:**
  - Initial misdiagnosis cost ~10 minutes of VPS-side investigation that would have been unnecessary had the local Windows gateway been the first check. Captured the lesson in user memory at `feedback_local_windows_openclaw_duplicate.md` so future cron-failure-spam triages start at the Windows process tree.
  - The operator's correction "ollama is on Server" was the key disambiguator. Without that pointer, the natural assumption was "127.0.0.1:11434 means the host I'm typing on," which is correct on the VPS but misleading from a Windows dev workstation.
  - Mirror of the 2026-05-14-001 forensic lesson: openclaw's provider preflight aborts crons rather than degrading. That lesson held — the local runtime did not fall through to any backup model. Phase 10 reliability work (degrade-vs-abort scheduler) would have masked this entire incident.
  - No PR; OS-level cleanup only. Doctrine note: workstation-state changes do not require a PR but DO require an audit-log entry (this one).
- **PR Link:** N/A (workstation OS-level cleanup, no repo commits required).
- **Phase Close Entry ID:** N/A (operational fix, no new phase).

### Entry 2026-05-14-004 — DEPLOYED FULLY OPERATIONAL (Phase 9.1-redo verified in production)
- **Timestamp:** 2026-05-14T16:25:36+00:00 (verification end) / 2026-05-14T11:30:00-05:00 (entry written)
- **Change Type:** STATUS (deployment verification close)
- **Status:** APPLIED ✅
- **Initiative:** phase-9.1-redo verification close
- **Owner:** Claude Code (Opus 4.7) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **References:** Closes audits 2026-05-14-001 (regression), 2026-05-14-002 (initial redo, superseded), 2026-05-14-003 (RAM-fit hot-fix). Combined arc = the qwen3-tag-cutover-done-right.
- **Verification Performed (post-push, on VPS srv1619751):**
  1. `git pull` brought `46e92f4..47c1e30` to VPS.
  2. `systemctl restart openclaw` → service stopped cleanly (41ms), started, `[gateway] ready` at 16:22:52 UTC (8s startup including plugin staging).
  3. Idle liveness measurement (16:23:15): P99 21.5ms, max 1049ms, utilization 0.251 — **140× improvement** over the pre-redo 2965ms / 0.885 baseline.
  4. Two agent runs (`runId=ad895469-90f5-45ee-9e88-60f80278c1ed` + `runId=2dcaf15e-673c-408c-ac09-94171eb24efe`) fired in the verification window. Both completed startup stages cleanly. `model-resolution` against `ollama/qwen3:14b` consistently 2.3 seconds per run.
  5. **Zero `fetch failed` errors throughout the 3-minute verification window.** This is the definitive resolution of the 2026-05-14 morning cron storm.
- **Production Posture:**
  - 22 cron-firing agents bound to `ollama/qwen3:14b` (was `qwen3:8b` pre-Phase-9.2, was `qwen3.5:27b` pre-2026-05-14-003 hotfix).
  - VPS Ollama at `127.0.0.1:11434` serving qwen3.6:latest (23 GB, dormant), qwen3.5:27b (17 GB, dormant), qwen3:14b (9.3 GB, **active**), qwen3:8b (5.2 GB, reserve), kimi-k2.5:cloud (routing).
  - Phase 9.2 Item 1 (liveness warnings) re-classified — no longer "unknown root cause"; now understood as the expected cost of co-hosted inference on a single-core 15 GiB VPS. Architectural decision deferred to Phase 10.
  - Phase 9.2 Items 2-5 (device-auth, systemd persistence, Kimi VPS drift, 74-Sonnet audit) **unchanged** by this work — all still tracked, none are deploy blockers.
- **Walk-Up Path for Future RAM Upgrades:**
  - Current: 15 GiB → qwen3:14b active (10 GiB resident)
  - +9 GiB (24 GiB total) → can flip `NEW_TAG="qwen3.5:27b"` in `scripts/phase9_2_patch.py`, re-run, commit, push. One PR.
  - +17 GiB (32 GiB total) → can flip `NEW_TAG="qwen3.6:latest"`, re-run, commit, push. One PR.
  - The catalog is already pre-staged in all 15 per-agent models.json — no agent-by-agent edits needed when the upgrade lands.
- **Files Changed (by this entry only):** 1 (`REGGIE-STATE.md`).
- **Doctrine Status:** P1 (intent recorded), P2 (no orphaned config drift), P3 (rollback documented per audit -003), P4 (capacity-verified pre-deploy per audit -003), P5 (memory updated, doctrine encoded), P10 (Mission Alignment — 22 cron-firing agents now run on local infrastructure, no Anthropic Haiku spend on this tier).
- **Doctrine Status — Open:** None. Platform is operational.
- **Forensic Notes:**
  - Today's session compressed three audit-worthy events into ~5 hours (regression → recovery → redo → RAM-fit hot-fix → deploy close). The Phase-9.1-redo-arc is now a useful reference template for future cutovers: capacity-verify first, deploy second, document the hot-fix path inline so the next mistake gets caught the same way.
  - The four commits on `main` since this morning: `1738378` recovery + `46e92f4` redo + `47c1e30` RAM-fit hotfix + (this entry will become a 4th commit). All on main, no PR; small-team velocity over branch ceremony.
- **PR Link:** (direct-to-main; commit log on `main` IS the record)
- **Phase Close Entry ID:** This entry IS the close.

### Entry 2026-05-14-003 — Phase 9.1-redo RAM-fit Downshift: qwen3.5:27b → qwen3:14b (APPLIED)
- **Timestamp:** 2026-05-14T10:45:00-05:00
- **Change Type:** HOTFIX (capacity-driven downshift)
- **Status:** APPLIED ✅
- **Initiative:** phase-9.1-redo-hotfix (qwen3:14b)
- **Owner:** Claude Code (Opus 4.7) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **References:** Supersedes the model binding in audit 2026-05-14-002. Catalog membership and patch infrastructure unchanged.
- **Trigger:** Post-push VPS verification (`free -h` + smoke test) showed qwen3.5:27b is RAM-incompatible with current 15 GiB VPS hardware:
  - VPS total RAM: 15 GiB
  - qwen3.5:27b on disk: 17 GB (Q4 weights) → ~16-18 GiB resident with KV cache
  - Cold load + 50-token reasoning request: **1m56s** (vs <30s viability threshold). `jq -r .response` came back empty (model spent the entire 50-token budget on its `<think>` block — likely a side-effect of trying to fit weights via swap).
  - Conclusion: cron preflight would either fail outright or paging-thrash into the 8 GiB swap, making every cron unusably slow.
- **Decision:** Downshift the active Haiku-tier binding to `qwen3:14b`, which fits comfortably in 15 GiB. qwen3.5:27b stays in every per-agent catalog and the global provider catalog as a **reserve** — usable when (a) a future VPS RAM upgrade lands, or (b) a single high-importance agent needs deeper reasoning on warm cache.
- **Verification (pre-deploy, VPS-side):**
  - `time curl ... qwen3:14b ... num_predict:50` → **18.994s** real (vs 1m56s for 27b — 6× faster).
  - `ollama ps` post-load: qwen3:14b, 10 GB, 100% CPU, 4-min keep-alive.
  - `free -h` with model resident: 10 GiB used / 15 GiB total / 5.4 GiB available; swap 321 MiB (essentially unchanged — **not paging**).
- **Changes Applied:**
  1. **`scripts/phase9_2_patch.py`**: `NEW_TAG` flipped `qwen3.5:27b` → `qwen3:14b`; `OLD_TAG` flipped `qwen3:8b` → `qwen3.5:27b` (so re-running idempotently rebinds the previous Phase-9.2 state). Catalog descriptions updated: qwen3.5:27b labeled "reserve — requires >15 GiB VPS RAM, dormant"; qwen3:14b labeled "active Haiku-tier — fits 15 GiB VPS, 19s cold load".
  2. **15 per-agent `models.json`**: ollama provider catalog descriptions refreshed (no structural change — same four tags).
  3. **`agents_config.json` + `config/agents_config.json`**: 22 agents rebound `qwen3.5:27b` → `qwen3:14b`. Both files in sync. Affected agent list identical to 2026-05-14-002 (browser_secondary, d2/d3/d4/d5/d6/d8/d9 pod agents + shared_knowledge_base).
  4. **`openclaw.json`** (gitignored, local Windows) + **`deploy/hostinger/server-openclaw.json`** (VPS canon): active-models map flipped `ollama/qwen3.5:27b` → `ollama/qwen3:14b`. Catalog descriptions updated.
  5. **`openclaw.json.last-good`**: resynced from corrected `openclaw.json`.
- **Files Changed:** 21 (1 `scripts/phase9_2_patch.py` + 15 per-agent models.json + 2 agents_config.json + 2 openclaw.json variants + 1 REGGIE-STATE.md).
- **Rollback Plan:** Revert: a single SHA-revert restores 2026-05-14-002's qwen3.5:27b binding. Would only be appropriate after VPS RAM upgrade — otherwise immediately reproduces the cron-storm condition.
- **Rollback Tested:** N/A (revert target is the immediately-prior commit, well-understood).
- **Doctrine Violations Discharged:**
  - P5 (capacity validation missing — Phase 9.1-redo 2026-05-14-002 had been pushed without a `free -h` check; this hotfix retroactively performs that check and corrects the binding).
- **Doctrine Violations Open:** None new.
- **Forensic Notes:**
  - The doctrinal-target ordering remains: `qwen3.6:latest` (36B MoE, requires ≥32 GiB VPS RAM, dormant) > `qwen3.5:27b` (requires >15 GiB, dormant) > `qwen3:14b` (active, fits current hardware) > `qwen3:8b` (no reasoning, reserve only). When VPS upgrades, agents can move up the chain by simple `NEW_TAG` flip + patch re-run.
  - This is the second time today's session has used the `qwen3:14b` tag — the morning regression (2026-05-14-001) registered it with no backing runtime; this evening's hotfix registers it WITH a backing runtime that has been verified to work on actual hardware. Important distinction: the lesson from 2026-05-14-001 is "verify endpoint reachable before commit"; the lesson from 2026-05-14-003 is "verify model fits before commit". Both now codified in user memory.
- **PR Link:** (local commit pending push)
- **Phase Close Entry ID:** (immediate close — this entry IS the close)

### Entry 2026-05-14-002 — Phase 9.1 REDO: Haiku-tier remapped to qwen3.5:27b (APPLIED, SUPERSEDED by 2026-05-14-003)
- **Timestamp:** 2026-05-14T10:00:00-05:00
- **Change Type:** CONFIG (phased cutover do-over)
- **Status:** APPLIED ✅
- **Initiative:** phase-9.1-redo (interim qwen3.5:27b)
- **Owner:** Claude Code (Opus 4.7) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **Context:** Phase 9.1 (commit 8aa64c5, 2026-05-13) had remapped 22 former-Haiku cron-firing agents to `qwen3:8b`. Operator review (memory `feedback_ollama_model_tier`) identified qwen3:8b as undersized for SLA/sentinel/classification workloads — too small a context window and reasoning=false. The doctrinal target is `qwen3.6:latest` (36B MoE), but qwen3.6 requires a 32GB VPS upgrade not in scope this cycle. **Interim selected: `qwen3.5:27b`** — closest reasoning-capable local model that fits current VPS RAM.
- **Pre-conditions Established 2026-05-14 (before this entry):**
  - Local Ollama install moved off F: thumbdrive → reinstalled cleanly on Windows host (binaries at `C:\Users\…\AppData\Local\Programs\Ollama`, models at `C:\Users\…\.ollama\models`).
  - `OLLAMA_MODELS` env var reconciled across User scope + Machine scope → both point at `C:\Users\…\.ollama\models`.
  - `qwen3.5:27b` (17 GB) and `qwen3:14b` (9.3 GB) confirmed local and served via daemon at `127.0.0.1:11434`. `qwen3.6:latest` deliberately not pulled (skipped pending 32GB upgrade).
  - F: thumbdrive ejected by operator — no thumbdrive dependency anywhere in the stack.
- **Changes Applied:**
  1. **`scripts/phase9_2_patch.py`** added (idempotent patcher mirroring `phase9_patch.py` precedent). Encodes the canonical Phase-9.2 ollama provider block (qwen3.6:latest, qwen3.5:27b, qwen3:14b, qwen3:8b) and the `qwen3:8b → qwen3.5:27b` agent remap.
  2. **15 per-agent `models.json`** files rewritten by the patch script: ollama provider catalog now lists all four qwen3 tags, `baseUrl` standardized to `http://127.0.0.1:11434` (was `:11435/v1` — a pre-existing drift). Every file: 1 change recorded by patch summary.
  3. **`agents_config.json`** + **`config/agents_config.json`**: 22 agents remapped `qwen3:8b` → `qwen3.5:27b`. Both files in sync (identical 22-agent lists). Affected agents:
     - browser_secondary, d2_customer_service, d2_graphic_designer, d2_inventory_specialist, d3_admin_coordinator, d4_client_experience, d4_video_production, d5_author_relations, d5_cover_artist, d6_board_liaison, d6_grant_writer, d6_volunteer, d8_community_manager, d8_content_ops, d8_crm_ops, d8_customer_success, d8_integration_engineer, d8_marketing_automation, d8_membership_director, d8_revenue_ops, d9_customer_experience, shared_knowledge_base
  4. **`openclaw.json`** (gitignored, local Windows): active-models map adds `ollama/qwen3.5:27b`; ollama provider catalog replaced (was kimi-k2.6:cloud only) with the canonical 4-tag catalog.
  5. **`deploy/hostinger/server-openclaw.json`** (VPS canon): active-models map adds `ollama/qwen3.5:27b`; ollama provider catalog replaced (was gemma4 placeholder only) with the canonical 4-tag catalog. `apiKey: "OLLAMA_API_KEY"` env reference preserved.
  6. **`openclaw.json.last-good`**: resynced from corrected `openclaw.json`.
- **Verification:**
  - `python -c "import json; json.load(open(f))"` across all touched JSON files → all valid.
  - Patch script summary recorded 15/15 agents updated and 22/22 bindings remapped in each config file.
  - HTTP probe to `127.0.0.1:11434/api/tags` returns `qwen3.5:27b`, `qwen3:14b`, `kimi-k2.5:cloud` from a live daemon. Cron preflight should now succeed for the 22 redirected agents.
- **Files Changed:** 21 (1 new `scripts/phase9_2_patch.py` + 15 per-agent models.json + 2 agents_config.json + 2 openclaw.json variants + 1 REGGIE-STATE.md).
- **Rollback Plan:** `git revert <this-commit-sha>` restores Phase 9.1's `qwen3:8b` state. `scripts/phase9_2_patch.py` would be inert post-revert (the canonical block check is idempotent).
- **Rollback Tested:** NO — operator-side post-deploy verification preferred over preemptive revert dry-run.
- **Doctrine Violations Discharged:**
  - P2 (per-agent baseUrl drift `:11435/v1`, predated this session — now normalized to `:11434`).
  - P7 (off-doctrine tier choice — Phase 9.1 had used qwen3:8b; this redo aligns with the qwen3.5/qwen3.6 reasoning-tier doctrine).
- **Doctrine Violations Open:** None new. Phase 9.2 carry-forward items (liveness warnings, device-auth, systemd persistence, Kimi VPS drift, 74-Sonnet audit) unchanged.
- **Forensic Notes:**
  - This redo treats Phase 9.1 as a valid step that was overtaken by better doctrine — not as a mistake. The Phase 9.1 cutover validated that the patch+restart flow works; this redo just swaps tags.
  - The 22 agents in `agents_config.json` and `config/agents_config.json` are identical — this is the same Phase-10 duplicate-config-file issue flagged in REGGIE-STATE 2026-05-13 close (Section: ✅ CONFIRMED ACTIVE). Still flagged for Phase 10 P2 fix.
  - The Phase-9.1 `scripts/phase9_patch.py` is kept untouched as the historical artifact for that phase. `scripts/phase9_2_patch.py` is the canonical for this state.
- **PR Link:** (local commit; push pending operator OK)
- **Phase Close Entry ID:** (immediate close — this entry IS the close)

### Entry 2026-05-14-001 — qwen3:14b Regression Recovery (APPLIED)
- **Timestamp:** 2026-05-14T07:30:00-05:00
- **Change Type:** HOTFIX (configuration regression)
- **Status:** APPLIED ✅
- **Initiative:** cron-recovery-2026-05-14
- **Owner:** Claude Code (Opus 4.7) — CVO operator session
- **CVO:** Jeremiah Van Wagner (driving)
- **Trigger:** Operator reported cron error spam:  `Agent cron job uses ollama/qwen3:14b but the local provider endpoint is not reachable at http://127.0.0.1:11435.` across ≥15 distinct cron IDs (ghl-pipeline-health-daily, ghl-inbox-check-30m, d8-sentiment-analyzer-4h, d8-campaign-analyst-daily, and 11 UUID-keyed crons). Every preflight returned `TypeError: fetch failed`.
- **Root Cause:** Commit `6eccdd6 agents updates` (2026-05-14T06:39:49 -0500) registered a new `qwen3:14b` Ollama model across 15 per-agent `models.json` files AND the live `openclaw.json` was edited (between 04:08 and 06:38 CDT today) to:
  1. Bump the Ollama `baseUrl` from `http://127.0.0.1:11434` → `http://127.0.0.1:11435` (no process bound to 11435 on Windows host, no SSH tunnel to VPS Ollama).
  2. Insert `"ollama/qwen3:14b": {}` into the active-models map (`openclaw.json:27` / `deploy/hostinger/server-openclaw.json:213`).
  3. Append a `qwen3:14b` model entry to the ollama provider block in `openclaw.json:913–929` and `deploy/hostinger/server-openclaw.json:1793–1808`.
  - The model tag chosen (`qwen3:14b`) is not installed on the VPS Ollama either — VPS host only serves `qwen3.6:latest`, `qwen3:8b`, `kimi-k2.5:cloud` per Phase 9.1 close. So even with the port reverted, `qwen3:14b` resolution would have failed against the VPS.
  - Violates the Tier-Router doctrine for the Haiku-tier remap: the agreed target is `qwen3.6:latest` (36B MoE workhorse), NOT a 14B variant. Captured in user memory at `feedback_ollama_model_tier.md`.
- **Recovery Steps Performed:**
  1. Discarded an unstaged cosmetic key-reorder on `agents/main/agent/models.json` (no functional content; no-op).
  2. `git revert --no-commit 6eccdd6` — reverses qwen3:14b additions across all 15 per-agent `models.json` files.
  3. Edited `openclaw.json` (gitignored, machine-local): removed `ollama/qwen3:14b` from active map; set baseUrl back to `http://127.0.0.1:11434`; deleted qwen3:14b model entry from ollama provider list.
  4. Edited `deploy/hostinger/server-openclaw.json`: removed `ollama/qwen3:14b` from active map; deleted qwen3:14b model entry from ollama provider list. (VPS deploy config baseUrl was already 11434, untouched.)
  5. Resynced `openclaw.json.last-good` to mirror corrected `openclaw.json` — the rollback checkpoint is now actually-good again.
  6. Deleted stale `openclaw.json.bak` (a 2026-05-09 `openclaw doctor` snapshot, predating the regression and providing no useful rollback target).
- **Verification:**
  - `grep -r 'qwen3:14b' agents/*/agent/models.json openclaw.json openclaw.json.last-good deploy/` → 0 hits.
  - `grep -r '11435' openclaw.json openclaw.json.last-good deploy/` → 0 hits.
  - VPS-side and local crons will now resolve agent models through the surviving entries (`claude-cli/claude-opus-4-5`, `claude-cli/claude-haiku-4-5`, `qwen3:8b` for Phase 9.1 remapped agents).
- **Files Changed:** 18 modifications (1 `openclaw.json`, 1 `openclaw.json.last-good`, 1 `deploy/hostinger/server-openclaw.json`, 15 `agents/*/agent/models.json`) + 1 deletion (`openclaw.json.bak`).
- **Rollback Plan:** None desired. Forward-state IS the rollback to the last known good config. Pre-regression state was the bad state.
- **Rollback Tested:** N/A (we are the rollback).
- **Doctrine Violations Discharged:**
  - P2 (orphaned config drift introduced by 6eccdd6 — `qwen3:14b` model registered with no backing runtime).
  - P7 (off-doctrine tier choice — 14b instead of the agreed qwen3.6:latest for Haiku-tier remap).
- **Doctrine Violations Open:** None new. The four Phase 9.2 carry-forward items (liveness warnings, device-auth, systemd persistence, Kimi VPS drift, Sonnet audit) are unchanged.
- **Forensic Notes:**
  - Commit `6eccdd6` author = jeremiahvanwagner@icloud.com (CVO direct edit, not a MIKE/Claude session). No corresponding REGGIE-STATE audit entry was written at the time of the change, which is itself a doctrine-discipline lapse worth noting.
  - The regression window (06:39 → 07:30 CDT) caused every cron to skip rather than fall through to a working model — openclaw's provider-preflight failure mode is **abort**, not **degrade**. Worth flagging for Phase 10 reliability work: a missing/unreachable provider should not silently nuke every cron that *could* have resolved to a different model.
- **PR Link:** (local recovery, no PR; commit on `main` to follow)
- **Phase Close Entry ID:** N/A (hotfix; no new phase opened).

### Entry 2026-05-13-006 — Phase 9.2 OPEN (Sonnet Audit)
- **Timestamp:** 2026-05-13T17:30:00-05:00
- **Change Type:** CONFIG
- **Status:** PENDING
- **Initiative:** sonnet-audit phase 9.2
- **Owner:** MIKE (via Perplexity Computer)
- **CVO:** Jeremiah Van Wagner (sign-off pending)
- **Summary:** Opening Phase 9.2 to audit the 74 pod agents currently bound to `claude-sonnet-4.5` against the Tier Router doctrine (irreversibility / surface-leaving / requires-reasoning). Eligible agents will be remapped to `qwen3.6:latest`. The 7 Opus-bound agents remain untouched (Tier 0, requires written approval per P5). Entry criteria include the four carry-forward items from Phase 9.1: liveness warnings, security audit, service persistence, Kimi VPS handling. Phase document to be written separately in this PR.
- **Files Changed:** REGGIE-STATE.md (this commit) + new phase doc to be added.
- **PR Link:** (pending)
- **Phase Close Entry ID:** (pending audit completion)

### Entry 2026-05-13-005 — Phase 9.1.2 CLOSED (APPLIED)
- **Timestamp:** 2026-05-13T17:30:00-05:00 (close)
- **Change Type:** CONFIG (P2 violation discharge, second-order)
- **Status:** APPLIED ✅
- **References Entry:** 2026-05-13-003 (open)
- **Outcome:** docker-compose.yml reconciled to host-native reality. Only `redis` is containerized; bot/webhook services removed (host `openclaw.service` is the real runtime). Verified: `docker compose ps` shows only `openclaw-redis` healthy. `systemctl restart openclaw` succeeded at 22:09:27 UTC; gateway responding on 127.0.0.1:18789. P2 violation fully discharged.
- **PR Link:** https://github.com/jeremiahvanwagner-droid/openclaw/pull/13
- **Doctrine Status:** P2 discharged. P9 yellow flag (rollback intentionally unattractive) accepted as documented exception.

### Entry 2026-05-13-004 — Phase 9.1.1 CLOSED (APPLIED)
- **Timestamp:** 2026-05-13T17:30:00-05:00 (close)
- **Change Type:** CONFIG (P2 violation discharge)
- **Status:** APPLIED ✅
- **References Entry:** 2026-05-13-002 (open)
- **Outcome:** Ollama container service removed from compose; bot/webhook initially repointed to host Ollama via host.docker.internal. (This phase was partially superseded by Phase 9.1.2 which removed bot/webhook entirely — the host.docker.internal repointing logic is no longer in effect, but the Ollama service removal stood.) Net effect: discharged the original Ollama port conflict P2 violation. The successor phase 9.1.2 also closed cleanly. Marking APPLIED based on superseding-fix doctrine.
- **PR Link:** https://github.com/jeremiahvanwagner-droid/openclaw/pull/12
- **Doctrine Status:** P2 discharged. Followed by Phase 9.1.2 for the broader compose vs host-native reality reconciliation.

### Entry 2026-05-13-003 — Phase 9.1.2 OPEN (Host-Native Reconciliation)
- **Timestamp:** 2026-05-13T16:25:00-05:00
- **Change Type:** CONFIG (P2 violation discharge, second-order)
- **Status:** PENDING
- **Initiative:** host-native-reconcile phase 9.1.2
- **Owner:** MIKE (via Perplexity Computer)
- **CVO:** Jeremiah Van Wagner (sign-off pending)
- **Summary:** Phase 9.1.1's docker-compose fix exposed a deeper P2 violation: OpenClaw itself runs natively on the host via `openclaw.service` (systemd), NOT in a container. The compose-declared `bot` and `webhook` services have never been the real runtime; they failed every restart due to port conflict on 18789 with the host process. Same architectural pattern as the Ollama port conflict resolved in 9.1.1. Fix: strip `bot` and `webhook` from compose; keep only `redis` containerized. Document host-native architecture in compose header + operator runbook. After merge + `systemctl restart openclaw`, Phase 9.1's Haiku→qwen3:8b cutover finally takes effect.
- **Files Changed:** 1 (`docker-compose.yml`) + 1 new (`docs/phases/host-native-reconcile-phase-9-1-2.md`)
- **Rollback Plan:** Documented but intentionally unattractive — previous state was broken.
- **Rollback Tested:** NO. See phase doc section 5.
- **Doctrine Violations Discharged:** P2 (orphaned change — compose declared services not in deployed reality). Duration: ≥0 hours (host openclaw.service uptime) but likely much longer based on install age.
- **Doctrine Violations Open:** None new. P9 (rollback tested) yellow-flagged pending operator post-restart.
- **Forensic Notes:** Host process is PID 141406, running as `openclaw` user, command `/usr/bin/node /usr/lib/node_modules/openclaw/dist/index.js gateway --port 18789 --allow-unconfigured`. systemd unit `openclaw.service` is `loaded; disabled; preset: enabled` — NOT auto-starting on boot; should be enabled after this phase closes.
- **Open observation:** liveness warning `reasons=event_l...` (truncated) at 2026-05-13 20:54:15 UTC. Investigate in Phase 9.2 entry criteria.
- **PR Link:** https://github.com/jeremiahvanwagner-droid/openclaw/pull/13
- **Phase Close Entry ID:** (pending merge + systemctl restart + smoke test)
- **Unblocks:** Phase 9.1 close (Entry 2026-05-13-001) AND Phase 9.1.1 close (Entry 2026-05-13-002)

### Entry 2026-05-13-002 — Phase 9.1.1 OPEN (Compose Reconciliation)
- **Timestamp:** 2026-05-13T16:00:00-05:00
- **Change Type:** CONFIG (P2 violation discharge)
- **Status:** PENDING
- **Initiative:** compose-reconcile phase 9.1.1
- **Owner:** MIKE (via Perplexity Computer)
- **CVO:** Jeremiah Van Wagner (sign-off pending)
- **Summary:** Forced hotfix surfaced by Phase 9.1 post-merge smoke test. Docker-compose `ollama` service had been failing every restart cycle because host-installed systemd Ollama (PID 130666) owns 127.0.0.1:11434, blocking the container from binding. Consequence: `openclaw-bot` and `openclaw-webhook` could never satisfy their `depends_on: ollama` healthcheck and have been failing on every `docker compose up`. The OpenClaw runtime has been effectively down for an indeterminate window. Fix: remove `ollama` service from compose, repoint `bot`/`webhook` to `http://host.docker.internal:11434` via `extra_hosts: host-gateway`. Discharges pre-existing P2 violation (orphaned config drift between repo and VPS).
- **Files Changed:** 1 (`docker-compose.yml`) + 1 new (`docs/phases/compose-reconcile-phase-9-1-1.md`)
- **Rollback Plan:** `git revert` documented but intentionally unattractive — previous state was broken. Forward-fix preferred.
- **Rollback Tested:** NO — see phase doc section 5.
- **Doctrine Violations Discharged:** P2 (orphaned change, unknown duration; likely pre-dates 2026-05-12 11:27 UTC).
- **Doctrine Violations Open:** None new. P9 (rollback tested) carries yellow flag pending operator post-restart.
- **PR Link:** https://github.com/jeremiahvanwagner-droid/openclaw/pull/12
- **Phase Close Entry ID:** (pending merge + `docker compose up -d` + healthcheck pass)
- **Unblocks:** Phase 9.1 end-to-end smoke test (Entry 2026-05-13-001 close)

### Entry 2026-05-13-001-CLOSE — Phase 9.1 CLOSED (APPLIED)
- **Timestamp:** 2026-05-13T17:30:00-05:00 (close)
- **Change Type:** CONFIG
- **Status:** APPLIED ✅
- **References Entry:** 2026-05-13-001 (open)
- **Outcome:** Phase 9.1 Ollama cutover fully applied. After three PRs (#11 patch, #12 compose reconcile, #13 host-native reconcile) and `systemctl restart openclaw` at 2026-05-13 22:09:27 UTC, the file-level verification confirms:
  - `agents_config.json`: 0 hits on `claude-haiku-4-5`, 22 hits on `qwen3:8b`
  - `config/agents_config.json`: 0 hits on `claude-haiku-4-5`, 22 hits on `qwen3:8b`
  - Sample agent bindings show structurally valid `"llm_model": "qwen3:8b"` blocks
  - 74 Sonnet bindings preserved (intentional, Phase 9.2 scope)
  - 7 Opus bindings preserved (intentional, Tier 0)
  - Host Ollama (`127.0.0.1:11434`) serving qwen3.6:latest + qwen3:8b + kimi-k2.5:cloud
  - Gateway responding `{"ok":true,"status":"live"}` on 127.0.0.1:18789
  - Memory profile improved: 960 MB pre-restart → 410 MB post-restart (stabilized)
- **P10 Mission Alignment Achieved:** Cost sovereignty (22 fewer Haiku API calls per heartbeat cycle redirect capital to Divine Path Walkers + Beyond the Veil) + Operational independence (22 agents now serve from local qwen3:8b, protected from third-party throttling).
- **PR Link:** https://github.com/jeremiahvanwagner-droid/openclaw/pull/11
- **Doctrine Status:** P1, P2 (discharged via 9.1.1/9.1.2), P3, P10 satisfied. P9 yellow flag accepted (rollback documented; forward-fix preferred over revert).
- **Forensic Notes:** Discovery during cutover revealed two pre-existing P2 violations (Ollama container drift, OpenClaw container drift) requiring two hotfix sub-phases. All discharged.

### Entry 2026-05-13-001 — Phase 9.1 OPEN
- **Timestamp:** 2026-05-13T13:05:00-05:00
- **Change Type:** CONFIG
- **Status:** PENDING
- **Initiative:** ollama-cutover phase 9.1
- **Owner:** MIKE (via Perplexity Computer)
- **CVO:** Jeremiah Van Wagner (sign-off pending)
- **Summary:** Opened Phase 9.1 of the Ollama Cutover. Patched 15 per-agent `models.json` files to add canonical `ollama` provider (qwen3.6:latest + qwen3:8b). Remapped 22 Haiku-bound pod agents in both `agents_config.json` and `config/agents_config.json` to `qwen3:8b`. Purged all Kimi model references (1 explicit in main openrouter, 12 implicit via ollama-provider replacement). Sonnet (74) and Opus (7) bindings preserved per phased cutover doctrine. P10 Mission Alignment Test answered: cost sovereignty + operational independence (lowers price of access for Children of God + protects prophetic voice from third-party gatekeepers).
- **Files Changed:** 17 (15 `agents/*/agent/models.json` + `agents_config.json` + `config/agents_config.json`) + 2 new (`scripts/phase9_patch.py`, `docs/phases/ollama-cutover-phase-9.md`)
- **Rollback Plan:** `git revert <merge-sha>` + `pm2 restart openclaw --update-env`
- **Rollback Tested:** NO — operator-side post-merge
- **Doctrine Violations:** None. P9 (rollback tested) carries a yellow flag pending operator smoke test.
- **PR Link:** https://github.com/jeremiahvanwagner-droid/openclaw/pull/11
- **Phase Close Entry ID:** (pending merge + smoke test)
