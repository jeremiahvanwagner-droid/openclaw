# Advancement 2 — Provider Preflight: Degrade-Not-Abort + Dev-Profile Cron Guard

> **STATUS: IMPLEMENTED 2026-07-03** (REGGIE-STATE audit 2026-07-03-006). Preflight gate + alert patcher + gateway guard shipped and verified. First VPS run caught three live faults: revoked VPS Telegram token (fixed), two dead Anthropic API keys (CVO must rotate), and the discovery that the VPS has no cron store and its live config contains no ollama references — see the audit entry's state-model correction.

## Summary

- **File Evidence:**
  - `REGGIE-STATE.md:340` (audit 2026-05-14-001, forensic notes) — "openclaw's provider-preflight failure mode is **abort**, not **degrade**. Worth flagging for Phase 10 reliability work: a missing/unreachable provider should not silently nuke every cron that *could* have resolved to a different model."
  - `REGGIE-STATE.md:162` (audit 2026-05-16-001) — ≥10 distinct cron IDs aborted with `TypeError: fetch failed` because a duplicate Windows gateway preflighted against a loopback Ollama that wasn't running.
  - `REGGIE-STATE.md:189` — open doctrine flag: "dev/control workstation runtime should not silently duplicate production cron schedules… either (a) a 'dev profile' that disables cron firing, or (b) a divergent dev config."
  - `cron/jobs.json:22,50,79,113,141` — every cron payload pins `"model": "qwen3:14b"` with no fallback chain.
  - `openclaw.json:26-34` — active-models map contains `claude-cli/*` entries alongside `ollama/qwen3:14b`; a working fallback existed during both incidents and was never used.
  - `scripts/upgrade/probe-anthropic-key.mjs` — an endpoint-probe precedent already exists for one provider; nothing equivalent covers Ollama or Telegram.
  - Two prior cost/outage incidents establish the pattern: the 2026-05-14 morning cron storm (port 11435 regression, ≥15 crons dead) and the March 2026 Telegram 401 retry storm (bad bot token, hundreds of dollars of Anthropic spend).
- **Current State:** Cron reliability depends on every pinned provider endpoint being reachable at tick time. One bad endpoint aborts every cron tick platform-wide with no degradation. Config edits ship without endpoint verification (the 05-14 regression was committed and pushed before anyone probed port 11435). The Windows workstation can silently re-become a second production cron scheduler if the two `.disabled` Startup shortcuts are ever restored.
- **Proposed Enhancement:** Three-part reliability gate, all repo-side (no upstream openclaw patch required):
  1. `scripts/preflight-providers.mjs` — probes every model in the active map (Ollama `/api/tags` + model presence, Anthropic via existing probe, Telegram `getMe`) and exits non-zero on failure.
  2. Fallback-chain declaration for cron payloads: a documented walk-down (`qwen3:14b` → `qwen3:8b` → `claude-cli/claude-sonnet-4-5`) applied by a small patcher to `cron/jobs.json`, plus per-cron `failureAlert` blocks (the mechanism already exists — see `cron/jobs.json:85-91`).
  3. Dev-profile guard: `gateway.cmd` refuses to start the cron scheduler unless `OPENCLAW_RUNTIME_ROLE=production` is set, making workstation gateways cron-inert by default.
- **Impact / Effort:** 9/10 · 3/10
- **Risk Eliminated:** Platform-wide silent cron death from a single bad endpoint (happened twice in one week in May); repeat of the Telegram 401 retry storm; accidental resurrection of the duplicate Windows cron scheduler.
- **Mission Advancement:** Speed-to-Lead and pipeline sentinels (Phase 10, REGGIE-STATE.md:118-124) are cron-driven; they cannot guarantee "< 5 min response" if the scheduler class-fails on preflight.
- **Unlocks:** Safe config edits (gate in DEPLOY-CHECKLIST); trustworthy cron SLAs for Phase 10; the preflight script doubles as the credential-health cron's implementation.

## Implementation Brief

### Files to Create/Modify/Delete

- **Create:** `scripts/preflight-providers.mjs`
- **Modify:** `package.json` (add `preflight` script), `DEPLOY-CHECKLIST.md` (add gate step), `gateway.cmd` (role guard), `.env.example` (document `OPENCLAW_RUNTIME_ROLE`), `cron/jobs.json` (add `failureAlert` to the crons missing it)
- **Delete:** nothing.

### Step-by-Step Instructions

