# OpenClaw Advancement Program — Executive Summary

_Analysis date: 2026-07-03 · Analyst: Claude Code (autonomous reconnaissance session) · Repo: `~/.openclaw` (main @ 270bc11)_

## Where the platform stands

The stack is **DEPLOYED FULLY OPERATIONAL** per [REGGIE-STATE.md:6-9](../../REGGIE-STATE.md) (verified 2026-05-14 on VPS srv1619751), but the repo has been idle since 2026-05-20. Phase 9.1-redo is closed (22 cron agents on local `ollama/qwen3:14b`); Phase 9.2 (Sonnet audit) is **open and unstarted**; Phase 10 (GHL webhook hardening & pipeline intelligence) is scoped but not opened. The upgrade-program backlog U01–U25 is fully implemented ([IMPLEMENTATION-BACKLOG.md](../upgrade-program/IMPLEMENTATION-BACKLOG.md)).

**The single most consequential finding:** the Supabase data plane is dark. Live query against the linked project (DB1 `aagqvfwuixpxtdcrdxmv`) on 2026-07-03 shows `rate_governor_state`, `agent_events`, `agent_costs`, `agent_memory`, and `human_approval_queue` all at **0 rows** — every one of these tables was migrated months ago and no runtime code writes to them. DB2 (`dbapisqoajswktxohfby`) is unreachable (connection timeout — likely paused). The platform runs, but it runs blind: no persisted cost truth, no event ledger, no shared circuit-breaker state across its two known runtimes (VPS + the Windows gateway that caused the 2026-05-16 duplicate-cron incident).

## The Seven Advancements (ranked)

| # | Advancement | Impact | Effort | Core evidence |
|---|-------------|--------|--------|---------------|
| 1 | Supabase-backed rate governor (finish "Phase 6" circuit breaker) | 9 | 4 | Table+RPC exist ([20260319000008](../../supabase/migrations/20260319000008_human_approval_and_governor_state.sql) L62–151); runtime persists to local JSON only ([api-rate-governor.ts:35](../../lib/api-rate-governor.ts)); live table 0 rows |
| 2 | Provider preflight: degrade-not-abort + dev-profile cron guard | 9 | 3 | [REGGIE-STATE.md:340](../../REGGIE-STATE.md) "failure mode is abort, not degrade"; :189 dev-workstation doctrine flag; two cron-storm incidents (2026-05-14, 2026-05-16) |
| 3 | GHL webhook idempotency + Ed25519 verification (Phase 10 opener) | 9 | 4 | [ghl-webhook-handler.mjs:174-182](../../ghl-webhook-handler.mjs) HMAC-only, zero dedupe logic; [.env.example:99-101](../../.env.example) promises Ed25519 override that is unimplemented |
| 4 | Security & persistence closure (discharge Phase 9.2 items 2–4) | 8 | 2 | [REGGIE-STATE.md:73-86](../../REGGIE-STATE.md): device auth disabled (RED, SOUL #2 violation), systemd units not enabled, Kimi drift; enforcement modes ship as `warn` ([.env.example:77-79](../../.env.example)) |
| 5 | Config single source of truth (kill 3 duplication axes) | 8 | 4 | `agents_config.json` vs `config/agents_config.json` have **diverged** (root lacks `business_scope`/`ghl_token_group`/`operational_boundaries`/`skills`); lib readers use `config/` ([security-governance.mjs:13](../../lib/security-governance.mjs)); `skills/` 124 .mjs vs `workspace/skills/` 69 .mjs physical copies |
| 6 | Close Phase 9.2: audit 74 Sonnet bindings → tier-safe local remap | 8 | 5 | 74 × `claude-sonnet-4.5` measured in both config files (2026-07-03); [REGGIE-STATE.md:88-91](../../REGGIE-STATE.md); walk-up mechanism pre-staged (`scripts/phase9_2_patch.py`) |
| 7 | Embedding sovereignty: OpenAI → local Ollama embeddings | 7 | 5 | Five live TODOs ([agent-memory.ts:8,75,116](../../lib/agent-memory.ts), [llm-router.ts:133,443](../../lib/llm-router.ts)); re-embed helper already exists (`scripts/reembed-agent-memory.mjs`); 512-dim migration precedent ([20260318000006](../../supabase/migrations/20260318000006_embedding_model_upgrade.sql)) |

Full briefs: `01-…md` through `07-…md` in this directory. Sequencing and parallelization: [08-master-timeline.md](08-master-timeline.md). Risks: [09-risk-register.md](09-risk-register.md). KPIs: [10-success-metrics.md](10-success-metrics.md).

## Why these seven

1. **They discharge every open doctrine flag in REGGIE-STATE.md** — abort-not-degrade (#2), dev-runtime cron duplication (#2), device-auth RED (#4), duplicate config files (#5), the 74-Sonnet audit (#6).
2. **They light up the dark data plane** — #1 and #3 make `rate_governor_state` and `agent_events` real, which is the prerequisite for Phase 10's "pipeline diagnostics" and every dashboard/KPI ambition in [PLATFORM-REFERENCE.md](../../PLATFORM-REFERENCE.md).
3. **They advance the GHL mission directly** — #3 is the first committed step of Phase 10 (GHL Webhook Hardening, [REGGIE-STATE.md:114-124](../../REGGIE-STATE.md)) and aligns with the 2026 GHL capability map (Master Capability Guide: workflows, webhooks, AI Employee suite) that the TJB funnel stack depends on.
4. **They cut recurring cost** — #6 is the largest remaining paid-model surface (74 agents); #7 removes the last OpenAI dependency; #1 makes budget ceilings enforceable across runtimes instead of per-machine.

## Honorable mentions (not in the seven)

- **Inngest event re-typing** — [inngest/client.ts:1287-1293](../../inngest/client.ts) documents that the 1,286-line `OpenClawEvent` union was disconnected in the v4 migration ("untyped to unblock CI"). Fold into Advancement 3's follow-on once webhook events start flowing; the `staticSchema<RecordOfEvents>()` refactor is mechanical but large.
- **Heartbeat** stays throttled at `168h` ([deploy/hostinger/server-openclaw.json:232-234](../../deploy/hostinger/server-openclaw.json)) — intentional cost guard; do not "fix" it back to 30 min.
- **DB2 disposition** — decide whether `dbapisqoajswktxohfby` (paused, unreachable 2026-07-03) is still part of the architecture or should be formally retired from docs and memory.

## Ground rules honored

Every claim above is anchored to a file and line read during reconnaissance on 2026-07-03. No architecture was invented; where the live DB was checked, the query and result date are stated. Secrets were scanned for (none found hardcoded in `lib/`, `skills/`, `scripts/`, `inngest/`, `docs/`, `config/`, `deploy/`) and no secret values appear in any of these documents.
