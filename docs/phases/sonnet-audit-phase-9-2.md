# Phase 9.2: Sonnet Tier Audit & Selective Remap

_Initiative slug: `sonnet-audit`_
_Phase number: 9.2_
_Owner: MIKE (Executive Systems Architect)_
_CVO sign-off required: YES_
_Opened: 2026-05-13 17:30 CDT_

---

## 1. Entry Criteria

- [x] Phase 9.1 closed APPLIED (Entry `2026-05-13-001-CLOSE`)
- [x] Phase 9.1.1 closed APPLIED (Entry `2026-05-13-004`)
- [x] Phase 9.1.2 closed APPLIED (Entry `2026-05-13-005`)
- [x] Host runtime stable (`openclaw.service` active, 410 MB memory)
- [x] Host Ollama serving qwen3.6:latest + qwen3:8b (`127.0.0.1:11434`)
- [ ] **Carry-forward Item 1 — Liveness warnings investigation** (BLOCKING entry to remap work)
- [ ] **Carry-forward Item 2 — Device-auth security violation** (BLOCKING entry to remap work)
- [ ] **Carry-forward Item 3 — systemd service persistence** (`systemctl enable openclaw ollama`) (BLOCKING entry to remap work)
- [ ] **Carry-forward Item 4 — Kimi VPS handling decision** (NOT blocking)
- [ ] Mission Alignment Test (P10) answered for Phase 9.2 (see Section 6)

## 2. Scope

### In Scope
- Audit each of the **74 pod agents** currently bound to `claude-sonnet-4.5` in `agents_config.json` against the Tier Router doctrine.
- Tier Router test for each agent (in sequence — first YES stops the test):
  1. **Irreversibility:** Does this agent perform actions that cannot be undone without data loss or external side effect?
  2. **Surface Leaving:** Does this agent write to a contact record, send a message, post to an external API, or modify GHL workflow?
  3. **Requires Reasoning:** Is qwen3.6:latest demonstrably insufficient for this agent's specific task? (long-context >100K, multi-document synthesis, novel strategic planning)
- For each agent, produce a verdict: `KEEP_SONNET` or `REMAP_QWEN36`.
- Bulk-remap all `REMAP_QWEN36` agents in both `agents_config.json` and `config/agents_config.json`.
- Resolve the three BLOCKING carry-forward items (liveness, device auth, service persistence) before any remap commits land.
- Discharge the Kimi VPS handling decision (non-blocking).

### Out of Scope (Phase 10+)
- **Opus (Tier 0) review.** 7 agents bound to `claude-opus-4`. Requires written CVO approval per P5.
- **Provider catalog cleanup.** OpenRouter / Arcee / Codex / openai-codex providers in per-agent models.json still present but unused. Phase 10.
- **agents_config.json duplication.** Root + /config/ versions are identical in shape but the two files exist. P2 fix, Phase 10.
- **Architectural deep dive on the host-native deployment** (no Dockerfile changes, no init system changes). Phase 11+.

## 3. Deliverables

| Deliverable | Owner | Due | Done? |
|---|---|---|---|
| Tier Router audit table for 74 Sonnet agents | MIKE | TBD | [ ] |
| Idempotent remap script (`scripts/phase9_2_sonnet_remap.py`) | MIKE | TBD | [ ] |
| Liveness investigation report (`docs/diagnostics/liveness-2026-05-13.md`) | MIKE | TBD | [ ] |
| Security audit output captured (`openclaw security audit`) | Jeremiah (operator) | TBD | [ ] |
| `systemctl enable openclaw ollama` executed on VPS | Jeremiah | TBD | [ ] |
| Kimi handling decision recorded in REGGIE-STATE.md | Jeremiah | TBD | [ ] |
| This phase document | MIKE | 2026-05-13 | [x] |
| REGGIE-STATE.md audit entry `2026-05-13-006` (open) | MIKE | 2026-05-13 | [x] |
| Single PR with all Phase 9.2 changes | MIKE | TBD | [ ] |
| CVO PR review + sign-off | Jeremiah | TBD | [ ] |
| Merge to `main` | Jeremiah | TBD | [ ] |
| Operator-side `systemctl restart openclaw` + smoke test | Jeremiah | TBD | [ ] |
| Phase 9.2 close audit entry | MIKE | post-merge | [ ] |

## 4. Validation Steps

