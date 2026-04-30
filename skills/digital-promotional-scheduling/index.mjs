import { supabase } from '../../lib/agent-memory.js';

const CALENDAR_TABLE = 'digital_promo_calendar';
const TASK_TABLE     = 'digital_promo_tasks';

const CHANNEL_WINDOWS = {
  instagram: { best_days: ['tuesday', 'wednesday', 'friday'], best_hours: [9, 12, 18] },
  facebook:  { best_days: ['wednesday', 'thursday', 'friday'], best_hours: [13, 15, 19] },
  email:     { best_days: ['tuesday', 'thursday'],             best_hours: [8, 10, 14] },
  linkedin:  { best_days: ['tuesday', 'wednesday', 'thursday'], best_hours: [8, 10, 12] },
  youtube:   { best_days: ['friday', 'saturday', 'sunday'],    best_hours: [12, 15, 18] },
};

export async function defineCampaign(campaignId, objective, offerWindow, assets) {
  const campaign = { campaign_id: campaignId, objective, offer_window: offerWindow, asset_count: assets.length, status: 'planning', created_at: new Date().toISOString() };
  await supabase.from(CALENDAR_TABLE).insert(campaign);
  return campaign;
}

export function segmentChannels(channels, audienceData = {}) {
  return channels.map(ch => ({ channel: ch, ...CHANNEL_WINDOWS[ch] ?? {}, audience_size: audienceData[ch] ?? 0 }));
}

export async function buildPostingCalendar(campaignId, channelSegments, startDate, durationDays = 14) {
  const posts = [];
  const start = new Date(startDate);
  for (let day = 0; day < durationDays; day++) {
    const date = new Date(start.getTime() + day * 86400000);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    for (const cs of channelSegments) {
      if ((cs.best_days ?? []).includes(dayName)) {
        posts.push({ campaign_id: campaignId, channel: cs.channel, scheduled_date: date.toISOString().slice(0, 10), scheduled_hour: (cs.best_hours ?? [10])[day % (cs.best_hours?.length ?? 1)], status: 'queued', created_at: new Date().toISOString() });
      }
    }
  }
  if (posts.length) await supabase.from(CALENDAR_TABLE).insert(posts);
  return { campaign_id: campaignId, posts_scheduled: posts.length };
}

export function staggerCreativeVariants(assets) {
  return assets.map((a, i) => ({ ...a, variant_index: i, rotation_day: i * 2, fatigue_guard: true }));
}

export function addUtmConventions(campaignId, channel) {
  return { utm_source: channel, utm_medium: 'social', utm_campaign: campaignId, utm_content: `${channel}_variant_${Date.now()}` };
}

export async function queuePublishingTasks(campaignId) {
  const { data } = await supabase.from(CALENDAR_TABLE).select('*').eq('campaign_id', campaignId).eq('status', 'queued');
  const tasks = (data ?? []).map(p => ({ campaign_id: campaignId, post_id: p.id, channel: p.channel, due_at: `${p.scheduled_date}T${String(p.scheduled_hour).padStart(2, '0')}:00:00Z`, fallback_slot: new Date(new Date(`${p.scheduled_date}T${String(p.scheduled_hour).padStart(2, '0')}:00:00Z`).getTime() + 3600000).toISOString(), status: 'pending' }));
  if (tasks.length) await supabase.from(TASK_TABLE).insert(tasks);
  return { campaign_id: campaignId, tasks_queued: tasks.length };
}

export async function outputExecutionSchedule(campaignId) {
  const { data: posts } = await supabase.from(CALENDAR_TABLE).select('*').eq('campaign_id', campaignId).order('scheduled_date');
  return { campaign_id: campaignId, schedule: posts ?? [], daily_monitoring: ['Check post went live', 'Record initial engagement metrics', 'Flag underperforming posts for pause', 'Verify UTM tracking active'], generated_at: new Date().toISOString() };
}
