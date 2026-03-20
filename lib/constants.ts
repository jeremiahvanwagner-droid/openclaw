/**
 * Shared Constants
 * OpenClaw Multi-Agent Network
 *
 * Single source of truth for all tunable thresholds, timeouts,
 * retry counts, and budget ceilings used across the codebase.
 */

// ═══════════════════════════════════════════════════════════════════
// TIMEOUTS (milliseconds)
// ═══════════════════════════════════════════════════════════════════

/** Default timeout for external HTTP fetch calls */
export const FETCH_TIMEOUT_MS = 30_000;

/** Timeout for webhook delivery attempts */
export const WEBHOOK_TIMEOUT_MS = 60_000;

/** Stale threshold for supervisor heartbeats */
export const SUPERVISOR_STALE_MS = 30 * 60 * 1000; // 30 minutes

/** Stale threshold for worker heartbeats */
export const WORKER_STALE_MS = 60 * 60 * 1000; // 60 minutes

// ═══════════════════════════════════════════════════════════════════
// RETRY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

/** Max retries for escalation chains */
export const ESCALATION_MAX_RETRIES = 3;

/** Webhook retry configuration */
export const WEBHOOK_RETRY = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 16_000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504] as readonly number[],
} as const;

/** GHL API rate limit spacing (ms between calls) */
export const GHL_MIN_CALL_SPACING_MS = 3000;

/** GHL API max retries on 429 */
export const GHL_MAX_RETRIES = 2;

// ═══════════════════════════════════════════════════════════════════
// RATE LIMITS (per provider) — mirrored from api-rate-governor.ts
// ═══════════════════════════════════════════════════════════════════

export const RATE_LIMITS = {
  "openai-codex": { requestsPerMinute: 40, requestsPerHour: 800 },
  anthropic: { requestsPerMinute: 30, requestsPerHour: 600 },
  openai: { requestsPerMinute: 50, requestsPerHour: 1000 },
  ghl: { requestsPerMinute: 20, requestsPerHour: 400 },
  supabase: { requestsPerMinute: 200, requestsPerHour: 5000 },
  telegram: { requestsPerMinute: 25, requestsPerHour: 1000 },
} as const;

// ═══════════════════════════════════════════════════════════════════
// BUDGET CEILINGS (cents per day)
// ═══════════════════════════════════════════════════════════════════

export const DAILY_BUDGETS = {
  "openai-codex": 5000, // $50/day
  anthropic: 4000, // $40/day
  openai: 3000, // $30/day
} as const;

/** Budget warning threshold (fraction, e.g. 0.75 = 75%) */
export const BUDGET_WARNING_PCT = 0.75;

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════

export const CIRCUIT_BREAKER = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 2,
  maxOpenTimeMs: 300_000,
} as const;

// ═══════════════════════════════════════════════════════════════════
// DEAD LETTER QUEUE
// ═══════════════════════════════════════════════════════════════════

/** Alert when DLQ entry count exceeds this */
export const DLQ_ALERT_THRESHOLD = 10;

/** Maximum DLQ file size before rotation (bytes) */
export const DLQ_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/** Maximum number of rotated DLQ files to keep */
export const DLQ_MAX_ROTATED_FILES = 3;

// ═══════════════════════════════════════════════════════════════════
// MEMORY
// ═══════════════════════════════════════════════════════════════════

/** Default number of results for semantic memory queries */
export const MEMORY_DEFAULT_TOP_K = 5;

/** Default minimum similarity threshold for memory queries */
export const MEMORY_MIN_SIMILARITY = 0.7;

/** Batch size for concurrent memory store operations */
export const MEMORY_BATCH_SIZE = 5;

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════

/** Maximum allowed request body size */
export const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

/** Default webhook server port */
export const WEBHOOK_PORT = 8788;

// ═══════════════════════════════════════════════════════════════════
// PAYMENT THRESHOLDS
// ═══════════════════════════════════════════════════════════════════

/** Alert director when payment failure exceeds this amount ($) */
export const PAYMENT_ALERT_THRESHOLD = 500;

/** Alert director when retry count reaches this number */
export const PAYMENT_RETRY_ALERT_THRESHOLD = 3;

// ═══════════════════════════════════════════════════════════════════
// CREDENTIAL HEALTH
// ═══════════════════════════════════════════════════════════════════

/** Days before credential expiry to trigger warning */
export const CREDENTIAL_EXPIRY_WARNING_DAYS = 14;
