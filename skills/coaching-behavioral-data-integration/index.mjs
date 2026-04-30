/**
 * Behavioral Data Integration — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const BEHAVIOR_TABLE = 'coaching_behavioral_profiles';
const INSIGHT_TABLE  = 'coaching_behavioral_insights';

export async function defineBehavioralMetrics(clientId, metrics) {
  await supabase.from(BEHAVIOR_TABLE).upsert({ client_id: clientId, metrics, defined_at: new Date().toISOString() }, { onConflict: 'client_id' });
  return { client_id: clientId, metrics_count: metrics.length };
}

export async function ingestBehavioralData(clientId, dataStreams) {
  const rows = dataStreams.map(s => ({ client_id: clientId, source: s.source, events: s.events, ingested_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(BEHAVIOR_TABLE).insert(rows);
  return { ingested: rows.length };
}

export function normalizeBehavioralProfile(dataStreams) {
  const profile = { consistency_score: 0, active_hours_per_week: 0, top_activities: [], patterns: [] };
  for (const stream of dataStreams) {
    profile.active_hours_per_week += (stream.events?.length ?? 0) * 0.5;
    if (stream.top_activity) profile.top_activities.push(stream.top_activity);
  }
  return { profile };
}

export function detectBehaviorPatterns(profile) {
  const patterns = [];
  if (profile.consistency_score > 0.8) patterns.push({ pattern: 'high_consistency', type: 'positive' });
  if (profile.active_hours_per_week < 5) patterns.push({ pattern: 'low_engagement', type: 'anti_pattern' });
  return { patterns };
}

export function correlateBehaviorWithOutcomes(patterns, outcomes) {
  return patterns.map(p => ({
    ...p,
    outcome_correlation: outcomes.find(o => o.pattern === p.pattern)?.correlation ?? 'unknown',
  }));
}

export async function generateCoachingInsights(clientId, correlated) {
  const insights = correlated.map(c => ({
    client_id: clientId,
    insight: `Pattern "${c.pattern}" correlates with ${c.outcome_correlation} outcomes`,
    type: c.type,
    generated_at: new Date().toISOString(),
  }));
  if (insights.length) await supabase.from(INSIGHT_TABLE).insert(insights);
  return { insights };
}

export async function outputBehavioralSummary(clientId) {
  const { data } = await supabase.from(INSIGHT_TABLE).select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(20);
  return { client_id: clientId, insights: data ?? [], generated_at: new Date().toISOString() };
}
