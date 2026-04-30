/**
 * Interactive Calendar Management — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CALENDAR_TABLE = 'coaching_calendar_sessions';

export async function syncAvailability(coachId, clientId, availabilityWindows) {
  await supabase.from(CALENDAR_TABLE).upsert({ coach_id: coachId, client_id: clientId, availability: availabilityWindows, synced_at: new Date().toISOString() }, { onConflict: 'coach_id,client_id' });
  return { synced: true, windows: availabilityWindows.length };
}

export function suggestBookingWindows(availability, timezone, count = 3) {
  const windows = (availability ?? []).slice(0, count);
  return { suggested: windows, timezone, count: windows.length };
}

export async function confirmSession(coachId, clientId, slot) {
  const session = { coach_id: coachId, client_id: clientId, slot, status: 'confirmed', confirmed_at: new Date().toISOString() };
  const { data } = await supabase.from(CALENDAR_TABLE).insert(session).select('id').single();
  return { session_id: data?.id, ...session };
}

export async function handleReschedule(sessionId, newSlot, policy = 'allow') {
  if (policy === 'block') return { rescheduled: false, reason: 'Policy blocks rescheduling within 24h' };
  await supabase.from(CALENDAR_TABLE).update({ slot: newSlot, status: 'rescheduled', rescheduled_at: new Date().toISOString() }).eq('id', sessionId);
  return { rescheduled: true, session_id: sessionId, new_slot: newSlot };
}

export async function sendReminders(sessionId, daysBeforeList = [1]) {
  const reminders = daysBeforeList.map(d => ({ session_id: sessionId, send_at: `${d}d before session`, type: 'reminder' }));
  return { reminders_scheduled: reminders.length };
}

export async function detectNoShowRisk(clientId) {
  const { data } = await supabase.from(CALENDAR_TABLE).select('*').eq('client_id', clientId).eq('status', 'no_show').order('confirmed_at', { ascending: false }).limit(3);
  const risk = (data ?? []).length >= 2;
  return { client_id: clientId, no_show_risk: risk, historical_no_shows: (data ?? []).length };
}

export async function outputSchedulingMetrics(coachId) {
  const { data } = await supabase.from(CALENDAR_TABLE).select('status').eq('coach_id', coachId);
  const counts = {};
  for (const s of (data ?? [])) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return { coach_id: coachId, metrics: counts, generated_at: new Date().toISOString() };
}
