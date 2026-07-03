/**
 * Rate Governor — Supabase Persistence Adapter
 * Truth J Blue LLC — OpenClaw Multi-Agent Network
 *
 * Cross-runtime ledger for api-rate-governor: pushes spend/circuit deltas
 * to the rate_governor_state table (one row per provider+day+runtime) and
 * pulls global daily totals at startup so budget ceilings respect ALL
 * runtimes (VPS gateway + workstation), not just this process.
 *
 * Failure policy: this adapter must never throw into governor paths — the
 * circuit breaker cannot depend on the availability of what it protects.
 * Missing SUPABASE_* env disables it silently (file persistence remains).
 */

import os from "os";
import { logger } from "./logger";
import { supabase } from "./agent-memory";

const log = logger.child({ module: "rate-governor-supabase" });

/** Labels this runtime's rows in rate_governor_state (VPS vs workstation). */
export const RUNTIME_ID = process.env.OPENCLAW_RUNTIME_ID || os.hostname();

export function isEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface GovernorStateDelta {
  provider: string;
  /** YYYY-MM-DD */
  day: string;
  spentCentsDelta: number;
  requestCountDelta: number;
  warningEmitted: boolean;
  circuitState: "closed" | "open" | "half-open";
  failures: number;
  lastFailureAt: number;
  openedAt: number;
}

/**
 * Push accumulated deltas via the additive upsert RPC. Deltas (not absolutes)
 * keep the SQL-side accounting correct with multiple concurrent writers.
 * Errors are logged and swallowed by design.
 */
export async function pushDeltas(deltas: GovernorStateDelta[]): Promise<void> {
  if (!isEnabled() || deltas.length === 0) return;
  for (const d of deltas) {
    try {
      const { error } = await supabase.rpc("upsert_rate_governor_state", {
        p_provider: d.provider,
        p_state_day: d.day,
        p_spent_cents_delta: Math.max(0, Math.round(d.spentCentsDelta)),
        p_request_count_delta: Math.max(0, Math.round(d.requestCountDelta)),
        p_warning_emitted: d.warningEmitted,
        p_circuit_state: d.circuitState,
        p_failures: d.failures,
        p_last_failure_at: d.lastFailureAt,
        p_opened_at: d.openedAt,
        p_runtime_id: RUNTIME_ID,
      });
      if (error) {
        log.warn({ error: error.message, provider: d.provider }, "governor supabase push failed");
      }
    } catch (err) {
      log.warn({ err, provider: d.provider }, "governor supabase push failed");
    }
  }
}

export interface GlobalProviderState {
  /** Sum across all runtimes for today. */
  spentCents: number;
  requestCount: number;
  /** True if ANY runtime reported an open circuit today. */
  circuitOpen: boolean;
}

/**
 * Read today's rows and aggregate across runtimes. Returns an empty map on
 * any failure so callers can proceed on local state alone.
 */
export async function pullToday(): Promise<Map<string, GlobalProviderState>> {
  const out = new Map<string, GlobalProviderState>();
  if (!isEnabled()) return out;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("rate_governor_state")
      .select("provider, spent_cents, request_count, circuit_state")
      .eq("state_day", today);
    if (error) {
      log.warn({ error: error.message }, "governor supabase pull failed");
      return out;
    }
    for (const row of data ?? []) {
      const prev = out.get(row.provider) ?? { spentCents: 0, requestCount: 0, circuitOpen: false };
      out.set(row.provider, {
        spentCents: prev.spentCents + (row.spent_cents ?? 0),
        requestCount: prev.requestCount + (row.request_count ?? 0),
        circuitOpen: prev.circuitOpen || row.circuit_state === "open",
      });
    }
  } catch (err) {
    log.warn({ err }, "governor supabase pull failed");
  }
  return out;
}
