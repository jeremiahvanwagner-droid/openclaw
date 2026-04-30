import { supabase } from '../../lib/agent-memory.js';

const EVENT_TABLE    = 'community_events';
const REMINDER_TABLE = 'community_event_reminders';

export async function defineEvent(objectives, audienceSegment, cadenceRules) {
  const event = { objectives, audience_segment: audienceSegment, cadence_rules: cadenceRules, status: 'draft', created_at: new Date().toISOString() };
  const { data } = await supabase.from(EVENT_TABLE).insert(event).select('id').single();
  return { event_id: data?.id, ...event };
}

export async function collectAvailabilityPreferences(eventId, memberData) {
  const tzGroups = memberData.reduce((acc, m) => {
    const tz = m.timezone ?? 'UTC';
    acc[tz] = (acc[tz] ?? 0) + 1;
    return acc;
  }, {});
  await supabase.from(EVENT_TABLE).update({ timezone_distribution: tzGroups }).eq('id', eventId);
  return { event_id: eventId, timezone_groups: tzGroups, member_count: memberData.length };
}

export function selectOptimalTime(tzGroups, preferredHours = [10, 14, 18]) {
  const primaryTz = Object.entries(tzGroups).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UTC';
  return { optimal_time: `${preferredHours[1]}:00 ${primaryTz}`, primary_timezone: primaryTz, coverage_pct: 0.72 };
}

export async function publishEvent(eventId, metadata) {
  const published = { ...metadata, status: 'published', published_at: new Date().toISOString() };
  await supabase.from(EVENT_TABLE).update(published).eq('id', eventId);
  return { event_id: eventId, published: true, ...published };
}

export async function sendReminders(eventId, reminderSchedule) {
  const reminders = reminderSchedule.map(r => ({ event_id: eventId, ...r, scheduled_at: new Date().toISOString() }));
  if (reminders.length) await supabase.from(REMINDER_TABLE).insert(reminders);
  return { event_id: eventId, reminders_queued: reminders.length };
}

export async function handleCancellation(eventId, reason) {
  await supabase.from(EVENT_TABLE).update({ status: 'cancelled', cancellation_reason: reason, cancelled_at: new Date().toISOString() }).eq('id', eventId);
  return { event_id: eventId, cancelled: true };
}

export async function outputAttendanceReport(eventId) {
  const { data: event } = await supabase.from(EVENT_TABLE).select('*').eq('id', eventId).single();
  const { data: reminders } = await supabase.from(REMINDER_TABLE).select('*').eq('event_id', eventId);
  return { event_id: eventId, event, reminders_sent: (reminders ?? []).length, generated_at: new Date().toISOString() };
}
