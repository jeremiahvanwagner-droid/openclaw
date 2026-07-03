/**
 * API Rate Governor
 * Truth J Blue LLC — OpenClaw Multi-Agent Network
 *
 * Global rate-limiting, circuit-breaking, and request budgeting layer.
 * Prevents API limit hits and critical overload across all 77 agents.
 *
 * Key protections:
 * 1. Per-provider token-bucket rate limiting
 * 2. Circuit breaker with exponential backoff
 * 3. Global concurrency semaphore
 * 4. Request priority queuing (P0 > P1 > P2 > P3)
 * 5. Budget tracking with hard ceilings
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger";
import {
  circuitBreakerState,
  budgetUsedDollars,
  budgetCeilingDollars,
  concurrencyActive,
} from "./metrics";
import {
  isEnabled as supabaseSyncEnabled,
  pushDeltas,
  pullToday,
  type GovernorStateDelta,
} from "./rate-governor-supabase";

const log = logger.child({ module: "rate-governor" });

// ═══════════════════════════════════════════════════════════════════
// STATE PERSISTENCE — survives gateway restarts
// ═══════════════════════════════════════════════════════════════════

const __filename_rg = fileURLToPath(import.meta.url);
const __dirname_rg = path.dirname(__filename_rg);
const STATE_FILE = path.join(__dirname_rg, "..", "data", "rate-governor-state.json");

interface PersistedState {
  savedAt: string;
  budgets: Record<string, { day: string; spentCents: number; requestCount: number; warningEmitted: boolean }>;
  circuits: Record<string, { state: CircuitState; failures: number; lastFailureAt: number; openedAt: number }>;
}

function persistState(): void {
  try {
    const state: PersistedState = {
      savedAt: new Date().toISOString(),
      budgets: {},
      circuits: {},
    };
    for (const [key, b] of budgets.entries()) {
      state.budgets[key] = { day: b.day, spentCents: b.spentCents, requestCount: b.requestCount, warningEmitted: b.warningEmitted };
    }
    for (const [provider, cb] of circuitBreakers.entries()) {
      if (cb.state !== "closed") {
        state.circuits[provider] = { state: cb.state, failures: cb.failures, lastFailureAt: cb.lastFailureAt, openedAt: cb.openedAt };
      }
    }
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    log.warn({ err }, "Failed to persist rate governor state");
  }
}

function loadState(): void {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as PersistedState;
    const today = todayKey();

    // Rehydrate budgets (only for today — stale days are irrelevant)
    for (const [key, b] of Object.entries(raw.budgets)) {
      if (b.day === today) {
        budgets.set(key, { day: b.day, spentCents: b.spentCents, requestCount: b.requestCount, warningEmitted: b.warningEmitted });
      }
    }

    // Rehydrate circuit breakers (open/half-open states)
    for (const [provider, cb] of Object.entries(raw.circuits)) {
      circuitBreakers.set(provider, {
        state: cb.state,
        failures: cb.failures,
        lastFailureAt: cb.lastFailureAt,
        openedAt: cb.openedAt,
        halfOpenAttempts: 0,
      });
      const stateNum = cb.state === "open" ? 2 : cb.state === "half-open" ? 1 : 0;
      circuitBreakerState.set({ provider }, stateNum);
    }

    log.info({ budgets: Object.keys(raw.budgets).length, circuits: Object.keys(raw.circuits).length }, "Rate governor state rehydrated from disk");
  } catch (err) {
    log.warn({ err }, "Failed to load rate governor state — starting fresh");
  }
}

// ═══════════════════════════════════════════════════════════════════
// RATE LIMIT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

export interface ProviderLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  dailyBudgetCents: number;        // hard ceiling in cents
  dailyBudgetWarningPct: number;   // alert threshold (e.g. 0.8 = 80%)
  maxConcurrent: number;
  retryAfterMs: number;            // default backoff base
  maxRetries: number;
}

/**
 * 5-AGENT PURE ANTHROPIC RATE LIMITS (2026-03-29 Migration)
 *
 * Tier Rate Limits:
 * - Strategist: 30/min (P1, Opus, Sovereign)
 * - Executor: 60/min (P1, Sonnet)
 * - Communicator: 90/min (P2, Sonnet)
 * - Analyst: 120/min (P3, Haiku)
 * - Guardian: 40/min (P0, Haiku, Sovereign)
 */
