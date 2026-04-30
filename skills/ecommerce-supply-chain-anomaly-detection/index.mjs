import { supabase } from '../../lib/agent-memory.js';

const EVENT_TABLE    = 'supply_chain_events';
const INCIDENT_TABLE = 'supply_chain_incidents';

const ANOMALY_RULES = [
  { type: 'transit_delay',      severity: 'high',     test: (e) => (e.actual_transit_days ?? 0) > (e.expected_transit_days ?? 0) * 1.5 },
  { type: 'supplier_late',      severity: 'high',     test: (e) => e.status === 'supplier_delayed' && (e.days_late ?? 0) > 2 },
  { type: 'warehouse_backlog',  severity: 'medium',   test: (e) => e.warehouse_queue_hours > 48 },
  { type: 'carrier_disruption', severity: 'critical', test: (e) => e.carrier_status === 'service_disruption' },
  { type: 'missing_shipment',   severity: 'critical', test: (e) => e.days_since_last_scan > 5 },
];

export async function monitorEvents(events) {
  const rows = events.map(e => ({ ...e, monitored_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(EVENT_TABLE).insert(rows);
  return { events_monitored: rows.length };
}

export function detectAnomalies(events) {
  const anomalies = [];
  for (const event of events) {
    for (const rule of ANOMALY_RULES) {
      if (rule.test(event)) anomalies.push({ event_id: event.id, type: rule.type, severity: rule.severity, entity: event.shipment_id ?? event.order_id });
    }
  }
  return anomalies;
}

export function classifyDisruption(anomaly) {
  const mitigationMap = {
    transit_delay:      { action: 'notify_customer_proactively', note: 'Update delivery estimate' },
    supplier_late:      { action: 'check_alternate_supplier', note: 'Request ETA from vendor' },
    warehouse_backlog:  { action: 'redistribute_to_secondary_warehouse', note: 'Check capacity at alt location' },
    carrier_disruption: { action: 'reroute_shipments', note: 'Switch carrier for pending orders in affected zone' },
    missing_shipment:   { action: 'open_carrier_trace', note: 'File trace request; prepare replacement shipment' },
  };
  return { ...anomaly, mitigation: mitigationMap[anomaly.type] ?? { action: 'manual_review' } };
}

export async function triggerMitigation(anomalyId, mitigation) {
  await supabase.from(INCIDENT_TABLE).insert({ anomaly_id: anomalyId, action: mitigation.action, status: 'triggered', triggered_at: new Date().toISOString() });
  return { anomaly_id: anomalyId, action_triggered: mitigation.action };
}

export async function notifyStakeholders(anomaly, threshold = 'high') {
  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const shouldNotify = severityOrder.indexOf(anomaly.severity) <= severityOrder.indexOf(threshold);
  if (shouldNotify) await supabase.from(INCIDENT_TABLE).update({ stakeholder_notified: true, notified_at: new Date().toISOString() }).eq('anomaly_id', anomaly.id);
  return { notified: shouldNotify };
}

export async function trackResolution(incidentId, resolved) {
  await supabase.from(INCIDENT_TABLE).update({ resolved, resolved_at: new Date().toISOString() }).eq('id', incidentId);
  return { incident_id: incidentId, resolved };
}

export async function outputDisruptionReport() {
  const { data } = await supabase.from(INCIDENT_TABLE).select('action, resolved, triggered_at').order('triggered_at', { ascending: false }).limit(50);
  const rows = data ?? [];
  const openIncidents = rows.filter(r => !r.resolved);
  return { total_incidents: rows.length, open: openIncidents.length, resolved: rows.length - openIncidents.length, preventive_recommendations: ['Diversify carrier contracts', 'Add secondary supplier for top-10 SKUs', 'Set safety stock buffers for high-velocity items'], generated_at: new Date().toISOString() };
}
