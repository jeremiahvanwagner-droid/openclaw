import { supabase } from '../../lib/agent-memory.js';

const MASTERY_TABLE   = 'education_mastery_records';
const SCHEDULE_TABLE  = 'education_refresher_schedule';

const HALF_LIFE_DAYS = { easy: 30, medium: 14, hard: 7 };

export async function collectMasteryData(learnerId) {
  const { data } = await supabase.from(MASTERY_TABLE).select('*').eq('learner_id', learnerId).order('last_reviewed_at', { ascending: false });
  return { learner_id: learnerId, mastery_records: data ?? [] };
}

export function estimateRetentionHalfLife(topic, learnerProfile) {
  const difficulty = learnerProfile.topic_difficulties?.[topic] ?? 'medium';
  const baseHalfLife = HALF_LIFE_DAYS[difficulty] ?? 14;
  const recencyBonus = learnerProfile.review_count > 3 ? 1.5 : 1.0;
  return Math.round(baseHalfLife * recencyBonus);
}

export function forecastDecayRisk(masteryRecord, halfLifeDays) {
  const daysSinceLearned = (Date.now() - new Date(masteryRecord.last_reviewed_at ?? masteryRecord.learned_at).getTime()) / 86400000;
  const retentionPct = Math.exp(-0.693 * daysSinceLearned / halfLifeDays) * 100;
  const decayRisk = retentionPct < 50 ? 'high' : retentionPct < 75 ? 'medium' : 'low';
  const daysToCliff = Math.round(halfLifeDays * Math.log2(100 / 50));
  return { topic: masteryRecord.topic, retention_pct: Math.round(retentionPct), decay_risk: decayRisk, days_to_cliff: Math.max(0, daysToCliff - Math.round(daysSinceLearned)) };
}

export async function scheduleRefreshers(learnerId, decayForecasts) {
  const due = decayForecasts.filter(d => d.decay_risk !== 'low').sort((a, b) => a.days_to_cliff - b.days_to_cliff);
  const rows = due.map(d => ({ learner_id: learnerId, topic: d.topic, due_at: new Date(Date.now() + d.days_to_cliff * 86400000).toISOString(), decay_risk: d.decay_risk, scheduled_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(SCHEDULE_TABLE).upsert(rows, { onConflict: 'learner_id,topic' });
  return { learner_id: learnerId, refreshers_scheduled: rows.length };
}

export function prioritizeByImpact(schedule, competencyWeights = {}) {
  return schedule.sort((a, b) => {
    const aWeight = competencyWeights[a.topic] ?? 1;
    const bWeight = competencyWeights[b.topic] ?? 1;
    return (b.decay_risk === 'high' ? 2 : 1) * bWeight - (a.decay_risk === 'high' ? 2 : 1) * aWeight;
  });
}

export async function adaptIntervals(learnerId, topic, refresherScore) {
  const multiplier = refresherScore >= 90 ? 1.5 : refresherScore >= 70 ? 1.2 : 0.8;
  await supabase.from(MASTERY_TABLE).update({ half_life_multiplier: multiplier, last_reviewed_at: new Date().toISOString() }).eq('learner_id', learnerId).eq('topic', topic);
  return { learner_id: learnerId, topic, interval_adjusted_by: multiplier };
}

export async function outputRetentionDashboard(learnerId) {
  const { data: schedule } = await supabase.from(SCHEDULE_TABLE).select('*').eq('learner_id', learnerId).order('due_at');
  return { learner_id: learnerId, upcoming_refreshers: (schedule ?? []).slice(0, 10), high_risk_topics: (schedule ?? []).filter(s => s.decay_risk === 'high').map(s => s.topic), generated_at: new Date().toISOString() };
}
