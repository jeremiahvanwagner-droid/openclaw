# Advancement 6 — Close Phase 9.2: Audit 74 Sonnet Bindings → Tier-Safe Local Remap

## Summary

- **File Evidence:**
  - Measured 2026-07-03: `grep -o '"llm_model": "[^"]*"' config/agents_config.json | sort | uniq -c` → **74 × `claude-sonnet-4.5`**, 22 × `qwen3:14b`, 7 × `claude-opus-4`. Identical counts in the root mirror.
  - `REGGIE-STATE.md:88-91` (Phase 9.2 Item 5) — "74 pod agents currently bound to `claude-sonnet-4.5`. Per Tier Router doctrine, only Tier-2-safe agents (no irreversibility, no surface-leaving action, no requires_reasoning) qualify for remap." Phase opened 2026-05-13 (entry 2026-05-13-006), **no audit work has landed since**.
  - `docs/phases/sonnet-audit-phase-9-2.md` — phase document exists and is the working spec.
  - `REGGIE-STATE.md:217-221` — walk-up path pre-staged: all 15 per-agent `models.json` catalogs already carry the four qwen3 tags; `scripts/phase9_2_patch.py` remaps via a `NEW_TAG` flip. The mechanism is proven by three prior executions (Phase 9.1, 9.1-redo, RAM-fit hotfix).
  - `REGGIE-STATE.md:69` — hardware constraint: qwen3:14b inference uses ~98% of the single VPS CPU core; `:239-248` — qwen3.5:27b does NOT fit 15 GiB RAM (1m56s cold load, swap-thrash). Any remap this cycle lands on `qwen3:14b`.
  - `config/agents_config.json` enrichment (`operational_boundaries`, `business_scope`, `skills[]` per agent — see Advancement 5 evidence) provides exactly the metadata the tier rubric needs.
