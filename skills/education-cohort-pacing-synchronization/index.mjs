import { supabase } from '../../lib/agent-memory.js';

const COHORT_TABLE      = 'education_cohort_pacing';
const INTERVENTION_TABLE = 'education_pacing_interventions';

export async function defineCohortMilestones(cohortId, milestones) {
  const rows = milestones.map(m => ({ cohort_id: cohortId, ...m, created_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(COHORT_TABLE).insert(rows);
  return { cohort_id: cohortId, milestones_set: rows.length };
}

export async function monitorProgressVariance(cohortId) {
  const { data } = await supabase.from('education_learner_sequences').select('learner_id, position').eq('cohort_id', cohortId);
  const positions = (data ?? []).map(r => r.position ?? 0);
  if (positions.length === 0) return { cohort_id: cohortId, variance: 0, min_position: 0, max_position: 0 };
  const mean = positions.reduce((s, p) => s + p, 0) / positions.length;
  const variance = positions.reduce((s, p) => s + (p - mean) ** 2, 0) / positions.length;
  return { cohort_id: cohortId, variance: Math.round(variance * 10) / 10, min_position: Math.min(...positions), max_position: Math.max(...positions), mean_position: Math.round(mean * 10) / 10 };
}

export function detectPacingDrift(variance) {
  const driftDetected = variance.max_position - variance.min_position > 5;
  const riskTier = driftDetected ? (variance.max_position - variance.min_position > 10 ? 'critical' : 'moderate') : 'normal';
  return { drift_detected: driftDetected, risk_tier: riskTier, position_spread: variance.max_position - variance.min_position };
}

export async function recommendCatchUpActions(cohortId, drift, progressData) {
  const { data } = await supabase.from('education_learner_sequences').select('learner_id, position').eq('cohort_id', cohortId);
  const avgPosition = (data ?? []).reduce((s, r) => s + (r.position ?? 0), 0) / Math.max((data ?? []).length, 1);
  const behind = (data ?? []).filter(r => (r.position ?? 0) < avgPosition - 2);
  const ahead = (data ?? []).filter(r => (r.position ?? 0) > avgPosition + 3);
  return { catch_up_needed: behind.map(r => ({ learner_id: r.learner_id, action: 'send_catch_up_nudge' })), stretch_content: ahead.map(r => ({ learner_id: r.learner_id, action: 'unlock_bonus_module' })) };
}

export async function adjustReminders(cohortId, drift) {
  if (drift.drift_detected) await supabase.from(COHORT_TABLE).update({ reminder_frequency: drift.risk_tier === 'critical' ? 'daily' : 'every_2_days' }).eq('cohort_id', cohortId);
  return { cohort_id: cohortId, reminder_adjusted: drift.drift_detected };
}

export async function prepLiveSession(cohortId, sessionDate) {
  const variance = await monitorProgressVariance(cohortId);
  return { cohort_id: cohortId, session_date: sessionDate, readiness_score: Math.max(0, 100 - variance.variance * 5), mean_position: variance.mean_position, recommended_topics: ['Review pacing catch-up materials', 'Cover modules most behind cohort'] };
}

export async function outputPacingHealth(cohortId) {
  const variance = await monitorProgressVariance(cohortId);
  const { data: interventions } = await supabase.from(INTERVENTION_TABLE).select('*').eq('cohort_id', cohortId);
  return { cohort_id: cohortId, variance, intervention_count: (interventions ?? []).length, generated_at: new Date().toISOString() };
}
