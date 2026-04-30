import { supabase } from '../../lib/agent-memory.js';

const METRICS_TABLE = 'funnel_conversion_metrics';
const TEST_TABLE    = 'funnel_ab_tests';
const LEARNING_TABLE = 'funnel_test_learnings';

export async function baselineConversionMetrics(funnelId, stageData) {
  const rows = stageData.map(s => ({ funnel_id: funnelId, ...s, device_breakdown: s.device_breakdown ?? {}, recorded_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(METRICS_TABLE).insert(rows);
  const worstStage = stageData.sort((a, b) => (a.conversion_rate ?? 0) - (b.conversion_rate ?? 0))[0];
  return { funnel_id: funnelId, baseline_recorded: rows.length, worst_stage: worstStage?.stage_name ?? null };
}

export async function identifyTopFrictionElement(funnelId) {
  const { data } = await supabase.from(METRICS_TABLE).select('*').eq('funnel_id', funnelId).order('conversion_rate');
  const worst = (data ?? [])[0];
  return { funnel_id: funnelId, friction_element: worst?.stage_name ?? 'headline', drop_off_rate: worst?.drop_off_rate ?? 0 };
}

export function proposeABHypotheses(frictionElement, stage) {
  const hypothesisMap = {
    headline: [{ variable: 'headline', control: 'Current headline', variant: 'Outcome-focused headline with number', expected_lift: '5-15%' }],
    cta:      [{ variable: 'cta_text', control: 'Current CTA', variant: 'Action verb + benefit CTA', expected_lift: '3-8%' }],
    form:     [{ variable: 'form_length', control: '5 fields', variant: '2 fields only', expected_lift: '10-20%' }],
    layout:   [{ variable: 'layout', control: 'Two column', variant: 'Single column', expected_lift: '4-10%' }],
    social_proof: [{ variable: 'testimonial_placement', control: 'Bottom of page', variant: 'Above fold', expected_lift: '5-12%' }],
  };
  return hypothesisMap[frictionElement] ?? hypothesisMap.headline;
}

export async function setupTest(funnelId, hypothesis, targetSampleSize = 1000) {
  const test = { funnel_id: funnelId, variable: hypothesis.variable, control: hypothesis.control, variant: hypothesis.variant, target_sample: targetSampleSize, confidence_threshold: 0.95, status: 'running', started_at: new Date().toISOString() };
  const { data } = await supabase.from(TEST_TABLE).insert(test).select('id').single();
  return { test_id: data?.id, ...test };
}

export function evaluateStatisticalConfidence(controlRate, variantRate, sampleSize) {
  const pooled = (controlRate + variantRate) / 2;
  const se = Math.sqrt(2 * pooled * (1 - pooled) / sampleSize);
  const z = Math.abs(variantRate - controlRate) / se;
  const confidence = z > 2.576 ? 0.99 : z > 1.96 ? 0.95 : z > 1.645 ? 0.90 : z > 1.28 ? 0.80 : 0.70;
  const lift = controlRate > 0 ? Math.round((variantRate - controlRate) / controlRate * 100) : 0;
  return { confidence, lift_pct: lift, significant: confidence >= 0.95, z_score: Math.round(z * 100) / 100 };
}

export async function promoteWinner(testId, winner) {
  await supabase.from(TEST_TABLE).update({ status: 'completed', winner, completed_at: new Date().toISOString() }).eq('id', testId);
  return { test_id: testId, promoted: winner };
}

export async function outputTestLearnings(funnelId) {
  const { data } = await supabase.from(TEST_TABLE).select('*').eq('funnel_id', funnelId).eq('status', 'completed');
  const tests = data ?? [];
  await supabase.from(LEARNING_TABLE).insert(tests.map(t => ({ funnel_id: funnelId, test_id: t.id, learning: `${t.variable}: ${t.winner} won`, recorded_at: new Date().toISOString() })));
  return { funnel_id: funnelId, tests_completed: tests.length, learnings: tests.map(t => ({ variable: t.variable, winner: t.winner })), generated_at: new Date().toISOString() };
}
