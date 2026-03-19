/**
 * API Rate Governor
 * Truth J Blue LLC - OpenClaw Multi-Agent Network
 *
 * Global rate-limiting, circuit-breaking, and request budgeting layer.
 * Prevents API limit hits and critical overload across all agents.
 *
 * Key protections:
 * 1. Per-provider token-bucket rate limiting
 * 2. Circuit breaker with exponential backoff
 * 3. Global concurrency semaphore
 * 4. Request priority queuing (P0 > P1 > P2 > P3)
 * 5. Budget tracking with hard ceilings
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import {
  circuitBreakerState,
  budgetUsedDollars,
  budgetCeilingDollars,
  concurrencyActive,
} from "./metrics";

const log = logger.child({ module: "rate-governor" });

type CircuitState = "closed" | "open" | "half-open";

interface GovernorStateRow {
  provider: string;
  state_day: string;
  spent_cents: number;
  request_count: number;
  warning_emitted: boolean;
  circuit_state: CircuitState;
  failures: number;
  last_failure_at: number;
  opened_at: number;
  saved_at: string;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
  halfOpenAttempts: number;
}

interface TokenBucket {
  tokens: number;
  maxTokens: number;
  refillRate: number;
  lastRefill: number;
}

interface DailyBudget {
  day: string;
  spentCents: number;
  requestCount: number;
  warningEmitted: boolean;
}

export interface ProviderLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  dailyBudgetCents: number;
  dailyBudgetWarningPct: number;
  maxConcurrent: number;
  retryAfterMs: number;
  maxRetries: number;
}

const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
  "openai-codex": {
    requestsPerMinute: 40,
    requestsPerHour: 800,
    dailyBudgetCents: 2500,
    dailyBudgetWarningPct: 0.75,
    maxConcurrent: 8,
    retryAfterMs: 2000,
    maxRetries: 3,
  },
  anthropic: {
    requestsPerMinute: 30,
    requestsPerHour: 600,
    dailyBudgetCents: 2000,
    dailyBudgetWarningPct: 0.75,
    maxConcurrent: 6,
    retryAfterMs: 3000,
    maxRetries: 3,
  },
  openai: {
    requestsPerMinute: 50,
    requestsPerHour: 1000,
    dailyBudgetCents: 1500,
    dailyBudgetWarningPct: 0.75,
    maxConcurrent: 8,
    retryAfterMs: 2000,
    maxRetries: 3,
  },
  ghl: {
    requestsPerMinute: 20,
    requestsPerHour: 400,
    dailyBudgetCents: 0,
    dailyBudgetWarningPct: 1.0,
    maxConcurrent: 5,
    retryAfterMs: 5000,
    maxRetries: 2,
  },
  supabase: {
    requestsPerMinute: 200,
    requestsPerHour: 5000,
    dailyBudgetCents: 0,
    dailyBudgetWarningPct: 1.0,
    maxConcurrent: 10,
    retryAfterMs: 1000,
    maxRetries: 3,
  },
  telegram: {
    requestsPerMinute: 25,
    requestsPerHour: 1000,
    dailyBudgetCents: 0,
    dailyBudgetWarningPct: 1.0,
    maxConcurrent: 2,
    retryAfterMs: 1000,
    maxRetries: 2,
  },
};

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
  maxOpenTimeMs: 300_000,
};

export type QueueClass = "P0" | "P1" | "P2" | "P3";

const PRIORITY_WEIGHTS: Record<QueueClass, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const minuteBuckets = new Map<string, TokenBucket>();
const hourBuckets = new Map<string, TokenBucket>();
const activeCounts = new Map<string, number>();
const budgets = new Map<string, DailyBudget>();
const circuitBreakers = new Map<string, CircuitBreakerState>();

let governorSupabase: SupabaseClient | null = null;
let persistenceHealthy = true;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getGovernorSupabase(): SupabaseClient | null {
  if (governorSupabase) return governorSupabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  governorSupabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return governorSupabase;
}

function markPersistenceDegraded(operation: string, error?: unknown): void {
  if (!persistenceHealthy) return;
  persistenceHealthy = false;
  log.error(
    { operation, err: error, critical: true },
    "Rate governor Supabase persistence degraded; continuing in in-memory mode",
  );
}

function markPersistenceRecovered(): void {
  if (persistenceHealthy) return;
  persistenceHealthy = true;
  log.info("Rate governor Supabase persistence recovered");
}

function getBudget(provider: string): DailyBudget {
  const key = `${provider}:${todayKey()}`;
  if (!budgets.has(key)) {
    budgets.set(key, {
      day: todayKey(),
      spentCents: 0,
      requestCount: 0,
      warningEmitted: false,
    });
  }
  return budgets.get(key)!;
}

function getCircuitBreaker(provider: string): CircuitBreakerState {
  if (!circuitBreakers.has(provider)) {
    circuitBreakers.set(provider, {
      state: "closed",
      failures: 0,
      lastFailureAt: 0,
      openedAt: 0,
      halfOpenAttempts: 0,
    });
  }
  return circuitBreakers.get(provider)!;
}

async function persistProviderState(
  provider: string,
  spentCentsDelta: number = 0,
  requestCountDelta: number = 0,
): Promise<void> {
  const db = getGovernorSupabase();
  if (!db) {
    markPersistenceDegraded("persist:missing_credentials");
    return;
  }

  const budget = budgets.get(`${provider}:${todayKey()}`) || {
    day: todayKey(),
    spentCents: 0,
    requestCount: 0,
    warningEmitted: false,
  };
  const circuit = getCircuitBreaker(provider);

  const { error } = await db.rpc("upsert_rate_governor_state", {
    p_provider: provider,
    p_state_day: todayKey(),
    p_spent_cents_delta: Math.max(0, spentCentsDelta),
    p_request_count_delta: Math.max(0, requestCountDelta),
    p_warning_emitted: budget.warningEmitted,
    p_circuit_state: circuit.state,
    p_failures: circuit.failures,
    p_last_failure_at: circuit.lastFailureAt,
    p_opened_at: circuit.openedAt,
    p_saved_at: new Date().toISOString(),
  });

  if (error) {
    markPersistenceDegraded("persist:rpc", error);
    return;
  }

  markPersistenceRecovered();
}

async function loadState(): Promise<void> {
  const db = getGovernorSupabase();
  if (!db) {
    markPersistenceDegraded("load:missing_credentials");
    return;
  }

  const { data, error } = await db.from("rate_governor_state").select("*");
  if (error) {
    markPersistenceDegraded("load:select", error);
    return;
  }

  const today = todayKey();
  let budgetCount = 0;
  let circuitCount = 0;

  for (const row of (data || []) as GovernorStateRow[]) {
    if (row.state_day === today) {
      budgets.set(`${row.provider}:${row.state_day}`, {
        day: row.state_day,
        spentCents: row.spent_cents,
        requestCount: row.request_count,
        warningEmitted: row.warning_emitted,
      });
      budgetUsedDollars.set({ provider: row.provider }, row.spent_cents / 100);
      const limits = PROVIDER_LIMITS[row.provider];
      if (limits?.dailyBudgetCents > 0) {
        budgetCeilingDollars.set({ provider: row.provider }, limits.dailyBudgetCents / 100);
      }
      budgetCount++;
    }

    if (row.circuit_state !== "closed") {
      circuitBreakers.set(row.provider, {
        state: row.circuit_state,
        failures: row.failures,
        lastFailureAt: row.last_failure_at,
        openedAt: row.opened_at,
        halfOpenAttempts: 0,
      });
      circuitBreakerState.set(
        { provider: row.provider },
        row.circuit_state === "open" ? 2 : 1,
      );
      circuitCount++;
    }
  }

  markPersistenceRecovered();
  log.info(
    { budgets: budgetCount, circuits: circuitCount },
    "Rate governor state rehydrated from Supabase",
  );
}

function recordSuccess(provider: string): void {
  const cb = getCircuitBreaker(provider);
  const wasOpen = cb.state !== "closed";
  cb.state = "closed";
  cb.failures = 0;
  cb.lastFailureAt = 0;
  cb.openedAt = 0;
  cb.halfOpenAttempts = 0;
  circuitBreakerState.set({ provider }, 0);
  if (wasOpen) {
    void persistProviderState(provider);
  }
}

function recordFailure(
  provider: string,
  isRateLimit: boolean,
  isAuthExpired: boolean = false,
): void {
  const cb = getCircuitBreaker(provider);
  cb.failures++;
  cb.lastFailureAt = Date.now();

  if (isAuthExpired) {
    cb.state = "open";
    cb.openedAt = Date.now();
    circuitBreakerState.set({ provider }, 2);
    log.error(
      { provider },
      "Circuit OPEN - AUTH EXPIRED (401/403). All requests blocked until token refresh.",
    );
    void persistProviderState(provider);
    return;
  }

  if (isRateLimit || cb.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    cb.state = "open";
    cb.openedAt = Date.now();
    circuitBreakerState.set({ provider }, 2);
    log.warn({ provider, failures: cb.failures, isRateLimit }, "Circuit OPEN");
    void persistProviderState(provider);
  }
}

function canAttempt(provider: string): { allowed: boolean; reason?: string } {
  const cb = getCircuitBreaker(provider);
  const now = Date.now();

  if (cb.state === "closed") return { allowed: true };

  if (cb.state === "open") {
    const elapsed = now - cb.openedAt;
    if (
      elapsed >= CIRCUIT_BREAKER_CONFIG.maxOpenTimeMs ||
      elapsed >= CIRCUIT_BREAKER_CONFIG.resetTimeoutMs
    ) {
      cb.state = "half-open";
      cb.halfOpenAttempts = 0;
      circuitBreakerState.set({ provider }, 1);
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Circuit open for ${provider} - retry in ${Math.ceil(
        (CIRCUIT_BREAKER_CONFIG.resetTimeoutMs - elapsed) / 1000,
      )}s`,
    };
  }

  if (cb.halfOpenAttempts < CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts) {
    cb.halfOpenAttempts++;
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Circuit half-open for ${provider} - max test attempts reached`,
  };
}

function getBucket(
  map: Map<string, TokenBucket>,
  provider: string,
  max: number,
  windowMs: number,
): TokenBucket {
  if (!map.has(provider)) {
    map.set(provider, {
      tokens: max,
      maxTokens: max,
      refillRate: max / windowMs,
      lastRefill: Date.now(),
    });
  }
  return map.get(provider)!;
}

function refillBucket(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRate);
  bucket.lastRefill = now;
}

function tryConsume(provider: string): { allowed: boolean; retryAfterMs?: number } {
  const limits = PROVIDER_LIMITS[provider];
  if (!limits) return { allowed: true };

  const minuteBucket = getBucket(
    minuteBuckets,
    provider,
    limits.requestsPerMinute,
    60_000,
  );
  const hourBucket = getBucket(
    hourBuckets,
    provider,
    limits.requestsPerHour,
    3_600_000,
  );

  refillBucket(minuteBucket);
  refillBucket(hourBucket);

  if (minuteBucket.tokens < 1) {
    return {
      allowed: false,
      retryAfterMs: Math.ceil((1 - minuteBucket.tokens) / minuteBucket.refillRate),
    };
  }

  if (hourBucket.tokens < 1) {
    return {
      allowed: false,
      retryAfterMs: Math.ceil((1 - hourBucket.tokens) / hourBucket.refillRate),
    };
  }

  minuteBucket.tokens -= 1;
  hourBucket.tokens -= 1;
  return { allowed: true };
}

function acquireConcurrency(provider: string): boolean {
  const limits = PROVIDER_LIMITS[provider];
  if (!limits) return true;

  const current = activeCounts.get(provider) || 0;
  if (current >= limits.maxConcurrent) return false;

  activeCounts.set(provider, current + 1);
  concurrencyActive.set({ provider }, current + 1);
  return true;
}

function releaseConcurrency(provider: string): void {
  const current = activeCounts.get(provider) || 0;
  const next = Math.max(0, current - 1);
  activeCounts.set(provider, next);
  concurrencyActive.set({ provider }, next);
}

function checkBudget(provider: string): { allowed: boolean; reason?: string } {
  const limits = PROVIDER_LIMITS[provider];
  if (!limits || limits.dailyBudgetCents <= 0) return { allowed: true };

  const budget = getBudget(provider);
  if (budget.spentCents >= limits.dailyBudgetCents) {
    return {
      allowed: false,
      reason: `Daily budget exhausted for ${provider}: $${(budget.spentCents / 100).toFixed(2)} / $${(
        limits.dailyBudgetCents / 100
      ).toFixed(2)}`,
    };
  }

  return { allowed: true };
}

function trackSpend(provider: string, costCents: number): void {
  const limits = PROVIDER_LIMITS[provider];
  const budget = getBudget(provider);
  budget.spentCents += costCents;
  budget.requestCount++;

  budgetUsedDollars.set({ provider }, budget.spentCents / 100);
  if (limits && limits.dailyBudgetCents > 0) {
    budgetCeilingDollars.set({ provider }, limits.dailyBudgetCents / 100);
  }

  if (limits && limits.dailyBudgetCents > 0) {
    const pct = budget.spentCents / limits.dailyBudgetCents;
    if (pct >= limits.dailyBudgetWarningPct && !budget.warningEmitted) {
      budget.warningEmitted = true;
      log.warn(
        {
          provider,
          pct: +(pct * 100).toFixed(1),
          spent: budget.spentCents,
          ceiling: limits.dailyBudgetCents,
        },
        "BUDGET WARNING",
      );
    }
  }

  void persistProviderState(provider, costCents, 1);
}

function priorityBackoffMultiplier(
  queueClass: QueueClass,
  activeLoad: number,
  maxLoad: number,
): number {
  const loadRatio = activeLoad / maxLoad;
  if (loadRatio < 0.5) return 1;
  return 1 + PRIORITY_WEIGHTS[queueClass] * loadRatio;
}

export interface GuardedRequestOptions {
  provider: string;
  queueClass?: QueueClass;
  agentId?: string;
  estimatedCostCents?: number;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

export function checkRequest(opts: GuardedRequestOptions): GuardResult {
  const { provider, queueClass = "P2" } = opts;

  const circuit = canAttempt(provider);
  if (!circuit.allowed) {
    return {
      allowed: false,
      reason: circuit.reason,
      retryAfterMs: CIRCUIT_BREAKER_CONFIG.resetTimeoutMs,
    };
  }

  const budget = checkBudget(provider);
  if (!budget.allowed) {
    return { allowed: false, reason: budget.reason };
  }

  const rateResult = tryConsume(provider);
  if (!rateResult.allowed) {
    const limits = PROVIDER_LIMITS[provider];
    const activeLoad = activeCounts.get(provider) || 0;
    const maxLoad = limits?.maxConcurrent || 10;
    const multiplier = priorityBackoffMultiplier(queueClass, activeLoad, maxLoad);
    const backoff = Math.ceil((rateResult.retryAfterMs || 2000) * multiplier);
    return {
      allowed: false,
      reason: `Rate limited for ${provider}`,
      retryAfterMs: backoff,
    };
  }

  if (!acquireConcurrency(provider)) {
    const limits = PROVIDER_LIMITS[provider];
    return {
      allowed: false,
      reason: `Max concurrency (${limits?.maxConcurrent}) reached for ${provider}`,
      retryAfterMs: 3000,
    };
  }

  return { allowed: true };
}

export function reportSuccess(provider: string, costCents: number = 0): void {
  releaseConcurrency(provider);
  recordSuccess(provider);
  if (costCents > 0) trackSpend(provider, costCents);
}

export function reportFailure(provider: string, statusCode?: number): void {
  releaseConcurrency(provider);
  const isRateLimit = statusCode === 429;
  const isAuthExpired = statusCode === 401 || statusCode === 403;
  recordFailure(provider, isRateLimit, isAuthExpired);
}

export async function withGovernor<T>(
  opts: GuardedRequestOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const { provider, queueClass = "P2" } = opts;
  const limits = PROVIDER_LIMITS[provider];
  const maxRetries = limits?.maxRetries ?? 3;
  const baseBackoff = limits?.retryAfterMs ?? 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const guard = checkRequest(opts);
    if (!guard.allowed) {
      if (attempt === maxRetries) {
        throw new Error(
          `[RateGovernor] Request blocked after ${maxRetries} retries: ${guard.reason}`,
        );
      }
      const jitter = Math.random() * 1000;
      const delay = (guard.retryAfterMs || baseBackoff) * Math.pow(2, attempt) + jitter;
      log.warn(
        {
          provider,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          reason: guard.reason,
          delayMs: Math.ceil(delay),
        },
        "Request blocked, waiting",
      );
      await sleep(delay);
      continue;
    }

    try {
      const result = await fn();
      reportSuccess(provider, opts.estimatedCostCents || 0);
      return result;
    } catch (error: unknown) {
      const statusCode = extractStatusCode(error);
      reportFailure(provider, statusCode);

      if (statusCode === 401 || statusCode === 403) {
        log.error({ provider, statusCode }, "Auth expired, circuit opened");
        throw error;
      }

      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw error;
      }

      if (attempt === maxRetries) throw error;

      const jitter = Math.random() * 1000;
      const delay = baseBackoff * Math.pow(2, attempt) + jitter;
      log.warn(
        {
          provider,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          statusCode,
          delayMs: Math.ceil(delay),
        },
        "Request failed, retrying",
      );
      await sleep(delay);
    }
  }

  throw new Error(`[RateGovernor] Exhausted retries for ${provider}`);
}

export interface GovernorStatus {
  provider: string;
  circuitState: CircuitState;
  consecutiveFailures: number;
  activeConcurrency: number;
  maxConcurrency: number;
  minuteTokensRemaining: number;
  hourTokensRemaining: number;
  dailySpentCents: number;
  dailyBudgetCents: number;
  dailyRequestCount: number;
}

export function getStatus(provider: string): GovernorStatus {
  const limits = PROVIDER_LIMITS[provider] || {
    requestsPerMinute: 0,
    requestsPerHour: 0,
    dailyBudgetCents: 0,
    dailyBudgetWarningPct: 1,
    maxConcurrent: 0,
    retryAfterMs: 2000,
    maxRetries: 3,
  };

  const circuit = getCircuitBreaker(provider);
  const minuteBucket = minuteBuckets.get(provider);
  const hourBucket = hourBuckets.get(provider);
  const budget = getBudget(provider);

  if (minuteBucket) refillBucket(minuteBucket);
  if (hourBucket) refillBucket(hourBucket);

  return {
    provider,
    circuitState: circuit.state,
    consecutiveFailures: circuit.failures,
    activeConcurrency: activeCounts.get(provider) || 0,
    maxConcurrency: limits.maxConcurrent,
    minuteTokensRemaining: Math.floor(minuteBucket?.tokens ?? limits.requestsPerMinute),
    hourTokensRemaining: Math.floor(hourBucket?.tokens ?? limits.requestsPerHour),
    dailySpentCents: budget.spentCents,
    dailyBudgetCents: limits.dailyBudgetCents,
    dailyRequestCount: budget.requestCount,
  };
}

export function getAllStatus(): GovernorStatus[] {
  return Object.keys(PROVIDER_LIMITS).map(getStatus);
}

export function __resetForTests(options: { deleteStateFile?: boolean } = {}): void {
  minuteBuckets.clear();
  hourBuckets.clear();
  activeCounts.clear();
  budgets.clear();
  circuitBreakers.clear();
  governorSupabase = null;
  persistenceHealthy = true;
  void options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const maybeError = error as Record<string, unknown>;
    if (typeof maybeError.status === "number") return maybeError.status;
    if (typeof maybeError.statusCode === "number") return maybeError.statusCode;
    if (maybeError.response && typeof maybeError.response === "object") {
      const response = maybeError.response as Record<string, unknown>;
      if (typeof response.status === "number") return response.status;
    }
  }
  return undefined;
}

void loadState();
