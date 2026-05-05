# OpenClaw Deployment Checklist — Anthropic Migration

> Branch: `fix/anthropic-migration-stabilization`  
> Target: Hostinger Ubuntu 24.04 LTS · `/opt/openclaw/`  
> Systemd unit: `openclaw-gateway.service` (user unit)

---

## Pre-Deploy — Local Verification

```bash
# 1. TypeScript must compile with 0 errors
npx tsc --noEmit

# 2. All tests must pass (currently 160/160)
pnpm vitest run

# 3. Confirm zero OpenAI model references in runtime code
grep -rn 'gpt-4o\|gpt-5\|openai/gpt' --include="*.ts" --include="*.mjs" \
  --exclude-dir=node_modules --exclude-dir=.git .

# 4. Confirm ANTHROPIC_API_KEY is present in your local .env
grep 'ANTHROPIC_API_KEY' .env
```

---

## Server — Environment Setup

SSH into the production server, then:

```bash
# 5. Edit the live env file — loaded by BOTH systemd units via EnvironmentFile=
sudo nano /etc/openclaw/.env

# REQUIRED lines to add/verify:
#   ANTHROPIC_API_KEY=sk-ant-<your-key>
#   OPENAI_API_KEY=sk-<your-key>          # Retained for text-embedding-3-small only
#   SUPABASE_URL=https://<project>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=<jwt>
#   OPENCLAW_GATEWAY_AUTH_TOKEN=<64-char-hex>
#   INNGEST_SIGNING_KEY=signkey-prod-<key>
#   INNGEST_EVENT_KEY=<key>

# 6. Verify file permissions (must be readable by the openclaw user only)
sudo chmod 600 /etc/openclaw/.env
sudo chown openclaw:openclaw /etc/openclaw/.env
sudo ls -la /etc/openclaw/.env
```

---

## Server — Code Deployment

```bash
# 7. Pull the migration branch
git fetch origin
git checkout fix/anthropic-migration-stabilization
git pull origin fix/anthropic-migration-stabilization

# 8. Install / update dependencies (pnpm must be on PATH)
pnpm install --frozen-lockfile

# 9. Build (compiles TypeScript + subpackages)
pnpm run build

# 10. Verify JSON configs have no BOM and no gpt refs
node -e "const c=require('./config/openclaw.json'); console.log('openclaw.json OK:', JSON.stringify(c.agents?.defaults?.model?.primary))"
node -e "const a=require('./agents_config.json'); const bad=a.agents?.filter(ag=>ag.llm_model?.includes('gpt')); console.log('gpt refs in agents_config:', bad?.length ?? 0)"
```

---

## Server — Systemd Service Hardening

```bash
# 11. Install the hardened service file
cp ops/configs/openclaw-gateway.service ~/.config/systemd/user/openclaw-gateway.service

# 12. Reload systemd daemon
systemctl --user daemon-reload

# 13. Check the restart limits are applied
systemctl --user cat openclaw-gateway.service | grep -E 'RestartSec|StartLimit'
# Expected:
#   RestartSec=60s
#   StartLimitInterval=300s
#   StartLimitBurst=3
```

---

## Server — Start & Smoke Test

```bash
# 14. Stop the service (if currently crash-looping, reset the fail counter first)
systemctl --user stop openclaw-gateway.service
systemctl --user reset-failed openclaw-gateway.service

# 15. Start fresh
systemctl --user start openclaw-gateway.service

# 16. Wait 10s, check status
sleep 10
systemctl --user status openclaw-gateway.service

# Expected: Active: active (running), restart count near 0

# 17. Check gateway health endpoint
curl -sf http://127.0.0.1:18789/health
# Expected: 200 OK with JSON body

# 18. Tail logs for 60s — confirm no crash loop
journalctl --user -u openclaw-gateway.service -f --no-pager &
TAIL_PID=$!
sleep 60
kill $TAIL_PID
# Expected: No "Starting/Stopping" cycle faster than 60s
```

---

## Server — Supabase Circuit Breaker Table

The self-healing circuit breaker table is now provisioned via the Supabase migration
`supabase/migrations/20260506000011_healing_circuit_breaker.sql`.

Run `supabase db push` (or apply via Supabase Dashboard SQL Editor) to create it.
The column is named `circuit_key` — **do not use the old manual SQL** (it used `key`, which
will cause a `column "circuit_key" does not exist` runtime error).

If you already ran the old manual SQL, rename the column before running the migration:

```sql
-- Only needed if the table already exists with the wrong column name
ALTER TABLE healing_circuit_breaker RENAME COLUMN "key" TO circuit_key;
```

After the migration runs, verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'healing_circuit_breaker'
ORDER BY ordinal_position;
-- Expected columns: circuit_key, failure_count, last_failure, state, opened_at, updated_at
```

---

## Post-Deploy Verification

```bash
# 19. Confirm restart counter is stable after 5 minutes
systemctl --user show openclaw-gateway.service --property=NRestarts

# 20. Confirm Inngest self-healing function is registered
curl -sf http://127.0.0.1:18789/api/inngest | jq '.fns[].id' | grep healing

# 21. Confirm ANTHROPIC_API_KEY is live (test single call via Inngest dev)
# Send a test event to OpenClaw and confirm a Claude model is invoked in logs

# 22. Check that old 1268+ restart count is behind you
journalctl --user -u openclaw-gateway.service --since "1 hour ago" | grep -c "Started\|Stopped"
# Healthy threshold: < 5 in one hour
```

---

## Rollback Plan

If the deployment fails:

```bash
# Rollback to prior commit
git checkout main
git pull origin main
pnpm install --frozen-lockfile
pnpm run build

# Restore prior service file
cp ops/configs/openclaw-gateway.service ~/.config/systemd/user/openclaw-gateway.service
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service

# Re-enable OPENAI_API_KEY in .openclaw/openclaw.env if needed for embeddings
sed -i 's/^# OPENAI_API_KEY=/OPENAI_API_KEY=/' .openclaw/openclaw.env
```

---

## Files Changed in This PR

| File | Change |
|---|---|
| `lib/anthropic-client.ts` | **NEW** — Anthropic SDK singleton, MODELS const |
| `lib/llm-router.ts` | Removed `gpt-4o`/`gpt-4o-mini` from MODEL_MAP; added `claude-haiku-4-5`; fixed `assertNever` exhaustive check |
| `inngest/client.ts` | `LLM_MODELS`: replaced `gpt-4o-mini` → `claude-haiku-4-5` |
| `lib/__tests__/llm-router.test.ts` | Updated model key assertions to Anthropic |
| `lib/__tests__/self-healing-supervisor.test.ts` | Added `ANTHROPIC_API_KEY` + `fetch` stub to `beforeEach` |
| `config/openclaw.json` | 89× `openai/gpt-5.3-codex` → `anthropic/claude-opus-4-5`; 20× `openai/gpt-4o-mini` → `anthropic/claude-haiku-4-5`; `memorySearch.enabled=false`; fixed duplicate key; stripped BOM |
| `agents_config.json` | 22× `gpt-4o-mini` → `claude-haiku-4-5`; 15× `gpt-4o` → `claude-sonnet-4.5`; stripped BOM |
| `config/agents_config.json` | Same as above; stripped BOM |
| `inngest/functions/self-hea