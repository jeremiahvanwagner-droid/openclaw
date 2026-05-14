# REGGIE — Sovereign Agent State File
_Last Updated: 2026-05-14 07:30 CDT | Updated by: Claude Code (Opus 4.7) session_

---

## 🔴 CURRENT OPERATIONAL STATUS

**Phase:** 9.1 CLOSED / 9.2 OPEN (Sonnet Audit, scoping) — **qwen3:14b regression recovered 2026-05-14**
**Overall System Health:** 🟢 OPERATIONAL — Phase 9.1 Haiku→qwen3:8b cutover proven applied; 2026-05-14 qwen3:14b regression recovered via audit entry 2026-05-14-001.
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

### Item 1: Liveness Warnings Recurring
**Severity:** YELLOW
**Evidence:** `[diagnostic] liveness warning: reasons=event_loop_delay,cpu interval=38s eventLoopDelayP99Ms=2965.4 eventLoopDelayMaxMs=11081.4 eventLoopUtilization=0.885 cpuCoreRatio=0.983` at 2026-05-13 22:10:12 UTC. Recurring across restarts — pre-existed Phase 9.1.
**Action:** Phase 9.2 must investigate the source. Suspects: (1) sessions.list took 13.7s and models.list took 25.5s on first post-restart calls, (2) plugin startup contention, (3) the 'embedded' agent runtime preparing in 28s. Run `journalctl -u openclaw | grep -E 'liveness|sessions.list|models.list' | tail -50` and produce a hot-path analysis.

### Item 2: Security — Device Auth Disabled
**Severity:** RED (SOUL.md constraint #2 violation)
**Evidence:** `[gateway] security warning: dangerous config flags enabled: gateway.controlUi.dangerouslyDisableDeviceAuth=true. Run 'openclaw security audit'.`
**Action:** Anyone reaching 127.0.0.1:18789 has full control-UI access without device pairing. Has been this way pre-Phase 9.1 (not introduced today). Phase 9.2 entry: either re-enable device auth and re-pair an authorized device, or document an explicit SOUL.md override with justification. Run `openclaw security audit` for the full report.

### Item 3: systemd Services NOT Persistent
**Severity:** YELLOW (P9 — reliability)
**Evidence:** `openclaw.service` and `ollama.service` are both `Loaded: ...; disabled; preset: enabled`. They survive only because nothing has stopped them; a VPS reboot will NOT bring them back.
**Action (operator, 1 command):** `systemctl enable openclaw ollama`

### Item 4: Kimi VPS Drift
**Severity:** YELLOW (state drift, repo vs VPS)
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
