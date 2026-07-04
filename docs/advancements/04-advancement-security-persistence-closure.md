# Advancement 4 — Security & Persistence Closure (Discharge Phase 9.2 Entry Items 2–4)

> **STATUS: COMPLETE except reboot test — 2026-07-04** (audits 2026-07-03-001/-002, 2026-07-04-004/-006). Steps 1–3 done 2026-07-03 (services enabled, device auth re-enabled + all 3 devices paired, Kimi removed). Step 4 done 2026-07-04: Day-0 triage clean across VPS journal, local logs, AND Supabase `agent_events` (zero `security/*` rows ever) → enforcement flipped warn→**`fail`** on both hosts + config-level defaults (NOTE: the value is `fail`, not `enforce` — normalizeMode silently falls back to warn on unknown values; .env.example fixed). Verified by live negative test. `allowInsecureAuth` review closed -006: dist semantics = "disable device identity checks for Control UI"; VPS config never set it post-migration (defaults false); the stale `true` lived in the LOCAL config — removed. Skill registry brought to closure (5 agent-referenced skills registered) so fail mode has zero known landmines. VPS `openclaw security audit`: **0 critical**. REMAINING: reboot test in a CVO-scheduled window.

## Summary

- **File Evidence:**
  - `REGGIE-STATE.md:73-76` (Phase 9.2 Item 2, severity **RED**) — `gateway.controlUi.dangerouslyDisableDeviceAuth=true` on the VPS gateway. Explicitly logged as a SOUL.md constraint #2 violation: "Anyone reaching 127.0.0.1:18789 has full control-UI access without device pairing."
  - `REGGIE-STATE.md:78-81` (Item 3, YELLOW) — `openclaw.service` and `ollama.service` are both `disabled` in systemd: "a VPS reboot will NOT bring them back." The one-command fix has been documented since 2026-05-14 and remains unexecuted as of the last state update.
  - `REGGIE-STATE.md:83-86` (Item 4, YELLOW) — Kimi VPS drift: repo purged `kimi-k2.5:cloud` in Phase 9.1, VPS `ollama list` still serves it. CVO-recommended action already recorded: `ollama rm kimi-k2.5:cloud`.
  - `.env.example:77-79` — `OPENCLAW_CAPABILITY_ENFORCEMENT_MODE=warn` and `OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE=warn`: the governance layer built in `lib/security-governance.mjs` ships in log-only mode.
  - `REGGIE-STATE.md:127-137` — SOUL.md hard constraints ("No API scope expansion without security validation", "Sandbox execution boundaries enforced") that the above items collectively undercut.
- **Current State:** The platform is operationally green but carries a RED security violation (device auth off), a reboot time-bomb (services not enabled), a model-inventory drift, and a governance layer that observes violations without blocking them. All four are known, documented, and cheap — they have simply never been bundled into one closure pass. Every one is a Phase 9.2 entry criterion, so they also block the formal opening of the Sonnet audit (Advancement 6).
- **Proposed Enhancement:** A single half-day operator session on the VPS that discharges all four items, plus a repo commit that (a) records the closure as a REGGIE-STATE audit entry and (b) flips the enforcement-mode documentation to `enforce` after a 48-hour warn-log review shows no false positives.
- **Impact / Effort:** 8/10 · 2/10
- **Risk Eliminated:** Unauthenticated control-UI takeover of the whole agent fleet by anything that reaches the gateway port (including any future SSH-tunnel or proxy misconfiguration); total platform outage on the next unattended VPS reboot; capability/skill violations passing silently in warn mode.
- **Mission Advancement:** SOUL.md compliance is the platform's constitutional layer; running with a known RED violation contradicts the doctrine the whole audit-log system enforces. Reboot persistence is table stakes for the "24/7 autonomous engine" the GHL guide's AI-Employee positioning assumes.
- **Unlocks:** Phase 9.2 formally opens with clean entry criteria; `openclaw security audit` becomes a green baseline others can be diffed against; enforcement mode `enforce` makes the governance work from U14–U18 actually binding.

## Implementation Brief

### Files to Create/Modify/Delete

