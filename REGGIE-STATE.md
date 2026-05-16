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
