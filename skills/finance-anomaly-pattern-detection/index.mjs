import { supabase } from '../../lib/agent-memory.js';

const BASELINE_TABLE = 'finance_entity_baselines';
const ANOMALY_TABLE  = 'finance_anomalies';
const INCIDENT_TABLE = 'finance_incidents';

const ANOMALY_RULES = [
  { type: 'velocity_spike',   severity: 'high',     test: (e, b) => (e.tx_count_1h ?? 0) > (b.avg_tx_per_hour ?? 1) * 5 },
  { type: 'amount_outlier',   severity: 'high',     test: (e, b) => (e.amount ?? 0) > (b.avg_amount ?? 100) * 10 },
  { type: 'geo_anomaly',      severity: 'medium',   test: (e, b) => e.country !== b.typical_country && e.country !== undefined },
  { type: 'time_anomaly',     severity: 'low',      test: (e, b) => { const h = new Date(e.timestamp).getUTCHours(); return h < 5 || h > 22; } },
  { type: 'round_number',     severity: 'low',      test: (e) => (e.amount ?? 0) % 1000 === 0 && (e.amount ?? 0) > 5000 },
];

export async function ingestEvents(events) {
  return { events_ingested: events.length, timestamp: new Date().toISOString() };
}

export async function buildBaseline(entityId, historicalData) {
  const amounts = historicalData.map(t => t.amount ?? 0);
  const baseline = { entity_id: entityId, avg_amount: amounts.reduce((s, a) => s + a, 0) / Math.max(amounts.length, 1), avg_tx_per_hour: historicalData.length / 720, typical_country: historicalData[0]?.country ?? 'US', updated_at: new Date().toISOString() };
  await supabase.from(BASELINE_TABLE).upsert(baseline, { onConflict: 'entity_id' });
  return baseline;
}

export async function flagDeviations(entityId, event) {
  const { data: baseline } = await supabase.from(BASELINE_TABLE).select('*').eq('entity_id', entityId).single();
  const b = baseline ?? {};
  const triggered = ANOMALY_RULES.filter(r => r.test(event, b));
  if (triggered.length === 0) return { flagged: false };
  const maxSeverity = triggered.some(r => r.severity === 'high') ? 'high' : triggered.some(r => r.severity === 'medium') ? 'medium' : 'low';
  const confidence = Math.min(0.99, 0.5 + triggered.length * 0.15);
  const anomaly = { entity_id: entityId, event_id: event.id, anomaly_types: triggered.map(r => r.type), severity: maxSeverity, confidence, flagged_at: new Date().toISOString() };
  await supabase.from(ANOMALY_TABLE).insert(anomaly);
  return { flagged: true, ...anomaly };
}

export async function correlateAnomalies(entityId, windowHours = 1) {
  const since = new Date(Date.now() - windowHours * 3600000).toISOString();
  const { data } = await supabase.from(ANOMALY_TABLE).select('anomaly_types, severity').eq('entity_id', entityId).gte('flagged_at', since);
  const isCoordinated = (data ?? []).length >= 3;
  return { entity_id: entityId, anomaly_count: (data ?? []).length, coordinated_attack: isCoordinated };
}

export async function triggerContainment(entityId, severity) {
  const action = severity === 'high' ? 'block_entity' : severity === 'medium' ? 'require_2fa' : 'flag_for_review';
  await supabase.from(INCIDENT_TABLE).insert({ entity_id: entityId, action, status: 'triggered', triggered_at: new Date().toISOString() });
  return { entity_id: entityId, action };
}

export async function escalateCritical(entityId) {
  await supabase.from(INCIDENT_TABLE).update({ escalated: true, escalated_at: new Date().toISOString() }).eq('entity_id', entityId);
  return { escalated: true };
}

export async function outputIncidentTimeline(entityId) {
  const { data } = await supabase.from(INCIDENT_TABLE).select('*').eq('entity_id', entityId).order('triggered_at');
  return { entity_id: entityId, incidents: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
