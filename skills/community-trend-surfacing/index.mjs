import { supabase } from '../../lib/agent-memory.js';

const TOPIC_TABLE = 'community_topic_clusters';
const TREND_TABLE = 'community_trends';

export async function aggregateTopics(sourceTables = ['community_content_tags', 'community_content_index']) {
  const { data } = await supabase.from('community_content_tags').select('primary_label, tagged_at').gte('tagged_at', new Date(Date.now() - 30 * 86400000).toISOString());
  const counts = (data ?? []).reduce((acc, r) => { acc[r.primary_label] = (acc[r.primary_label] ?? 0) + 1; return acc; }, {});
  return { topic_counts: counts, total_analyzed: (data ?? []).length };
}

export async function clusterTopics(topicCounts) {
  const clusters = Object.entries(topicCounts).map(([label, count]) => ({ label, count, cluster_id: label.replace(/[^a-z0-9]/gi, '_').toLowerCase() }));
  if (clusters.length) await supabase.from(TOPIC_TABLE).upsert(clusters.map(c => ({ ...c, clustered_at: new Date().toISOString() })), { onConflict: 'cluster_id' });
  return { clusters };
}

export async function scoreTrends(clusters) {
  const { data: prior } = await supabase.from(TOPIC_TABLE).select('cluster_id, count').lt('clustered_at', new Date(Date.now() - 7 * 86400000).toISOString());
  const priorCounts = (prior ?? []).reduce((acc, r) => { acc[r.cluster_id] = r.count; return acc; }, {});
  return clusters.map(c => ({
    ...c,
    growth_rate: priorCounts[c.cluster_id] ? Math.round((c.count - priorCounts[c.cluster_id]) / priorCounts[c.cluster_id] * 100) : 100,
    strategic_impact: c.count > 20 ? 'high' : c.count > 5 ? 'medium' : 'low',
  })).sort((a, b) => b.count - a.count);
}

export function distinguishNoiseFromDemand(scoredTrends) {
  const persistent = scoredTrends.filter(t => t.count >= 5 && t.growth_rate > 0);
  const noise = scoredTrends.filter(t => t.count < 5 || t.growth_rate < 0);
  return { persistent_trends: persistent, noise, signal_count: persistent.length };
}

export async function mapToOffers(trends, existingOffers = []) {
  return trends.map(t => ({
    trend: t.label,
    mapped_offer: existingOffers.find(o => o.keywords?.includes(t.label)) ?? null,
    gap: !existingOffers.find(o => o.keywords?.includes(t.label)),
    roadmap_candidate: t.strategic_impact === 'high' && !existingOffers.find(o => o.keywords?.includes(t.label)),
  }));
}

export async function generateRecommendations(mappedTrends) {
  const gaps = mappedTrends.filter(t => t.gap);
  const candidates = mappedTrends.filter(t => t.roadmap_candidate);
  return { recommendations: candidates.map(c => ({ action: 'add_to_roadmap', topic: c.trend })), content_gaps: gaps.map(g => g.trend) };
}

export async function outputTrendBrief() {
  const { data } = await supabase.from(TOPIC_TABLE).select('*').order('count', { ascending: false }).limit(20);
  const rows = data ?? [];
  return { week_ending: new Date().toISOString().slice(0, 10), top_trends: rows.slice(0, 10), priority_ranked: rows.map((r, i) => ({ rank: i + 1, topic: r.label, count: r.count })), generated_at: new Date().toISOString() };
}