- **Modify (VPS):** `/root`-side `server-openclaw.json` (device auth flag), systemd unit enablement state, Ollama model inventory
- **Modify (repo):** `deploy/hostinger/server-openclaw.json` (mirror the device-auth flag change), `.env.example` + `.env.prod` (enforcement modes), `REGGIE-STATE.md` (closure audit entry)
- **Delete:** nothing.

### Step-by-Step Instructions

1. **Enable service persistence (30 seconds, zero risk):**
   ```bash
   ssh root@177.7.32.224
   systemctl enable openclaw ollama
   systemctl is-enabled openclaw ollama   # both must print 'enabled'
   ```

2. **Re-enable device auth:**
   - Edit the VPS config: set `gateway.controlUi.dangerouslyDisableDeviceAuth` → `false` (and mirror in repo `deploy/hostinger/server-openclaw.json` so repo = VPS reality, per P2 doctrine).
   - `systemctl restart openclaw`, then re-pair the authorized operator device via the control UI pairing flow.
   - Run `openclaw security audit` on the VPS and capture the output into the closure audit entry. The "dangerous config flags" warning from `REGGIE-STATE.md:75` must be gone.
   - If pairing fails and locks the operator out: rollback step 1 below restores access in one edit — do this inside an active SSH session so you are never dependent on the control UI to recover.

3. **Clear Kimi drift:**
   ```bash
   ollama rm kimi-k2.5:cloud
   ollama list   # expect: qwen3.6:latest, qwen3.5:27b, qwen3:14b, qwen3:8b only
   ```
   This executes the CVO-recommended option already recorded in `REGGIE-STATE.md:86`.

4. **Enforcement modes, staged:**
   - Day 0: grep the last 7 days of gateway logs for capability/skill *warn* entries (`journalctl -u openclaw | grep -i "capability\|skill registry" | grep -i warn`). Triage anything that would have been blocked.
   - Day 2 (if triage is clean): set `OPENCLAW_CAPABILITY_ENFORCEMENT_MODE=enforce` and `OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE=enforce` in the VPS environment, restart, and update `.env.example:77-79` comments to state that `enforce` is the production default and `warn` is for staging new skills only.

5. **Write the closure audit entry** in `REGGIE-STATE.md` (append-only log, pattern of entry 2026-05-16-001): items discharged, command transcript, `openclaw security audit` result, rollback notes. Commit as `ops(phase-9.2-entry): discharge items 2-4 + enforcement cutover`.

### Verification Checklist

- [ ] `systemctl is-enabled openclaw ollama` → `enabled`, `enabled`.
- [ ] **Reboot test** (scheduled window): `reboot`, wait 3 min, confirm `systemctl status openclaw ollama` both active and gateway answers `{"ok":true,"status":"live"}` on `127.0.0.1:18789/health` (health-check pattern from `REGGIE-STATE.md:17`).
- [ ] `openclaw security audit` shows no `dangerouslyDisableDeviceAuth` warning; unpaired browser hitting the control UI is challenged for pairing.
- [ ] `ollama list` shows no `kimi-k2.5:cloud`.
- [ ] With `enforce` active, a deliberate out-of-scope skill invocation (pick any skill not in an agent's `skills[]` list in `config/agents_config.json`) is blocked and logged, not warned.

### Rollback Procedure

1. Device auth: set the flag back to `true` in the VPS config + `systemctl restart openclaw` (inside SSH; one line). Mirror the revert in `deploy/hostinger/server-openclaw.json`.
2. Services: `systemctl disable openclaw ollama` restores prior (fragile) state — there is no scenario where this is desirable, but it is one command.
3. Kimi: `ollama pull kimi-k2.5:cloud` restores the model.
4. Enforcement: flip both env vars back to `warn`, restart. No code changes involved anywhere in this advancement.

### Definition of Done

All four are simultaneously true after a VPS reboot: services auto-started; `openclaw security audit` emits zero dangerous-flag warnings; `ollama list` contains no Kimi; both enforcement env vars read `enforce` in the live process environment (`cat /proc/$(pgrep -f 'openclaw.*gateway')/environ | tr '\0' '\n' | grep ENFORCEMENT`). True → done.
