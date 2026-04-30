/**
 * Intervention Triggering — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SIGNAL_TABLE      = 'coaching_distress_signals';
const INTERVENTION_TABLE = 'coaching_interventions';

const DISTRESS_PATTERNS = [
  { pattern: /i give up|quit|hopeless|can't do this/i, urgency: 'critical' },
  { pattern: /overwhelmed|stuck|frozen|paralyzed/i, urgency: 'high' },
  { pattern: /not sure|losing motivation|tired/i, urgency: 'medium' },
];

export async function monitorDistressSignals(clientId, messages) {
  const signals = [];
  for (const msg of messages) {
    const match = DISTRESS_PATTERNS.find(p => p.pattern.test(msg.text ?? ''));
    if (match) signals.push({ client_id: clientId, text: msg.text, urgency: match.urgency, detected_at: new Date().toISOString() });
  }
  if (signals.length) await supabase.from(SIGNAL_TABLE).insert(signals);
  return { signals_detected: signals.length, highest_urgency: signals[0]?.urgency ?? 'none' };
}

export async function scoreInterventionUrgency(clientId) {
  const { data } = await supabase.from(SIGNAL_TABLE).select('urgency').eq('client_id', clientId).order('detected_at', { ascending: false }).limit(5);
  const urgencyScore = { critical: 3, high: 2, medium: 1, none: 0 };
  const total = (data ?? []).reduce((a, s) => a + (urgencyScore[s.urgency] ?? 0), 0);
  return { client_id: clientId, urgency_score: total, threshold_exceeded: total >= 3 };
}

export function distinguishCoachableVsHighRisk(signals) {
  const highRisk = signals.filter(s => s.urgency === 'critical');
  const coachable = signals.filter(s => s.urgency !== 'critical');
  return { high_risk: highRisk, coachable, requires_human: highRisk.length > 0 };
}

export async function triggerEscalation(clientId, expertId, context) {
  const escalation = { client_id: clientId, expert_id: expertId, context, status: 'pending', triggered_at: new Date().toISOString() };
  await supabase.from(INTERVENTION_TABLE).insert(escalation);
  return { escalated: true, expert_id: expertId };
}

export async function preserveHandoffContext(clientId) {
  const { data: signals } = await supabase.from(SIGNAL_TABLE).select('*').eq('client_id', clientId).order('detected_at', { ascending: false }).limit(10);
  return { client_id: clientId, context_package: { recent_signals: signals ?? [], summary: `${(signals ?? []).length} distress signals detected` } };
}

export async function pauseAutonomousPrompts(clientId) {
  await supabase.from('coaching_sessions').update({ autonomous_paused: true, paused_at: new Date().toISOString() }).eq('client_id', clientId);
  return { paused: true, client_id: clientId };
}

export async function outputInterventionLog(clientId) {
  const { data } = await supabase.from(INTERVENTION_TABLE).select('*').eq('client_id', clientId);
  return { client_id: clientId, interventions: data ?? [], generated_at: new Date().toISOString() };
}