1. **Create `scripts/preflight-providers.mjs`:**
   ```js
   #!/usr/bin/env node
   // Verifies every provider endpoint + model referenced by the active config.
   // Exit 0 = all reachable; exit 1 = at least one failure (block deploy/restart).
   import fs from 'node:fs';
   import path from 'node:path';

   const configPath = process.argv.includes('--config')
     ? process.argv[process.argv.indexOf('--config') + 1]
     : path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'openclaw.json');
   const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
   const failures = [];

   // 1. Ollama: endpoint up AND every ollama/* model in the active map is pulled
   const ollama = cfg?.models?.providers?.ollama ?? findOllamaProvider(cfg); // adapt to actual shape
   const activeModels = Object.keys(cfg?.agents?.defaults?.models ?? {});
   const ollamaTags = activeModels.filter(m => m.startsWith('ollama/')).map(m => m.slice('ollama/'.length));
   if (ollamaTags.length) {
     const base = (ollama?.baseUrl || 'http://127.0.0.1:11434').replace(/\/v1$/, '');
     try {
       const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
       const tags = (await res.json()).models?.map(m => m.name) ?? [];
       for (const t of ollamaTags) if (!tags.includes(t)) failures.push(`ollama model not pulled: ${t} @ ${base}`);
     } catch (e) { failures.push(`ollama endpoint unreachable: ${base} (${e.message})`); }
   }

   // 2. Telegram: getMe MUST pass before any TG channel is trusted (March 2026 401-storm lesson)
   const tg = process.env.TELEGRAM_BOT_TOKEN || process.env.OPENCLAW_TELEGRAM_BOT_TOKEN;
   if (tg) {
     try {
       const res = await fetch(`https://api.telegram.org/bot${tg}/getMe`, { signal: AbortSignal.timeout(5000) });
       const body = await res.json();
       if (!body.ok) failures.push(`telegram getMe failed: ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
     } catch (e) { failures.push(`telegram unreachable: ${e.message}`); }
   }

   // 3. Anthropic: delegate to the existing probe
   //    (spawn scripts/upgrade/probe-anthropic-key.mjs and treat non-zero exit as failure)

   if (failures.length) { console.error('PREFLIGHT FAIL:'); failures.forEach(f => console.error('  - ' + f)); process.exit(1); }
   console.log('PREFLIGHT OK: all providers reachable and models present.');
   ```
   (Implement `findOllamaProvider` against the real `openclaw.json` shape — provider block observed at `openclaw.json:893-899`.)

2. **`package.json`:** add `"preflight": "node scripts/preflight-providers.mjs"` and chain it into `validate`.

3. **`DEPLOY-CHECKLIST.md`:** insert as the first gate: *"Run `pnpm preflight` against the config you are about to ship. A red preflight blocks commit — this is the codified lesson of audits 2026-05-14-001 and 2026-05-16-001."*

4. **Dev-profile guard in `gateway.cmd`:** at the top:
   ```bat
   if /I not "%OPENCLAW_RUNTIME_ROLE%"=="production" (
     echo [guard] OPENCLAW_RUNTIME_ROLE is not 'production' — starting gateway WITHOUT cron scheduling.
     set OPENCLAW_DISABLE_CRON=1
   )
   ```
   On the VPS, set `OPENCLAW_RUNTIME_ROLE=production` in the systemd unit environment. If the installed openclaw dist has no cron-disable env hook, the guard instead refuses to start (`exit /b 1`) unless the operator passes `--allow-cron` — either way the workstation default becomes cron-inert. Document the chosen behavior in `PLATFORM-REFERENCE.md`.

5. **Cron fallback + alerts:** add the `failureAlert` block (pattern from `cron/jobs.json:85-91`) to every enabled cron missing one, so a failing preflight becomes a Telegram page after 2 misses instead of silent log spam.

6. **Schedule it:** add a `credential-health-check-daily` payload step invoking `node scripts/preflight-providers.mjs` (a cron run file for that job already exists at `cron/runs/credential-health-check-daily.jsonl` — align the job to call the new script).

### Verification Checklist

- [ ] `pnpm preflight` exits 0 on the healthy VPS config; flipping the Ollama baseUrl to `:11435` makes it exit 1 naming the endpoint (reproduces the 05-14 regression in a test).
- [ ] With an intentionally corrupted `TELEGRAM_BOT_TOKEN`, preflight fails on `getMe` — the 401-storm class is now caught pre-deploy.
- [ ] Starting `gateway.cmd` on the workstation without `OPENCLAW_RUNTIME_ROLE=production` logs the guard message and fires zero crons over a 2-hour observation window (check `cron/runs/*.jsonl` mtimes).
- [ ] VPS `systemctl restart openclaw` with the env var set → crons fire normally on next tick.

### Rollback Procedure

1. Remove the `preflight` entry from `package.json` and the checklist step (docs-only).
2. Restore `gateway.cmd` from git (`git checkout -- gateway.cmd`).
3. `cron/jobs.json` edits: restore from the timestamped backups the repo already keeps (`cron/jobs.json.bak-*`) or `git checkout`.
4. No schema, no service, no upstream changes — rollback is entirely local file reverts.

### Definition of Done

With Ollama deliberately stopped on a test host, `pnpm preflight` exits 1 naming the dead endpoint, AND a workstation `gateway.cmd` launch without `OPENCLAW_RUNTIME_ROLE=production` produces zero new cron run entries in 2 hours. Both true → done.