- **Current State:** The 74 Sonnet-bound pod agents are the largest remaining external-model surface on the platform. Phase 9.1 proved the cutover machinery on the 22 Haiku-tier agents; Phase 9.2 was opened to do the same, agent-by-agent, for the Sonnet tier — and has sat unstarted for seven weeks while the audit doctrine, patch tooling, and model catalogs all wait ready.
- **Proposed Enhancement:** Execute the audit as a data-driven pass over `config/agents_config.json`: score each of the 74 agents against the three Tier-Router tests using their declared `skills[]` and `operational_boundaries`, produce a reviewable classification table, remap only the clean Tier-2 cohort to `ollama/qwen3:14b` in a staged rollout (10 agents → observe 48h → remainder), and close the phase with the standard audit entry. Sequencing constraint honored: **single-batch concurrency** — with one CPU core, remapped agents share the same local model the 22 cron agents use, so the rollout must watch event-loop liveness (`REGGIE-STATE.md:65-71`) and stop if inference queuing degrades cron SLAs.
- **Impact / Effort:** 8/10 · 5/10
- **Risk Eliminated:** Ongoing paid-API dependency for agents that don't need frontier reasoning; third-party throttling exposure for the bulk of the fleet (doctrine P10, `REGGIE-STATE.md:424`); the risk of an *unaudited* bulk remap (the rubric exists precisely so revenue-touching and irreversible-action agents stay on Sonnet).
- **Mission Advancement:** Directly executes the open phase of record. Cost freed here is the capital the P10 mission-alignment entries earmark for Divine Path Walkers + Beyond the Veil.
- **Unlocks:** The classification table becomes the permanent tier registry (feeds `lib/claw-router.ts:840`'s "TODO: Replace with model capability registry"); the walk-up path (27b at 24 GiB, qwen3.6 at 32 GiB) becomes a one-line flip for the whole audited cohort when RAM lands.

## Implementation Brief

### Files to Create/Modify/Delete

- **Create:** `scripts/phase9_2_audit.py` (classifier), `docs/phases/sonnet-audit-phase-9-2-results.md` (generated classification table)
- **Modify:** `scripts/phase9_2_patch.py` (accept an explicit agent allowlist instead of blanket OLD_TAG→NEW_TAG), `config/agents_config.json` + mirrors via Advancement 5 sync, `REGGIE-STATE.md` (open/close audit entries)
- **Delete:** nothing.

### Step-by-Step Instructions

1. **Build the classifier (`scripts/phase9_2_audit.py`):** read `config/agents_config.json`; for each `llm_model == "claude-sonnet-4.5"` agent emit a row: agent id, division, `business_scope`, and three booleans derived from declared metadata:
   - `surface_leaving`: any skill in a deny-set built from the skill names themselves (`email-broadcaster`, `send-sms` capable modules, `social-media-publisher`, `proposal-and-contract-sender`, `invoice-generator`, `checkout-integrator`, `subaccount-provisioner`, `snapshot-deployer`, browser-control skills…) — i.e., actions that leave the system and touch contacts, money, or production GHL assets.
   - `irreversible`: skills that mutate GHL structures without a snapshot path (`funnel-builder`, `ghl-workflow-builder`, `domain-connector`, `pipeline-manager` stage mutations…).
   - `requires_reasoning`: agents whose `operational_boundaries`/role text marks strategy, legal, pricing, or multi-step planning (orchestrators, `d*_ceo`, `pricing-strategist` holders…).
   Classification: all three false → **Tier-2-safe (remap)**; any true → **stay Sonnet**; ambiguous (skill list empty/missing because config enrichment is absent for that agent) → **manual review list**. Write the table to `docs/phases/sonnet-audit-phase-9-2-results.md` sorted by verdict.
2. **CVO review gate:** the generated table is reviewed and hand-annotated (this is the "written approval" discipline the Opus tier already uses per `REGGIE-STATE.md:351`). The approved remap list is committed as a JSON allowlist next to the results doc.
3. **Extend `scripts/phase9_2_patch.py`:** add `--agents <allowlist.json>` mode that rebinds only listed agents `claude-sonnet-4.5 → qwen3:14b` in `config/agents_config.json` (canonical; mirrors refresh via `scripts/sync-canonical-config.mjs --write` from Advancement 5). Keep idempotency: re-running with the same list is a no-op.
4. **Capacity check BEFORE commit (doctrine from audit 2026-05-14-003):** on the VPS: `free -h` (expect ≥ 4 GiB headroom with qwen3:14b resident), `time curl` a 50-token generation (expect < 30 s). qwen3:14b is already the active serving model for 22 cron agents, so this validates only that *additional concurrent* demand is tolerable: run two simultaneous generations and confirm the second completes < 90 s.
5. **Staged rollout:** Batch 1 = 10 lowest-risk agents (pure analysis/reporting roles, no surface-leaving skills). Deploy: commit → `git pull` on VPS → `systemctl restart openclaw` → verify `[gateway] ready` and two clean agent runs (verification pattern of `REGGIE-STATE.md:206-211`). Observe 48 h: liveness (`eventLoopDelayP99Ms` during inference), cron completion rate, and output-quality spot-check of each batch-1 agent's most recent artifact. Then remap the remaining approved cohort in one second batch, same verification.
6. **Close the phase:** REGGIE-STATE audit entry with final counts (`grep -c` on the config), the results-table link, and the walk-up note ("approved cohort moves to qwen3.5:27b/qwen3.6:latest by NEW_TAG flip when RAM upgrade lands").

### Verification Checklist

- [ ] `python scripts/phase9_2_audit.py` produces a table whose row count equals exactly the live Sonnet count (74 at analysis time) with zero unclassified rows after manual review.
- [ ] Post-batch-1 restart: `[gateway] ready` logged; `model-resolution` for remapped agents resolves `ollama/qwen3:14b`; zero `fetch failed` in a 15-minute window (the 9.1-redo bar, `REGGIE-STATE.md:9`).
- [ ] 48 h observation: cron success rate for the pre-existing 22 local agents unchanged (no starvation from added load); idle liveness stays in the post-redo band (P99 ≈ tens of ms idle, `REGGIE-STATE.md:68`).
- [ ] Final: `grep -c '"llm_model": "claude-sonnet-4.5"' config/agents_config.json` equals the stay-on-Sonnet count from the approved table; 7 Opus bindings untouched.

### Rollback Procedure

1. Per-batch: `git revert <batch-commit>` + `systemctl restart openclaw` — restores Sonnet bindings for that batch only (allowlist mode keeps batches in separate commits).
2. The patch script's idempotent design means a revert followed by re-run of the *previous* allowlist reproduces any intermediate state exactly.
3. No model needs pulling/removing (qwen3:14b already resident), so rollback has no capacity step.

### Definition of Done

Phase 9.2 close entry exists in `REGGIE-STATE.md` AND the live config satisfies: (Sonnet count) + (remapped count) = 74 original, with every remapped agent listed in the CVO-approved allowlist, AND the 48-hour post-remap observation window recorded zero cron-failure regressions. All true → done.
