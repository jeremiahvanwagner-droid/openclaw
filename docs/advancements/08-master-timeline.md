# Master Timeline — Dependency Order & Parallelization Map

_Working assumption: one operator (CVO) + Claude Code sessions, VPS change windows in the evening (America/Chicago), the repo's existing small-team direct-to-main velocity (`REGGIE-STATE.md:227`). Durations are working sessions, not calendar promises._

## Dependency graph

```
A4 Security closure ──────────────┐            (no code; VPS ops — do first, it also
                                  │             cleans the baseline everything else
A2 Preflight gate ────────┐       │             gets verified against)
                          ├──> A6 Sonnet audit rollout (needs: clean baseline A4,
A5 Config SoT ────────────┘       │             preflight gate A2, canonical config A5)
                                  │
A1 Governor→Supabase ──┐          │
                       ├──> Phase 10 pipeline intelligence (future, out of scope)
A3 Webhook hardening ──┘
A7 Embeddings ──────── independent (only soft-depends on A1's governor entry for ollama)
```

Key edges, with reasons:

- **A5 → A6 (hard):** the Sonnet-audit classifier reads `business_scope` / `operational_boundaries` / `skills[]`, which exist only in `config/agents_config.json` today. Auditing before the single-source-of-truth fix risks classifying from the stale root copy — the exact split-brain A5 eliminates.
- **A2 → A6 (hard):** every remap batch ends in a config push + restart; the preflight gate is the guard that made the 2026-05-14 regression class impossible. No remap ships without it.
- **A4 → everything (soft):** device-auth re-enable and `systemctl enable` change restart semantics; do them before the restart-heavy advancements so each later verification also exercises the hardened path.
- **A1 ∥ A3 (parallel-safe):** both write to Supabase (different tables: `rate_governor_state` vs `agent_events`) and touch disjoint code (`lib/api-rate-governor.ts` vs `ghl-webhook-handler.mjs`). One shared prerequisite: confirm `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` present in the VPS process environment (both read the same vars).
- **A7 (independent):** touches `lib/agent-memory.ts` / `lib/llm-router.ts` embedding paths only. Its single ordering preference is to land the `PROVIDER_LIMITS.ollama` entry after A1 merges, to avoid a merge conflict in `api-rate-governor.ts`.

## Phased schedule

### Phase 0 — "Stop the standing risks" (Day 0, one evening session)
| Slot | Work | Advancement |
|------|------|-------------|
| 0.1 | `systemctl enable openclaw ollama`; device-auth re-enable + re-pair; `ollama rm kimi-k2.5:cloud`; security audit capture | A4 |
| 0.2 | Enforcement-mode warn-log triage begins (48 h clock starts) | A4 |
| 0.3 | Write + land `scripts/preflight-providers.mjs` and the `gateway.cmd` role guard (pure additions, no restart needed) | A2 |

### Phase 1 — "Light up the data plane" (Days 1–4, two tracks in parallel)
| Track A (governor) | Track B (webhook) |
|--------------------|-------------------|
| A1 migration (runtime_id) + adapter module | A3 verify/dedupe modules + unique index migration |
| A1 wire-in + tests | A3 handler wiring + tests + smoke-test extension |
| Joint deploy window: one VPS `git pull` + restart covers both; preflight gate (A2) runs first; reboot test from A4 doubles as the persistence verification | |
| Day 2 checkpoint (from Phase 0): flip enforcement modes to `enforce` if triage clean | |

### Phase 2 — "One truth" (Days 5–6)
| Slot | Work | Advancement |
|------|------|-------------|
| 2.1 | Drift reconcile, `sync-canonical-config.mjs`, CI gate, webhook `skillsDir` repoint, hygiene moves (`tui/` ignore, supabase skill folders → `plugin-skills/`) | A5 |
| 2.2 | `pnpm validate` full pass — this is the last change to the config substrate before the audit reads it | A5 |

### Phase 3 — "The big remap" (Days 7–14, includes two 48 h observation windows)
| Slot | Work | Advancement |
|------|------|-------------|
| 3.1 | Classifier + generated results table | A6 |
| 3.2 | CVO review of the 74-row table; approved allowlist committed | A6 (human gate — the only step Claude cannot close alone) |
| 3.3 | Batch 1 (10 agents) → 48 h observation | A6 |
| 3.4 | Batch 2 (remaining approved) → 48 h observation → phase close entry | A6 |

### Phase 4 — "Sovereign memory" (Days 8–15, overlaps Phase 3 observation windows)
| Slot | Work | Advancement |
|------|------|-------------|
| 4.1 | `ollama pull nomic-embed-text` + 768 migration + provider switch (can run while A6 batch 1 soaks — code areas are disjoint) | A7 |
| 4.2 | Cutover env flip + one-week soak (runs in the background of everything) | A7 |
| 4.3 | Retire `openai` dependency at soak end (~Day 20) | A7 |

## Critical path

**A4 → A2 → (A1 ∥ A3) → A5 → A6-batch-1 → 48 h → A6-batch-2 → 48 h → close.** ≈ 14 working days end-to-end; A7's soak tail extends the full program to ~Day 20 without blocking anything.

## Standing rules for every deploy in this program

1. `pnpm preflight` green against the exact config being shipped (A2, from Phase 0 onward).
2. Capacity check (`free -h` + timed generation) before any change that adds local-model load (doctrine from audit 2026-05-14-003).
3. Every VPS-side change gets a REGGIE-STATE audit entry (append-only, existing format).
4. One advancement per commit-train; no bundling A-numbers into a single revert-unit.
