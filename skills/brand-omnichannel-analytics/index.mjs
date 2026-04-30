/**
 * Omnichannel Analytics — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const METRICS_TABLE  = 'brand_channel_metrics';
const DASHBOARD_TABLE = 'brand_analytics_dashboard';

export async function ingestChannelMetrics(creatorId, channelData) {
  const rows = Object.entries(channelData).map(([channel, metrics]) => ({
    creator_id: creatorId, channel, ...metrics, ingested_at: new Date().toISOString(),
  }));
  await supabase.from(METRICS_TABLE).insert(rows);
  return { ingested: rows.length, channels: Object.keys(channelData) };
}

export function normalizeKPIs(channelRows) {
  return channelRows.map(row => ({
    channel: row.channel,
    normalized: {
      reach: row.followers ?? row.subscribers ?? row.email_list_size ?? 0,
      engagement_rate: row.engagement_rate ?? (row.likes ? row.likes / Math.max(row.impressions ?? 1, 1) : 0),
      conversion_rate: row.conversion_rate ?? 0,
      revenue: row.revenue ?? 0,
    },
  }));
}

export function computeGrowthTrends(current, previous) {
  const growth = {};
  for (const [k, v] of Object.entries(current)) {
    const prev = previous?.[k] ?? 0;
    growth[k] = { current: v, previous: prev, delta: v - prev, pct_change: prev ? Math.round((v - prev) / prev * 100) : null };
  }
  return { growth };
}

export function attributeMonetization(revenue, channelMetrics) {
  const totalReach = channelMetrics.reduce((a, c) => a + (c.normalized?.reach ?? 0), 0);
  return channelMetrics.map(c => ({
    channel: c.channel,
    attributed_revenue: totalReach ? Math.round(revenue * (c.normalized?.reach ?? 0) / totalReach) : 0,
  }));
}

export function detectAnomalies(channelMetrics, thresholdPct = 30) {
  return channelMetrics.filter(c => Math.abs(c.growth?.pct_change ?? 0) > thresholdPct).map(c => ({ channel: c.channel, anomaly: c.growth?.pct_change > 0 ? 'spike' : 'drop', pct_change: c.growth?.pct_change }));
}

export function generateExecutiveSummary(normalized, attribution) {
  const top_channel = normalized.sort((a, b) => (b.normalized?.reach ?? 0) - (a.normalized?.reach ?? 0))[0];
  return { top_channel: top_channel?.channel, total_reach: normalized.reduce((a, c) => a + (c.normalized?.reach ?? 0), 0), attribution_summary: attribution };
}

export async function outputUnifiedDashboard(creatorId, summary) {
  await supabase.from(DASHBOARD_TABLE).insert({ creator_id: creatorId, ...summary, generated_at: new Date().toISOString() });
  return { creator_id: creatorId, dashboard: summary, generated_at: new Date().toISOString() };
}
