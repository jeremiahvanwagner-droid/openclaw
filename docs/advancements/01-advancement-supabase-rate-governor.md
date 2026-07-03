# Advancement 1 — Supabase-Backed Rate Governor (Finish the Phase 6 Circuit Breaker)

## Summary

- **File Evidence:**
  - `supabase/migrations/20260319000008_human_approval_and_governor_state.sql:62-85` — `rate_governor_state` table (provider, state_day, spent_cents, request_count, circuit_state, failures, opened_at) created 2026-03-19.
  - Same file `:87-151` — `upsert_rate_governor_state()` RPC with delta-additive spend accounting and circuit-state merge logic, purpose-built for a runtime writer that never arrived.
  - `lib/api-rate-governor.ts:35` — `STATE_FILE = path.join(__dirname_rg, "..", "data", "rate-governor-state.json")`: persistence is a machine-local JSON file.
  - `lib/api-rate-governor.ts:43-95` — `persistState()` / `loadState()` write/read disk only; no Supabase import anywhere in the module.
  - **Live verification (2026-07-03):** `select relname, n_live_tup from pg_stat_user_tables …` on DB1 (`aagqvfwuixpxtdcrdxmv`) → `rate_governor_state` = **0 rows**. The table has never been written.
  - `REGGIE-STATE.md:155-196` (audit 2026-05-16-001) — a second openclaw runtime on the Windows workstation fired the same cron schedule as the VPS. With file-based state, each runtime kept its own budgets and circuits; neither could see the other's spend.
- **Current State:** Full in-memory governor (token buckets, circuit breaker, priority queue, daily budget ceilings at `lib/api-rate-governor.ts:121-216`) with disk-only persistence. Budget truth is per-machine; a restart on a different host, a redeploy, or a duplicate runtime silently resets or forks spend counters. The Supabase persistence layer designed for exactly this exists but is orphaned.
- **Proposed Enhancement:** Add a Supabase sync layer to the governor: write-through on spend/circuit transitions via the existing `upsert_rate_governor_state` RPC, read-merge on startup (take the max of local file and Supabase for `spent_cents`), keep the local JSON as offline fallback. Emit a `runtime_id` (hostname) column value so two runtimes writing the same `(provider, state_day)` become visible — turning the 2026-05-16 incident class into a queryable signal.
- **Impact / Effort:** 9/10 · 4/10
- **Risk Eliminated:** Cross-runtime budget blindness (the March 2026 Telegram 401 retry storm cost hundreds of dollars precisely because no shared ledger existed); budget-reset-on-redeploy; invisible duplicate runtimes double-spending.
- **Mission Advancement:** Cost sovereignty is doctrine P10 (REGGIE-STATE.md:424). A shared, queryable spend ledger is the enforcement mechanism, not just telemetry.
- **Unlocks:** Dashboard cost panels reading `rate_governor_state`; alerting on `circuit_state = 'open'` via Supabase; Phase 10 pipeline-intelligence cost attribution; later wiring of `human_approval_queue` (same migration, also 0 rows) for HITL approvals.

## Implementation Brief

### Files to Create/Modify/Delete

- **Create:** `lib/rate-governor-supabase.ts` (sync adapter)
- **Modify:** `lib/api-rate-governor.ts` (call adapter from `persistState()`/`loadState()` and on circuit transitions)
- **Modify:** `lib/__tests__/api-rate-governor.test.ts` (mock adapter; assert write-through calls)
- **Modify (optional, additive):** new migration `supabase/migrations/<ts>_rate_governor_runtime_id.sql`
- **Delete:** nothing.

### Step-by-Step Instructions

1. **Add the runtime_id column (additive migration):**
   ```sql
   ALTER TABLE rate_governor_state
     ADD COLUMN IF NOT EXISTS runtime_id TEXT NOT NULL DEFAULT 'unknown';
   -- widen PK to keep per-runtime rows distinct
   ALTER TABLE rate_governor_state DROP CONSTRAINT rate_governor_state_pkey;
   ALTER TABLE rate_governor_state ADD PRIMARY KEY (provider, state_day, runtime_id);
   ```
   Update `upsert_rate_governor_state` with a `p_runtime_id TEXT DEFAULT 'unknown'` parameter and include it in INSERT/ON CONFLICT. Apply via `supabase db push` (project is CLI-linked to DB1 per `supabase/.temp/project-ref`).