const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
  // Catch-all for any Anthropic call that doesn't specify a tier.
  // Matches the strategist (most conservative) tier as a safe default.
  "anthropic": {
    requestsPerMinute: 30,
    requestsPerHour: 1800,
    dailyBudgetCents: 3000,
    dailyBudgetWarningPct: 0.8,
    maxConcurrent: 5,
    retryAfterMs: 2000,
    maxRetries: 3,
  },
  "anthropic-strategist": {
    requestsPerMinute: 30,
    requestsPerHour: 1800,
    dailyBudgetCents: 3000,      // $30/day (Opus is expensive: $30/1M tokens)
    dailyBudgetWarningPct: 0.8,
    maxConcurrent: 5,
    retryAfterMs: 2000,
    maxRetries: 3,
  },
  "anthropic-executor": {
    requestsPerMinute: 60,
    requestsPerHour: 3600,
    dailyBudgetCents: 2000,      // $20/day (Sonnet is moderate)
    dailyBudgetWarningPct: 0.75,
    maxConcurrent: 10,
    retryAfterMs: 1500,
    maxRetries: 3,
  },
  "anthropic-communicator": {
    requestsPerMinute: 90,
    requestsPerHour: 5400,
    dailyBudgetCents: 1500,      // $15/day (High volume, cost-conscious)
    dailyBudgetWarningPct: 0.7,
    maxConcurrent: 15,
    retryAfterMs: 1000,
    maxRetries: 3,
  },
  "anthropic-analyst": {
    requestsPerMinute: 120,
    requestsPerHour: 7200,
    dailyBudgetCents: 800,       // $8/day (Haiku is cheap: $0.80/1M tokens)
    dailyBudgetWarningPct: 0.65,
    maxConcurrent: 20,
    retryAfterMs: 500,
    maxRetries: 5,
  },
  "anthropic-guardian": {
    requestsPerMinute: 40,
    requestsPerHour: 2400,
    dailyBudgetCents: 1000,      // $10/day (Compliance is critical, cannot be cheap)
    dailyBudgetWarningPct: 0.75,
    maxConcurrent: 3,
    retryAfterMs: 3000,
    maxRetries: 4,
  },
  ghl: {
    requestsPerMinute: 20,       // GoHighLevel is aggressive on limits
    requestsPerHour: 400,
    dailyBudgetCents: 0,         // included in plan
    dailyBudgetWarningPct: 1.0,
    maxConcurrent: 5,            // raised from 3 — safe with staggered cron schedules
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
    requestsPerMinute: 25,       // Telegram limits: 30 msg/sec but burst protection
    requestsPerHour: 1000,
    dailyBudgetCents: 0,
    dailyBudgetWarningPct: 1.0,
    maxConcurrent: 2,
    retryAfterMs: 1000,
    maxRetries: 2,
  },
  // OpenAI — BACKUP ONLY. Embeddings only, no completions.
  // Hard cap: $3/day to prevent runaway costs.
  "openai": {
    requestsPerMinute: 10,
    requestsPerHour: 200,
    dailyBudgetCents: 300,        // $3/day hard cap — embeddings only
    dailyBudgetWarningPct: 0.5,   // warn at 50% ($1.50)
    maxConcurrent: 2,
    retryAfterMs: 5000,
    maxRetries: 1,
  },
};

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
  halfOpenAttempts: number;
}

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,        // open after N consecutive failures
  resetTimeoutMs: 60_000,     // try half-open after 60s
  halfOpenMaxAttempts: 2,     // allow 2 test requests in half-open
  maxOpenTimeMs: 300_000,     // force half-open after 5 min max
};

const circuitBreakers = new Map<string, CircuitBreakerState>();

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

