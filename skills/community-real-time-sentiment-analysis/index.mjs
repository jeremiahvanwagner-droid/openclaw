import { supabase } from '../../lib/agent-memory.js';

const SENTIMENT_TABLE = 'community_sentiment_events';
const SNAPSHOT_TABLE  = 'community_sentiment_snapshots';

const POSITIVE_SIGNALS = /love|great|amazing|thank|helpful|awesome|excited|progress|win|congrats/i;
const NEGATIVE_SIGNALS = /hate|terrible|scam|broken|refund|quit|useless|waste|angry|frustrated|disappointed/i;
const ESCALATION_SIGNALS = /lawsuit|fraud|illegal|threatening|harass|abuse/i;

function classifySentiment(text) {
  if (ESCALATION_SIGNALS.test(text)) return { polarity: 'negative', intensity: 'critical', escalation_risk: true };
  if (NEGATIVE_SIGNALS.test(text)) return { polarity: 'negative', intensity: 'high', escalation_risk: false };
  if (POSITIVE_SIGNALS.test(text)) return { polarity: 'positive', intensity: 'medium', escalation_risk: false };
  return { polarity: 'neutral', intensity: 'low', escalation_risk: false };
}

export async function ingestMessages(channelId, messages) {
  const rows = messages.map(m => {
    const sentiment = classifySentiment(m.text ?? '');
    return { channel_id: channelId, message_id: m.id, author_id: m.author_id, text_preview: (m.text ?? '').slice(0, 200), ...sentiment, analyzed_at: new Date().toISOString() };
  });
  if (rows.length) await supabase.from(SENTIMENT_TABLE).insert(rows);
  return { channel_id: channelId, analyzed: rows.length };
}

export async function aggregateWindow(channelId, windowMinutes = 30) {
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const { data } = await supabase.from(SENTIMENT_TABLE).select('polarity, intensity, escalation_risk').eq('channel_id', channelId).gte('analyzed_at', since);
  const rows = data ?? [];
  const total = rows.length;
  const positive = rows.filter(r => r.polarity === 'positive').length;
  const negative = rows.filter(r => r.polarity === 'negative').length;
  const score = total > 0 ? Math.round(((positive - negative) / total) * 100) : 0;
  return { channel_id: channelId, window_minutes: windowMinutes, total_messages: total, sentiment_score: score, positive_pct: total > 0 ? Math.round(positive / total * 100) : 0, negative_pct: total > 0 ? Math.round(negative / total * 100) : 0 };
}

export async function detectMoodShifts(channelId) {
  const { data } = await supabase.from(SNAPSHOT_TABLE).select('sentiment_score, snapshot_at').eq('channel_id', channelId).order('snapshot_at', { ascending: false }).limit(5);
  const scores = (data ?? []).map(r => r.sentiment_score);
  const shift = scores.length >= 2 ? scores[0] - scores[1] : 0;
  return { channel_id: channelId, shift, abrupt_shift: Math.abs(shift) > 30, trend: shift > 10 ? 'improving' : shift < -10 ? 'declining' : 'stable' };
}

export async function flagEscalationRisk(channelId) {
  const { data } = await supabase.from(SENTIMENT_TABLE).select('message_id, author_id, text_preview').eq('channel_id', channelId).eq('escalation_risk', true).order('analyzed_at', { ascending: false }).limit(10);
  return { channel_id: channelId, escalation_threads: data ?? [], requires_moderator: (data ?? []).length > 0 };
}

export async function publishSnapshot(channelId, window) {
  const snapshot = { channel_id: channelId, ...window, snapshot_at: new Date().toISOString() };
  await supabase.from(SNAPSHOT_TABLE).insert(snapshot);
  return snapshot;
}

export async function outputAlerts(channelId) {
  const shift = await detectMoodShifts(channelId);
  const escalation = await flagEscalationRisk(channelId);
  const posture = escalation.requires_moderator ? 'immediate_intervention' : shift.trend === 'declining' ? 'monitor_closely' : 'normal';
  return { channel_id: channelId, recommended_posture: posture, mood_shift: shift, escalation_risk: escalation, generated_at: new Date().toISOString() };
}
