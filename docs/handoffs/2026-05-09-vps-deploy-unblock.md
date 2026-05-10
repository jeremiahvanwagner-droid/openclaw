# Handoff: Unblock VPS Deploy — Missing Env Vars + Canary → Full Rollout

**Date:** 2026-05-09
**Author:** Claude Code (CLI session — context exhausted)
**Recipient:** Claude Code (IDE session — Hostinger MCP connected)
**Operator:** Jeremiah Van Wagner (CVO, Truth J Blue LLC)
**Repo:** `github.com/jeremiahvanwagner-droid/openclaw`
**VPS:** `root@177.7.32.224` — `/opt/openclaw` is the authoritative git checkout AND runtime home
**Env file:** `/etc/openclaw/.env` (NOT `/root/openclaw/.env` — that clone is dead)
**Branch:** `main`
**Status:** BLOCKED — 2 env vars missing from VPS, deploy cannot proceed until operator supplies values

---

## WHAT IS DONE (do not redo)

All of the following completed successfully in the prior CLI session:

1. **DB1 confirmed live.** `SUPABASE_URL` in `/etc/openclaw/.env` points to `aagqvfwuixpxtdcrdxmv` (DB1 "Truth J Blue-Umbrella"). DB2 (`dbapisqoajswktxohfby`) does not exist — confirmed via `list_projects`. Phase 4 (DB sunset) skipped.

2. **All 9 openclaw migrations applied to DB1 via `supabase db push --linked --include-all`.** Eight `*_tjb_stub.sql` files were created in `supabase/migrations/` to satisfy the shared-DB CLI requirement. `supabase db diff --linked` returned empty. All committed and pushed.

3. **GitHub Actions deploy pipeline repaired:**
   - Old `HETZNER_*` secrets deleted from repo (operator instruction: "burned")
   - `HOSTINGER_HOST=177.7.32.224`, `HOSTINGER_USER=root`, `HOSTINGER_SSH_KEY` set from `~/.ssh/id_ed25519` (hostinger-openclaw-2026-04)
   - Expected agent count updated: `--expected-agent-count 103` → `107`
   - Preflight and deploy steps use `/opt/openclaw` (correct checkout path)

4. **VPS `/opt/openclaw` initialized as git repo** pointing to `git@github.com:jeremiahvanwagner-droid/openclaw.git`, reset to `origin/main`.

5. **Two of four missing env vars added to `/etc/openclaw/.env`:**
   - `ANTHROPIC_API_KEY_SOVEREIGN` — set equal to existing `ANTHROPIC_API_KEY` value
   - `ANTHROPIC_API_KEY_SHARED` — set equal to existing `ANTHROPIC_API_KEY` value

