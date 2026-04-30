/**
 * Backlink Prospecting — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PROSPECT_TABLE = 'seo_backlink_prospects';
const PIPELINE_TABLE = 'seo_outreach_pipeline';

export async function defineTargetPages(pages) {
  const { error } = await supabase.from(PROSPECT_TABLE).upsert(
    pages.map(p => ({ page_url: p.url, topical_goal: p.goal, registered_at: new Date().toISOString() })),
    { onConflict: 'page_url' }
  );
  return { registered: error ? 0 : pages.length };
}

export async function identifyProspectDomains(targetPageUrl, limit = 50) {
  const { data } = await supabase.from(PROSPECT_TABLE).select('*').eq('page_url', targetPageUrl).limit(limit);
  return { prospects: data ?? [], found: (data ?? []).length };
}

export async function scoreProspects(prospects) {
  const scored = prospects.map(p => ({
    ...p,
    score: Math.round(
      (p.domain_authority ?? 20) * 0.4 +
      (p.relevance ?? 50) * 0.4 +
      (p.outreach_likelihood ?? 30) * 0.2
    ),
  })).sort((a, b) => b.score - a.score);
  return { scored };
}

export async function excludeRiskyTargets(prospects) {
  const safe = prospects.filter(p => !p.is_spammy && !p.is_penalized && (p.domain_authority ?? 20) > 10);
  const excluded = prospects.length - safe.length;
  return { safe, excluded };
}

export async function generateOutreachList(prospects) {
  const outreach = prospects.map(p => ({
    domain: p.domain,
    contact_url: `https://${p.domain}/contact`,
    partnership_type: p.score > 70 ? 'editorial' : 'resource',
    notes: p.topical_goal ?? '',
    created_at: new Date().toISOString(),
  }));
  if (outreach.length) await supabase.from(PIPELINE_TABLE).insert(outreach);
  return { outreach, count: outreach.length };
}

export function segmentByPartnershipType(prospects) {
  const segments = { editorial: [], resource: [], guest_post: [], sponsorship: [] };
  for (const p of prospects) {
    const type = p.partnership_type ?? (p.score > 70 ? 'editorial' : 'resource');
    (segments[type] ?? segments.resource).push(p);
  }
  return { segments };
}

export async function outputOutreachPipeline(targetPageUrl) {
  const { data } = await supabase.from(PIPELINE_TABLE).select('*').order('created_at', { ascending: false });
  return { pipeline: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
