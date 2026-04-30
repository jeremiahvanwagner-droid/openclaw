import { supabase } from '../../lib/agent-memory.js';

const TREND_TABLE = 'digital_market_trends';

export function defineNicheUniverse(seedKeywords) {
  const universe = seedKeywords.flatMap(kw => [kw, `${kw} course`, `${kw} template`, `${kw} for beginners`, `how to ${kw}`]);
  return { seed_keywords: seedKeywords, expanded_universe: universe, total: universe.length };
}

export async function collectSignals(niche, externalData = {}) {
  const { searchVolume = 0, socialMentions = 0, marketplaceListings = 0, forumPosts = 0, avgReviewCount = 0 } = externalData;
  const signals = { niche, search_volume: searchVolume, social_mentions: socialMentions, marketplace_listings: marketplaceListings, forum_posts: forumPosts, avg_review_count: avgReviewCount, collected_at: new Date().toISOString() };
  await supabase.from(TREND_TABLE).upsert(signals, { onConflict: 'niche' });
  return signals;
}

export function normalizeMetrics(signals) {
  const maxVol = 100000;
  const volumeScore = Math.min(100, (signals.search_volume / maxVol) * 100);
  const growthScore = signals.social_mentions > 1000 ? 80 : signals.social_mentions > 100 ? 50 : 20;
  const competitionDensity = signals.marketplace_listings > 500 ? 'high' : signals.marketplace_listings > 100 ? 'medium' : 'low';
  const intentQuality = signals.avg_review_count > 50 ? 'high' : 'medium';
  return { niche: signals.niche, volume_score: Math.round(volumeScore), growth_score: growthScore, competition_density: competitionDensity, intent_quality: intentQuality };
}

export function calculateOpportunityScore(normalized) {
  const competitionPenalty = normalized.competition_density === 'high' ? -20 : normalized.competition_density === 'medium' ? -5 : 10;
  const intentBonus = normalized.intent_quality === 'high' ? 15 : 0;
  return Math.max(0, Math.min(100, Math.round((normalized.volume_score + normalized.growth_score) / 2 + competitionPenalty + intentBonus)));
}

export function flagRiskConstraints(niche) {
  const risks = [];
  if (/cryptocurrency|forex|trading|investment/i.test(niche)) risks.push({ type: 'regulatory', note: 'Financial advice regulations apply — SEC/FTC compliance required' });
  if (/medical|cure|health|weight loss/i.test(niche)) risks.push({ type: 'health_claims', note: 'FTC health claim rules apply — disclaimers required' });
  if (/trademark|brand name/i.test(niche)) risks.push({ type: 'ip', note: 'Verify no trademark conflicts before publishing' });
  return { niche, risks, safe_to_proceed: risks.length === 0 };
}

export async function outputTrendReport(niches) {
  const scored = await Promise.all(niches.map(async (n) => {
    const { data } = await supabase.from(TREND_TABLE).select('*').eq('niche', n).single();
    if (!data) return { niche: n, opportunity_score: 0 };
    const normalized = normalizeMetrics(data);
    const score = calculateOpportunityScore(normalized);
    const risks = flagRiskConstraints(n);
    return { ...normalized, opportunity_score: score, risks: risks.risks, validation_experiment: `Create a $0 landing page for "${n}" and run $50 ad spend test for 7 days` };
  }));
  const ranked = scored.sort((a, b) => b.opportunity_score - a.opportunity_score);
  return { ranked_niches: ranked, top_recommendation: ranked[0], generated_at: new Date().toISOString() };
}
