/**
 * Churn Predictor — Core Logic
 * Analyzes customer behavior signals to predict churn risk.
 */

import { supabase } from '../../lib/agent-memory.js';

const SCORE_TABLE = 'churn_risk_scores';

const HIGH_RISK_SIGNALS = [
  { signal: 'payment_failure_2x', weight: 3, description: '2+ failed payments in 30 days' },
  { signal: 'negative_csat', weight: 3, description: 'CSAT score 1-2 in last 14 days' },
  { signal: 'cancellation_page_visit', weight: 3, description: 'Visited cancel/downgrade URL' },
  { signal: 'no_logins_30d', weight: 3, description: 'No login in 30+ days' },
  { signal: 'downgrade_request', weight: 3, description: 'Requested downgrade' },
];

const MEDIUM_RISK_SIGNALS = [
  { signal: 'declining_usage_50pct', weight: 2, description: '50%+ activity drop vs prior period' },
  { signal: 'no_email_opens_5x', weight: 2, description: 'Zero opens in last 5 emails' },
  { signal: 'left_community', weight: 2, description: 'Left community group or 0 posts in 60d' },
  { signal: 'ticket_unresolved_7d', weight: 2, description: 'Support ticket open for 7+ days' },
];

const RETENTION_SIGNALS = [
  { signal: 'recent_upgrade', weight: -3 },
  { signal: 'high_nps', weight: -2 },
  { signal: 'active_community_member', weight: -2 },
  { signal: 'completed_onboarding', weight: -1 },
  { signal: 'referred_others', weight: -3 },
];

const TIER_ACTIONS = {
  critical: { tier: 'critical', min: 80, action: 'Immediate personal outreach + discount offer', intervention_type: 'personal_outreach', priority: 'immediate' },
  high:     { tier: 'high',     min: 60, action: 'Automated re-engagement + success check-in',   intervention_type: 'automated_email',  priority: 'this_week' },
  moderate: { tier: 'moderate', min: 40, action: 'Nurture email sequence + usage tips',           intervention_type: 'automated_email',  priority: 'this_month' },
  low:      { tier: 'low',      min: 20, action: 'Standard engagement — no action',               intervention_type: 'none',             priority: 'none' },
  healthy:  { tier: 'healthy',  min: 0,  action: 'Upsell opportunity',                            intervention_type: 'none',             priority: 'none' },
};

/**
 * Score a contact's churn risk.
 * @param {{ location_id: string, contact_id: string, signals?: object, lookback_days?: number }} params
 */
export async function scoreChurnRisk(params) {
  const { contact_id, signals = {}, lookback_days = 90 } = params;

  const detected_signals = [];
  const retention_signals = [];
  let score = 0;

  for (const sig of [...HIGH_RISK_SIGNALS, ...MEDIUM_RISK_SIGNALS]) {
    if (signals[sig.signal]) {
      score += sig.weight * 10;
      detected_signals.push({ signal: sig.signal, weight: sig.weight, details: sig.description });
    }
  }

  for (const ret of RETENTION_SIGNALS) {
    if (signals[ret.signal]) {
      score += ret.weight * 10;
      retention_signals.push({ signal: ret.signal, weight: ret.weight });
    }
  }

  score = Math.max(0, Math.min(100, score));

  const tier_config = Object.values(TIER_ACTIONS).find(t => score >= t.min) ?? TIER_ACTIONS.healthy;
  const days_to_next_review = { critical: 7, high: 14, moderate: 30, low: 90, healthy: 90 };
  const next_review = new Date(Date.now() + (days_to_next_review[tier_config.tier] ?? 30) * 24 * 60 * 60 * 1000).toISOString();

  const result = {
    contact_id, churn_risk_score: score, risk_tier: tier_config.tier,
    signals_detected: detected_signals, retention_signals,
    recommended_action: tier_config.action,
    intervention: { type: tier_config.intervention_type, priority: tier_config.priority, message_template: `[${tier_config.tier.toUpperCase()} churn risk message template]` },
    scored_at: new Date().toISOString(), next_review,
  };

  await supabase.from(SCORE_TABLE).upsert({ ...result, updated_at: new Date().toISOString() }, { onConflict: 'contact_id' });
  return result;
}

export async function batchScoreChurnRisk(locationId, lookbackDays = 90) {
  const { data: contacts } = await supabase.from('contacts').select('id').eq('location_id', locationId).limit(100);
  const results = await Promise.all((contacts ?? []).map(c => scoreChurnRisk({ location_id: locationId, contact_id: c.id, signals: {}, lookback_days: lookbackDays })));
  return { scored: results.length, critical: results.filter(r => r.risk_tier === 'critical').length };
}
