/**
 * Experiment Engine — Core Logic
 * OpenClaw Phase 3 Execution Skill
 *
 * A/B testing with Z-score + chi-squared significance,
 * deterministic hash-based variant assignment, and auto-promotion.
 */

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── Supabase client ────────────────────────────────────────────

function supabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ── Statistical Functions ──────────────────────────────────────

/**
 * Z-score for two-proportion test.
 * H0: p1 = p2 (no difference between variants)
 */
function zScoreTwoProportions(conversionsA, sampleA, conversionsB, sampleB) {
  if (sampleA === 0 || sampleB === 0) return 0;
  const pA = conversionsA / sampleA;
  const pB = conversionsB / sampleB;
  const pPooled = (conversionsA + conversionsB) / (sampleA + sampleB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / sampleA + 1 / sampleB));
  if (se === 0) return 0;
  return (pA - pB) / se;
}

/**
 * Chi-squared test for independence (2×2 contingency table).
 */
function chiSquared(conversionsA, sampleA, conversionsB, sampleB) {
  const noConvA = sampleA - conversionsA;
  const noConvB = sampleB - conversionsB;
  const total = sampleA + sampleB;
  const totalConv = conversionsA + conversionsB;
  const totalNoConv = noConvA + noConvB;

  if (total === 0 || totalConv === 0 || totalNoConv === 0) return 0;

  const cells = [
    { observed: conversionsA, expected: (sampleA * totalConv) / total },
    { observed: noConvA, expected: (sampleA * totalNoConv) / total },
    { observed: conversionsB, expected: (sampleB * totalConv) / total },
    { observed: noConvB, expected: (sampleB * totalNoConv) / total },
  ];

  return cells.reduce((sum, c) => {
    if (c.expected === 0) return sum;
    return sum + Math.pow(c.observed - c.expected, 2) / c.expected;
  }, 0);
}

/**
 * Map z-score to significance level.
 */
function significanceLevel(zScore) {
  const absZ = Math.abs(zScore);
  if (absZ >= 2.576) return 'highly_significant'; // p < 0.01
  if (absZ >= 1.960) return 'significant';         // p < 0.05
  if (absZ >= 1.645) return 'trending';             // p < 0.10
  return 'inconclusive';
}

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new A/B experiment.
 */
export async function createExperiment(config) {
  if (!config.business_id) throw new Error('business_id is required');
  if (!config.name) throw new Error('Experiment name is required');
  if (!config.type) throw new Error('Experiment type is required (offer, copy, page, automation, prompt)');
  if (!config.success_metric) throw new Error('success_metric is required');

  const variants = config.variants || ['A', 'B'];
  const trafficSplit = config.traffic_split || Object.fromEntries(
    variants.map(v => [v, Math.floor(100 / variants.length)])
  );

  const db = supabase();
  const { data, error } = await db.from('experiments').insert({
    business_id: config.business_id,
    type: config.type,
    name: config.name,
    variants_json: variants.map(v => ({
      id: v,
      label: config.variant_labels?.[v] || `Variant ${v}`,
      config: config.variant_configs?.[v] || {},
    })),
    traffic_split: trafficSplit,
    success_metric: config.success_metric,
    min_sample: config.min_sample || 100,
    max_duration_days: config.max_duration_days || 30,
    status: 'active',
  }).select('*').single();

  if (error) throw new Error(`Failed to create experiment: ${error.message}`);
  return data;
}

/**
 * Deterministic variant assignment via hash.
 * Same subject always gets the same variant for a given experiment.
 */
export async function assignVariant(experimentId, subjectId) {
  const db = supabase();

  // Check for existing assignment
  const { data: existing } = await db.from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId)
    .eq('subject_id', subjectId)
    .single();

  if (existing) return existing.variant;

  // Load experiment to get traffic split
  const { data: experiment } = await db.from('experiments')
    .select('traffic_split, status')
    .eq('id', experimentId)
    .single();

  if (!experiment || experiment.status !== 'active') {
    throw new Error(`Experiment ${experimentId} is not active`);
  }

  // Deterministic hash-based assignment
  const hash = createHash('sha256')
    .update(`${experimentId}:${subjectId}`)
    .digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  const bucket = hashInt % 100;

  const split = experiment.traffic_split;
  const variants = Object.keys(split);
  let cumulative = 0;
  let assignedVariant = variants[variants.length - 1]; // fallback

  for (const variant of variants) {
    cumulative += split[variant];
    if (bucket < cumulative) {
      assignedVariant = variant;
      break;
    }
  }

  // Store assignment
  await db.from('experiment_assignments').insert({
    experiment_id: experimentId,
    subject_id: subjectId,
    variant: assignedVariant,
  });

  return assignedVariant;
}

/**
 * Record a conversion event for a subject.
 */
