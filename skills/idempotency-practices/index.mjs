import { supabase } from '../../lib/agent-memory.js';

const LEDGER_TABLE = 'idempotency_ledger';

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(33, h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function generateIdempotencyKey(resource, entityId, intent) {
  const intentHash = hashString(JSON.stringify(intent));
  return `op:${resource}:${entityId}:${intentHash}`;
}

export async function checkExistingOperation(idempotencyKey) {
  const { data } = await supabase.from(LEDGER_TABLE).select('*').eq('key', idempotencyKey).single();
  return { exists: !!data, existing_result: data ?? null, status: data?.status ?? null };
}

export async function recordOperation(idempotencyKey, resource, entityId, status = 'started') {
  await supabase.from(LEDGER_TABLE).upsert({ key: idempotencyKey, resource, entity_id: entityId, status, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return { key: idempotencyKey, status };
}

export async function executeIdempotently(idempotencyKey, resource, entityId, operation) {
  const existing = await checkExistingOperation(idempotencyKey);
  if (existing.exists && existing.status === 'completed') return { skipped: true, reason: 'already_completed', result: existing.existing_result };
  await recordOperation(idempotencyKey, resource, entityId, 'in_progress');
  try {
    const result = await operation();
    await supabase.from(LEDGER_TABLE).update({ status: 'completed', result: JSON.stringify(result), updated_at: new Date().toISOString() }).eq('key', idempotencyKey);
    return { skipped: false, result };
  } catch (err) {
    await supabase.from(LEDGER_TABLE).update({ status: 'failed', error: err.message, updated_at: new Date().toISOString() }).eq('key', idempotencyKey);
    throw err;
  }
}

export async function runReplayTest(resource, entityId, intent, operation) {
  const key = generateIdempotencyKey(resource, entityId, intent);
  const first = await executeIdempotently(key, resource, entityId, operation);
  const second = await executeIdempotently(key, resource, entityId, operation);
  return { key, first_run: { skipped: first.skipped }, second_run: { skipped: second.skipped, idempotent: second.skipped === true }, no_duplicates: second.skipped === true };
}

export async function outputIdempotencyAudit(resource) {
  const { data } = await supabase.from(LEDGER_TABLE).select('key, status, entity_id').eq('resource', resource).order('created_at', { ascending: false }).limit(100);
  const rows = data ?? [];
  return { resource, total_operations: rows.length, completed: rows.filter(r => r.status === 'completed').length, failed: rows.filter(r => r.status === 'failed').length, in_progress: rows.filter(r => r.status === 'in_progress').length, key_strategy: `op:{resource}:{entityId}:{intentHash}`, generated_at: new Date().toISOString() };
}
