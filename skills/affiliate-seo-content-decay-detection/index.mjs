/**
 * Content Decay Detection — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PERFORMANCE_TABLE = 'seo_url_performance';
const DECAY_TABLE       = 'seo_content_decay';
const REFRESH_TABLE     = 'seo_refresh_backlog';

export async function monitorPerformanceTrends(urls) {
  const rows = urls.map(u => ({ url: u.url, rank: u.rank, traffic: u.traffic, ctr: u.ctr, conversions: u.conversions, captured_at: new Date().toISOString() }));
  await supabase.from(PERFORMANCE_TABLE).insert(rows);
  return { monitored: urls.length };
}

export async function detectSustainedDecline(url, baselineWindowDays = 90) {
  const { data } = await supabase.from(PERFORMANCE_TABLE).select('*').eq('url', url).order('captured_at', { ascending: true });
  if (!data || data.length < 2) return { url, decaying: false, reason: 'insufficient_data' };
  const latest = data[data.length - 1];
  const baseline = data[0];
  const decaying = (latest.traffic ?? 0) < (baseline.traffic ?? 0) * 0.8;
  if (decaying) await supabase.from(DECAY_TABLE).upsert({ url, detected_at: new Date().toISOString(), severity: 'moderate' }, { onConflict: 'url' });
  return { url, decaying, traffic_delta_pct: Math.round(((latest.traffic - baseline.traffic) / (baseline.traffic || 1)) * 100) };
}

export async function attributeDecayCauses(url) {
  const causes = ['outdated_facts', 'weak_intent_match', 'stale_serp_features', 'lost_backlinks'];
  return { url, likely_causes: causes.slice(0, 2) };
}

export async function selectRefreshScope(decayedUrls) {
  const scoped = decayedUrls.map(u => ({ url: u.url, scope: 'partial', sections_to_update: ['intro', 'stats', 'conclusion'] }));
  return { scoped };
}

export async function draftRefreshContent(url, sections) {
  const drafts = sections.map(section => ({
    url,
    section,
    draft_placeholder: `[REFRESH NEEDED: Update ${section} with current data and improved intent alignment]`,
  }));
  return { drafts };
}

export async function queueRefreshUpdates(url, changes) {
  const entry = { url, changes, queued_at: new Date().toISOString(), status: 'pending' };
  await supabase.from(REFRESH_TABLE).upsert(entry, { onConflict: 'url' });
  return { queued: true, url };
}

export async function outputRefreshBacklog() {
  const { data } = await supabase.from(REFRESH_TABLE).select('*').eq('status', 'pending').order('queued_at', { ascending: true });
  return { backlog: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