function recordSuccess(provider: string): void {
  const cb = getCircuitBreaker(provider);
  const wasOpen = cb.state !== "closed";
  cb.state = "closed";
  cb.failures = 0;
  cb.halfOpenAttempts = 0;
  circuitBreakerState.set({ provider }, 0);
  if (wasOpen) {
    persistState();
    queueSyncDelta(provider, {}, true); // circuit closed — cross-runtime signal
  }
}

function recordFailure(provider: string, isRateLimit: boolean, isAuthExpired: boolean = false): void {
  const cb = getCircuitBreaker(provider);
  cb.failures++;
  cb.lastFailureAt = Date.now();

  if (isAuthExpired) {
    cb.state = "open";
    cb.openedAt = Date.now();
    circuitBreakerState.set({ provider }, 2);
    // Auth-expired circuits stay open longer — no point retrying until token is refreshed
    log.error({ provider }, "Circuit OPEN — AUTH EXPIRED (401/403). All requests blocked until token refresh.");
    persistState();
    queueSyncDelta(provider, {}, true); // circuit open — flush immediately
    return;
  }

  if (isRateLimit || cb.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    cb.state = "open";
    cb.openedAt = Date.now();
    circuitBreakerState.set({ provider }, 2);
    log.warn({ provider, failures: cb.failures, isRateLimit }, "Circuit OPEN");
    persistState();
    queueSyncDelta(provider, {}, true); // circuit open — flush immediately
  }
}

function canAttempt(provider: string): { allowed: boolean; reason?: string } {
  const cb = getCircuitBreaker(provider);
  const now = Date.now();

  if (cb.state === "closed") return { allowed: true };

  if (cb.state === "open") {
    const elapsed = now - cb.openedAt;
    if (elapsed >= CIRCUIT_BREAKER_CONFIG.maxOpenTimeMs || elapsed >= CIRCUIT_BREAKER_CONFIG.resetTimeoutMs) {
      cb.state = "half-open";
      cb.halfOpenAttempts = 0;
      circuitBreakerState.set({ provider }, 1);
      return { allowed: true };
    }
    return { allowed: false, reason: `Circuit open for ${provider} — retry in ${Math.ceil((CIRCUIT_BREAKER_CONFIG.resetTimeoutMs - elapsed) / 1000)}s` };
  }

  // half-open
  if (cb.halfOpenAttempts < CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts) {
    cb.halfOpenAttempts++;
    return { allowed: true };
  }
  return { allowed: false, reason: `Circuit half-open for ${provider} — max test attempts reached` };
}

// ═══════════════════════════════════════════════════════════════════
// TOKEN BUCKET RATE LIMITER
// ═══════════════════════════════════════════════════════════════════

interface TokenBucket {
  tokens: number;
  maxTokens: number;
  refillRate: number;     // tokens per ms
  lastRefill: number;
}

const minuteBuckets = new Map<string, TokenBucket>();
const hourBuckets = new Map<string, TokenBucket>();

function getBucket(map: Map<string, TokenBucket>, provider: string, max: number, windowMs: number): TokenBucket {
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
  if (!limits) return { allowed: true }; // unknown provider = no limit

  const minBucket = getBucket(minuteBuckets, provider, limits.requestsPerMinute, 60_000);
  const hrBucket = getBucket(hourBuckets, provider, limits.requestsPerHour, 3_600_000);

  refillBucket(minBucket);
  refillBucket(hrBucket);

  if (minBucket.tokens < 1) {
    const waitMs = Math.ceil((1 - minBucket.tokens) / minBucket.refillRate);
    return { allowed: false, retryAfterMs: waitMs };
  }
  if (hrBucket.tokens < 1) {
    const waitMs = Math.ceil((1 - hrBucket.tokens) / hrBucket.refillRate);
    return { allowed: false, retryAfterMs: waitMs };
  }

  minBucket.tokens -= 1;
  hrBucket.tokens -= 1;
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════
// CONCURRENCY SEMAPHORE
// ═══════════════════════════════════════════════════════════════════

const activeCounts = new Map<string, number>();

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
  const newCount = Math.max(0, current - 1);
  activeCounts.set(provider, newCount);
  concurrencyActive.set({ provider }, newCount);
}

