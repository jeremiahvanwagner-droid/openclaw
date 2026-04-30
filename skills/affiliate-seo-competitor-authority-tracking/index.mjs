/**
 * Competitor Authority Tracking — Core Logic
 * Affiliate SEO Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const COMPETITOR_TABLE = 'seo_competitor_authority';
const BRIEF_TABLE      = 'seo_competitive_briefs';

export async function defineCompetitorSet(competitors) {
  const rows = competitors.map(c => ({ domain: c.domain, signals: c.signals ?? [], added_at: new Date().toISOString() }));
  await supabase.from(COMPETITOR_TABLE).upsert(rows, { onConflict: 'domain' });
  return { registered: competitors.length };
}

export async function trackAuthorityMetrics(domain) {
  const { data } = await supabase.from(COMPETITOR_TABLE).select('*').eq('domain', domain).single();
  return { domain, metrics: data ?? { domain, domain_authority: 0, link_growth: 0, ranking_footprint: 0 } };
}

export async function detectStrategyShifts(domain) {
  const { data } = await supabase.from(COMPETITOR_TABLE).select('*').eq('domain', domain).single();
  const shifts = [];
  if (data?.link_velocity > 50) shifts.push('Significant link acquisition burst detected');
  if (data?.new_content_clusters?.length > 5) shifts.push('New content cluster expansion observed');
  return { domain, shifts, detected_at: new Date().toISOString() };
}

export async function compareVisibilityMovement(domain, ownedDomain) {
  const { data: comp } = await supabase.from(COMPETITOR_TABLE).select('*').eq('domain', domain).single();
  const { data: owned } = await supabase.from(COMPETITOR_TABLE).select('*').eq('domain', ownedDomain).single();
  const delta = (comp?.domain_authority ?? 0) - (owned?.domain_authority ?? 0);
  return { competitor: domain, owned: ownedDomain, authority_delta: delta, competitor_leads: delta > 0 };
}

export async function identifyWhiteSpaceOpportunities(competitorDomains, ownedDomain) {
  const opportunities = competitorDomains.map(d => ({
    gap_domain: d,
    opportunity: `Content cluster not covered vs ${d}`,
    priority: 'medium',
  }));
  return { opportunities };
}

export function recommendResponses(shifts) {
  const recommendations = shifts.map(s => `Address: ${s} — Increase content production and link outreach in this area.`);
  return { recommendations };
}

export async function outputCompetitiveLandscapeBrief(ownedDomain) {
  const { data } = await supabase.from(COMPETITOR_TABLE).select('*').order('domain_authority', { ascending: false }).limit(20);
  const brief = { competitors: data ?? [], owned_domain: ownedDomain, generated_at: new Date().toISOString() };
  await supabase.from(BRIEF_TABLE).insert(brief);
  return { brief };
}
