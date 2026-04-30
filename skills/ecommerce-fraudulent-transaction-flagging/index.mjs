import { supabase } from '../../lib/agent-memory.js';

const TRANSACTION_TABLE = 'ecommerce_transactions';
const FRAUD_TABLE       = 'ecommerce_fraud_flags';

const FRAUD_SIGNALS = [
  { signal: 'velocity_high',        weight: 25, test: (t) => (t.orders_last_hour ?? 0) > 5 },
  { signal: 'mismatched_billing',   weight: 20, test: (t) => t.billing_country !== t.ip_country },
  { signal: 'new_account_highval',  weight: 15, test: (t) => t.account_age_days < 1 && (t.order_value ?? 0) > 200 },
  { signal: 'declined_attempts',    weight: 20, test: (t) => (t.prior_declines ?? 0) > 2 },
  { signal: 'disposable_email',     weight: 15, test: (t) => /tempmail|guerrilla|mailinator/i.test(t.email ?? '') },
  { signal: 'proxy_or_vpn',         weight: 10, test: (t) => t.is_proxy === true },
];

export async function ingestTransaction(txId, txData) {
  await supabase.from(TRANSACTION_TABLE).upsert({ tx_id: txId, ...txData, ingested_at: new Date().toISOString() }, { onConflict: 'tx_id' });
  return { tx_id: txId, ingested: true };
}

export function scoreFraudLikelihood(txData) {
  const triggered = FRAUD_SIGNALS.filter(s => s.test(txData));
  const score = triggered.reduce((sum, s) => sum + s.weight, 0);
  const tier = score >= 60 ? 'block' : score >= 35 ? 'hold' : score >= 15 ? 'review' : 'approve';
  return { fraud_score: Math.min(100, score), tier, triggered_signals: triggered.map(s => s.signal) };
}

export async function classifyRiskTier(txId, scoreResult) {
  await supabase.from(FRAUD_TABLE).upsert({ tx_id: txId, ...scoreResult, classified_at: new Date().toISOString() }, { onConflict: 'tx_id' });
  return { tx_id: txId, tier: scoreResult.tier, triggered_signals: scoreResult.triggered_signals };
}

export async function applyPolicyAction(txId, tier) {
  const actionMap = { approve: 'process', hold: 'manual_review', block: 'reject', review: 'flag_for_review' };
  const action = actionMap[tier] ?? 'flag_for_review';
  await supabase.from(TRANSACTION_TABLE).update({ policy_action: action, actioned_at: new Date().toISOString() }).eq('tx_id', txId);
  return { tx_id: txId, action };
}

export async function alertOperations(txId, score, value) {
  if (score >= 60 || value > 1000) {
    await supabase.from(FRAUD_TABLE).update({ ops_alerted: true, alert_at: new Date().toISOString() }).eq('tx_id', txId);
    return { alerted: true, reason: score >= 60 ? 'high_fraud_score' : 'high_value_transaction' };
  }
  return { alerted: false };
}

export async function recordOutcome(txId, actuallyFraud) {
  await supabase.from(FRAUD_TABLE).update({ confirmed_fraud: actuallyFraud, outcome_recorded_at: new Date().toISOString() }).eq('tx_id', txId);
  return { tx_id: txId, outcome_recorded: true };
}

export async function outputFraudDashboard() {
  const { data } = await supabase.from(FRAUD_TABLE).select('tier, confirmed_fraud, fraud_score');
  const rows = data ?? [];
  const falsePositives = rows.filter(r => r.tier !== 'approve' && r.confirmed_fraud === false).length;
  const byTier = rows.reduce((acc, r) => { acc[r.tier] = (acc[r.tier] ?? 0) + 1; return acc; }, {});
  return { total_scored: rows.length, by_tier: byTier, false_positive_count: falsePositives, avg_fraud_score: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (r.fraud_score ?? 0), 0) / rows.length) : 0, generated_at: new Date().toISOString() };
}