// ═══════════════════════════════════════════════════════════════════
// DAILY BUDGET TRACKER
// ═══════════════════════════════════════════════════════════════════

interface DailyBudget {
  day: string;         // YYYY-MM-DD
  spentCents: number;
  requestCount: number;
  warningEmitted: boolean;
}

const budgets = new Map<string, DailyBudget>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getBudget(provider: string): DailyBudget {
  const key = `${provider}:${todayKey()}`;
  if (!budgets.has(key)) {
    budgets.set(key, { day: todayKey(), spentCents: 0, requestCount: 0, warningEmitted: false });
  }
  return budgets.get(key)!;
}

function checkBudget(provider: string): { allowed: boolean; reason?: string } {
  const limits = PROVIDER_LIMITS[provider];
  if (!limits || limits.dailyBudgetCents <= 0) return { allowed: true };

  const budget = getBudget(provider);
  if (budget.spentCents >= limits.dailyBudgetCents) {
    return { allowed: false, reason: `Daily budget exhausted for ${provider}: $${(budget.spentCents / 100).toFixed(2)} / $${(limits.dailyBudgetCents / 100).toFixed(2)}` };
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
      log.warn({ provider, pct: +(pct * 100).toFixed(1), spent: budget.spentCents, ceiling: limits.dailyBudgetCents }, "BUDGET WARNING");
    }
  }

  persistState();
  queueSyncDelta(provider, { spentCents: costCents, requests: 1 });
}

// ═══════════════════════════════════════════════════════════════════
// PRIORITY QUEUE CLASS
// ═══════════════════════════════════════════════════════════════════

export type QueueClass = "P0" | "P1" | "P2" | "P3";

const PRIORITY_WEIGHTS: Record<QueueClass, number> = {
  P0: 0,   // runtime — immediate, skip queue if possible
  P1: 1,   // revenue — high priority
  P2: 2,   // growth  — normal
  P3: 3,   // batch   — can be deferred
};

// P3 requests get extra backoff when load is high
function priorityBackoffMultiplier(queueClass: QueueClass, activeLoad: number, maxLoad: number): number {
  const loadRatio = activeLoad / maxLoad;
  if (loadRatio < 0.5) return 1;  // under 50% — no penalty
  const weight = PRIORITY_WEIGHTS[queueClass];
  return 1 + weight * loadRatio;  // P3 at 90% load → 3.7x backoff
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API: guarded request execution
// ═══════════════════════════════════════════════════════════════════

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

/**
 * Check whether a request is allowed under all rate/budget/circuit constraints.
 * Call this BEFORE making any external API call.
 */
export function checkRequest(opts: GuardedRequestOptions): GuardResult {
  const { provider, queueClass = "P2" } = opts;

  // 1. Circuit breaker
  const circuit = canAttempt(provider);
  if (!circuit.allowed) {
    return { allowed: false, reason: circuit.reason, retryAfterMs: CIRCUIT_BREAKER_CONFIG.resetTimeoutMs };
  }

  // 2. Daily budget
  const budget = checkBudget(provider);
  if (!budget.allowed) {
    return { allowed: false, reason: budget.reason };
  }

  // 3. Token bucket rate limit
  const rateResult = tryConsume(provider);
  if (!rateResult.allowed) {
    const limits = PROVIDER_LIMITS[provider];
    const activeLoad = activeCounts.get(provider) || 0;
    const maxLoad = limits?.maxConcurrent || 10;
    const multiplier = priorityBackoffMultiplier(queueClass, activeLoad, maxLoad);
    const backoff = Math.ceil((rateResult.retryAfterMs || 2000) * multiplier);
    return { allowed: false, reason: `Rate limited for ${provider}`, retryAfterMs: backoff };
  }

  // 4. Concurrency semaphore
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

/**
 * Call after a successful API response.
 */
export function reportSuccess(provider: string, costCents: number = 0): void {
  releaseConcurrency(provider);
  recordSuccess(provider);
  if (costCents > 0) trackSpend(provider, costCents);
}

/**
 * Call after a failed API response.
 * Detects 401/403 as auth-expired and opens a long-lived circuit.
 */
export function reportFailure(provider: string, statusCode?: number): void {
  releaseConcurrency(provider);
  const isRateLimit = statusCode === 429;
  const isAuthExpired = statusCode === 401 || statusCode === 403;
  recordFailure(provider, isRateLimit, isAuthExpired);
}

/**
 * Execute a function with full rate governance protection.
 * Handles acquire/release, retry with backoff, and circuit breaking.
 */
export async function withGovernor<T>(
  opts: GuardedRequestOptions,
  fn: () => Promise<T>
): Promise<T> {
  const { provider, queueClass: _queueClass = "P2" } = opts;
  const limits = PROVIDER_LIMITS[provider];
  const maxRetries = limits?.maxRetries ?? 3;
  const baseBackoff = limits?.retryAfterMs ?? 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const guard = checkRequest(opts);
    if (!guard.allowed) {
      if (attempt === maxRetries) {
        throw new Error(`[RateGovernor] Request blocked after ${maxRetries} retries: ${guard.reason}`);
      }
      const jitter = Math.random() * 1000;
      const delay = (guard.retryAfterMs || baseBackoff) * Math.pow(2, attempt) + jitter;
      log.warn({ provider, attempt: attempt + 1, maxAttempts: maxRetries + 1, reason: guard.reason, delayMs: Math.ceil(delay) }, "Request blocked, waiting");
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

      // Auth-expired: open circuit immediately, no retry
      if (statusCode === 401 || statusCode === 403) {
        log.error({ provider, statusCode }, "Auth expired, circuit opened");
        throw error;
      }

      // Other non-retryable 4xx errors (except 429 rate limit)
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw error;
      }

      if (attempt === maxRetries) throw error;

      const jitter = Math.random() * 1000;
      const delay = baseBackoff * Math.pow(2, attempt) + jitter;
      log.warn({ provider, attempt: attempt + 1, maxAttempts: maxRetries + 1, statusCode, delayMs: Math.ceil(delay) }, "Request failed, retrying");
      await sleep(delay);
    }
  }

  throw new Error(`[RateGovernor] Exhausted retries for ${provider}`);
}

