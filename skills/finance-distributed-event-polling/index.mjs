import { supabase } from '../../lib/agent-memory.js';

const ENDPOINT_TABLE   = 'finance_polling_endpoints';
const EVENT_TABLE      = 'finance_polled_events';
const CHECKPOINT_TABLE = 'finance_poll_checkpoints';

export async function registerEndpoints(endpoints) {
  const rows = endpoints.map(e => ({ endpoint_id: e.id, url: e.url, cadence_seconds: e.cadence_seconds ?? 30, priority: e.priority ?? 'normal', active: true, registered_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(ENDPOINT_TABLE).upsert(rows, { onConflict: 'endpoint_id' });
  return { registered: rows.length };
}

export async function pollEndpoint(endpointId, lastCursor) {
  const { data: checkpoint } = await supabase.from(CHECKPOINT_TABLE).select('cursor').eq('endpoint_id', endpointId).single();
  const cursor = lastCursor ?? checkpoint?.cursor ?? '0';
  return { endpoint_id: endpointId, events: [], new_cursor: String(Date.now()), cursor_used: cursor };
}

export function normalizeTimestamps(events) {
  const now = Date.now();
  return events.map(e => {
    const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp ?? now).getTime();
    const skewMs = now - ts;
    return { ...e, normalized_timestamp: ts, clock_skew_ms: skewMs, adjusted: Math.abs(skewMs) > 5000 };
  });
}

export function deduplicateEvents(events, seen = new Set()) {
  const deduped = [];
  for (const e of events) {
    const key = e.event_id ?? `${e.endpoint_id}_${e.normalized_timestamp}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(e); }
  }
  return deduped;
}

export async function detectStaleFeeds(endpointIds, maxStalenessSeconds = 60) {
  const { data } = await supabase.from(CHECKPOINT_TABLE).select('endpoint_id, updated_at').in('endpoint_id', endpointIds);
  const stale = (data ?? []).filter(c => (Date.now() - new Date(c.updated_at).getTime()) / 1000 > maxStalenessSeconds);
  return { stale_endpoints: stale.map(s => s.endpoint_id), stale_count: stale.length };
}

export async function publishToEventBus(events) {
  const rows = events.map(e => ({ ...e, published_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(EVENT_TABLE).insert(rows);
  return { published: rows.length };
}

export async function saveCheckpoint(endpointId, cursor) {
  await supabase.from(CHECKPOINT_TABLE).upsert({ endpoint_id: endpointId, cursor, updated_at: new Date().toISOString() }, { onConflict: 'endpoint_id' });
  return { endpoint_id: endpointId, cursor };
}

export async function outputFeedHealth() {
  const { data: endpoints } = await supabase.from(ENDPOINT_TABLE).select('endpoint_id, cadence_seconds, active');
  const { data: checkpoints } = await supabase.from(CHECKPOINT_TABLE).select('endpoint_id, updated_at');
  const cpMap = (checkpoints ?? []).reduce((acc, c) => { acc[c.endpoint_id] = c.updated_at; return acc; }, {});
  return { endpoints: (endpoints ?? []).map(e => ({ ...e, last_polled: cpMap[e.endpoint_id] ?? null, latency_status: cpMap[e.endpoint_id] && (Date.now() - new Date(cpMap[e.endpoint_id]).getTime()) / 1000 < e.cadence_seconds * 2 ? 'ok' : 'degraded' })), generated_at: new Date().toISOString() };
}
