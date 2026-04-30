/**
 * Competitor Campaign Synthesis — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CAMPAIGN_TABLE = 'brand_competitor_campaigns';
const BACKLOG_TABLE  = 'brand_monetization_backlog';

export async function monitorCompetitorCampaigns(competitors) {
  const rows = competitors.map(c => ({ competitor: c.name, launches: c.launches ?? [], partnerships: c.partnerships ?? [], monitored_at: new Date().toISOString() }));
  await supabase.from(CAMPAIGN_TABLE).upsert(rows, { onConflict: 'competitor' });
  return { monitored: rows.length };
}

export async function extractCampaignMechanics(competitor) {
  const { data } = await supabase.from(CAMPAIGN_TABLE).select('*').eq('competitor', competitor).single();
  return { competitor, mechanics: { launches: data?.launches ?? [], partnerships: data?.partnerships ?? [], monetization_structures: [] } };
}

export function compareToOwnBrand(mechanics, ownBrandProfile) {
  const transferable = mechanics.launches?.filter(l => !ownBrandProfile.existing_offers?.includes(l.type)) ?? [];
  return { transferable_tactics: transferable, positioning_gaps: [] };
}

export async function identifyWhiteSpaceOpportunities(competitors) {
  const opportunities = competitors.map(c => ({ opportunity: `Gap vs ${c}: unexplored content/offer type`, competitor: c, priority: 'medium' }));
  return { opportunities };
}

export function rankExperiments(opportunities) {
  return opportunities.map(o => ({ ...o, impact: 'medium', effort: 'low', risk: 'low', rank_score: 7 })).sort((a, b) => b.rank_score - a.rank_score);
}

export async function draftTestBriefs(experiments) {
  const briefs = experiments.slice(0, 5).map(e => ({ title: e.opportunity, hypothesis: `Testing ${e.opportunity} will increase revenue by 10%`, success_criteria: 'CTR > 3% or revenue_delta > $500', duration_days: 14 }));
  return { briefs };
}

export async function outputMonetizationBacklog(experiments) {
  await supabase.from(BACKLOG_TABLE).insert(experiments.map(e => ({ ...e, created_at: new Date().toISOString() })));
  return { backlog: experiments, count: experiments.length };
}
