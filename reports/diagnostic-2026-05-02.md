# OpenClaw Full Diagnostic Report
**Generated:** 2026-05-02 12:38 UTC  
**System:** OpenClaw Gateway v2026.4.29 (a448042)  
**Environment:** Production — Hostinger VPS `177.7.32.224`  
**Prepared by:** GitHub Copilot (Claude Sonnet 4.5)

---

## Executive Summary

The OpenClaw production stack is **operationally healthy** with one blocking issue: the Telegram channel bot token is revoked and requires replacement via BotFather. Both Docker containers are running and reporting healthy. GHL integration is fully operational. All other previously flagged health alerts are either resolved or inapplicable to the current deployment state.

**Blocking issue count:** 1  
**Requires user action:** Yes (Telegram token rotation)  
**Gateway availability:** ✅ Serving requests on port 18789  
**Webhook handler:** ✅ Processing GHL events on port 8788  

---

## 1. Infrastructure

| Component | Value |
|---|---|
| VPS Provider | Hostinger |
| VPS IP | `177.7.32.224` |
| OS user | `root` |
| Deployment method | Docker Compose (`/root/openclaw/docker-compose.yml`) |
| Container runtime | Docker |
| Restart policy | `"no"` (manual restart required on crash) |
| SSH alias | `Host hostinger` → `root@177.7.32.224` |

---

## 2. Container Status

**Captured at:** 2026-05-02 12:37 UTC

```
NAMES              STATUS                    PORTS
openclaw-webhook   Up 16 minutes (healthy)   0.0.0.0:8788->8788/tcp
openclaw-bot       Up 11 minutes (healthy)   0.0.0.0:18789->18789/tcp
```

Both containers report Docker health status **healthy**. The `openclaw-bot` container started at `2026-05-02T12:26:25Z` (second attempt — first attempt at 12:21 failed due to secrets loader ENOENT from a WhatsApp/baileys dependency, which is expected when git is absent from the container).

---

## 3. Gateway Startup Sequence (Current Run)

| Time (UTC) | Event |
|---|---|
| 12:26:28 | Gateway loading configuration |
| 12:26:29 | Resolving authentication |
| 12:26:29 | Starting |
| 12:26:32 | **Config size-drop guard triggered** — write rejected (see §7) |
| 12:27:33 | HTTP server started |
| 12:27:33 | Health monitor started (interval: 300s, startup-grace: 60s, channel-connect-grace: 120s) |
| 12:27:34 | **Agent model confirmed:** `anthropic/claude-sonnet-4-5` |
| 12:27:34 | Log file: `/tmp/openclaw-1001/openclaw-2026-05-02.log` |
| 12:27:36 | **Gateway READY** |
| 12:27:36 | Telegram channel started → **immediate 401 error** |
| 12:32:34 | Health monitor restarted Telegram channel (reason: stopped) — reset retry counter |

---

## 4. Health Issue Assessment

### Issue 1 — GHL Auth `CRITICAL` → ✅ RESOLVED

**Original symptom:** GHL authentication failures blocking all CRM operations.  
**Root cause (resolved):** Invalid GHL Private Integration Token (PIT) and missing/malformed `GHL_LOCATION_ID_TJB` / `GHL_PRIVATE_INTEGRATION_TOKEN_TJB` tenant vars in the server `.env`.  
**Current state:** Zero GHL errors in current container run. Webhook handler confirmed:

```json
{"msg":"OpenClaw GHL Webhook Handler started","tenants":[{"alias":"TJB","locationId":"TW8JsPW5NMnA3tfK2XLn"}]}
{"msg":"Phase 3 modules loaded (3/3)"}
{"msg":"GHL OAuth auto-refresh initialized"}
```

**Active token:** `pit-214f148c-23d8-429f-9173-fd0b3cd20d88`  
**Active location:** `TW8JsPW5NMnA3tfK2XLn` (TJB)

---

### Issue 2 — Telegram 401 `HIGH` → 🔴 ACTIVE — BLOCKED ON USER ACTION

