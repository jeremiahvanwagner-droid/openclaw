import { supabase } from '../../lib/agent-memory.js';

const TEST_TABLE = 'split_test_results';

const CHI_SQUARED_CRITICAL = { 0.90: 2.706, 0.95: 3.841, 0.99: 6.635 };

export function calculateChiSquared(variants) {
  const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);
  const totalVisitors   = variants.reduce((s, v) => s + v.visitors, 0);
  if (totalVisitors === 0) return 0;
  const expectedRate = totalConversions / totalVisitors;
  let chi2 = 0;
  for (const v of variants) {
    const eConv = v.visitors * expectedRate;
    const eNoConv = v.visitors * (1 - expectedRate);
    if (eConv > 0) chi2 += (v.conversions - eConv) ** 2 / eConv;
    if (eNoConv > 0) chi2 += ((v.visitors - v.conversions) - eNoConv) ** 2 / eNoConv;
  }
  return Math.round(chi2 * 10000) / 10000;
}

export async function analyzeTest(locationId, funnelId, variantData, options = {}) {
  const { minSampleSize = 100, confidenceLevel = 0.95, autoDeclare = false } = options;
  const variants = variantData.map(v => ({ ...v, conversion_rate: v.visitors > 0 ? Math.round(v.conversions / v.visitors * 10000) / 100 : 0 }));

  if (variants.some(v => v.visitors < minSampleSize)) {
    return { funnel_id: funnelId, test_status: 'insufficient_data', variants, statistics: null, recommendation: 'continue', estimated_days_remaining: null, auto_declared: false, analyzed_at: new Date().toISOString() };
  }

  const asymmetric = Math.max(...variants.map(v => v.visitors)) / Math.min(...variants.map(v => v.visitors)) > 3;
  const chiSquared = calculateChiSquared(variants);
  const criticalValue = CHI_SQUARED_CRITICAL[confidenceLevel] ?? 3.841;
  const isSignificant = chiSquared > criticalValue;
  const winner = variants.sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
  const control = variants[0];
  const relativeImprovement = control.conversion_rate > 0 ? Math.round((winner.conversion_rate - control.conversion_rate) / control.conversion_rate * 100) : 0;

  const recommendation = !isSignificant ? 'continue' : 'declare_winner';
  const strength = isSignificant && relativeImprovement > 20 ? 'strong' : isSignificant ? 'marginal' : 'none';
  const totalConvRate = variants.reduce((s, v) => s + v.conversions, 0) / variants.reduce((s, v) => s + v.visitors, 0);
  const dailyVisitors = Math.max(...variants.map(v => v.visitors)) / 14;
  const estimatedDaysRemaining = !isSignificant && dailyVisitors > 0 ? Math.ceil((minSampleSize * 2 - variants.reduce((s, v) => s + v.visitors, 0)) / dailyVisitors) : 0;

  const flaggedVariants = isSignificant ? variants.map(v => ({ ...v, is_winner: v.variant_id === winner.variant_id })) : variants.map(v => ({ ...v, is_winner: false }));
  if (autoDeclare && isSignificant) await supabase.from('funnel_routing').upsert({ funnel_id: funnelId, winner_variant: winner.variant_id, updated_at: new Date().toISOString() }, { onConflict: 'funnel_id' });

  const result = { funnel_id: funnelId, test_status: isSignificant ? 'significant' : 'not_significant', variants: flaggedVariants, statistics: { chi_squared: chiSquared, confidence: confidenceLevel, is_significant: isSignificant, relative_improvement: `${relativeImprovement}%`, asymmetric_sample: asymmetric }, recommendation, recommendation_strength: strength, estimated_days_remaining: estimatedDaysRemaining, auto_declared: autoDeclare && isSignificant, analyzed_at: new Date().toISOString() };
  await supabase.from(TEST_TABLE).insert({ location_id: locationId, ...result });
  return result;
}

export async function getTestHistory(funnelId, limit = 10) {
  const { data } = await supabase.from(TEST_TABLE).select('test_status, recommendation, analyzed_at').eq('funnel_id', funnelId).order('analyzed_at', { ascending: false }).limit(limit);
  return { funnel_id: funnelId, history: data ?? [] };
}
