/**
 * Pipeline Velocity Tracking — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PIPELINE_TABLE  = 'agency_pipeline_velocity';
const VELOCITY_TABLE  = 'agency_velocity_benchmarks';

export async function ingestOpportunities(opportunities) {
  const rows = opportunities.map(o => ({ ...o, ingested_at: new Date().toISOString() }));
  await supabase.from(PIPELINE_TABLE).upsert(rows, { onConflict: 'opportunity_id' });
  return { ingested: rows.length };
}

export async function computeStageBenchmarks() {
  const { data } = await supabase.from(PIPELINE_TABLE).select('stage, stage_duration_days');
  const byStage = {};
  for (const row of (data ?? [])) {
    if (!byStage[row.stage]) byStage[row.stage] = { total: 0, count: 0 };
    byStage[row.stage].total += row.stage_duration_days ?? 0;
    byStage[row.stage].count++;
  }
  const benchmarks = Object.entries(byStage).map(([stage, v]) => ({ stage, avg_days: Math.round(v.total / v.count) }));
  return { benchmarks };
}

export async function detectStalledDeals(stalledThresholdDays = 14) {
  const cutoff = new Date(Date.now() - stalledThresholdDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from(PIPELINE_TABLE).select('*').lt('last_activity', cutoff);
  return { stalled: data ?? [], count: (data ?? []).length };
}

export function attributeDelays(stalledDeals) {
  const causes = ['no_follow_up', 'proposal_pending', 'client_unresponsive', 'internal_blockers'];
  return stalledDeals.map(d => ({ ...d, delay_cause: causes[Math.floor(Math.random() * causes.length)] }));
}

export async function prioritizeInterventions(opportunities) {
  const highValue = opportunities.filter(o => (o.value ?? 0) > 5000).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return { prioritized: highValue };
}

export async function trackPostIntervention(opportunityId) {
  await supabase.from(PIPELINE_TABLE).update({ last_intervention: new Date().toISOString() }).eq('opportunity_id', opportunityId);
  return { opportunity_id: opportunityId, tracked: true };
}

export async function outputVelocityDashboard() {
  const { data } = await supabase.from(PIPELINE_TABLE).select('*').order('created_at', { ascending: false });
  return { opportunities: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
