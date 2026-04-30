import { supabase } from '../../lib/agent-memory.js';

const DORMANT_TABLE  = 'community_dormant_members';
const SEQUENCE_TABLE = 'community_reengagement_sequences';

export async function identifyDormant(inactivityDays = 14) {
  const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();
  const { data } = await supabase.from('community_member_activity').select('member_id, last_active_at').lt('last_active_at', cutoff);
  const dormant = data ?? [];
  if (dormant.length) await supabase.from(DORMANT_TABLE).upsert(dormant.map(d => ({ ...d, identified_at: new Date().toISOString() })), { onConflict: 'member_id' });
  return { dormant_count: dormant.length, cutoff_date: cutoff };
}

export async function profileInterests(memberId) {
  const { data: activity } = await supabase.from('community_content_tags').select('primary_label').eq('author_id', memberId).limit(20);
  const interests = (activity ?? []).reduce((acc, r) => { acc[r.primary_label] = (acc[r.primary_label] ?? 0) + 1; return acc; }, {});
  const topInterests = Object.entries(interests).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label);
  return { member_id: memberId, top_interests: topInterests };
}

export function generatePersonalizedPrompt(memberId, interests, milestones = []) {
  const topic = interests[0] ?? 'community discussions';
  const milestone = milestones[0] ?? null;
  const body = milestone
    ? `We noticed you hit "${milestone}" recently — that's worth celebrating! Come back and share your win with the community.`
    : `There's been great conversation around ${topic} lately. We think you'd enjoy jumping back in.`;
  return { member_id: memberId, subject: `We miss you! Come see what's new`, body, intent_hook: topic };
}

export async function selectOptimalChannel(memberId) {
  const { data } = await supabase.from('community_channel_preferences').select('channels').eq('member_id', memberId).single();
  const channel = (data?.channels ?? ['email'])[0];
  const hour = new Date().getUTCHours();
  const sendWindow = hour >= 8 && hour <= 11 ? 'morning' : hour >= 18 && hour <= 20 ? 'evening' : 'next_morning';
  return { member_id: memberId, channel, send_window: sendWindow };
}

export async function queueSequence(memberId, prompt, channel) {
  const steps = [
    { step: 1, delay_days: 0, message: prompt.body },
    { step: 2, delay_days: 3, message: `Still thinking about coming back? Here's a quick win waiting for you in the community.` },
    { step: 3, delay_days: 7, message: `Last nudge — we'd love to see you back. No pressure, but the door's always open.` },
  ];
  const rows = steps.map(s => ({ member_id: memberId, channel, ...s, status: 'queued', queued_at: new Date().toISOString() }));
  await supabase.from(SEQUENCE_TABLE).insert(rows);
  return { member_id: memberId, steps_queued: rows.length };
}

export async function captureOutcome(memberId, responded) {
  await supabase.from(DORMANT_TABLE).update({ reengaged: responded, outcome_recorded_at: new Date().toISOString() }).eq('member_id', memberId);
  return { member_id: memberId, reengaged: responded };
}

export async function outputReactivationPerformance() {
  const { data } = await supabase.from(DORMANT_TABLE).select('reengaged');
  const total = (data ?? []).length;
  const reengaged = (data ?? []).filter(r => r.reengaged).length;
  return { total_targeted: total, reengaged, reactivation_rate: total > 0 ? Math.round(reengaged / total * 100) : 0, generated_at: new Date().toISOString() };
}
