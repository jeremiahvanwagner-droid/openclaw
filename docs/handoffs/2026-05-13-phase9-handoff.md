# HANDOFF — 2026-05-13 — Pre-Phase 9 Audit Complete

> **To:** Next AI session (Perplexity, Claude Code, or any AI touching this repo)
> **From:** MIKE (agent:MIKE + human:jeremiah-vanwagner)
> **Date:** 2026-05-13 17:41 UTC
> **Session type:** VPS live audit + infrastructure cleanup
> **REGGIE entries written:** r14, r15
> **Phase 9 gate status:** BLOCKED on Open Item #9 (browser-automation symlink)

---

## 1. MANDATORY FIRST STEPS FOR THIS REPO

1. Read `REGGIE-STATE.md` in full — it is the single source of truth
2. Read `PLATFORM-REFERENCE.md` for full architecture context
3. Do NOT treat any handoff doc (including this one) as authoritative over `REGGIE-STATE.md`
4. Confirm VPS gateway is live: `curl -fsS http://127.0.0.1:18789/healthz`

---

## 2. WHAT WAS ACCOMPLISHED THIS SESSION

### 2.1 Prometheus / Metrics — CONFIRMED AND CLEANED (r14)

**Finding:** `curl http://127.0.0.1:18789/metrics` returns HTML (the Control UI SPA).
The `/metrics` path does not exist — it falls through to the SPA router.
OpenClaw does not expose a Prometheus metrics endpoint on any port.

**Evidence gathered:**
```
ss -tlnp → only :18789 (gateway) and :8788 (webhook) listening
curl :18789/metrics    → 404
curl :18789/healthz    → {"ok":true,"status":"live"}
curl :8788/healthz     → 401 (auth required — not broken)
curl :9090/metrics     → connection refused (Prometheus not running)
curl :18790/metrics    → connection refused
```

**Fix applied:** `deploy/monitoring/prometheus/prometheus.yml` updated — both dead scrape jobs
(`openclaw-gateway` and `openclaw-webhook`) commented out with restoration instructions.
Prometheus self-monitoring retained. Commit: `52d99f2f7ac2b75eba2e39aa8845de93fb836192`.

Prometheus monitoring stack is NOT running on VPS. When it is started, the config is now clean.

**REGGIE Open Items #4 and #5 → CLOSED.**

### 2.2 git pull — 34 Files Updated

`git pull origin main` on the VPS pulled 34 files including:
- `HANDOFF-MIKE-20260511.md` — NEW (prior session handoff)
- `PLATFORM-REFERENCE.md` — NEW (510-line architecture reference)
- `REGGIE-STATE.md` — updated (r13 inngest migration entry)
- `openclaw.json.last-good` — NEW (1,827 lines — backup of last known-good runtime config, 60KB)
- `plugin-skills/browser-automation` — NEW **broken symlink** (see Section 2.3)
- `tasks/runs.sqlite*` — DELETED from repo (correct — binary runtime state)
- Various `inngest/functions/*.ts` — updated (Phase 3, self-healing, training protocol)
- `deploy/monitoring/prometheus/prometheus.yml` — updated (our r14 fix)

`pnpm install --frozen-lockfile` ran clean in 2.6s. Gateway still live post-pull.

### 2.3 Broken Symlink Discovered — PHASE 9 BLOCKER (r15)

```
plugin-skills/browser-automation → 
C:/Users/JeremiahVanWagner/AppData/Roaming/npm/node_modules/openclaw/dist/extensions/browser/skills/browser-automation
```

This is a **Windows absolute path** committed in a repo running on Linux VPS.
It resolves to `ENOENT`. Any browser-automation skill call will silently fail or throw.

**`git rm` failed** with `fatal: pathspec did not match any files` — git may have the symlink
stored as a blob. Use `git ls-files plugin-skills/browser-automation` to check.

**Correct target found on VPS:**
```
/opt/openclaw/.openclaw/plugin-runtime-deps/openclaw-2026.4.29-4eca5026e977/dist/extensions/browser/skills/browser-automation
```
(The `/root/.npm/_npx/...` path is a temp cache — do NOT use.)

**Fix commands — run these on VPS:**
```bash
cd /root/openclaw
git ls-files plugin-skills/browser-automation
git rm -f plugin-skills/browser-automation 2>/dev/null || rm -f plugin-skills/browser-automation
ln -s /opt/openclaw/.openclaw/plugin-runtime-deps/openclaw-2026.4.29-4eca5026e977/dist/extensions/browser/skills/browser-automation plugin-skills/browser-automation
ls -la plugin-skills/browser-automation/
# If ls shows files inside the directory:
git add plugin-skills/browser-automation
git commit -m "fix(symlink): restore browser-automation to VPS production path (r15)"
git push origin main
```

**After the fix — add a stable alias to prevent future breakage:**
```bash
# Create a version-stable alias that survives openclaw upgrades
ln -sfn /opt/openclaw/.openclaw/plugin-runtime-deps/openclaw-2026.4.29-4eca5026e977 /opt/openclaw/current
# Then update the symlink to use the stable alias:
git rm -f plugin-skills/browser-automation
ln -s /opt/openclaw/current/dist/extensions/browser/skills/browser-automation plugin-skills/browser-automation
# Update this stable alias on every openclaw upgrade
```

**REGGIE Open Item #9 → OPEN (Phase 9 BLOCKER)**

---

## 3. CURRENT VPS RUNTIME STATE (verified 2026-05-13)

