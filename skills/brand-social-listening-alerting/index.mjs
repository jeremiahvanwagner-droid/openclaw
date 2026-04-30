/**
 * Social Listening Alerting — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const MENTION_TABLE = 'brand_social_mentions';
const ALERT_TABLE   = 'brand_social_alerts';

export async function trackMentions(brandId, keywords, mentions) {
  const rows = mentions.map(m => ({ brand_id: brandId, keyword: keywords.find(k => m.text?.includes(k)) ?? 'brand', ...m, captured_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(MENTION_TABLE).insert(rows);
  return { tracked: rows.length };
}

export async function detectVelocitySpikes(brandId, windowMinutes = 60) {
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const { data } = await supabase.from(MENTION_TABLE).select('id').eq('brand_id', brandId).gte('captured_at', since);
  const count = (data ?? []).length;
  return { brand_id: brandId, mentions_in_window: count, spike_detected: count > 50 };
}

export function classifyEvents(mentions) {
  return mentions.map(m => ({
    ...m,
    classification: /great|love|amazing/i.test(m.text ?? '') ? 'opportunity' : /terrible|hate|scam|fraud/i.test(m.text ?? '') ? 'risk' : 'neutral',
    sentiment: /great|love|amazing/i.test(m.text ?? '') ? 'positive' : /terrible|hate|scam/i.test(m.text ?? '') ? 'negative' : 'neutral',
  }));
}

export async function triggerAlerts(brandId, classifiedEvents) {
  const risks = classifiedEvents.filter(e => e.classification === 'risk');
  if (!risks.length) return { alerts_created: 0 };
  const alerts = risks.map(e => ({ brand_id: brandId, mention_id: e.id, severity: 'high', alerted_at: new Date().toISOString() }));
  await supabase.from(ALERT_TABLE).insert(alerts);
  return { alerts_created: alerts.length };
}

export function recommendPlaybooks(classifiedEvents) {
  const byClass = {};
  for (const e of classifiedEvents) byClass[e.classification] = (byClass[e.classification] ?? 0) + 1;
  const playbooks = [];
  if (byClass.risk > 3) playbooks.push({ action: 'respond_to_negative', urgency: 'high' });
  if (byClass.opportunity > 10) playbooks.push({ action: 'amplify_positive', urgency: 'medium' });
  return { playbooks };
}

export async function monitorEventEvolution(alertId) {
  const { data } = await supabase.from(ALERT_TABLE).select('*').eq('id', alertId).single();
  return { alert_id: alertId, status: data?.status ?? 'active', last_updated: data?.updated_at };
}

export async function outputIncidentTimeline(brandId) {
  const { data } = await supabase.from(ALERT_TABLE).select('*').eq('brand_id', brandId).order('alerted_at', { ascending: false });
  return { brand_id: brandId, incidents: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
