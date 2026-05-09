# Handoff: Local Rig Model Upgrade & Compose Override Fix

**Date:** 2026-05-09
**Author:** MIKE (Modular Intelligence & Knowledge Engine, Perplexity Computer)
**Recipient:** Claude Code (or any IDE coding agent)
**Operator:** Jeremiah Van Wagner (CVO, Truth J Blue LLC)
**Repo:** `github.com/jeremiahvanwagner-droid/openclaw`
**Local checkout:** `C:\Users\JeremiahVanWagner\.openclaw`
**Branch:** `main`
**Last good commit:** `85106c3` — `fix(compose): use ollama CLI for healthcheck (image lacks curl)`

---

## CRITICAL DOCTRINE — READ FIRST

This handoff assumes you operate under the **REGGIE Doctrine** (6R + P1–P10 + Channel Authority + Tier 0/1/2 + P10 Mission Alignment). The relevant rules for THIS task:

- **P3 — Declarative Schema.** All changes go through committed migration files. No dashboard-applied DDL, no on-host edits without a corresponding repo commit.
- **P4 — Skill Audit Gate.** Any new skill must pass `audit-skills.mjs` before merging.
- **P5 — Per-Agent Least Privilege.** Each agent gets only the model providers it needs.
- **P10 — Mission Alignment Test.** Every change answers: "Does this shorten the distance between expressed intent and meaningful response?" If no, do not ship.
- **Local-First Compute Doctrine.** Tier 2 (default) = local Ollama. Tier 1 = cloud workhorse (Claude Sonnet/Haiku). Tier 0 = Sovereign Council (Claude Opus, requires written `TIER0_SPEND` audit entry).
- **Audit log discipline.** Append entries to `REGGIE-STATE.md` §7. Never edit prior entries.
- **Working tree:** local `.openclaw` is the canonical git checkout. The VPS at `177.7.32.224` is production. Both must stay in sync via `main`.

If you cannot satisfy any of the above rules during execution, **stop and report**. Do not bypass.

---

## CONTEXT — what just happened (read so you do not undo it)

Earlier today another IDE agent (also Claude Code) introduced four runtime-config violations to this repo: removed the local Ollama service from `docker-compose.yml`, added a stray `/db.js` with a top-level service-role Supabase query, deleted `agents/main/agent/auth-state.json`, and rewrote `agents/main/agent/models.json` to a cloud-only `kimi-k2.6:cloud` endpoint. MIKE repaired all four in commits `6b3d110`, `4f7675a`, `85106c3`. Audit entry `r9-2026-05-09-repair` is in `REGGIE-STATE.md` §7.0.

Then the operator:
1. Cleaned Docker Desktop on the local rig (~24 GB freed, postgres data backed up to `C:\Users\JeremiahVanWagner\backups\openclaw-postgres-volume-20260509-094708.tar.gz`)
2. Upgraded Hostinger VPS from KVM 2 (2 vCPU / 8 GB RAM) to KVM 4 (4 vCPU / 16 GB RAM / 200 GB NVMe), live-resized with no downtime
3. Pulled `qwen3:8b` and `qwen3:14b` onto the VPS Ollama, retired `llama3.1:8b`
4. Decided the local rig will run **identical model lineup** to VPS, with one key difference: **native Windows Ollama**, not containerized

**Hardware on the local rig (just confirmed):**
- AMD Ryzen 9 5900X — 12 cores / 24 threads
- 64 GB RAM @ 3200 MT/s (just upgraded today)
- NVIDIA GeForce RTX 5060 Ti — **16 GB VRAM**
- Storage: 932 GB total, ~121 GB free (87% used — be disk-aware)
- WSL2 + Docker Desktop installed; Ubuntu distro stopped, docker-desktop distro running
- **Native Windows Ollama** at `C:\Users\JeremiahVanWagner\AppData\Local\Programs\Ollama\ollama.exe`, listening on `0.0.0.0:11434` (PID 8256 last seen)

