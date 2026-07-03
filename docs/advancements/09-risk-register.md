# Risk Register — Top Risk per Advancement + Mitigation

_Format: one primary risk per advancement (the one most likely to cause a rollback or an incident), with likelihood × severity, the mitigation built into the brief, and the tripwire that says "stop and roll back."_

## A1 — Supabase-Backed Rate Governor

- **Top risk:** The governor's hot path gains a network dependency; a slow/unavailable Supabase degrades every governed API call (the circuit breaker becomes the bottleneck it exists to prevent).
- **Likelihood × Severity:** Medium × High
- **Mitigation (designed-in):** Fire-and-forget pushes (never `await` in the hot path), 5-second debounce coalescing, log-and-continue on RPC errors, local JSON file remains the always-on fallback. Supabase is additive telemetry+merge, not a gate.
- **Tripwire:** Any appearance of `governor supabase push failed` at > 1/min sustained, or p95 latency increase on `withGovernor`-wrapped calls after deploy → set `SUPABASE_URL` empty for the process (disables adapter cleanly) and investigate offline.

## A2 — Provider Preflight & Dev-Profile Guard

- **Top risk:** The `gateway.cmd` role guard, if the installed openclaw dist lacks a cron-disable hook, blocks a *legitimate* workstation gateway use-case and the operator "temporarily" bypasses it — recreating the silent duplicate-cron scheduler the guard exists to prevent.
- **Likelihood × Severity:** Medium × Medium
- **Mitigation:** The brief specifies the fallback behavior (refuse to start without explicit `--allow-cron`) so the bypass is loud and deliberate, never ambient; the Startup-folder shortcuts stay `.disabled` (state since 2026-05-16); preflight itself is read-only and cannot break anything.
- **Tripwire:** Any cron run file in `cron/runs/` gaining an mtime while the VPS service was the only intended scheduler → immediately re-run the Windows process-tree check from audit 2026-05-16-001 (`Get-CimInstance Win32_Process … -match 'openclaw.*gateway'`).

## A3 — GHL Webhook Hardening

- **Top risk:** Ed25519 verification rejects **legitimate** GHL platform webhooks (wrong/rotated public key, or GHL signs only a subset of event classes) — silently dropping revenue-path events like `payment.received`.
- **Likelihood × Severity:** Medium × High
- **Mitigation:** Staged verification: deploy Ed25519 in *log-only* mode first (verify, record result, but accept on HMAC as today) for 72 h; flip to enforcing only after observed `verify=ed25519 ok` on real traffic. Dedupe returns 200 on duplicates so GHL's retry engine is never fighting the handler. The pinned key ships with an env override (`OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY`, already in `.env.example:99-101`) for same-day key rotation.
- **Tripwire:** `agent_events` insert rate drops to zero while GHL activity continues (compare with GHL workflow execution logs), or any 401 on a delivery GHL's dashboard shows as legitimate → flip back to HMAC-only via the staged flag.

## A4 — Security & Persistence Closure

- **Top risk:** Device-auth re-enable locks the operator out of the control UI (pairing flow fails against the current dist version), and panic-revert reinstates the RED violation permanently ("we tried once, it broke").
- **Likelihood × Severity:** Medium × Medium
- **Mitigation:** The brief mandates doing the change inside an active SSH session (recovery never depends on the UI being reachable); rollback is a single config-flag edit + restart; the reboot test is scheduled in a change window, not discovered by accident.
- **Tripwire:** Pairing not achievable within 30 minutes → revert flag, file an upstream-version note in the audit entry, and re-attempt after the next `openclaw` dist upgrade instead of abandoning the item.

## A5 — Config Single Source of Truth

- **Top risk:** The one-time reconcile overwrites a root-copy edit that was real (made after the enrichment fork) and the loss surfaces weeks later as an agent behaving off-spec.
- **Likelihood × Severity:** Low × High
- **Mitigation:** The brief's step 1 diffs *both directions* and requires reviewing `<`-side lines before overwrite; both files are git-tracked, so any lost edit is recoverable byte-exact from history; the CI drift gate prevents the fork from ever re-opening.
- **Tripwire:** Post-merge, `scripts/upgrade/check-governance-drift.mjs` or `upgrade:runtime:parity` flags an agent whose behavior metadata changed unexpectedly → `git log -p -- agents_config.json` to locate the orphaned edit and merge it forward.

## A6 — Sonnet Audit Completion

- **Top risk:** Concurrency starvation on the single-core VPS: 70+ agents newly eligible to call qwen3:14b stack requests behind one CPU core, cron ticks time out, and the platform reproduces the cron-storm symptom *with a healthy endpoint* (the `REGGIE-STATE.md:69` measurement — 98% core usage during one inference — is the warning).
- **Likelihood × Severity:** High × High (this is the program's most dangerous change)
- **Mitigation:** Staged batches (10 → rest) with 48 h observation windows; liveness metrics watched explicitly (`eventLoopDelayP99Ms` bands from `REGGIE-STATE.md:67-69`); the audit rubric keeps every latency-sensitive, surface-leaving agent on Sonnet; hardware walk-up path (24/32 GiB) documented as the pressure valve; batches are independent revert units.
- **Tripwire:** Cron completion rate for the pre-existing 22 local agents drops below 95% during any observation window, or `eventLoopDelayMaxMs` exceeds the ~12 s post-redo inference band persistently → halt rollout, revert latest batch, escalate the RAM/second-host decision (Phase 10 architectural item, `REGGIE-STATE.md:71`).

## A7 — Embedding Sovereignty

- **Top risk:** Retrieval-quality regression: nomic-embed-text's similarity space differs from text-embedding-3-small; memories stored under one model and queried under mindset of the other rank differently, degrading agent recall in ways no test asserts.
- **Likelihood × Severity:** Medium × Medium (severity capped today because `agent_memory` is empty — verified 0 rows on 2026-07-03; the risk grows with every row written before cutover)
- **Mitigation:** Dual-column design means the corpora never mix dimensions; cutover is an env flip; the soak week compares hit-rates; doing this *now*, while the table is empty, is itself the mitigation — the brief exists partly to beat the corpus.
- **Tripwire:** Probe-memory round-trip similarity < 0.9, or agents visibly failing to recall recently stored facts during the soak → env-flip back to `openai` (instant, no data loss).

## Program-level risks

- **Idle-repo context decay:** seven weeks since last commit; VPS reality may have drifted from `REGGIE-STATE.md` (last verified 2026-05-16). **Mitigation:** Phase 0 includes `openclaw security audit` + `ollama list` + `systemctl status` capture — a fresh ground-truth snapshot before anything ships. Treat every "current state" claim in these briefs as *repo-verified, VPS-pending* until that snapshot lands.
- **DB2 ambiguity:** `dbapisqoajswktxohfby` unreachable (timeout, likely paused) on 2026-07-03. If anything still points at DB2, A1/A3 writes could target the wrong project. **Mitigation:** grep the VPS process env for `SUPABASE_URL` during Phase 0; record the finding in the audit entry; formally retire DB2 from docs if unused.
- **Single human gate:** A6's CVO review (slot 3.2) is the only step that cannot be automated; if it stalls, the critical path stalls. **Mitigation:** the classifier emits a *pre-annotated* table with verdict rationale per row, so review is confirm/override, not research.
