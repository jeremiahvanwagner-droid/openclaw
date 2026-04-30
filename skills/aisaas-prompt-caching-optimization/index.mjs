/**
 * Prompt Caching Optimization — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CACHE_TABLE   = 'aisaas_prompt_cache';
const METRICS_TABLE = 'aisaas_cache_metrics';

export function identifyCacheableSegments(prompt) {
  const lines = prompt.split('\n');
  const staticLines = lines.filter(l => !l.includes('{{') && l.trim().length > 0);
  const dynamicLines = lines.filter(l => l.includes('{{'));
  return { total_lines: lines.length, static_count: staticLines.length, dynamic_count: dynamicLines.length, static_ratio: staticLines.length / lines.length };
}

export function separateStaticFromDynamic(prompt) {
  const staticParts = [];
  const dynamicParts = [];
  for (const line of prompt.split('\n')) {
    if (line.includes('{{')) dynamicParts.push(line);
    else if (line.trim()) staticParts.push(line);
  }
  return { static_context: staticParts.join('\n'), dynamic_inputs: dynamicParts };
}

export function generateCacheKey(staticContext, version = 'v1') {
  const hash = Array.from(staticContext).reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);
  return `cache:${version}:${Math.abs(hash).toString(16)}`;
}

export async function applyCachingRules(cacheKey, content, ttlSeconds = 3600) {
  const entry = { cache_key: cacheKey, content, ttl_seconds: ttlSeconds, created_at: new Date().toISOString(), hit_count: 0 };
  await supabase.from(CACHE_TABLE).upsert(entry, { onConflict: 'cache_key' });
  return { cache_key: cacheKey, ttl_seconds: ttlSeconds };
}

export async function routeCacheHit(cacheKey) {
  const { data } = await supabase.from(CACHE_TABLE).select('content, hit_count, created_at, ttl_seconds').eq('cache_key', cacheKey).single();
  if (!data) return { hit: false };
  const age = (Date.now() - new Date(data.created_at).getTime()) / 1000;
  if (age > data.ttl_seconds) return { hit: false, expired: true };
  await supabase.from(CACHE_TABLE).update({ hit_count: (data.hit_count ?? 0) + 1 }).eq('cache_key', cacheKey);
  return { hit: true, content: data.content };
}

export async function trackCacheMetrics(endpoint, hit, latencyMs, costSaved) {
  await supabase.from(METRICS_TABLE).insert({ endpoint, hit, latency_ms: latencyMs, cost_saved: costSaved, recorded_at: new Date().toISOString() });
  return { tracked: true };
}

export async function outputCacheTuningRecommendations() {
  const { data } = await supabase.from(METRICS_TABLE).select('endpoint, hit').order('recorded_at', { ascending: false }).limit(500);
  const byEndpoint = {};
  for (const m of (data ?? [])) {
    if (!byEndpoint[m.endpoint]) byEndpoint[m.endpoint] = { hits: 0, misses: 0 };
    if (m.hit) byEndpoint[m.endpoint].hits++; else byEndpoint[m.endpoint].misses++;
  }
  const recs = Object.entries(byEndpoint).map(([ep, stats]) => ({
    endpoint: ep,
    hit_rate: stats.hits / (stats.hits + stats.misses),
    recommendation: stats.hits / (stats.hits + stats.misses) < 0.5 ? 'increase_ttl_or_expand_static_context' : 'cache_is_performing_well',
  }));
  return { recommendations: recs, generated_at: new Date().toISOString() };
}