**Decision locked by operator:**
- Local rig keeps native Ollama (better GPU performance than container)
- Container `ollama` service is disabled locally via `docker-compose.override.yml`
- Bot points at `http://host.docker.internal:11434` (the native Ollama on the Windows host)
- VPS keeps containerized Ollama (Linux, no GPU, doctrine-aligned)
- Coding work routes to Claude (you, the recipient of this handoff). NO local coder model.
- Local model lineup: `qwen3:8b`, `qwen3:14b`, `nomic-embed-text`. Total ~14.5 GB.

---

## OBJECTIVE

Bring the local rig fully online with the chosen model lineup, then push the agent-config changes that make REGGIE recognize the new lineup, on both rigs.

Specifically:

1. Pull `qwen3:8b`, `qwen3:14b`, `nomic-embed-text` into the **native Windows Ollama** (NOT the Docker container — the container's `ollama` service is disabled locally).
2. Fix the broken `docker-compose.override.yml` (currently has invalid YAML — see "Pre-existing broken state" below).
3. Bring up the local Compose stack (3 services: bot, redis, webhook — no ollama service locally).
4. Verify `openclaw-bot` can reach the native Ollama via `host.docker.internal:11434` and call all three models.
5. Update `agents/main/agent/models.json` so the `ollama` provider's `models[]` array reflects the new lineup (qwen3:8b, qwen3:14b, nomic-embed-text). Currently it lists `gemma4`, `kimi-k2.5:cloud`, `minimax-m2.7:cloud`, `glm-5.1:cloud` — those are pre-Claude-Code-incident artifacts and need to be replaced with the new local-truth list.
6. Append a new audit entry to `REGGIE-STATE.md` §7 documenting the model upgrade. Use the same schema as `r9-2026-05-09-repair`.
7. Commit and push to `origin/main`. The VPS will pull on next deploy cycle.
8. Optional sanity: run `pnpm typecheck` and `pnpm test` to confirm nothing broke.

---

## OUT OF SCOPE — DO NOT TOUCH

- Do NOT modify `docker-compose.yml` (the base file). All local-only behavior goes in `docker-compose.override.yml`.
- Do NOT remove the 11 sub-agent `models.json` files added by the prior Claude Code session (`d8_compliance_auditor`, `d8_content_ops`, `d8_customer_success`, `d8_integration_engineer`, `d8_saas_director`, `marketing`, `sales`, `shared_data_control`, `shared_exec_orchestrator`, `shared_runtime_ops`, `support`). Those are flagged as Open Items in `REGGIE-STATE.md` §7.0 and will be audited separately.
- Do NOT pull additional models beyond the three listed. Disk is at 87%; do not exceed.
- Do NOT modify the VPS in any way. This handoff is local-rig-only.
- Do NOT edit `REGGIE-STATE.md` entries above §7.0 — append-only, never rewrite.
- Do NOT add `docker-compose.override.yml` to git. It is per-developer. Add to `.gitignore` if not already.
- Do NOT use Tier 0 models (Claude Opus) for any work in this handoff. This is routine config + verification — Tier 1 (Sonnet) is the maximum.

---

## PRE-EXISTING BROKEN STATE TO FIX

The operator ran an attempt at writing `docker-compose.override.yml` from PowerShell that produced invalid YAML. Compose currently fails with:

```
service "webhook" depends on undefined service "ollama": invalid compose project
```

The current contents of `docker-compose.override.yml` (broken):

```yaml
services:
  bot:
    environment:
      - ...
      - OLLAMA_HOST=http://host.docker.internal:11434
    depends_on:
      redis:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"

  webhook:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - bot
      - redis

  ollama:
    profiles:
      - never-run-locally
```

The bug: `profiles:` does not remove a service from dependency resolution; webhook still references `ollama` as a depends_on (inherited from `docker-compose.yml`), and Compose can't resolve it. Use the `!reset` directive instead.

---

## STEP-BY-STEP EXECUTION PLAN

Run each step in order. Stop and report if any step fails.

### Step 1 — Verify native Ollama is reachable

```powershell
# Powershell on Windows host
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags"
```

Expected: returns JSON, possibly with empty `models: {}` or some pre-existing models. If connection refused, the native Ollama service is not running — start the Ollama tray app from Start Menu, then retry.

### Step 2 — Pull the three models into native Ollama

```powershell
ollama pull qwen3:8b
ollama pull qwen3:14b
ollama pull nomic-embed-text
ollama list
```

Expected: `ollama list` shows all three models. Total disk usage ~14.5 GB.

If `qwen3` tags do not exist (Ollama version too old), upgrade Ollama first via the installer at https://ollama.com/download. Do NOT silently substitute a different model.

### Step 3 — Replace the broken `docker-compose.override.yml`

Path: `C:\Users\JeremiahVanWagner\.openclaw\docker-compose.override.yml`

Contents (use `!reset` to wipe inherited keys from the base compose):

```yaml
# ════════════════════════════════════════════════════════════════
# LOCAL-ONLY OVERRIDE — do NOT commit to git
# Native Windows Ollama on host:11434, container ollama disabled locally
# ════════════════════════════════════════════════════════════════

services:
  bot:
    environment:
      - HOME=/opt/openclaw
      - OPENCLAW_CONFIG_DIR=/opt/openclaw/.openclaw
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - OLLAMA_HOST=http://host.docker.internal:11434
    depends_on: !reset
      redis:
        condition: service_healthy
    extra_hosts:
      - "host.docker.internal:host-gateway"

  webhook:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on: !reset
      - bot
      - redis

  ollama: !reset null
```

Make sure `.gitignore` contains `docker-compose.override.yml`. If not, add a line at the bottom under a `# Local-only compose overrides` comment.

### Step 4 — Validate merged compose config

```powershell
cd C:\Users\JeremiahVanWagner\.openclaw
docker compose config --services
```

Expected output (in any order): `bot`, `redis`, `webhook`. **`ollama` must NOT appear.** If it does, the override didn't take effect — re-check Step 3 syntax, especially `!reset null`.

```powershell
docker compose config | Select-String "OLLAMA_HOST|host.docker.internal"
```

Expected: shows `OLLAMA_HOST: http://host.docker.internal:11434` and the `extra_hosts` mapping.

### Step 5 — Bring up the stack

```powershell
docker compose down
docker compose up -d
Start-Sleep -Seconds 30
docker compose ps
```

Expected: 3 containers (`openclaw-bot`, `openclaw-redis`, `openclaw-webhook`), all `(healthy)` after ~30 seconds. NO `openclaw-ollama` container.

If bot is in a restart loop, capture the last 50 lines of `docker logs openclaw-bot` and report. Common causes:
- Bind-mount `/root/.openclaw` doesn't exist on Windows host → Compose mounts an empty volume → bot can't load config. Fix: confirm `docker-compose.yml` (base) doesn't have that bind-mount on Windows, or override to a Windows-compatible path.
- `host.docker.internal` not resolvable from container → check `extra_hosts` is in merged config.

### Step 6 — Verify bot can reach native Ollama

```powershell
docker exec openclaw-bot curl -fsS http://host.docker.internal:11434/api/tags
```

Expected: returns JSON listing the three models you pulled in Step 2.

```powershell
docker exec openclaw-bot curl -fsS http://127.0.0.1:18789/health
```

Expected: `{"ok":true,"status":"live"}`.

### Step 7 — Update `agents/main/agent/models.json`

Path: `C:\Users\JeremiahVanWagner\.openclaw\agents\main\agent\models.json`

**Find** the `providers.ollama` block. It currently looks like (after the prior repair):

```json
"ollama": {
  "baseUrl": "http://127.0.0.1:11434/v1",
  "apiKey": "ollama-local",
  "api": "ollama",
  "models": [
    { "id": "gemma4", "name": "gemma4", "reasoning": false, ... },
    { "id": "kimi-k2.5:cloud", "name": "kimi-k2.5:cloud", "reasoning": false, ... },
    { "id": "minimax-m2.7:cloud", "name": "minimax-m2.7:cloud", "reasoning": false, ... },
    { "id": "glm-5.1:cloud", "name": "glm-5.1:cloud", "reasoning": false, ... }
  ]
}
```

**Replace** the `models` array contents with the three models actually pulled, preserving JSON structure:

```json
"ollama": {
  "baseUrl": "http://127.0.0.1:11434/v1",
  "apiKey": "ollama-local",
  "api": "ollama",
  "models": [
    {
      "id": "qwen3:8b",
      "name": "Qwen3 8B (daily Tier-2, hybrid thinking)",
      "reasoning": true,
      "input": ["text"],
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
      "contextWindow": 32768,
      "maxTokens": 8192
    },
    {
      "id": "qwen3:14b",
      "name": "Qwen3 14B (heavy reasoner, deep thinking)",
      "reasoning": true,
      "input": ["text"],
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
      "contextWindow": 32768,
      "maxTokens": 8192
    },
    {
      "id": "nomic-embed-text",
      "name": "Nomic Embed Text (embeddings)",
      "reasoning": false,
      "input": ["text"],
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
      "contextWindow": 8192,
      "maxTokens": 0
    }
  ]
}
```

Important guarantees while editing:
- The `baseUrl` STAYS `http://127.0.0.1:11434/v1` — that is the URL inside the bot container's network namespace. The bot reaches the host via `host.docker.internal` only when the env var `OLLAMA_HOST` is set explicitly; the model.json `baseUrl` is the agent-runtime fallback and the VPS uses the same value. Do NOT change it to `host.docker.internal` — that breaks the VPS.
- Do NOT touch the other providers (anthropic, openrouter, openai-codex, arcee). They are correct.
- Validate: `node -e "JSON.parse(require('fs').readFileSync('agents/main/agent/models.json'))"` must exit 0.

### Step 8 — Append audit entry to `REGGIE-STATE.md`

Insert a new entry as §7.0 (BEFORE the existing §7.0 entry). Renumber the previous 7.0 to 7.1, etc. (Or insert as 7.0a — match prior style if there is precedent.) The schema must follow the template used in `r9-2026-05-09-repair`. Required fields:

```markdown
### 7.0 AUDIT ENTRY — Local rig model upgrade — 2026-05-09

| Field | Value |
|---|---|
| Date | 2026-05-09 <HH:MM> UTC |
| Author | agent:claude-code + human:jeremiah-vanwagner |
| Change Type | CONFIG_INTEGRITY (model lineup standardization) |
| Status | APPLIED |
| Parent Entry | `r9-2026-05-09-repair` |
| Impacted Divisions | shared_runtime_ops |
| Rollback Plan | `git revert <this-commit>` returns models.json to prior state. Local override file removal: `rm docker-compose.override.yml`. Native Ollama models can be removed with `ollama rm qwen3:8b qwen3:14b nomic-embed-text` if needed. |
| Rollback Tested | NO |
| Next Audit Due | 2026-08-09 |
| Entry ID | `r10-2026-05-09-local-models` |

**Summary.** Local rig model lineup upgraded to match VPS. Pulled qwen3:8b, qwen3:14b, nomic-embed-text into native Windows Ollama (the rig has 16 GB VRAM RTX 5060 Ti — better GPU performance than running Ollama in Docker). The Compose `ollama` service is disabled locally via `docker-compose.override.yml` (per-developer, gitignored); local bot points at `http://host.docker.internal:11434`. VPS continues to use containerized Ollama. `agents/main/agent/models.json` updated so the `ollama` provider's `models[]` array lists the three real models instead of the placeholder lineup (`gemma4`, `kimi-k2.5:cloud`, `minimax-m2.7:cloud`, `glm-5.1:cloud`). Coding work continues to route to Claude (Tier 1) per operator decision; no local coder model added.

**Impacted Files**
- `agents/main/agent/models.json` — providers.ollama.models array updated
- `REGGIE-STATE.md` — this entry
- `docker-compose.override.yml` — local-only, gitignored, NOT committed
- `.gitignore` — added `docker-compose.override.yml` if not already present

**Validation Steps Performed**
- Doctrine load: REGGIE Doctrine active (6R + P1–P10 + Channel Authority + Tiers + P10).
- `ollama list` on Windows host shows qwen3:8b, qwen3:14b, nomic-embed-text.
- `docker compose config --services` returns only bot, redis, webhook (no ollama).
- `docker compose ps` shows all 3 services healthy.
- `docker exec openclaw-bot curl -fsS http://host.docker.internal:11434/api/tags` returns the model list.
- `docker exec openclaw-bot curl -fsS http://127.0.0.1:18789/health` returns `{"ok":true,"status":"live"}`.
- `node -e "JSON.parse(...)"` confirms models.json is valid JSON.
- Mission Alignment Test (P10): upgrade advances Recognize (better Tier-2 reasoning) and Restore (model lineup is now identical local↔VPS, easier to debug). Confirmed.

**Open Items (NOT closed by this entry)**
- Audit the 11 new sub-agent `models.json` files for Tier-2 compliance before they enter routing (carried over from r9-2026-05-09-repair).
- Capture a Tier-2 smoke test on next REGGIE deploy.
```

Adjust the `<HH:MM>` to actual UTC at time of write.

### Step 9 — Commit and push

```powershell
cd C:\Users\JeremiahVanWagner\.openclaw
git add agents/main/agent/models.json REGGIE-STATE.md .gitignore
git status              # confirm docker-compose.override.yml is NOT staged
git commit -m "feat(models): align local Tier-2 lineup with VPS (qwen3:8b + qwen3:14b + nomic-embed-text)

Updates agents/main/agent/models.json so providers.ollama.models reflects
the actual local model lineup pulled into native Windows Ollama. Replaces
placeholder names (gemma4, kimi-k2.5:cloud, minimax-m2.7:cloud, glm-5.1:cloud)
with real models that match the VPS exactly: qwen3:8b (daily Tier-2 with
hybrid thinking), qwen3:14b (heavy reasoner), nomic-embed-text (embeddings).

Local rig uses native Windows Ollama (better GPU performance on RTX 5060 Ti
16GB VRAM); container ollama is disabled locally via docker-compose.override.yml
(gitignored). VPS continues with containerized ollama.

REGGIE-STATE entry r10-2026-05-09-local-models documents the change with
parent r9-2026-05-09-repair. Mission Alignment Test (P10) confirmed."

git push origin main
```

### Step 10 — Optional sanity check

If time permits:

```powershell
pnpm typecheck
pnpm test
```

Both should pass. If they fail, investigate before declaring done; do not silently merge.

---

## DEFINITION OF DONE

You are done when ALL of the following are true:

1. ✅ `ollama list` on Windows host shows exactly 3 models: qwen3:8b, qwen3:14b, nomic-embed-text.
2. ✅ `docker compose config --services` returns 3 services: bot, redis, webhook (no ollama).
3. ✅ `docker compose ps` shows all 3 services `(healthy)`.
4. ✅ `docker exec openclaw-bot curl -fsS http://host.docker.internal:11434/api/tags` returns the 3 models.
5. ✅ `docker exec openclaw-bot curl -fsS http://127.0.0.1:18789/health` returns `{"ok":true,"status":"live"}`.
6. ✅ `agents/main/agent/models.json` parses as valid JSON and the `ollama` provider lists the 3 real models.
7. ✅ `REGGIE-STATE.md` has a new audit entry `r10-2026-05-09-local-models`.
8. ✅ Commit pushed to `origin/main`.
9. ✅ `git status` shows clean working tree (except `docker-compose.override.yml` which is gitignored).
10. ✅ `docker logs openclaw-bot --tail=30` shows `[gateway] ready` and no permission/connection errors related to Ollama.

If any of these is false, do not declare done. Report which step failed, the exact error, and what you tried.

---

## REPORTING BACK

When complete, append a one-paragraph status report to this handoff file under a new `## EXECUTION REPORT` section, including:

- Time taken
- Models pulled (with sizes from `ollama list`)
- Final disk free percentage on `C:`
- Commit SHA pushed
- Any deviations from the plan and why

If you got stuck, instead append a `## BLOCKED` section with:

- Which step you got to
- The exact error message
- What you tried
- What you think MIKE/the operator should know to unblock you

Do not silently abandon. The operator is reading both this handoff and your report on resume.

---

## END OF HANDOFF