// ═══════════════════════════════════════════════════════════════════
// TELEMETRY & STATUS
// ═══════════════════════════════════════════════════════════════════

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
    requestsPerMinute: 0, requestsPerHour: 0,
    dailyBudgetCents: 0, maxConcurrent: 0,
    dailyBudgetWarningPct: 1, retryAfterMs: 2000, maxRetries: 3,
  };

  const cb = getCircuitBreaker(provider);
  const minBucket = minuteBuckets.get(provider);
  const hrBucket = hourBuckets.get(provider);
  const budget = getBudget(provider);

  if (minBucket) refillBucket(minBucket);
  if (hrBucket) refillBucket(hrBucket);

  return {
    provider,
    circuitState: cb.state,
    consecutiveFailures: cb.failures,
    activeConcurrency: activeCounts.get(provider) || 0,
    maxConcurrency: limits.maxConcurrent,
    minuteTokensRemaining: Math.floor(minBucket?.tokens ?? limits.requestsPerMinute),
    hourTokensRemaining: Math.floor(hrBucket?.tokens ?? limits.requestsPerHour),
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
  pendingSyncDeltas.clear();
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  if (options.deleteStateFile) {
    try {
      fs.rmSync(STATE_FILE, { force: true });
    } catch {
      // Best-effort cleanup for test isolation.
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;
    if (e.response && typeof e.response === "object") {
      const r = e.response as Record<string, unknown>;
      if (typeof r.status === "number") return r.status;
    }
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════
// GHL TOKEN STALENESS FLAG
// ═══════════════════════════════════════════════════════════════════

const ghlTokenStale = new Map<string, boolean>();

/**
 * Mark a GHL tenant token as stale (or clear the stale flag).
 * Used by ghl-oauth-manager auto-refresh to signal that GHL API calls
 * should be held until the token is refreshed.
 */
export function setGhlTokenStale(tenant: string, stale: boolean): void {
  if (stale) {
    ghlTokenStale.set(tenant, true);
  } else {
    ghlTokenStale.delete(tenant);
  }
}

/**
 * Returns true if the GHL token for the given tenant is currently stale.
 */
export function isGhlTokenStale(tenant: string): boolean {
  return ghlTokenStale.get(tenant) === true;
}

// ═══════════════════════════════════════════════════════════════════
// SUPABASE CROSS-RUNTIME SYNC
// ═══════════════════════════════════════════════════════════════════
// Deltas accumulate in-process and flush on a debounce timer (or immediately
// on circuit transitions — the one signal other runtimes need promptly).
// Everything here is fire-and-forget: a Supabase outage must never slow or
// fail a governed request; the local JSON file remains the always-on record.

const SYNC_DEBOUNCE_MS = 5_000;
const pendingSyncDeltas = new Map<string, GovernorStateDelta>();
let syncTimer: NodeJS.Timeout | null = null;

function queueSyncDelta(
  provider: string,
  changes: { spentCents?: number; requests?: number } = {},
  immediate = false,
): void {
  if (!supabaseSyncEnabled()) return;
  const day = todayKey();
  const key = `${provider}:${day}`;
  const cb = getCircuitBreaker(provider);
  const budget = getBudget(provider);
  const delta = pendingSyncDeltas.get(key) ?? {
    provider,
    day,
    spentCentsDelta: 0,
    requestCountDelta: 0,
    warningEmitted: false,
    circuitState: cb.state,
    failures: cb.failures,
    lastFailureAt: cb.lastFailureAt,
    openedAt: cb.openedAt,
  };
  delta.spentCentsDelta += changes.spentCents ?? 0;
  delta.requestCountDelta += changes.requests ?? 0;
  delta.warningEmitted = budget.warningEmitted;
  delta.circuitState = cb.state;
  delta.failures = cb.failures;
  delta.lastFailureAt = cb.lastFailureAt;
  delta.openedAt = cb.openedAt;
  pendingSyncDeltas.set(key, delta);

  if (immediate) {
    flushSyncDeltas();
    return;
  }
  if (!syncTimer) {
    syncTimer = setTimeout(flushSyncDeltas, SYNC_DEBOUNCE_MS);
    // Never hold a short-lived script's process open for telemetry.
    syncTimer.unref?.();
  }
}

function flushSyncDeltas(): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (pendingSyncDeltas.size === 0) return;
  const batch = [...pendingSyncDeltas.values()];
  pendingSyncDeltas.clear();
  void pushDeltas(batch).catch(() => {
    /* adapter logs internally; never propagate */
  });
}

export function __flushSyncForTests(): void {
  flushSyncDeltas();
}

/**
 * Merge today's global (all-runtime) spend into local budgets so ceilings
 * govern total spend, not per-machine spend. Max() semantics: a restart can
 * never move the day's accounting downward. Circuit state is deliberately
 * NOT imported from other runtimes — a remote runtime's failures should not
 * block this one; a genuinely down provider trips the local breaker fast.
 */
async function hydrateFromSupabase(): Promise<void> {
  if (!supabaseSyncEnabled()) return;
  try {
    const remote = await pullToday();
    if (remote.size === 0) return;
    const today = todayKey();
    for (const [provider, global] of remote) {
      const key = `${provider}:${today}`;
      const local = budgets.get(key) ?? {
        day: today,
        spentCents: 0,
        requestCount: 0,
        warningEmitted: false,
      };
      local.spentCents = Math.max(local.spentCents, global.spentCents);
      local.requestCount = Math.max(local.requestCount, global.requestCount);
      budgets.set(key, local);
      budgetUsedDollars.set({ provider }, local.spentCents / 100);
    }
    log.info({ providers: remote.size }, "Rate governor merged global daily spend from Supabase");
  } catch (err) {
    log.warn({ err }, "Rate governor Supabase hydrate failed — continuing with local state");
  }
}

// Short-lived scripts: flush pending deltas when the event loop drains.
process.once("beforeExit", flushSyncDeltas);

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION — rehydrate persisted state on module load
// ═══════════════════════════════════════════════════════════════════

loadState();
void hydrateFromSupabase();