| Component | Status | Evidence |
|---|---|---|
| Gateway (`:18789`) | ✅ LIVE | `{"ok":true,"status":"live"}` |
| Webhook handler (`:8788`) | ✅ LIVE | 401 on unauth probe (expected) |
| Ollama (`:11434`) | ✅ Running | 3 models: `qwen3.6:latest`, `qwen3:8b`, `kimi-k2.5:cloud` |
| pnpm packages | ✅ Clean | `Done in 2.6s` post-pull |
| Prometheus monitoring stack | ❌ NOT running | No process on `:9090` |
| `plugin-skills/browser-automation` | ❌ BROKEN | Windows path symlink |
| `openclaw.json.last-good` | ✅ Present | 60KB backup on VPS |

---

## 4. OPEN ITEMS FOR NEXT SESSION

In priority order:

### IMMEDIATE — Phase 9 BLOCKER
- **#9** Fix `plugin-skills/browser-automation` symlink (commands in Section 2.3 above)

### PHASE 9 PRE-FLIGHT
- **models.json schema verification** — before writing Phase 9 model config, run:
  ```bash
  grep -r "models.json" /root/openclaw --include="*.ts" --include="*.mjs" --include="*.js" | head -20
  ```
  We need to know the exact schema OpenClaw expects before finalizing the file.

- **`openclaw.json.last-good` review** — this 60KB file was added to the repo in this pull.
  It is a backup of the last known-good runtime config. Review before Phase 9 touches
  the live `openclaw.json`.

### CARRY-FORWARD (pre-existing open items)
- **#1** Initialize P4 skill audit gate (`skills/.audit-manifest.json` missing)
- **#2** Locate agent auth profile (`config/agent-auth-profiles.json` missing)
- **#3** Bring `deploy/sanitize-runtime-config.py` into repo (Ghost Reference)
- **#6** `/health/deep` endpoint absent (no "running but broken" detection)
- **#7** No staging environment

### LOW PRIORITY — LOCAL MACHINE HYGIENE
- Tray-autostart `OLLAMA_MODELS` path may revert to `F:\` on next Windows reboot (r11)
- Reclaim ~4 GB partial blob data from `F:\blobs\` (r11)
- Identify origin of `OLLAMA_MODELS=F:\` env var (r11)

---

## 5. PHASE 9 SCOPE (NOT STARTED)

Phase 9 = migrate primary model lineup from Anthropic cloud to local Ollama.

**Target state:**
- 78 Sonnet agents → `qwen3.6:latest` (Tier 1 workhorse)
- 22 Haiku agents → `qwen3:8b` (Tier 2 fast loops)
- 7 Opus agents → unchanged (TIER0_SPEND audit required per Block 6)
- `kimi-k2.5:cloud` as long-context overflow (remote-proxied, use sparingly)

**Before Phase 9 can start:**
1. Fix browser-automation symlink (Item #9)
2. Verify `models.json` schema (see above)
3. Confirm Ollama is healthy: `curl http://127.0.0.1:11434/api/tags`
4. Write TIER0_SPEND audit entry for any Opus agent that will be touched

**Estimated risk:** MEDIUM. `models.json` change affects 100 agents. Roll back path:
`git revert <phase9-commit>` + `systemctl restart openclaw`.

---

## 6. KEY FILE LOCATIONS

| File | Purpose |
|---|---|
| `/root/openclaw/REGGIE-STATE.md` | Canonical audit state — read first |
| `/root/openclaw/PLATFORM-REFERENCE.md` | Full architecture reference |
| `/root/openclaw/openclaw.json.last-good` | Last known-good runtime config backup |
| `/opt/openclaw/.openclaw/openclaw.json` | LIVE runtime config (managed by openclaw pre-start) |
| `/root/openclaw/deploy/hostinger/server-openclaw.json` | Repo version of runtime config |
| `/root/openclaw/agents/main/agent/models.json` | Model lineup config |
| `/root/openclaw/plugin-skills/browser-automation` | ❌ BROKEN SYMLINK — fix before Phase 9 |
| `/etc/systemd/system/openclaw.service` | systemd unit (production shape) |
| `/root/openclaw/.env` | Environment variables (26 keys) |

---

## 7. COMMANDS TO VERIFY SYSTEM STATE

Run these at the start of any new session to confirm current state:

```bash
# Gateway live?
curl -fsS http://127.0.0.1:18789/healthz

# Ollama models available?
curl -fsS http://127.0.0.1:11434/api/tags | python3 -m json.tool | grep name

# systemd service healthy?
systemctl status openclaw.service --no-pager | head -20

# Any recent errors?
journalctl -u openclaw.service --since '1 hour ago' --no-pager | grep -iE '(error|warn|ABRT|crash)' | tail -20

# Symlink still broken?
ls -la /root/openclaw/plugin-skills/browser-automation

# pnpm in sync?
cd /root/openclaw && pnpm install --frozen-lockfile 2>&1 | tail -5
```

---

## 8. DOCTRINE REMINDERS FOR NEXT SESSION

- **Tier routing:** Default Tier 2 (Ollama). Promote only for irreversible ops, leaves-TJB-surface, or 8K+ context.
- **Tier 0 (Opus):** Requires written `TIER0_SPEND` audit entry BEFORE the call.
- **No public surface (P7):** Gateway stays on localhost. Do not bind to `0.0.0.0`.
- **HITL (P9):** Any payment, deletion, mass-broadcast, or account closure requires operator confirmation.
- **Append-only audit log:** Never edit prior REGGIE entries. Corrections = new entry with `Status=ROLLED_BACK`.
- **Channel Authority (P1):** REGGIE stands down 30 min after GHL AI Employee replies on a native channel.
- **`openclaw.json` is NOT the source of truth** — `deploy/hostinger/server-openclaw.json` in repo is canonical. The pre-start script governs keys at runtime.

---

*End of handoff. Next action: fix the browser-automation symlink, then Phase 9.*
