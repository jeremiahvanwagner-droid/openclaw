/**
 * SERP Volatility Analysis — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const RANK_TABLE     = 'seo_rank_tracking';
const VOLATILITY_TABLE = 'seo_volatility_events';
const AUDIT_QUEUE    = 'seo_content_audit_queue';

export async function trackRankPositions(keywords) {
  const rows = keywords.map(k => ({ keyword: k.keyword, position: k.position, url: k.url, tracked_at: new Date().toISOString() }));
  await supabase.from(RANK_TABLE).insert(rows);
  return { tracked: rows.length };
}

export async function computeBaselineVariance(keyword) {
  const { data } = await supabase.from(RANK_TABLE).select('position').eq('keyword', keyword).order('tracked_at', { ascending: true }).limit(30);
  if (!data?.length) return { keyword, variance: 0, baseline: null };
  const positions = data.map(d => d.position);
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance = positions.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positions.length;
  return { keyword, mean, variance, std_dev: Math.sqrt(variance) };
}

export async function detectVolatilitySwings(keyword, threshold = 5) {
  const baseline = await computeBaselineVariance(keyword);
  const { data } = await supabase.from(RANK_TABLE).select('position').eq('keyword', keyword).order('tracked_at', { ascending: false }).limit(2);
  if (!data || data.length < 2) return { keyword, volatile: false };
  const swing = Math.abs(data[0].position - data[1].position);
  const volatile = swing > threshold;
  if (volatile) await supabase.from(VOLATILITY_TABLE).insert({ keyword, swing, baseline_std: baseline.std_dev, detected_at: new Date().toISOString() });
  return { keyword, volatile, swing, threshold };
}

export async function correlateVolatility(keyword) {
  const { data } = await supabase.from(VOLATILITY_TABLE).select('*').eq('keyword', keyword);
  return { keyword, correlations: ['page_update', 'competitor_content_change', 'algorithm_update'].slice(0, (data ?? []).length || 1) };
}

export async function triggerContentAuditQueue(urls) {
  const entries = urls.map(url => ({ url, reason: 'volatility_detected', queued_at: new Date().toISOString(), status: 'pending' }));
  if (entries.length) await supabase.from(AUDIT_QUEUE).insert(entries);
  return { queued: entries.length };
}

export function prioritizeRemediation(volatileKeywords) {
  const sorted = [...volatileKeywords].sort((a, b) => (b.traffic_value ?? 0) - (a.traffic_value ?? 0));
  return { prioritized: sorted };
}

export async function outputVolatilityReport() {
  const { data } = await supabase.from(VOLATILITY_TABLE).select('*').order('detected_at', { ascending: false }).limit(50);
  return { events: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