2. **Create `lib/rate-governor-supabase.ts`:**
   ```ts
   import os from "os";
   import { createClient } from "@supabase/supabase-js";
   import { logger } from "./logger";

   const log = logger.child({ module: "rate-governor-supabase" });
   const RUNTIME_ID = process.env.OPENCLAW_RUNTIME_ID || os.hostname();
   const url = process.env.SUPABASE_URL;
   const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
   const sb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

   export function isEnabled(): boolean { return sb !== null; }

   export async function pushState(rows: Array<{
     provider: string; day: string; spentCentsDelta: number; requestCountDelta: number;
     warningEmitted: boolean; circuitState: string; failures: number;
     lastFailureAt: number; openedAt: number;
   }>): Promise<void> {
     if (!sb) return;
     for (const r of rows) {
       const { error } = await sb.rpc("upsert_rate_governor_state", {
         p_provider: r.provider, p_state_day: r.day,
         p_spent_cents_delta: r.spentCentsDelta, p_request_count_delta: r.requestCountDelta,
         p_warning_emitted: r.warningEmitted, p_circuit_state: r.circuitState,
         p_failures: r.failures, p_last_failure_at: r.lastFailureAt,
         p_opened_at: r.openedAt, p_runtime_id: RUNTIME_ID,
       });
       if (error) log.warn({ error: error.message, provider: r.provider }, "governor supabase push failed");
     }
   }

   export async function pullToday(): Promise<Map<string, { spentCents: number; requestCount: number; circuitState: string }>> {
     const out = new Map<string, { spentCents: number; requestCount: number; circuitState: string }>();
     if (!sb) return out;
     const today = new Date().toISOString().slice(0, 10);
     const { data, error } = await sb.from("rate_governor_state")
       .select("provider, spent_cents, request_count, circuit_state")
       .eq("state_day", today);
     if (error) { log.warn({ error: error.message }, "governor supabase pull failed"); return out; }
     for (const row of data ?? []) {
       const prev = out.get(row.provider);
       out.set(row.provider, {
         spentCents: (prev?.spentCents ?? 0) + row.spent_cents,          // sum across runtimes
         requestCount: (prev?.requestCount ?? 0) + row.request_count,
         circuitState: prev?.circuitState === "open" ? "open" : row.circuit_state,
       });
     }
     return out;
   }
   ```
   Key design point: **deltas, not absolutes.** Track a `lastPushedCents` watermark per provider in `api-rate-governor.ts` and push only the increment, so the RPC's additive `ON CONFLICT` math stays correct with multiple writers.

3. **Wire into `lib/api-rate-governor.ts`:**
   - In `trackSpend()` (line 431) and `recordFailure()`/`recordSuccess()` (lines 254-286): after the existing `persistState()`, call `void pushState([...deltas])` fire-and-forget (never `await` inside the hot path; failures log-and-continue so Supabase outage cannot take down the governor — the circuit breaker must not need a circuit breaker).
   - In `loadState()` (line 65): after file rehydration, `pullToday()` and for each provider set `spentCents = Math.max(local, supabaseSum)`. Budget checks then respect global spend.
   - Throttle pushes: coalesce with a 5-second debounce timer to avoid one RPC per request.

4. **Env:** no new required vars — `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` already in `.env.example:60-61`. Add optional `OPENCLAW_RUNTIME_ID` to `.env.example` with comment `# distinguishes VPS vs workstation rows in rate_governor_state`.

5. **Tests:** in `lib/__tests__/api-rate-governor.test.ts`, mock `./rate-governor-supabase` (pattern identical to the existing mock at `inngest/__tests__/agent-orchestrator.test.ts:79`). Assert: spend → push called with delta; startup merge takes max; adapter disabled (no env) → zero behavioral change.

### Verification Checklist

- [ ] `pnpm test` green, including new adapter tests.
- [ ] Local smoke: run any governed call path (e.g. `scripts/test-openrouter-fallback.ts` exercises the governor), then `select * from rate_governor_state where state_day = current_date;` shows a row with your hostname as `runtime_id`.
- [ ] Kill and restart the process → startup log line `Rate governor state rehydrated` now reports Supabase merge; `spent_cents` not reset.
- [ ] Simulate 5 consecutive failures for a provider → row shows `circuit_state = 'open'`.
- [ ] With `SUPABASE_URL` unset → governor behaves exactly as today (file-only), no errors.

### Rollback Procedure

1. `git revert <commit-sha>` (code is additive; no callers change signature).
2. The migration is additive (new column + widened PK); to fully revert: `ALTER TABLE rate_governor_state DROP COLUMN runtime_id;` and restore the two-column PK. Data loss is acceptable — the table currently holds 0 rows.
3. Local JSON file persistence is untouched throughout, so no state is lost in either direction.

### Definition of Done

`select count(*) from rate_governor_state where state_day = current_date` returns **> 0** on DB1 after one production cron cycle on the VPS, AND a process restart preserves `spent_cents` (verified by comparing the value before shutdown and after startup). Both true → done; either false → not done.