6. **Last GitHub Actions run** ([#25613280863](https://github.com/jeremiahvanwagner-droid/openclaw/actions/runs/25613280863)): all tests passed, SSH auth passed, pnpm install ran, Playwright Chromium downloaded. Failed at step [4/8] — `node scripts/validate-env.mjs --bot` — due to 2 remaining missing vars (now reduced to 2; SOVEREIGN and SHARED were since added).

---

## CURRENT BLOCKER

`scripts/validate-env.mjs --bot` requires all of these (4 were missing, 2 are now fixed):

| Var | Status | Action needed |
|---|---|---|
| `ANTHROPIC_API_KEY_SOVEREIGN` | ✅ Added to `/etc/openclaw/.env` | None |
| `ANTHROPIC_API_KEY_SHARED` | ✅ Added to `/etc/openclaw/.env` | None |
| `TELEGRAM_ALERT_CHAT_ID` | ❌ Key present but value is empty string | **Operator must provide numeric chat ID** |
| `OPENCLAW_GHL_WEBHOOK_SECRET` | ❌ Key entirely absent from `.env` | **Operator must provide GHL webhook HMAC secret** |

Also present in `.env` but empty (same var group):
- `OPENCLAW_ALERT_TELEGRAM_CHAT_ID` — empty (validate-env accepts any one of the three Telegram ID vars)

**Once the operator provides both values, execute the steps below in order.**

---

## STEP 1 — Add missing env vars to VPS

Use Hostinger MCP SSH to append both vars to `/etc/openclaw/.env`. Replace `<TELEGRAM_CHAT_ID>` and `<GHL_WEBHOOK_SECRET>` with operator-supplied values:

```bash
# Append both vars atomically
echo 'TELEGRAM_ALERT_CHAT_ID=<TELEGRAM_CHAT_ID>' >> /etc/openclaw/.env
echo 'OPENCLAW_GHL_WEBHOOK_SECRET=<GHL_WEBHOOK_SECRET>' >> /etc/openclaw/.env
```

Verify they landed:

```bash
grep -E 'TELEGRAM_ALERT_CHAT_ID|OPENCLAW_GHL_WEBHOOK_SECRET' /etc/openclaw/.env
```

Expected: both lines present with non-empty values.

---

## STEP 2 — Trigger canary rollout

```powershell
gh workflow run deploy-bot.yml `
  --repo jeremiahvanwagner-droid/openclaw `
  --ref main `
  --field rollout_mode=canary `
  --field upgrade_cli=false `
  --field clean_server_checkout=false
```

Monitor until completion:

```powershell
gh run list --repo jeremiahvanwagner-droid/openclaw --workflow=deploy-bot.yml --limit=3
```

If failed, get the failure logs:

```powershell
gh run view <run-id> --repo jeremiahvanwagner-droid/openclaw --log-failed
```

Do not retry without diagnosing the specific failure.

---

## STEP 3 — 30-minute observation window (P9 HITL gate)

After canary succeeds, watch the bot container for 30 minutes before promoting to full:

```bash
# Via Hostinger MCP SSH:
cd /opt/openclaw && docker compose logs --tail=100 bot 2>&1 | grep -iE 'error|restart|oom|unhealthy|gateway|heartbeat' | tail -50
```

**Acceptable:** single `eventLoopDelay` spike during model warm-up, routine `[heartbeat]` cycles, `[gateway] ready`.

**Unacceptable (STOP and report):**
- Sustained `eventLoopDelay > 1000ms` across multiple intervals
- Repeated `[gateway] starting...` (restart loop)
- Any container `(unhealthy)` in `docker compose ps`
- OOM-killer entries: `dmesg | grep -i kill`

---

## STEP 4 — Full rollout (only after clean observation window)

```powershell
gh workflow run deploy-bot.yml `
  --repo jeremiahvanwagner-droid/openclaw `
  --ref main `
  --field rollout_mode=full `
  --field upgrade_cli=false `
  --field clean_server_checkout=false
```

Wait for `completed / success`.

---

## STEP 5 — End-to-end verification (Phase 3)

Run all five checks. Record pass/fail for the audit entry.

```powershell
# 5a — Bot gateway via Caddy
Invoke-RestMethod -Uri "https://api.truthjblue.dev/health"
# Expected: {"ok":true,"status":"live"}

# 5b — Webhook (direct)
Invoke-RestMethod -Uri "http://177.7.32.224:8788/health"
# Expected: 200 / {"ok":true}

# 5c — Dashboard
(Invoke-WebRequest -Uri "https://truthjblue.dev" -UseBasicParsing).StatusCode
# Expected: 200
```

```bash
# 5d — Ollama reachability from inside bot container
docker exec openclaw-bot curl -fsS http://ollama:11434/api/tags | head -c 400
# Expected: JSON with qwen3:8b, qwen3:14b, nomic-embed-text

# 5e — VPS HEAD matches origin/main
cd /opt/openclaw && git log --oneline -3
```

Compare the top commit SHA to `git ls-remote origin HEAD` output. They must match.

---

## STEP 6 — Supabase smoke queries

Use the Supabase MCP (`mcp__139be6c2-311c-4acb-8cb5-fbe24127d86d__execute_sql`) against DB1 (`aagqvfwuixpxtdcrdxmv`):

```sql
-- Circuit breaker table exists and is queryable
SELECT circuit_key, state, failure_count, updated_at
FROM healing_circuit_breaker LIMIT 5;

-- Agent count in registry
SELECT count(*) AS agent_count FROM agents;
```

Expected: both queries succeed (0 rows on circuit_breaker is fine — populated at runtime).

---

## STEP 7 — Append audit entry r12 to REGGIE-STATE.md

The entry numbering as of this handoff:
- `r9-2026-05-09-repair` (APPLIED)
- `r10-2026-05-09-vps-resize` (APPLIED)
- `r11-2026-05-09-local-models` (APPLIED — current §7.0)
- **`r12-2026-05-09-full-deploy`** ← next (this session's work)

Insert as new §7.0 in `REGGIE-STATE.md`, shifting existing §7.0 → §7.0a, §7.0a → §7.0b, §7.0b → §7.0c. Use the table schema from r11 exactly.

```markdown
### 7.0 AUDIT ENTRY — Full deploy: DB migrations + VPS code deploy — 2026-05-09

| Field | Value |
|---|---|
| Date | 2026-05-09 <HH:MM> UTC |
| Author | agent:claude-code-ide + human:jeremiah-vanwagner |
| Change Type | INFRA_DEPLOY + SCHEMA_MIGRATION |
| Status | APPLIED |
| Parent Entry | `r11-2026-05-09-local-models` |
| Impacted Divisions | shared_runtime_ops, shared_data_control |
| Rollback Plan | (1) DB: `supabase db diff` captures are at `/tmp/supabase-pre-push.diff` pre-push (captured during prior CLI session). (2) VPS code: re-run `deploy-bot.yml` targeting prior HEAD with `rollout_mode=canary`. (3) Config: `cp /opt/openclaw/.deploy/configs/previous-openclaw-config.json /opt/openclaw/.openclaw/openclaw.json && systemctl restart openclaw openclaw-webhook openclaw-dashboard`. |
| Rollback Tested | NO |
| Next Audit Due | 2026-08-09 |
| Entry ID | `r12-2026-05-09-full-deploy` |
```

Commit and push:

```bash
git add REGGIE-STATE.md
git commit -m "audit(reggie): r12-2026-05-09-full-deploy — DB migrations + VPS canary+full deploy"
git push origin main
```

---

## DEFINITION OF DONE

All must be true before declaring this session complete:

- [ ] `TELEGRAM_ALERT_CHAT_ID` and `OPENCLAW_GHL_WEBHOOK_SECRET` present with values in `/etc/openclaw/.env`
- [ ] Canary rollout completed with status `success`
- [ ] 30-minute observation window clean (no unacceptable log entries)
- [ ] Full rollout completed with status `success`
- [ ] `https://api.truthjblue.dev/health` → `{"ok":true,"status":"live"}`
- [ ] `http://177.7.32.224:8788/health` → healthy
- [ ] `https://truthjblue.dev` → HTTP 200
- [ ] Bot can reach Ollama inside container: `qwen3:8b`, `qwen3:14b`, `nomic-embed-text` in response
- [ ] VPS HEAD matches `origin/main`
- [ ] `healing_circuit_breaker` table queryable in DB1
- [ ] Audit entry `r12-2026-05-09-full-deploy` committed and pushed
- [ ] `git status` clean

---

## KEY FACTS ABOUT THIS STACK

- **`/opt/openclaw`** = git checkout AND openclaw CLI runtime home. `deploy.sh` does `OPENCLAW_HOME="/opt/openclaw"` — all service files, pnpm scripts, and config paths branch from here.
- **`/root/openclaw`** = stale clone created during earlier troubleshooting. Ignore it. The deploy pipeline does NOT use it.
- **SSH user `root`** has the GitHub SSH key for `jeremiahvanwagner-droid/openclaw` at `/root/.ssh/id_ed25519`. Git operations run fine as root; `deploy.sh` subsequently runs `chown -R openclaw:openclaw /opt/openclaw`.
- **`deploy-bot.yml` rollout modes**: only `canary` and `full` — no `core` option.
- **Agent count**: 107 in runtime config. `--expected-agent-count 107` is already set in the workflow (fixed in prior session).
- **Supabase migrations**: all 9 openclaw migrations + 8 tjb-stub files are committed and applied. `supabase db diff --linked` is empty.
- **Hostinger MCP**: now connected — use it for all VPS SSH commands instead of local Bash SSH.
- **Supabase MCP**: `mcp__139be6c2-311c-4acb-8cb5-fbe24127d86d__*` — use for DB queries. DB1 = `aagqvfwuixpxtdcrdxmv`.

---

## DOCTRINE REMINDERS

- **P3**: Do not apply any new SQL via `mcp__apply_migration`. If a schema fix is needed, write a migration file, commit it, and re-run `supabase db push`.
- **P9**: Do not skip the 30-minute canary observation window. Operator must acknowledge before full rollout.
- **Audit**: Append-only. Never edit prior REGGIE-STATE entries.

---

## IF YOU GET BLOCKED

Append a `## BLOCKED` section to this file with: which step, the exact error, what you tried, and what the operator needs to decide. Do not abandon silently.
