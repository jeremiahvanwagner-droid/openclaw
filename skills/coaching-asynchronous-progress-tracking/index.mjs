/**
 * Asynchronous Progress Tracking — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const MILESTONE_TABLE = 'coaching_milestones';
const UPDATE_TABLE    = 'coaching_client_updates';

export async function defineMilestoneMap(clientId, milestones) {
  const rows = milestones.map(m => ({ client_id: clientId, ...m, status: 'pending', created_at: new Date().toISOString() }));
  await supabase.from(MILESTONE_TABLE).upsert(rows, { onConflict: 'client_id,milestone_id' });
  return { client_id: clientId, milestones: rows.length };
}

export async function ingestClientUpdates(clientId, updates) {
  const rows = updates.map(u => ({ client_id: clientId, ...u, received_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(UPDATE_TABLE).insert(rows);
  return { ingested: rows.length };
}

export async function scoreMilestoneCompletion(clientId) {
  const { data: milestones } = await supabase.from(MILESTONE_TABLE).select('*').eq('client_id', clientId);
  const { data: updates } = await supabase.from(UPDATE_TABLE).select('*').eq('client_id', clientId).order('received_at', { ascending: false });
  const completed = (milestones ?? []).filter(m => m.status === 'complete').length;
  return { client_id: clientId, total: (milestones ?? []).length, completed, pct: Math.round(completed / Math.max((milestones ?? []).length, 1) * 100) };
}

export async function detectStalls(clientId, stalledDays = 7) {
  const cutoff = new Date(Date.now() - stalledDays * 86400000).toISOString();
  const { data } = await supabase.from(UPDATE_TABLE).select('*').eq('client_id', clientId).gte('received_at', cutoff);
  const stalled = (data ?? []).length === 0;
  return { client_id: clientId, stalled, last_update: data?.[0]?.received_at ?? null };
}

export async function triggerUpdateReminders(stalledClientIds) {
  const reminders = stalledClientIds.map(id => ({ client_id: id, type: 'progress_reminder', sent_at: new Date().toISOString() }));
  return { reminders_sent: reminders.length };
}

export async function summarizeProgressDeltas(clientId) {
  const { data: recent } = await supabase.from(UPDATE_TABLE).select('*').eq('client_id', clientId).order('received_at', { ascending: false }).limit(5);
  return { client_id: clientId, recent_updates: recent ?? [], delta_summary: `${(recent ?? []).length} updates in recent period` };
}

export async function outputClientStatusBoard(clientId) {
  const completion = await scoreMilestoneCompletion(clientId);
  const stall = await detectStalls(clientId);
  return { client_id: clientId, ...completion, stalled: stall.stalled, generated_at: new Date().toISOString() };
}
