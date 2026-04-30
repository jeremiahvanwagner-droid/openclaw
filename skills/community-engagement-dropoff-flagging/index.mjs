import { supabase } from '../../lib/agent-memory.js';

const BASELINE_TABLE    = 'community_engagement_baselines';
const DROPOFF_TABLE     = 'community_engagement_dropoffs';
const INTERVENTION_TABLE = 'community_interventions';

const RISK_THRESHOLDS = { critical: 75, high: 50, medium: 25 };

export async function baselineEngagement(memberId, segment) {
  const { data } = await supabase.from(BASELINE_TABLE).select('avg_sessions_per_week, avg_posts_per_week').eq('segment', segment).single();
  const baseline = data ?? { avg_sessions_per_week: 3, avg_posts_per_week: 1.5 };
  await supabase.from(BASELINE_TABLE).upsert({ member_id: memberId, ...baseline, segment, baselined_at: new Date().toISOString() }, { onConflict: 'member_id' });
  return { member_id: memberId, baseline };
}

export async function trackDeclines(memberId, recentActivity) {
  const { data: baseline } = await supabase.from(BASELINE_TABLE).select('*').eq('member_id', memberId).single();
  if (!baseline) return { member_id: memberId, decline_detected: false };
  const sessionDecline = (baseline.avg_sessions_per_week - recentActivity.sessions_per_week) / baseline.avg_sessions_per_week;
  const postDecline = (baseline.avg_posts_per_week - recentActivity.posts_per_week) / baseline.avg_posts_per_week;
  const maxDecline = Math.max(sessionDecline, postDecline);
  return { member_id: memberId, session_decline_pct: Math.round(sessionDecline * 100), post_decline_pct: Math.round(postDecline * 100), max_decline_pct: Math.round(maxDecline * 100) };
}

export async function computeDropoffScore(memberId, declines) {
  const score = Math.min(100, Math.round((declines.max_decline_pct ?? 0) * 1.2));
  const tier = score >= RISK_THRESHOLDS.critical ? 'critical' : score >= RISK_THRESHOLDS.high ? 'high' : score >= RISK_THRESHOLDS.medium ? 'medium' : 'low';
  const drivers = [];
  if (declines.session_decline_pct > 50) drivers.push('session_frequency_drop');
  if (declines.post_decline_pct > 50) drivers.push('contribution_depth_drop');
  const record = { member_id: memberId, score, tier, drivers, computed_at: new Date().toISOString() };
  await supabase.from(DROPOFF_TABLE).upsert(record, { onConflict: 'member_id' });
  return record;
}

export async function classifyRiskTier(memberId) {
  const { data } = await supabase.from(DROPOFF_TABLE).select('score, tier').eq('member_id', memberId).single();
  const urgencyWindow = data?.tier === 'critical' ? '24h' : data?.tier === 'high' ? '72h' : '7d';
  return { member_id: memberId, tier: data?.tier ?? 'low', urgency_window: urgencyWindow };
}

export async function triggerRetentionWorkflow(memberId, tier) {
  const workflow = tier === 'critical' ? 'personal_outreach' : tier === 'high' ? 'email_sequence' : 'content_nudge';
  await supabase.from(INTERVENTION_TABLE).insert({ member_id: memberId, workflow, triggered_at: new Date().toISOString() });
  return { member_id: memberId, workflow_triggered: workflow };
}

export async function monitorOutcomes(memberId) {
  const { data } = await supabase.from(INTERVENTION_TABLE).select('*').eq('member_id', memberId).order('triggered_at', { ascending: false }).limit(5);
  return { member_id: memberId, interventions: data ?? [], last_intervention: (data ?? [])[0] ?? null };
}

export async function outputReengagementList() {
  const { data } = await supabase.from(DROPOFF_TABLE).select('*').in('tier', ['critical', 'high']).order('score', { ascending: false });
  return { priority_list: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
