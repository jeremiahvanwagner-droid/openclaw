import { supabase } from '../../lib/agent-memory.js';

const LOG_TABLE = 'retry_execution_logs';

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

function isRetryable(error) {
  const code = error?.status ?? error?.statusCode ?? error?.code;
  if (NON_RETRYABLE_STATUS_CODES.has(code)) return false;
  if (RETRYABLE_STATUS_CODES.has(code)) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|network timeout/i.test(error?.message ?? '')) return true;
  return false;
}

function calcDelay(attempt, baseDelayMs = 500, jitterMs = 200) {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * jitterMs;
  return Math.min(exponential + jitter, 30000);
}

function parseRetryAfter(error) {
  const retryAfterHeader = error?.headers?.['retry-after'] ?? error?.retryAfter;
  if (retryAfterHeader) return parseInt(retryAfterHeader) * 1000;
  return null;
}

export async function withRetry(operationName, operation, options = {}) {
  const { maxRetries = 5, baseDelayMs = 500, circuitBreakerThreshold = 5 } = options;
  const attempts = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const startTs = Date.now();
    try {
      const result = await operation();
      const log = { operation: operationName, attempts: attempt, final_status: 'success', total_ms: Date.now() - startTs, created_at: new Date().toISOString() };
      await supabase.from(LOG_TABLE).insert(log);
      return { success: true, result, attempts: attempt, delays: attempts };
    } catch (err) {
      lastError = err;
      const retryable = isRetryable(err);
      attempts.push({ attempt, error: err.message ?? String(err), status: err?.status ?? null, retryable });
      if (!retryable || attempt > maxRetries) break;
      const retryAfterMs = parseRetryAfter(err);
      const delay = retryAfterMs ?? calcDelay(attempt, baseDelayMs);
      attempts[attempts.length - 1].delay_ms = Math.round(delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  const log = { operation: operationName, attempts: attempts.length, final_status: 'failed', error_class: isRetryable(lastError) ? 'transient' : 'permanent', total_ms: attempts.reduce((s, a) => s + (a.delay_ms ?? 0), 0), created_at: new Date().toISOString() };
  await supabase.from(LOG_TABLE).insert(log);
  return { success: false, error: lastError?.message ?? String(lastError), attempts: attempts.length, error_class: log.error_class, attempt_log: attempts };
}

export async function getRetryReport(operationName, limit = 50) {
  const { data } = await supabase.from(LOG_TABLE).select('*').eq('operation', operationName).order('created_at', { ascending: false }).limit(limit);
  const rows = data ?? [];
  return { operation: operationName, total: rows.length, success_rate: rows.length > 0 ? Math.round(rows.filter(r => r.final_status === 'success').length / rows.length * 100) : 0, avg_attempts: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (r.attempts ?? 1), 0) / rows.length * 10) / 10 : 0, generated_at: new Date().toISOString() };
}
