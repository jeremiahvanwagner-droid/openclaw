# Handoff: VPS Deploy — Canary Live but Unstable; Telegram Disabled (Cost Stop)

**Date:** 2026-05-10
**Author:** Claude Code (CLI session)
**Recipient:** Claude Code (IDE session — Hostinger MCP loaded)
**Operator:** Jeremiah Van Wagner (CVO, Truth J Blue LLC)
**Repo:** `github.com/jeremiahvanwagner-droid/openclaw`
**VPS:** `root@177.7.32.224` (Hostinger), git checkout + runtime at `/opt/openclaw`, env at `/etc/openclaw/.env`
**Branch:** `main` (HEAD = `17c54a6` after this session's commits)
**Status:** Gateway + Webhook + Dashboard all live via systemd. Canary deploy CI is GREEN. **Phase B (30-min observation) FAILED** — gateway watchdog-aborted at 14:22:36 UTC due to Telegram 401 retry storm. Telegram channel now disabled. Phase C (full rollout) BLOCKED until VPS gateway runs 30 min clean.

---

## CRITICAL CONTEXT — READ FIRST

**Telegram retry-loop = past API cost disaster.** In March 2026 the same Telegram unauthorized→retry pattern burned hundreds of dollars in Anthropic API (secondary spend from self-healing/recovery agents reacting to each channel exit). Operator closed the project over it. **Do NOT re-enable `channels.telegram.enabled` without first verifying the bot token via `curl https://api.telegram.org/bot<TOKEN>/getMe`.** Assume any sustained channel exit loop is potentially expensive even when the immediate logs don't show Anthropic traffic.

Telegram is currently `enabled: false` on the VPS gateway (patched live). It is NOT yet patched in the source-of-truth `deploy/hostinger/server-openclaw.json`, so the next full deploy regenerates with telegram enabled. **You must either** patch server-openclaw.json before the next deploy OR get a verified-working bot token first.

---

## WHAT IS DONE (cumulative — do not redo)

### From prior CLI session ([prior handoff](2026-05-09-vps-deploy-unblock.md))
1. DB1 confirmed live (`aagqvfwuixpxtdcrdxmv`). All 9 openclaw migrations + 8 tjb-stub files applied.
2. CI/CD pipeline repaired: `HOSTINGER_*` secrets, agent count `107`, deploy targets `/opt/openclaw`.
3. VPS `/opt/openclaw` initialized as live git checkout.
4. `ANTHROPIC_API_KEY_SOVEREIGN` and `ANTHROPIC_API_KEY_SHARED` added to `/etc/openclaw/.env` (mirrored from existing `ANTHROPIC_API_KEY`).

### This session (2026-05-10)

**Env vars added to `/etc/openclaw/.env`:**
| Var | Value (truncated) | Purpose |
|---|---|---|
| `TELEGRAM_ALERT_CHAT_ID` | `7737707872` | validate-env requirement (operator's chat ID) |
| `OPENCLAW_GHL_WEBHOOK_SECRET` | `450e8396…` | validate-env requirement (HMAC for `/webhook/ghl`) |
| `GHL_PRIVATE_INTEGRATION_TOKEN_TJB` | mirrored from un-suffixed | Tenant registration for `lib/ghl-tenant-resolver.mjs` |
| `GHL_LOCATION_ID_TJB` | mirrored from un-suffixed | Tenant registration |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://aagqvfwuixpxtdcrdxmv.supabase.co` | Dashboard (Next.js) Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci…` (legacy anon JWT for DB1) | Dashboard Supabase client |
| `OPENCLAW_GATEWAY_AUTH_TOKEN` | `e45c083ef0ca2de28edb0ea1fae16e84a43ec7ab664b2462eff1a6d5d129bb86` | Gateway token auth (was missing) |

Backups exist at `/etc/openclaw/.env.bak.2026-05-10` and `.env.bak.2026-05-10-A1` and `.env.bak.A3a-fix`.

**Repo commits pushed to `main`:**
| SHA | Title |
|---|---|
| [`2f40163`](https://github.com/jeremiahvanwagner-droid/openclaw/commit/2f40163) | `fix(deploy): chmod +x openclaw-pre-start.sh — systemd ExecStartPre needs exec bit (status=203/EXEC)` |
| [`5218634`](https://github.com/jeremiahvanwagner-droid/openclaw/commit/5218634) | `fix(deploy): strip governance metadata keys from openclaw.json on start` |
| [`34c5c2e`](https://github.com/jeremiahvanwagner-droid/openclaw/commit/34c5c2e) | `config(gateway): allow https://api.truthjblue.dev origin for Control UI` |
| [`17c54a6`](https://github.com/jeremiahvanwagner-droid/openclaw/commit/17c54a6) | `config(gateway): disable secondary device-pairing auth for Control UI` |

**Live patches to `/opt/openclaw/.openclaw/openclaw.json` (NOT yet in repo's server-openclaw.json):**
- `channels.telegram.enabled = false` (cost-stop, this session)

The other live patches (`gateway.controlUi.allowedOrigins`, `gateway.controlUi.dangerouslyDisableDeviceAuth`) ARE reflected in `deploy/hostinger/server-openclaw.json` already (commits 34c5c2e + 17c54a6).

**CI runs:**
- [25629739892](https://github.com/jeremiahvanwagner-droid/openclaw/actions/runs/25629739892) failed — chmod issue
- [25629810688](https://github.com/jeremiahvanwagner-droid/openclaw/actions/runs/25629810688) failed — config invalid keys + GHL tenant + dashboard env
- [25630315358](https://github.com/jeremiahvanwagner-droid/openclaw/actions/runs/25630315358) failed — Docker port collision
- **[25630483421](https://github.com/jeremiahvanwagner-droid/openclaw/actions/runs/25630483421) GREEN** — current canary on record

**Other infra changes (one-time, not in repo):**
- Two orphan Docker containers `openclaw-bot` and `openclaw-webhook` were stopped via `docker stop` (they had been running 17 hours with `restart: "no"`, blocking systemd from binding ports 8788 and 18789). They are stopped, not removed — restart with `docker start openclaw-bot openclaw-webhook` if rollback needed.
- `systemctl reset-failed openclaw-webhook.service` was run after `start-limit-hit`.
- `openclaw-pre-start.sh` script extended to also strip `meta.rollout_mode`, `meta.rollout_generated_by`, and per-agent `business_scope` / `ghl_token_group` / `operational_boundaries` (governance metadata the openclaw CLI's zod schema rejects).

---

## CURRENT STATE (snapshot at handoff time, ~14:30 UTC)

### Services
| Service | State | Listener | Reachable |
|---|---|---|---|
| `openclaw` (gateway) | active | `127.0.0.1:18789` and `[::1]:18789` | `https://api.truthjblue.dev/health` → `{"ok":true,"status":"live"}` |
| `openclaw-webhook` | active | `127.0.0.1:8788` | local `:8788/health` → 200 with auth modes |
| `openclaw-dashboard` | active | `*:3001` | `https://truthjblue.dev` → 307 → `/login` |
| `caddy` | active | `*:80`, `*:443` | TLS terminating + proxy |

### What's working
- Gateway Control UI at `https://api.truthjblue.dev` connectable (origin allowlist + dangerouslyDisableDeviceAuth + token auth)
- Operator successfully connected to Control UI Chat ("Ready to chat", `claude-sonnet-4-5`, fallbacks via `claude-cli`)
- Webhook handler accepting auth (ghlEd25519 + workflowBearer + openclawHmac)
- Dashboard Next.js serving (but operator says "needs much work" — deferred)

### What's NOT working / outstanding
1. **Telegram channel disabled** — bad/stale `TELEGRAM_BOT_TOKEN` in `/etc/openclaw/.env` returns 401 from `getMe`. Must NOT re-enable until token verified.
2. **CLI version drift** — gateway shows "Update available: v2026.5.7 (running v2026.4.29)". Use `gh workflow run deploy-bot.yml --field upgrade_cli=true` to bump, NOT the in-UI "Update now" button.
3. **Ollama missing entirely** — no container, no systemd unit, `which ollama` not found. Bot doesn't crash without it (using Anthropic), but Phase 9 local-model agents can't route. Separate provisioning needed.
4. **Dashboard "needs much work"** (operator's words) — Phase deferred.
5. **Operator's local `openclaw gateway run`** is running on their machine and was the actual responder for the Telegram `/status` screenshot they shared (the VPS gateway was 401-bouncing the whole time). They should stop the local gateway once VPS Telegram works, to avoid two gateways with the same bot token.

### Phase B observation window — FAILED ❌
Started 13:54:56 UTC, target end 14:25 UTC.
- ✅ All services stayed `active`
- ❌ 11 restarts in window (only ~5 manual; rest were watchdog)
- ❌ 10+ liveness warnings, max `eventLoopDelayP99Ms=6203.4 / Max=11676.9 / CPU=96%`
- ❌ Watchdog ABRT at 14:22:36 (`status=6/ABRT, Failed with result 'watchdog'`) — gateway became unresponsive for 5min
- **Root cause:** Telegram channel retry storm against bad token (401 every 5–30s for 28 min)

After Telegram disabled + restart at ~14:25 UTC, gateway is quiescent (no journal events, no API connections, no liveness warnings, zero outbound). New 30-min observation needed before Phase C.

### Database (DB1 = `aagqvfwuixpxtdcrdxmv`)
- All migrations applied (verified pre-this-session). `supabase db diff --linked` was empty.
- No SQL changes this session.

---

## NEXT STEPS — RESUME ORDER

### Phase B′ — Re-run 30-min observation (NEW WINDOW)
Telegram is now disabled. Gateway should be stable. Start a fresh 30-min window from now (or whenever IDE session picks up).

```bash
# Quick health snapshot
ssh root@177.7.32.224 "for s in openclaw openclaw-webhook openclaw-dashboard; do printf '%-25s ' \$s; systemctl is-active \$s; done"
ssh root@177.7.32.224 "journalctl -u openclaw.service --since '30 minutes ago' --no-pager | grep -iE 'liveness warning|watchdog|ABRT|telegram.*unauthorized' | tail -10"
```

**Acceptable in this window:** A few `liveness warning` entries with `eventLoopDelayMaxMs` between 1000–2000 (model warm-up). NO sustained P99 > 1000ms. NO watchdog. NO Telegram retry entries (we disabled the channel).

**Unacceptable (STOP):** Any watchdog ABRT, any sustained eventLoopDelay > 1000ms, any Telegram retry (would mean enabled flag flipped somehow).

### Phase A.4 — Restore Telegram (operator decision)
Either:

**Option A (operator provides fresh token):**
```bash
# Get fresh token from BotFather, then on VPS:
ssh root@177.7.32.224 "
  curl -fsS 'https://api.telegram.org/bot<NEW_TOKEN>/getMe' && \
  sed -i 's|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=<NEW_TOKEN>|' /etc/openclaw/.env && \
  echo '{\"channels\":{\"telegram\":{\"enabled\":true}}}' | sudo -u openclaw bash -lc 'cd /opt/openclaw && export HOME=/opt/openclaw OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw && openclaw config patch --stdin' && \
  systemctl restart openclaw"
```
**MUST verify `getMe` returns `{ok:true}` BEFORE flipping enabled=true.** If `getMe` fails, do not enable.

**Option B (defer Telegram, push patch to repo to keep it disabled across deploys):**
```bash
# Edit deploy/hostinger/server-openclaw.json, find channels.telegram block, add "enabled": false
# Commit + push
```
Without this, a future full-deploy that runs `build-runtime-rollout-config.mjs` will re-enable Telegram and trigger the loop again. **This is the highest-priority sticky-note: do not run deploy-bot.yml without one of these two options applied.**

### Phase C — Promote to full rollout
Only after Phase B′ clean window. Same as the prior handoff:
```powershell
gh workflow run deploy-bot.yml `
  --repo jeremiahvanwagner-droid/openclaw `
  --ref main `
  --field rollout_mode=full `
  --field upgrade_cli=false `
  --field clean_server_checkout=false
```
Watch the run, then run E2E checks per [prior handoff Step 5](2026-05-09-vps-deploy-unblock.md).

### Phase D — Audit entry r12 to REGGIE-STATE.md
Per prior handoff Step 7. Use entry ID `r12-2026-05-10-full-deploy` (note: 2026-05-10, not 09 — the deploy actually shipped on the 10th).

### Phase E — Phase 6 work (Supabase circuit-breaker / rate_governor_state)
Original next-phase per memory. Not started.

### Phase F — DB tuning & scaling on DB1
Original. Not started.

### Followups (lower priority)
- **Ollama provisioning** — Phase 9 dependency. Decide architecture (Docker, systemd, or external). Bot works fine without it on Anthropic, but local-model agents will fail until provisioned.
- **CLI upgrade** v2026.4.29 → v2026.5.7+. Run via `--field upgrade_cli=true`.
- **Dashboard rebuild** — operator said "needs much work" without specifying what. Probe before attempting.
- **Stop operator's local `openclaw gateway run`** once VPS Telegram channel is healthy (avoids two gateways sharing same bot token).
- **Update `server-openclaw.json` for telegram.enabled=false** if going Option B above (high priority, see Phase A.4).

---

## CONNECT TO THE GATEWAY (for chatting with REGGIE in IDE session)

| Field | Value |
|---|---|
| URL | `https://api.truthjblue.dev` |
| WebSocket URL | `wss://api.truthjblue.dev` (default in form) |
| Gateway Token | `e45c083ef0ca2de28edb0ea1fae16e84a43ec7ab664b2462eff1a6d5d129bb86` |
| Password | leave blank |

Token also in `/etc/openclaw/.env` as `OPENCLAW_GATEWAY_AUTH_TOKEN`. Auth mode is `token`, allowedOrigins is `["https://api.truthjblue.dev"]`, device-pairing layer is disabled.

---

## KEY ARCHITECTURAL FACTS

- **`/opt/openclaw`** = git checkout AND openclaw CLI runtime home. systemd services source HOME=/opt/openclaw and OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw.
- **`/root/openclaw`** = stale clone, ignore.
- **systemd is production**, Docker (`docker-compose-server.yml`) is dev-only per the file's own comment. The `restart: "no"` constraint means stopped containers stay stopped.
- **Dual gateway risk:** `openclaw gateway run` on operator's local machine and on VPS via systemd both authenticate the same Telegram bot token. Two gateways = two `getMe` calls = doubled rate-limit pressure + risk of duplicate message processing.
- **`openclaw-pre-start.sh`** runs as `ExecStartPre` and strips: `agents.defaults.skills`, `meta.rollout_mode`, `meta.rollout_generated_by`, and per-agent `business_scope` / `ghl_token_group` / `operational_boundaries`. These are governance-metadata keys emitted by `scripts/upgrade/build-runtime-rollout-config.mjs` that the openclaw CLI's zod schema rejects.
- **Config patches via CLI** require explicit `HOME=/opt/openclaw OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw` env override, otherwise `openclaw config patch` writes to `/home/openclaw/.openclaw/openclaw.json` (wrong file).
- **GHL tenant resolver** (`lib/ghl-tenant-resolver.mjs:147`): `listTenants()` only returns explicitly-suffixed tenants (`*_TJB`, `*_MSL`); the un-suffixed `GHL_PRIVATE_INTEGRATION_TOKEN` is fallback-only. We mirrored to `*_TJB` to register the tenant.
- **DB1 anon key** is the legacy JWT (`eyJhbGci…`); modern `sb_publishable_…` also exists. Used legacy for Next.js compatibility.

---

## DOCTRINE REMINDERS

- **P3:** No new SQL via `mcp__apply_migration`. Schema changes must be migration files committed via `supabase db push`.
- **P9:** No promotion to full rollout without 30-min clean canary observation. Phase B failed; Phase B′ must restart fresh.
- **Audit:** REGGIE-STATE.md is append-only. r12 entry pending.
- **Telegram:** see CRITICAL CONTEXT above.

---

## IF YOU GET BLOCKED

Append a `## BLOCKED` section to this file with: which step, the exact error, what you tried, and what the operator needs to decide. Do not abandon silently. Do not "let things stabilize" — that's the failure mode that caused the March cost incident.
