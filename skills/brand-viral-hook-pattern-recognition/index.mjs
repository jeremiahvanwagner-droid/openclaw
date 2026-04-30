/**
 * Viral Hook Pattern Recognition — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const HOOK_TABLE    = 'brand_hook_library';
const PERF_TABLE    = 'brand_post_performance';

const HOOK_PATTERNS = [
  { pattern: /stop .{5,30} (if|when|unless)/i, type: 'warning_hook' },
  { pattern: /i (made|earned|lost|gained) .{3,20} (in|from|by)/i, type: 'proof_hook' },
  { pattern: /nobody talks about/i, type: 'secret_hook' },
  { pattern: /(here's|this is) (how|why|what)/i, type: 'reveal_hook' },
  { pattern: /\d+ (ways|tips|things|reasons|mistakes)/i, type: 'list_hook' },
  { pattern: /most .{3,20} (don't|never|won't)/i, type: 'contrarian_hook' },
];

export async function collectHistoricalPerformance(creatorId, posts) {
  const rows = posts.map(p => ({ creator_id: creatorId, post_id: p.id, hook: p.opening_line ?? p.text?.slice(0, 100), engagement: p.engagement ?? 0, captured_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(PERF_TABLE).insert(rows);
  return { ingested: rows.length };
}

export async function extractHookStructures(posts) {
  const extracted = posts.map(p => {
    const hook_text = p.opening_line ?? p.text?.slice(0, 100) ?? '';
    const matched = HOOK_PATTERNS.find(hp => hp.pattern.test(hook_text));
    return { post_id: p.id, hook_text, hook_type: matched?.type ?? 'generic', engagement: p.engagement ?? 0 };
  });
  return { extracted };
}

export function clusterHooks(hooks) {
  const clusters = {};
  for (const h of hooks) {
    if (!clusters[h.hook_type]) clusters[h.hook_type] = { type: h.hook_type, hooks: [], avg_engagement: 0 };
    clusters[h.hook_type].hooks.push(h);
  }
  for (const c of Object.values(clusters)) {
    c.avg_engagement = c.hooks.reduce((a, h) => a + (h.engagement ?? 0), 0) / c.hooks.length;
  }
  return { clusters: Object.values(clusters).sort((a, b) => b.avg_engagement - a.avg_engagement) };
}

export function generateHookVariants(topHookType, brandTopic, count = 5) {
  const templates = {
    warning_hook: (t) => `Stop doing this ${t} strategy (if you want results)`,
    proof_hook: (t) => `I grew my ${t} audience by 10x in 90 days — here's how`,
    reveal_hook: (t) => `Here's the ${t} truth nobody is telling you`,
    list_hook: (t) => `5 ${t} mistakes killing your growth right now`,
    contrarian_hook: (t) => `Most ${t} creators never figure this out`,
  };
  const fn = templates[topHookType] ?? templates.reveal_hook;
  return Array.from({ length: count }, (_, i) => ({ variant: i + 1, hook: fn(brandTopic), type: topHookType }));
}

export function filterForBrandFit(variants, brandGuidelines) {
  return variants.filter(v => !/(scam|fake|guaranteed)/i.test(v.hook));
}

export async function outputHookLibrary(creatorId, variants) {
  const rows = variants.map(v => ({ creator_id: creatorId, ...v, added_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(HOOK_TABLE).insert(rows);
  return { creator_id: creatorId, hook_count: variants.length, generated_at: new Date().toISOString() };
}