export async function recordConversion(experimentId, subjectId, metric, value = 1) {
  const db = supabase();

  // Look up assigned variant
  const { data: assignment } = await db.from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId)
    .eq('subject_id', subjectId)
    .single();

  if (!assignment) throw new Error(`No variant assignment found for subject ${subjectId} in experiment ${experimentId}`);

  const { error } = await db.from('experiment_conversions').insert({
    experiment_id: experimentId,
    subject_id: subjectId,
    variant: assignment.variant,
    metric,
    value,
  });

  if (error) throw new Error(`Failed to record conversion: ${error.message}`);

  return { experiment_id: experimentId, subject_id: subjectId, variant: assignment.variant, metric, value };
}

/**
 * Evaluate statistical significance of an experiment.
 */
export async function evaluateSignificance(experimentId) {
  const db = supabase();

  // Load experiment config
  const { data: experiment } = await db.from('experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

  // Count assignments per variant
  const { data: assignments } = await db.from('experiment_assignments')
    .select('variant')
    .eq('experiment_id', experimentId);

  // Count conversions per variant
  const { data: conversions } = await db.from('experiment_conversions')
    .select('variant, value')
    .eq('experiment_id', experimentId)
    .eq('metric', experiment.success_metric);

  const variants = Object.keys(experiment.traffic_split);
  const stats = {};

  for (const v of variants) {
    const vAssignments = (assignments || []).filter(a => a.variant === v).length;
    const vConversions = (conversions || []).filter(c => c.variant === v);
    const convCount = vConversions.length;
    const totalValue = vConversions.reduce((sum, c) => sum + (c.value || 1), 0);

    stats[v] = {
      sample_size: vAssignments,
      conversions: convCount,
      conversion_rate: vAssignments > 0 ? convCount / vAssignments : 0,
      total_value: totalValue,
      avg_value: convCount > 0 ? totalValue / convCount : 0,
    };
  }

  // Calculate significance (A vs B comparison for now)
  const [varA, varB] = variants;
  const sA = stats[varA] || { sample_size: 0, conversions: 0 };
  const sB = stats[varB] || { sample_size: 0, conversions: 0 };

  const zScore = zScoreTwoProportions(sA.conversions, sA.sample_size, sB.conversions, sB.sample_size);
  const chiSq = chiSquared(sA.conversions, sA.sample_size, sB.conversions, sB.sample_size);
  const sig = significanceLevel(zScore);

  const totalSample = Object.values(stats).reduce((s, v) => s + v.sample_size, 0);
  const minReached = totalSample >= experiment.min_sample;

  // Determine winner
  let winnerVariant = null;
  if (sig === 'significant' || sig === 'highly_significant') {
    winnerVariant = sA.conversion_rate > sB.conversion_rate ? varA : varB;
  }

  // Upsert result
  await db.from('experiment_results').upsert({
    experiment_id: experimentId,
    variant_stats_json: stats,
    significance: sig,
    winner_variant: winnerVariant,
  }, { onConflict: 'experiment_id' });

  // Update experiment status if significant
  if ((sig === 'significant' || sig === 'highly_significant') && minReached) {
    await db.from('experiments').update({ status: 'significant' }).eq('id', experimentId);
  }

  return {
    experiment_id: experimentId,
    variant_stats: stats,
    z_score: zScore,
    chi_squared: chiSq,
    significance: sig,
    winner_variant: winnerVariant,
    min_sample_reached: minReached,
    total_sample: totalSample,
  };
}

/**
 * Auto-promote the winning variant to production.
 */
export async function autoPromoteWinner(experimentId) {
  const db = supabase();

  const { data: result } = await db.from('experiment_results')
    .select('*')
    .eq('experiment_id', experimentId)
    .single();

  if (!result) throw new Error(`No results found for experiment ${experimentId}`);
  if (!result.winner_variant) throw new Error('No winner determined yet');

  const { data: experiment } = await db.from('experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  // Requires HITL for page/automation changes
  const requiresHITL = ['page', 'automation'].includes(experiment?.type);

  // Mark as promoted
  await db.from('experiment_results')
    .update({ promoted_at: new Date().toISOString() })
    .eq('experiment_id', experimentId);

  await db.from('experiments')
    .update({ status: 'completed' })
    .eq('id', experimentId);

  return {
    experiment_id: experimentId,
    winner: result.winner_variant,
    type: experiment?.type,
    requires_hitl: requiresHITL,
    promoted_at: new Date().toISOString(),
  };
}

/**
 * Archive a completed experiment with learnings.
 */
export async function archiveExperiment(experimentId) {
  const db = supabase();

  await db.from('experiments')
    .update({ status: 'completed' })
    .eq('id', experimentId);

  const { data: result } = await db.from('experiment_results')
    .select('*')
    .eq('experiment_id', experimentId)
    .single();

  return {
    experiment_id: experimentId,
    archived: true,
    result: result || null,
  };
}

/**
 * List active experiments for a business.
 */
export async function listActiveExperiments(businessId) {
  const db = supabase();

  const { data, error } = await db.from('experiments')
    .select('*')
    .eq('business_id', businessId)
    .in('status', ['active', 'significant'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list experiments: ${error.message}`);
  return data || [];
}