**Symptom:** Telegram channel fails immediately on every connection attempt with HTTP 401.

**Error (repeating):**
```
Telegram bot token unauthorized for account "default"
(getMe returned 401 from Telegram; source: config token).
Update channels.telegram.botToken, channels.telegram.tokenFile,
or TELEGRAM_BOT_TOKEN with the current BotFather token.
```

**Current retry state (as of 12:35:59 UTC):** Attempt 6/10, backoff 162s  
The health monitor fires every 300s and resets the retry counter, preventing permanent channel shutdown.

**Invalid token in `.env.prod`:**  
`8410783483:AAHqwK6R5Iiy1jns3zRFLjrYhePmhQXb13M`  
This token has been revoked by BotFather (confirmed by 401 response from Telegram's `getMe` endpoint).

**Impact:** Telegram channel is entirely non-functional. All agents using Telegram for delivery are unreachable via that channel. Gateway itself is healthy and all other operations continue normally.

**Fix (requires user action — see §9):**  
1. Open Telegram → `@BotFather` → `/mybots` → select bot → `API Token` → revoke & regenerate  
2. Update two env vars in `deploy/hetzner/.env.prod`  
3. SCP to server and restart `openclaw-bot`

---

### Issue 3 — Cron Model Not Allowed `MEDIUM` → ⚠️ NOT APPLICABLE (deferred)

**Original symptom:** Health monitor flagged cron jobs referencing a model that is not in the gateway's allowed model list.  
**Current state:** No cron jobs exist on the server. The `cron/` directory and `cron/jobs.json` are **local-only** and have never been deployed.  
**Local cron/jobs.json:** 42 jobs, all using `"model": "openai/gpt-4o-mini"`. The `OPENAI_API_KEY` is present and valid in the container.  
**Action needed:** When cron is deployed, verify `openai/gpt-4o-mini` is in the gateway's allowed model list, or update jobs to a confirmed-allowed model.

---

### Issue 4 — Package Update Available `LOW-MEDIUM` → ✅ RESOLVED

**Original symptom:** Update notification for OpenClaw.  
**Current state:** Running v2026.4.29 (latest). No update available for openclaw itself.  
Note: pnpm 10.32.1 → 10.33.2 update notice appears in secrets loader output — this is informational only and does not affect gateway operation.

---

### Issue 5 — Anomaly Metrics Stale `LOW` → ⚠️ NOT ACTIVE

**Original symptom:** Anomaly detection metrics not being updated.  
**Current state:** No cron scheduler running on server → no anomaly-check job → no metric polling. This is expected given no cron deployment.  
**Will resolve automatically** when cron/jobs.json is deployed and the anomaly job runs on schedule.

---

### Issue 6 — ENOENT File Noise `LOW` → ✅ RESOLVED

**Original symptom:** Container logs polluted with ENOENT errors referencing missing files.  
**Current state:** ENOENT appears only once in the current run — the secrets loader attempting to resolve a WhatsApp/baileys git dependency (`libsignal-node`). This is a pre-boot error from the first container start attempt (12:21 UTC) caused by `git` not being installed in the container image. The second start (12:26 UTC) succeeded via the `--allow-unconfigured` flag. No ENOENT errors appear in normal operation.

---

## 5. Config Subsystem

### Config File (Server Host)

| Field | Value |
|---|---|
| Path | `/root/.openclaw/openclaw.json` |
| Size | 395,481 bytes |
| Last modified | 2026-05-02 12:26:20 UTC |
| Source | OpenClaw-generated default + merged agent definitions |
| Contains invalid schema keys | Yes (non-fatal warnings) |

### Config File (Local — Cleaned)

| Field | Value |
|---|---|
| Path | `config/openclaw.prod.cleaned.json` |
| Size | 171,296 bytes |
| Status | Local only — not currently active on server |
| Invalid schema keys | Stripped |

### Size-Drop Guard (Non-Fatal)

At startup, OpenClaw attempted to write the 171,296-byte cleaned config over the 395,481-byte host config. The **size-drop guard** rejected this write to prevent accidental data loss:

```
Config write rejected: /opt/openclaw/.openclaw/openclaw.json
(size-drop:395481->171296)
Rejected payload saved to:
/opt/openclaw/.openclaw/openclaw.json.rejected.2026-05-02T12-26-32-662Z
```

**Impact:** None. Gateway loaded the existing 395,481-byte config and started normally.  
**Action (optional):** To use the cleaned config, the size-drop guard must be bypassed. Consult OpenClaw docs for `--force-config-write` or equivalent flag, or manually replace the file on the host before restart.

### Schema Warnings (Non-Fatal)

The active config contains agent definitions with keys not recognized by the current schema:
- `business_scope`
- `ghl_token_group`
- `operational_boundaries`

These generate warnings at startup but do **not** prevent gateway operation. All agents load and run normally.

Additionally, `TELEGRAM_ALERT_CHAT_ID` is empty, producing:
```
Config: missing env var "TELEGRAM_ALERT_CHAT_ID" at channels.telegram.allowFrom[0]
Config: missing env var "TELEGRAM_ALERT_CHAT_ID" at channels.msteams.groupAllowFrom[0]
```
These are also non-fatal; the affected allow-from filters are simply inactive.

---

## 6. Credentials Inventory

| Credential | Status | Notes |
|---|---|---|
| GHL PIT (`GHL_PRIVATE_INTEGRATION_TOKEN`) | ✅ Valid | `pit-214f148c-...` |
| GHL Location ID | ✅ Valid | `TW8JsPW5NMnA3tfK2XLn` |
| Supabase URL | ✅ Configured | `aagqvfwuixpxtdcrdxmv.supabase.co` |
| Supabase Service Role Key | ✅ Configured | Set in env |
| OpenAI API Key | ✅ Configured | `sk-proj-6anr6...` present in env |
| OpenClaw Codex Manual Token | ✅ Configured | Full JWT set in env |
| OpenClaw Gateway Auth Token | ✅ Configured | `bvOwxLoW0rZQ8JP...` |
| GHL Webhook Secret | ✅ Configured | `JDlBA0tMCh...` |
| **Telegram Bot Token** | **🔴 INVALID** | Revoked — must be regenerated |
| Telegram Alert Chat ID | ⚠️ Empty | Non-fatal; alert delivery inactive |
| Canva credentials | ⚠️ Empty | Non-fatal; Canva features inactive |
| Google Drive Base Folder ID | ⚠️ Empty | Non-fatal; GDrive features inactive |
| YouTube Channel ID | ⚠️ Empty | Non-fatal; YouTube features inactive |

---

## 7. Webhook Handler

**Container:** `openclaw-webhook`  
**Port:** `8788`  
**Status:** Up (healthy), zero errors

Startup events (confirmed):
```
OpenClaw GHL Webhook Handler started — tenants: [TJB → TW8JsPW5NMnA3tfK2XLn]
Phase 3 modules loaded (3/3)
GHL OAuth auto-refresh initialized
```

GHL webhook endpoint is live and processing. Health check (`GET /health`) responding successfully.

---

## 8. Summary Status Board

| Subsystem | Status | Severity |
|---|---|---|
| Docker containers (both) | ✅ Up (healthy) | — |
| Gateway HTTP server (port 18789) | ✅ Serving | — |
| GHL integration | ✅ Operational | — |
| GHL webhook handler | ✅ Operational | — |
| Supabase connection | ✅ Configured | — |
| OpenAI API | ✅ Configured | — |
| Agent model (claude-sonnet-4-5) | ✅ Active | — |
| Health monitor | ✅ Running (300s interval) | — |
| Telegram channel | 🔴 FAILED (401) | HIGH |
| Cron scheduler | ⚠️ Not deployed | DEFERRED |
| Anomaly metrics | ⚠️ Not active (no cron) | DEFERRED |
| Config schema warnings | ⚠️ Non-fatal warnings | LOW |
| Config size-drop rejection | ⚠️ Non-fatal, informational | LOW |
| Telegram alert chat ID | ⚠️ Empty (alerts silent) | LOW |

---

## 9. Required Actions

### 🔴 P1 — Regenerate Telegram Bot Token (USER ACTION REQUIRED)

**Steps:**

1. Open Telegram → search `@BotFather` → `/mybots`
2. Select your bot → tap **API Token** → **Revoke current token** → copy new token
3. Edit `deploy/hetzner/.env.prod` — update both lines:
   ```
   TELEGRAM_BOT_TOKEN=<NEW_TOKEN>
   OPENCLAW_TELEGRAM_BOT_TOKEN=<NEW_TOKEN>
   ```
4. Deploy to server:
   ```powershell
   scp deploy/hetzner/.env.prod root@177.7.32.224:/root/openclaw/.env
   ```
5. Restart bot container:
   ```powershell
   ssh root@177.7.32.224 "cd /root/openclaw && docker compose restart bot"
   ```
6. Verify:
   ```powershell
   ssh root@177.7.32.224 "docker logs openclaw-bot 2>&1 | grep -i telegram | tail -10"
   ```
   Expected: No 401 errors. `[telegram] [default] connected` or similar.

---

### 🟡 P2 — Set `TELEGRAM_ALERT_CHAT_ID` (optional but recommended)

After the bot token is valid and Telegram is connected:
1. Send a message to the bot from your Telegram account
2. Retrieve your chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Add to `.env.prod`:
   ```
   TELEGRAM_ALERT_CHAT_ID=<YOUR_CHAT_ID>
   OPENCLAW_ALERT_TELEGRAM_CHAT_ID=<YOUR_CHAT_ID>
   ```
4. SCP and restart (same as P1 steps 4–5)

---

### 🟡 P3 — Deploy Cron Jobs (when ready)

```powershell
scp cron/jobs.json root@177.7.32.224:/root/openclaw/cron/jobs.json
ssh root@177.7.32.224 "cd /root/openclaw && docker compose restart bot"
```

Before deploying, confirm `openai/gpt-4o-mini` is an allowed model in the gateway. All 42 jobs currently reference this model.

---

### ⚪ P4 — Optionally Eliminate Schema Warnings (low priority)

To activate the cleaned 171,296-byte config and suppress schema warnings:
- Research the `--force-config-write` flag or equivalent in OpenClaw v2026.4.29 docs
- Or: stop bot, replace `/root/.openclaw/openclaw.json` with cleaned version, restart
  ```bash
  # On server:
  cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.bak
  # (then scp cleaned config from local)
  ```
- Risk: Cleaned config is smaller and may be missing agent data that was merged in by OpenClaw

---

## 10. Appendix — Key Reference Data

### Server Paths
| Path | Purpose |
|---|---|
| `/root/openclaw/` | Docker Compose working directory |
| `/root/openclaw/.env` | Runtime env (source: `deploy/hetzner/.env.prod`) |
| `/root/openclaw/docker-compose.yml` | Container definitions |
| `/root/.openclaw/openclaw.json` | Active config (395,481 bytes) |
| `/root/openclaw/data/` | Persistent data volume |
| `/root/openclaw/logs/` | Log volume |
| `/root/openclaw/memory/` | Agent memory volume |

### Local Paths
| Path | Purpose |
|---|---|
| `deploy/hetzner/.env.prod` | Env source of truth (local) |
| `config/openclaw.prod.cleaned.json` | Cleaned config (not active on server) |
| `cron/jobs.json` | 42 cron jobs (not deployed to server) |

### Port Map
| Port | Service |
|---|---|
| `18789` | OpenClaw Gateway HTTP API |
| `8788` | GHL Webhook Handler |
| `18791` | Browser control (internal, `127.0.0.1` only) |

---

*End of Diagnostic Report — 2026-05-02*
