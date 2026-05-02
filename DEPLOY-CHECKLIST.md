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

SSH into the production server as the `openclaw` service user, then:

```bash
cd /opt/openclaw

# 5. Edit the live env file (chmod 600)
nano .openclaw/openclaw.env

# REQUIRED lines to add/verify:
#   ANTHROPIC_API_KEY=sk-ant-<your-key>
#   SUPABASE_URL=https://<project>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=<jwt>
#   OPENCLAW_GATEWAY_AUTH_TOKEN=<64-char-hex>

# 6. Verify file permissions
chmod 600 .openclaw/openclaw.env
ls -la .openclaw/openclaw.env
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

The self-healing circuit breaker requires a Supabase table. Run this SQL once in the Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS healing_circuit_breaker (
  key          TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  open_until   TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a clean state for the scheduled healing key
INSERT INTO healing_circuit_breaker (key, failures)
VALUES ('scheduled_healing', 0)
ON CONFLICT (key) DO NOTHING;
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
| `inngest/functions/self-healing-coding.ts` | Full circuit breaker (Supabase-backed, MAX_FAILURES=3, COOLDOWN=30min); preflight `ANTHROPIC_API_KEY` check |
| `lib/self-healing-supervisor.ts` | `preflightCheck()` added; integrated into `runHealingLoop()` early-return guard |
| `ops/configs/openclaw-gateway.service` | `RestartSec=60s`; `StartLimitInterval=300s`; `StartLimitBurst=3` |
| `.env.example` | `ANTHROPIC_API_KEY` at top as REQUIRED; `OPENAI_API_KEY` commented as LEGACY |
| `ops/configs/openclaw.env.template` | `ANTHROPIC_API_KEY` added as REQUIRED; OpenAI section commented as LEGACY |
| `DEPLOY-CHECKLIST.md` | **NEW** — this file |
