# Advancement 5 — Single Source of Truth: Agent Config & Skills Tree Deduplication

## Summary

- **File Evidence:**
  - **Axis 1 — agent config duplication, now diverged.** `agents_config.json` (root, 161 KB) vs `config/agents_config.json`: diff on 2026-07-03 shows the `config/` copy carries `business_scope`, `ghl_token_group`, `operational_boundaries`, and full `skills[]` arrays (first divergence at root line ~287, `shared_master_orchestrator` block) that the root copy lacks. Both are git-tracked. `REGGIE-STATE.md:49` flagged the duplication for "Phase 10 P2 fix" back on 2026-05-13, and audit 2026-05-14-002 kept them in sync by editing both — the sync has since broken.
  - **The runtime reads `config/`:** `lib/security-governance.mjs:13` (`AGENTS_CONFIG_PATH = path.join(ROOT_DIR, "config", "agents_config.json")`), `lib/runtime-model-policy.mjs:4` ("Source-of-truth llm_model values come from config/agents_config.json"), `lib/ghl-scope-enforcer.mjs:47`.
  - **But tooling writes both:** `scripts/phase9_patch.py`, `scripts/phase9_2_patch.py`, `scripts/register-agents.mjs`, `scripts/register-all-agents.py`, `scripts/generate-workspaces.mjs`, `scripts/map-skills-to-agents.py` all reference `agents_config` (grep 2026-07-03) — any script that edits only the root copy changes nothing the runtime sees, and vice versa.
  - **Axis 2 — skills tree duplication.** `skills/` has 124 top-level `.mjs` modules; `workspace/skills/` has 69. `workspace/skills` is a **physical directory copy** (no junction/LinkType — verified with `Get-Item`), last synced 2026-05-05. The production webhook handler imports Phase 3 modules from the *stale* copy: `ghl-webhook-handler.mjs:20` (`skillsDir = path.join(__dirname, 'workspace', 'skills')`).
  - **Axis 3 — repo hygiene.** `git status`: `tui/` (runtime session state, 1 file) and `skills/supabase/`, `skills/supabase-postgres-best-practices/` are untracked. The two supabase folders are Claude-Code-format `SKILL.md` skills (from `npx skills add`), not REGGIE `.mjs` skills — parked in the wrong skills system (the repo has `plugin-skills/` for CLI-backed skills). `.gitignore` has no `tui/` entry.
- **Current State:** Three copies of behavioral truth drift independently. Concretely today: security-governance enforcement, GHL scope enforcement, and model policy read the enriched `config/` file, while phase-patch tooling and at least one registration script also write the impoverished root file; the webhook handler executes 55-modules-stale skill code. The 2026-05-14 incident class ("both files in sync" asserted in audits) recurs because sync is manual.
- **Proposed Enhancement:** Declare canonical paths and enforce them mechanically: `config/agents_config.json` is the only hand-edited agent config (root becomes a generated mirror with a CI drift gate); `skills/` is the only skill source (`workspace/skills` becomes a build artifact refreshed by a sync script, or the webhook handler is repointed to `skills/`); repo hygiene entries land in `.gitignore` and the misfiled Claude skills move to `plugin-skills/`.
- **Impact / Effort:** 8/10 · 4/10
- **Risk Eliminated:** Split-brain agent behavior (enforcement layer governing a different reality than tooling writes); production webhook code drifting from the maintained skill implementations; future phase-patch scripts "succeeding" against the dead copy.
- **Mission Advancement:** Every subsequent advancement (Sonnet audit, preflight, governance enforcement) reads or writes agent config — they inherit correctness from this one. Doctrine P2 (no orphaned config drift) becomes mechanically enforced instead of audit-log-enforced.
- **Unlocks:** Advancement 6 (Sonnet audit) can trust a single file; `pnpm upgrade:runtime:parity` (already in `package.json`) gains a real invariant to check; future agent onboarding touches one file.

## Implementation Brief

### Files to Create/Modify/Delete

- **Create:** `scripts/sync-canonical-config.mjs` (config mirror + skills sync + drift check, one tool with `--check` / `--write` modes)
- **Modify:** `ghl-webhook-handler.mjs:20` (repoint `skillsDir` to `skills/`), `package.json` (add `config:check` to `validate`), `.gitignore` (add `tui/`), the phase-patch scripts' docstrings (declare `config/` canonical), `AGENTS.md` (document the rule)
- **Move:** `skills/supabase/` and `skills/supabase-postgres-best-practices/` → `plugin-skills/`
- **Delete:** nothing in this pass (root `agents_config.json` stays as a generated mirror to avoid breaking unaudited readers; deletion is a later cleanup once `grep -rn "agents_config"` shows only canonical readers).

### Step-by-Step Instructions

