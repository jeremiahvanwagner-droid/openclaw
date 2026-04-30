/**
 * Growth Trend Extrapolation — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const TREND_TABLE    = 'brand_growth_trends';
const FORECAST_TABLE = 'brand_forecasts';

export async function compileTrendData(creatorId, lookbackMonths = 12) {
  const { data } = await supabase.from(TREND_TABLE).select('*').eq('creator_id', creatorId).order('month', { ascending: true }).limit(lookbackMonths);
  return { creator_id: creatorId, data_points: data ?? [], months: (data ?? []).length };
}

export function modelGrowthScenarios(dataPoints) {
  const values = dataPoints.map(d => d.audience_size ?? 0);
  const avg_growth = values.length > 1 ? (values[values.length - 1] - values[0]) / values.length : 0;
  return {
    conservative: { monthly_growth: avg_growth * 0.5, 12_month_projection: (values[values.length - 1] ?? 0) + avg_growth * 6 },
    base: { monthly_growth: avg_growth, 12_month_projection: (values[values.length - 1] ?? 0) + avg_growth * 12 },
    aggressive: { monthly_growth: avg_growth * 2, 12_month_projection: (values[values.length - 1] ?? 0) + avg_growth * 24 },
  };
}

export function estimateMonetizationCapacity(scenarios, revenuePerFollower = 0.01) {
  return Object.fromEntries(Object.entries(scenarios).map(([s, v]) => [s, { ...v, monthly_revenue_potential: Math.round(v['12_month_projection'] * revenuePerFollower) }]));
}

export function projectSponsorshipValues(scenarios, currentCPM = 25) {
  return Object.fromEntries(Object.entries(scenarios).map(([s, v]) => [s, {
    ...v,
    sponsorship_range: { low: Math.round(currentCPM * 0.8), high: Math.round(currentCPM * 1.5) },
  }]));
}

export function highlightConfidenceBounds(scenarios) {
  return { conservative_confidence: 0.9, base_confidence: 0.7, aggressive_confidence: 0.4, risk_factors: ['algorithm_changes', 'market_saturation', 'content_quality_drift'] };
}

export function recommendTargetRanges(scenarios) {
  return {
    audience_target: scenarios.base['12_month_projection'],
    revenue_target: scenarios.base.monthly_revenue_potential,
    negotiation_guidance: `Open deals at aggressive scenario values, accept at base scenario minimums.`,
  };
}

export async function outputForecastReport(creatorId, scenarios) {
  const forecast = { creator_id: creatorId, scenarios, generated_at: new Date().toISOString() };
  await supabase.from(FORECAST_TABLE).insert(forecast);
  return { forecast };
}
