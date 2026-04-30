import { supabase } from '../../lib/agent-memory.js';

const CHURN_TABLE        = 'education_churn_predictions';
const INTERVENTION_TABLE = 'education_churn_interventions';

const CHURN_SIGNALS = [
  { signal: 'login_frequency_drop',  weight: 25, test: (s) => (s.logins_last_7d ?? 0) < (s.avg_logins_per_7d ?? 3) * 0.4 },
  { signal: 'assignment_overdue',    weight: 20, test: (s) => (s.overdue_count ?? 0) >= 2 },
  { signal: 'support_ticket_filed',  weight: 15, test: (s) => (s.support_tickets_30d ?? 0) > 0 },
  { signal: 'no_progress_7d',        weight: 20, test: (s) => (s.days_since_progress ?? 0) >= 7 },
  { signal: 'negative_sentiment',    weight: 10, test: (s) => s.sentiment_score < -0.3 },
  { signal: 'missed_live_sessions',  weight: 10, test: (s) => (s.missed_sessions_30d ?? 0) >= 2 },
];

export async function aggregateSignals(learnerId) {
  const { data } = await supabase.from('education_learner_activity').select('*').eq('learner_id', learnerId).single();
  return { learner_id: learnerId, signals: data ?? {} };
}

export function computeChurnScore(signals) {
  const triggered = CHURN_SIGNALS.filter(s => s.test(signals));
  const score = Math.min(100, triggered.reduce((sum, s) => sum + s.weight, 0));
  const tier = score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { churn_score: score, tier, triggered_signals: triggered.map(s => s.signal) };
}

export function identifyDropoutTriggers(churnResult) {
  const triggerMap = { login_frequency_drop: 'disengagement', assignment_overdue: 'overwhelm', support_ticket_filed: 'frustration', no_progress_7d: 'stuck', negative_sentiment: 'dissatisfaction', missed_live_sessions: 'scheduling_conflict' };
  const triggers = churnResult.triggered_signals.map(s => triggerMap[s] ?? 'unknown').filter((v, i, a) => a.indexOf(v) === i);
  return { likely_triggers: triggers, primary_trigger: triggers[0] ?? null };
}

export function generateInterventions(tier, triggers) {
  const interventionMap = { disengagement: 'Send personalized check-in message', overwhelm: 'Offer 1:1 support session', frustration: 'Escalate to student success team', stuck: 'Send targeted micro-lesson bundle', dissatisfaction: 'Request feedback and address concerns', scheduling_conflict: 'Offer async alternatives' };
  return triggers.map(t => ({ trigger: t, action: interventionMap[t] ?? 'General outreach', priority: tier === 'critical' ? 'immediate' : tier === 'high' ? '24h' : '72h' }));
}

export async function triggerOutreach(learnerId, interventions) {
  const rows = interventions.map(i => ({ learner_id: learnerId, ...i, triggered_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(INTERVENTION_TABLE).insert(rows);
  return { learner_id: learnerId, outreach_triggered: rows.length };
}

export async function trackOutcomes(learnerId, retained) {
  await supabase.from(CHURN_TABLE).update({ retained, outcome_at: new Date().toISOString() }).eq('learner_id', learnerId);
  return { learner_id: learnerId, retained };
}

export async function outputRetentionQueue() {
  const { data } = await supabase.from(CHURN_TABLE).select('learner_id, tier, churn_score, triggered_signals').in('tier', ['critical', 'high']).order('churn_score', { ascending: false });
  return { priority_cases: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