1. **Reconcile the current drift (one-time):** the `config/` copy is the enriched one and the one the runtime reads — it wins. Verify the root copy contains no *newer* edits first:
   ```bash
   git log --oneline -5 -- agents_config.json config/agents_config.json
   diff <(python -m json.tool agents_config.json) <(python -m json.tool config/agents_config.json) | grep '^<' | head -50
   ```
   Any `<` lines that are real data (not just missing enrichment) get merged into `config/` by hand. Then overwrite root from `config/`.

2. **Create `scripts/sync-canonical-config.mjs`:**
   ```js
   #!/usr/bin/env node
   // Canonical: config/agents_config.json  →  mirror: agents_config.json
   // Canonical: skills/*.mjs               →  mirror: workspace/skills/
   // Modes: --check (exit 1 on drift, for CI)  |  --write (refresh mirrors)
   import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
   const mode = process.argv.includes('--write') ? 'write' : 'check';
   const drift = [];

   // 1. agents_config mirror
   const canon = fs.readFileSync('config/agents_config.json');
   if (!fs.existsSync('agents_config.json') || !canon.equals(fs.readFileSync('agents_config.json'))) {
     if (mode === 'write') fs.writeFileSync('agents_config.json', canon);
     else drift.push('agents_config.json != config/agents_config.json');
   }
   // 2. workspace/skills mirror (top-level .mjs + dirs)
   for (const entry of fs.readdirSync('skills')) {
     const src = path.join('skills', entry), dst = path.join('workspace', 'skills', entry);
     if (!fs.statSync(src).isFile() || !entry.endsWith('.mjs')) continue;
     const same = fs.existsSync(dst) && crypto.createHash('sha1').update(fs.readFileSync(src)).digest('hex')
                                       === crypto.createHash('sha1').update(fs.readFileSync(dst)).digest('hex');
     if (!same) { if (mode === 'write') fs.copyFileSync(src, dst); else drift.push(`workspace/skills/${entry} stale`); }
   }
   if (drift.length) { console.error('CONFIG DRIFT:\n  ' + drift.join('\n  ')); process.exit(1); }
   console.log(mode === 'write' ? 'Mirrors refreshed.' : 'No drift.');
   ```
   Run `node scripts/sync-canonical-config.mjs --write` once to converge, commit the result.

3. **Repoint the webhook handler:** change `ghl-webhook-handler.mjs:20` from `path.join(__dirname, 'workspace', 'skills')` to `path.join(__dirname, 'skills')` so production executes the maintained tree directly. (Keep the mirror sync anyway — agent workspaces reference `workspace/skills` for other flows.) Run `node scripts/smoke-test-ghl-webhook-handler.mjs` after.

4. **CI gate:** add `"config:check": "node scripts/sync-canonical-config.mjs --check"` to `package.json` and prepend it to the `validate` chain, alongside the existing `upgrade:runtime:parity` precedent.

5. **Hygiene:** append to `.gitignore`:
   ```
   # runtime session state
   tui/
   ```
   `git mv` is not applicable (untracked) — physically move `skills/supabase*` into `plugin-skills/` and commit; they are Claude-Code-format skills, not REGGIE `.mjs` skills (two distinct systems; keeping them separated prevents the loader confusion documented in operator memory).

6. **Document the rule** in `AGENTS.md`: "Hand-edit only `config/agents_config.json` and `skills/`. `agents_config.json` (root) and `workspace/skills/` are generated mirrors — run `node scripts/sync-canonical-config.mjs --write` after canonical edits. CI fails on drift."

### Verification Checklist

- [ ] `node scripts/sync-canonical-config.mjs --check` exits 0 on a clean tree; hand-editing the root mirror makes it exit 1 naming the file.
- [ ] `pnpm validate` includes and passes the drift gate.
- [ ] `node scripts/smoke-test-ghl-webhook-handler.mjs` passes with the repointed `skillsDir` (Phase 3 modules load — startup log prints "✅ Phase 3 modules loaded").
- [ ] `grep -c '"llm_model"' agents_config.json config/agents_config.json` returns identical counts AND `diff` returns empty.
- [ ] `git status` shows no untracked `tui/`; `skills/` contains only `.mjs` modules + `package.json`.

### Rollback Procedure

1. `git revert <commit-sha>` — restores the old webhook `skillsDir`, removes the CI gate, restores prior file locations.
2. The one-time root-config overwrite is recoverable from git history (`git checkout <pre-sha> -- agents_config.json`) if a lost root-only edit is discovered later.
3. No schema, service, or VPS-side changes exist in this advancement.

### Definition of Done

`node scripts/sync-canonical-config.mjs --check` is part of `pnpm validate` and exits 0, AND `ghl-webhook-handler.mjs` loads Phase 3 modules from `skills/` (smoke test green), AND `diff agents_config.json config/agents_config.json` is empty at HEAD. All three true → done.
