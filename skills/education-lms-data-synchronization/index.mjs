import { supabase } from '../../lib/agent-memory.js';

const SYNC_TABLE      = 'education_lms_sync_log';
const CHECKPOINT_TABLE = 'education_sync_checkpoints';

export async function defineSchemas(sourceSchema, destSchema) {
  return { source: sourceSchema, destination: destSchema, field_map: Object.fromEntries(Object.keys(sourceSchema).map(k => [k, destSchema[k] ?? k])) };
}

export async function pullIncrementalUpdates(source, lastCursor) {
  const { data, error } = await supabase.from(source).select('*').gt('updated_at', lastCursor ?? '1970-01-01').order('updated_at').limit(500);
  const newCursor = (data ?? []).length > 0 ? (data ?? []).slice(-1)[0].updated_at : lastCursor;
  return { records: data ?? [], new_cursor: newCursor, count: (data ?? []).length };
}

export function normalizeRecords(records, fieldMap) {
  return records.map(r => {
    const normalized = {};
    for (const [src, dest] of Object.entries(fieldMap)) normalized[dest] = r[src];
    normalized.sync_key = r.id ?? r.learner_id ?? `auto_${Date.now()}`;
    return normalized;
  });
}

export async function upsertRecords(table, normalized) {
  const results = { inserted: 0, updated: 0, rejected: 0 };
  const chunks = [];
  for (let i = 0; i < normalized.length; i += 100) chunks.push(normalized.slice(i, i + 100));
  for (const chunk of chunks) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'sync_key' });
    if (error) results.rejected += chunk.length;
    else results.inserted += chunk.length;
  }
  return results;
}

export async function logMismatches(syncId, mismatches) {
  if (mismatches.length) await supabase.from(SYNC_TABLE).insert(mismatches.map(m => ({ sync_id: syncId, ...m, logged_at: new Date().toISOString() })));
  return { logged: mismatches.length };
}

export async function retryFailures(failedRecords, table, maxRetries = 3) {
  const retried = [];
  for (const record of failedRecords) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { error } = await supabase.from(table).upsert(record, { onConflict: 'sync_key' });
      if (!error) { retried.push(record.sync_key); break; }
      await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return { retried_count: retried.length, failed_count: failedRecords.length - retried.length };
}

export async function saveCheckpoint(syncId, cursor) {
  await supabase.from(CHECKPOINT_TABLE).upsert({ sync_id: syncId, cursor, updated_at: new Date().toISOString() }, { onConflict: 'sync_id' });
  return { sync_id: syncId, cursor };
}

export async function outputSyncHealthReport(syncId) {
  const { data: log } = await supabase.from(SYNC_TABLE).select('*').eq('sync_id', syncId);
  const { data: cp } = await supabase.from(CHECKPOINT_TABLE).select('cursor').eq('sync_id', syncId).single();
  return { sync_id: syncId, mismatches: (log ?? []).length, last_cursor: cp?.cursor, generated_at: new Date().toISOString() };
}
