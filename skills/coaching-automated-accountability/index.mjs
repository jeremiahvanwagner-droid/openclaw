/**
 * Automated Accountability — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const COMMITMENT_TABLE = 'coaching_commitments';
const NUDGE_TABLE      = 'coaching_nudges';

export async function loadCommitments(clientId) {
  const { data } = await supabase.from(COMMITMENT_TABLE).select('*').eq('client_id', clientId).eq('status', 'active');
  return { client_id: clientId, commitments: data ?? [], count: (data ?? []).length };
}

export function scheduleNudgeCadence(commitments) {
  return commitments.map(c => ({
    commitment_id: c.id, client_id: c.client_id,
    nudge_times: c.priority === 'high' ? ['09:00', '15:00'] : ['09:00'],
    channel: c.preferred_channel ?? 'sms',
  }));
}

export async function sendReminders(nudgeSchedule) {
  const sent = nudgeSchedule.map(n => ({
    ...n,
    message: `Reminder: "${n.commitment_description ?? 'your commitment'}" is due today. How's your progress?`,
    sent_at: new Date().toISOString(),
  }));
  if (sent.length) await supabase.from(NUDGE_TABLE).insert(sent);
  return { sent: sent.length };
}

export async function captureCompletionConfirmations(nudgeId, confirmed) {
  await supabase.from(NUDGE_TABLE).update({ confirmed, responded_at: new Date().toISOString() }).eq('id', nudgeId);
  return { nudge_id: nudgeId, confirmed };
}

export async function escalateOverdueTasks(clientId, overdueDays = 2) {
  const cutoff = new Date(Date.now() - overdueDays * 86400000).toISOString();
  const { data } = await supabase.from(COMMITMENT_TABLE).select('*').eq('client_id', clientId).eq('status', 'active').lt('due_date', cutoff);
  return { overdue: data ?? [], count: (data ?? []).length };
}

export async function adjustCadence(clientId, responsivenessPct) {
  const frequency = responsivenessPct > 0.8 ? 'daily' : responsivenessPct > 0.5 ? 'every_2_days' : 'weekly';
  await supabase.from(COMMITMENT_TABLE).update({ nudge_frequency: frequency }).eq('client_id', clientId);
  return { client_id: clientId, new_frequency: frequency };
}

export async function outputAccountabilityReport(clientId) {
  const { data: commitments } = await supabase.from(COMMITMENT_TABLE).select('*').eq('client_id', clientId);
  const { data: nudges } = await supabase.from(NUDGE_TABLE).select('*').eq('client_id', clientId);
  const confirmed = (nudges ?? []).filter(n => n.confirmed).length;
  return { client_id: clientId, total_commitments: (commitments ?? []).length, nudges_sent: (nudges ?? []).length, confirmed_rate: Math.round(confirmed / Math.max((nudges ?? []).length, 1) * 100), generated_at: new Date().toISOString() };
}
