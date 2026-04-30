/**
 * API Rate Limit Handling — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const THROTTLE_TABLE = 'aisaas_throttle_telemetry';
const QUEUE_TABLE    = 'aisaas_request_queue';
const CIRCUIT_TABLE  = 'aisaas_circuit_breakers';

const RETRY_AFTER_HEADER = 'retry-after';
const RATE_LIMIT_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Detect rate-limit headers, status codes, and quota windows.
 */
export function detectRateLimit(response) {
  const status = response.status ?? response.statusCode ?? 0;
  const headers = response.headers ?? {};
  const isRateLimited = RATE_LIMIT_STATUSES.has(status);
  const retryAfterSec = headers[RETRY_AFTER_HEADER] ? parseInt(headers[RETRY_AFTER_HEADER]) : null;
  const quotaWindowReset = headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset']) : null;
  return { is_rate_limited: isRateLimited, status, retry_after_sec: retryAfterSec, quota_reset: quotaWindowReset };
}

/**
 * Queue and prioritize requests by criticality.
 */
export async function queueRequests(requests) {
  const sorted = [...requests].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const rows = sorted.map((r, i) => ({ ...r, queue_position: i + 1, queued_at: new Date().toISOString(), status: 'queued' }));
  if (rows.length) await supabase.from(QUEUE_TABLE).insert(rows);
  return { queued: rows.length, queue: rows };
}

/**
 * Apply exponential backoff with jitter for retries.
 */
export function calculateBackoffMs(attempt, baseMs = 500, maxMs = 30000) {
  const exp = Math.pow(2, attempt) * baseMs;
  const jitter = Math.random() * baseMs;
  return Math.min(exp + jitter, maxMs);
}

/**
 * Honor Retry-After and provider-specific constraints.
 */
export function getRetryDelay(rateLimitInfo, attempt) {
  if (rateLimitInfo.retry_after_sec) return rateLimitInfo.retry_after_sec * 1000;
  if (rateLimitInfo.quota_reset) return Math.max(0, rateLimitInfo.quota_reset * 1000 - Date.now());
  return calculateBackoffMs(attempt);
}

/**
 * Open circuit breakers on persistent throttle/failure states.
 */
export async function manageCircuitBreaker(provider, failureCount, threshold = 5) {
  const state = failureCount >= threshold ? 'open' : failureCount >= threshold / 2 ? 'half_open' : 'closed';
  await supabase.from(CIRCUIT_TABLE).upsert({ provider, state, failure_count: failureCount, updated_at: new Date().toISOString() }, { onConflict: 'provider' });
  return { provider, state, failure_count: failureCount };
}

/**
 * Degrade gracefully with fallback responses.
 */
export function buildFallbackResponse(request, circuitState) {
  return {
    request_id: request.id,
    status: 'degraded',
    fallback: true,
    reason: circuitState === 'open' ? 'circuit_open' : 'rate_limited',
    cached_result: request.last_cached_result ?? null,
  };
}

/**
 * Output throttle telemetry and retry effectiveness metrics.
 */
export async function outputThrottleTelemetry(provider) {
  const { data } = await supabase.from(THROTTLE_TABLE).select('*').eq('provider', provider).order('recorded_at', { ascending: false }).limit(100);
  return { provider, events: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
