/**
 * Dynamic Sponsorship Pricing — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PRICING_TABLE = 'brand_sponsorship_pricing';
const DEAL_TABLE    = 'brand_sponsorship_deals';

export async function gatherAudienceMetrics(creatorId) {
  const { data } = await supabase.from('brand_audience_metrics').select('*').eq('creator_id', creatorId).single();
  return { creator_id: creatorId, metrics: data ?? { followers: 0, engagement_rate: 0.02, avg_views: 0 } };
}

export async function benchmarkPricing(creatorId, niche) {
  const { data } = await supabase.from(PRICING_TABLE).select('*').eq('niche', niche).order('created_at', { ascending: false }).limit(10);
  const benchmarks = data ?? [];
  const avg_cpm = benchmarks.length ? benchmarks.reduce((a, b) => a + (b.cpm ?? 0), 0) / benchmarks.length : 25;
  return { niche, benchmark_cpm: avg_cpm, comparable_deals: benchmarks.length };
}

export function modelValueContribution(metrics, deliverables) {
  const base_value = metrics.avg_views * 0.025;
  return deliverables.map(d => ({
    deliverable: d.type,
    estimated_value: Math.round(base_value * (d.multiplier ?? 1)),
    impressions_estimate: Math.round(metrics.avg_views * (d.reach_factor ?? 1)),
  }));
}

export function calculatePriceBands(valueModels, metrics) {
  const total_value = valueModels.reduce((a, v) => a + v.estimated_value, 0);
  return {
    floor: Math.round(total_value * 0.7),
    midpoint: Math.round(total_value),
    ceiling: Math.round(total_value * 1.5),
    exclusivity_premium: Math.round(total_value * 0.3),
  };
}

export function adjustForDemand(priceBands, demandSignals) {
  const multiplier = demandSignals.high_season ? 1.25 : demandSignals.low_demand ? 0.85 : 1.0;
  return { ...Object.fromEntries(Object.entries(priceBands).map(([k, v]) => [k, Math.round(v * multiplier)])), demand_multiplier: multiplier };
}

export function generateNegotiationRationale(priceBands, metrics) {
  return {
    opening_ask: priceBands.ceiling,
    walk_away_floor: priceBands.floor,
    justification: `Based on ${metrics.avg_views?.toLocaleString()} avg views, ${(metrics.engagement_rate * 100).toFixed(1)}% engagement, and niche benchmarks.`,
    concession_room: priceBands.ceiling - priceBands.midpoint,
  };
}

export async function outputPricingMatrix(creatorId, priceBands) {
  await supabase.from(PRICING_TABLE).insert({ creator_id: creatorId, ...priceBands, created_at: new Date().toISOString() });
  return { creator_id: creatorId, pricing: priceBands, generated_at: new Date().toISOString() };
}