1. **Audit table coverage** — all 74 Sonnet-bound agents have a verdict and rationale.
2. **Tier Router test logged** — for each `REMAP_QWEN36` verdict, the three-step routing test answers are recorded (`irreversible=NO, leaves_surface=NO, requires_reasoning=NO`).
3. **No Sonnet→qwen3:8b remaps.** qwen3:8b is for the Haiku-replaced low-stakes path only. Sonnet remaps go to qwen3.6:latest (workhorse).
4. **Liveness investigation report** identifies the root cause of `event_loop_delay,cpu` warnings AND proposes a fix OR explicitly documents acceptance.
5. **Security audit output reviewed.** If device auth must remain disabled, the SOUL.md override is documented in this phase with justification.
6. **Idempotency.** Remap script run twice = no-op second time (P3).
7. **JSON validity.** Both `agents_config.json` files parse cleanly post-remap.
8. **Operator post-merge smoke test:**
   ```bash
   cd /root/openclaw && git pull
   systemctl restart openclaw
   systemctl status openclaw --no-pager
   journalctl -u openclaw -f --since "1 minute ago"
   ```
9. **File-level proof of remap** — grep both `agents_config.json` files for `claude-sonnet-4.5` count before/after; confirm the delta matches the audit's `REMAP_QWEN36` count.

## 5. Rollback Procedure

- **Step 1:** `git revert <merge-sha>` on `main`.
- **Step 2:** On VPS: `cd /root/openclaw && git pull && systemctl restart openclaw`.
- **Step 3:** Verify Sonnet count returns to 74.
- **Rollback Tested:** Will be tested in a dry-run script execution before the actual remap commit lands.

## 6. Exit Criteria

- [ ] All deliverables marked Done
- [ ] All validation steps passed
- [ ] Rollback procedure tested (dry-run)
- [ ] REGGIE-STATE.md audit entry written (open + close)
- [ ] **Mission Alignment Test (P10):** _To be answered before remap commits land._ Provisional draft: "Phase 9.2 deepens cost sovereignty and operational independence by moving every Tier-2-safe Sonnet binding to local qwen3.6:latest, redirecting more capital to Divine Path Walkers community growth and Beyond the Veil mentorship scholarships, while protecting more of TJB's prophetic surface area from third-party LLM provider gatekeepers."
- [ ] CVO sign-off received

## 7. Doctrine Compliance Plan

- **P1 (Declarative):** All changes via committed file edits.
- **P3 (Declarative migration):** Idempotent remap script committed before any edits.
- **P5 (Tier 0 spend):** No Tier 0 changes in this phase.
- **P9 (Rollback tested):** Will be dry-run before the remap commit lands.
- **P10 (Mission Alignment):** To be answered explicitly before remap.

## 8. Risk Register

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Tier Router audit misclassifies an agent as Tier-2-safe; agent then fails on production task | Medium | High | Audit table reviewed by CVO before remap; conservative defaults (when in doubt, KEEP_SONNET) |
| Liveness warnings worsen under more local-model load | Medium | Medium | Phase 9.2 entry blocks on liveness investigation; remap waits until cause is known |
| Memory exhaustion on host (currently 410 MB of 2 GB cap) | Low | Medium | Monitor `systemctl status` post-restart; if peak >1.5 GB, halt remap and scope a memory-cap raise |
| qwen3.6:latest cold-start latency under burst load | Medium | Low | Ollama keep-alive tuning; document in liveness investigation |
| Device-auth security violation persists into Phase 9.2 work | High | High | Carry-forward Item 2 is a BLOCKING entry criterion; no remap until resolved |

## 9. Carry-Forward Action List (Operator Side)

These three are blocking entry into the remap work. They must be discharged before Phase 9.2 ships the agent remap commits:

1. **Liveness investigation.** Run on VPS and send output:
   ```bash
   journalctl -u openclaw --since "2026-05-13 22:00 UTC" --until "2026-05-13 23:00 UTC" --no-pager | grep -E "liveness|sessions.list|models.list|embedded-run"
   ```

2. **Security audit.** Run on VPS and send output:
   ```bash
   openclaw security audit
   ```
   Then either re-enable device auth and re-pair, OR document the SOUL.md override in this phase document.

3. **Service persistence.** One command:
   ```bash
   systemctl enable openclaw ollama
   ```

4. **Kimi VPS decision (not blocking but should be resolved):**
   - **Option A (recommended):** `ollama rm kimi-k2.5:cloud`
   - **Option B:** Keep installed; I add a deny-by-default tier-router rule.
