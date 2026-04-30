/**
 * SLA Monitoring — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SLA_TABLE   = 'agency_sla_definitions';
const METRIC_TABLE = 'agency_sla_metrics';
const ALERT_TABLE  = 'agency_sla_alerts';

export async function loadSlaDefinitions(accountId) {
  const { data } = await supabase.from(SLA_TABLE).select('*').eq('account_id', accountId);
  return { account_id: accountId, slas: data ?? [], count: (data ?? []).length };
}

export async function ingestServiceMetrics(accountId, metrics) {
  const rows = metrics.map(m => ({ account_id: accountId, ...m, ingested_at: new Date().toISOString() }));
  await supabase.from(METRIC_TABLE).insert(rows);
  return { ingested: rows.length };
}

export async function computeSlaHealth(accountId) {
  const { data: slas } = await supabase.from(SLA_TABLE).select('*').eq('account_id', accountId);
  const { data: metrics } = await supabase.from(METRIC_TABLE).select('*').eq('account_id', accountId).order('ingested_at', { ascending: false });
  const health = (slas ?? []).map(sla => {
    const latest = (metrics ?? []).find(m => m.metric_type === sla.metric_type);
    const breached = latest && latest.value > sla.threshold;
    return { sla_id: sla.id, metric: sla.metric_type, threshold: sla.threshold, current: latest?.value, status: breached ? 'at_risk' : 'healthy' };
  });
  return { account_id: accountId, health };
}

export async function detectBreachRisk(accountId) {
  const { health } = await computeSlaHealth(accountId);
  const at_risk = health.filter(h => h.status === 'at_risk');
  return { at_risk, count: at_risk.length };
}

export async function triggerAlerts(accountId, atRiskItems) {
  const alerts = atRiskItems.map(item => ({
    account_id: accountId, sla_id: item.sla_id, metric: item.metric,
    severity: item.current > item.threshold * 1.2 ? 'critical' : 'warning',
    alerted_at: new Date().toISOString(),
  }));
  if (alerts.length) await supabase.from(ALERT_TABLE).insert(alerts);
  return { alerts_created: alerts.length };
}

export async function trackMitigationActions(alertId, action) {
  await supabase.from(ALERT_TABLE).update({ mitigation: action, resolved_at: new Date().toISOString() }).eq('id', alertId);
  return { alert_id: alertId, tracked: true };
}

export async function outputSlaComplianceDashboard(accountId) {
  const { data: alerts } = await supabase.from(ALERT_TABLE).select('*').eq('account_id', accountId).order('alerted_at', { ascending: false });
  return { account_id: accountId, alerts: alerts ?? [], generated_at: new Date().toISOString() };
}
