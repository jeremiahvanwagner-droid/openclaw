import { supabase } from '../../lib/agent-memory.js';

const SCORE_TABLE = 'lead_scores';

const DEMOGRAPHIC_RULES = [
  { signal: 'has_email',      points: 5,  test: (c) => !!c.email },
  { signal: 'has_phone',      points: 5,  test: (c) => !!c.phone },
  { signal: 'location_match', points: 10, test: (c) => c.in_target_geo === true },
  { signal: 'company_icp',    points: 10, test: (c) => c.company_size_matches_icp === true },
];

const BEHAVIORAL_RULES = [
  { signal: 'form_submitted',   points: 10, test: (c) => (c.form_submissions ?? 0) > 0 },
  { signal: 'email_opened_7d',  points: 5,  test: (c) => (c.email_opens_7d ?? 0) > 0 },
  { signal: 'email_clicked_7d', points: 10, test: (c) => (c.email_clicks_7d ?? 0) > 0 },
  { signal: 'page_visit_7d',    points: 5,  test: (c) => (c.page_visits_7d ?? 0) > 0 },
  { signal: 'booked_appt',      points: 15, test: (c) => c.booked_appointment === true },
  { signal: 'replied',          points: 10, test: (c) => (c.inbound_replies ?? 0) > 0 },
  { signal: 'watched_video_50', points: 5,  test: (c) => c.video_watch_pct >= 50 },
];

const NEGATIVE_RULES = [
  { signal: 'unsubscribed',    points: -20, test: (c) => c.unsubscribed === true },
  { signal: 'bounced_email',   points: -10, test: (c) => c.hard_bounce === true },
  { signal: 'inactive_60d',    points: -10, test: (c) => (c.days_since_activity ?? 0) > 60 },
  { signal: 'spam_complaint',  points: -30, test: (c) => c.spam_complaint === true },
];

function recencyScore(contact) {
  const days = contact.days_since_activity ?? 999;
  if (days < 1)  return { points: 20, signal: 'active_today' };
  if (days < 7)  return { points: 15, signal: 'active_this_week' };
  if (days < 30) return { points: 10, signal: 'active_this_month' };
  if (days < 90) return { points: 5,  signal: 'active_last_90d' };
  return { points: 0, signal: 'inactive_90d_plus' };
}

function tierFromScore(score) {
  if (score >= 80) return { tier: 'hot',      action: 'Immediate sales follow-up' };
  if (score >= 50) return { tier: 'warm',     action: 'Nurture sequence + sales alert' };
  if (score >= 25) return { tier: 'cool',     action: 'Long-term nurture' };
  if (score >= 0)  return { tier: 'cold',     action: 'Re-engagement or archive' };
  return             { tier: 'negative', action: 'Do not contact' };
}

export async function scoreContact(locationId, contactId, contactData, options = {}) {
  const c = contactData;
  const demog = DEMOGRAPHIC_RULES.filter(r => r.test(c));
  const behav = BEHAVIORAL_RULES.filter(r => r.test(c));
  const neg   = NEGATIVE_RULES.filter(r => r.test(c));
  const rec   = recencyScore(c);

  const breakdown = {
    demographic: demog.reduce((s, r) => s + r.points, 0),
    behavioral:  behav.reduce((s, r) => s + r.points, 0),
    recency:     rec.points,
    negative:    neg.reduce((s, r) => s + r.points, 0),
  };
  const rawScore = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const { tier, action } = tierFromScore(rawScore);
  const topSignals = [...demog, ...behav].map(r => r.signal).slice(0, 5);

  const result = { contact_id: contactId, score, tier, breakdown, top_signals: topSignals, recommended_action: action, scored_at: new Date().toISOString() };
  await supabase.from(SCORE_TABLE).upsert({ location_id: locationId, ...result }, { onConflict: 'contact_id' });
  return result;
}

export async function batchScore(locationId, contacts) {
  const results = await Promise.all(contacts.map(c => scoreContact(locationId, c.id, c)));
  return { total_scored: results.length, hot: results.filter(r => r.tier === 'hot').length, warm: results.filter(r => r.tier === 'warm').length, scores: results };
}

export async function getTopLeads(locationId, tier = 'hot', limit = 20) {
  const { data } = await supabase.from(SCORE_TABLE).select('*').eq('location_id', locationId).eq('tier', tier).order('score', { ascending: false }).limit(limit);
  return { tier, leads: data ?? [], total: (data ?? []).length };
}
