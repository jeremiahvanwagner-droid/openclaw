import { supabase } from '../../lib/agent-memory.js';

const PREFS_TABLE    = 'community_channel_preferences';
const DELIVERY_TABLE = 'community_message_deliveries';

const CHANNEL_ORDER = ['push', 'email', 'sms', 'in_app'];
const PRIORITY_TIERS = { critical: 0, high: 1, normal: 2 };

export async function resolveChannelPreferences(memberId) {
  const { data } = await supabase.from(PREFS_TABLE).select('*').eq('member_id', memberId).single();
  return { member_id: memberId, preferred_channels: data?.channels ?? ['email'], permissions: data?.permissions ?? {}, resolved_at: new Date().toISOString() };
}

export function classifyPriority(announcement) {
  if (/urgent|critical|immediately|action required/i.test(announcement.title ?? '')) return 'critical';
  if (/important|announcement|update/i.test(announcement.title ?? '')) return 'high';
  return 'normal';
}

export function formatChannelVariants(payload, channels) {
  const variants = {};
  for (const ch of channels) {
    if (ch === 'sms') variants.sms = { text: `${(payload.title ?? '').slice(0, 50)}: ${(payload.body ?? '').slice(0, 100)}...` };
    else if (ch === 'push') variants.push = { title: (payload.title ?? '').slice(0, 60), body: (payload.body ?? '').slice(0, 100) };
    else variants[ch] = { subject: payload.title, html: `<p>${payload.body}</p>`, plain: payload.body };
  }
  return variants;
}

export async function dispatch(memberId, messageId, variants, channels) {
  const deliveries = channels.map(ch => ({ member_id: memberId, message_id: messageId, channel: ch, variant: variants[ch] ?? {}, status: 'sent', sent_at: new Date().toISOString() }));
  if (deliveries.length) await supabase.from(DELIVERY_TABLE).insert(deliveries);
  return { member_id: memberId, channels_dispatched: channels };
}

export async function trackDelivery(deliveryId, status) {
  await supabase.from(DELIVERY_TABLE).update({ status, updated_at: new Date().toISOString() }).eq('id', deliveryId);
  return { delivery_id: deliveryId, status };
}

export async function retryFailed(memberId, messageId) {
  const { data } = await supabase.from(DELIVERY_TABLE).select('*').eq('member_id', memberId).eq('message_id', messageId).eq('status', 'failed');
  const failed = data ?? [];
  for (const d of failed) {
    const fallback = CHANNEL_ORDER[CHANNEL_ORDER.indexOf(d.channel) + 1];
    if (fallback) await supabase.from(DELIVERY_TABLE).insert({ ...d, channel: fallback, status: 'retry', sent_at: new Date().toISOString() });
  }
  return { retried: failed.length };
}

export async function outputDeliveryReport(messageId) {
  const { data } = await supabase.from(DELIVERY_TABLE).select('*').eq('message_id', messageId);
  const rows = data ?? [];
  const byStatus = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
  const unresolved = rows.filter(r => r.status === 'failed');
  return { message_id: messageId, total: rows.length, by_status: byStatus, unresolved_recipients: unresolved.map(r => r.member_id), generated_at: new Date().toISOString() };
}
