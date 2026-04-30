import { supabase } from '../../lib/agent-memory.js';

const SCREENING_TABLE  = 'finance_compliance_screenings';
const DECISION_TABLE   = 'finance_compliance_decisions';

const RESTRICTED_JURISDICTIONS = ['IR', 'KP', 'CU', 'SY', 'SD'];
const RESTRICTED_PATTERNS = [/mixer|tumbler|tornado.cash/i, /darknet|silk road/i];

export async function screenCounterparties(entityId, counterparties) {
  const results = counterparties.map(cp => {
    const onWatchlist = false;
    const restrictedJurisdiction = RESTRICTED_JURISDICTIONS.includes(cp.country ?? '');
    const patternsMatch = RESTRICTED_PATTERNS.some(p => p.test(cp.name ?? '') || p.test(cp.wallet_address ?? ''));
    const flagged = onWatchlist || restrictedJurisdiction || patternsMatch;
    const reason = flagged ? (restrictedJurisdiction ? 'restricted_jurisdiction' : patternsMatch ? 'sanctioned_entity_pattern' : 'watchlist_hit') : null;
    return { entity_id: entityId, counterparty_id: cp.id, flagged, reason, screened_at: new Date().toISOString() };
  });
  if (results.length) await supabase.from(SCREENING_TABLE).insert(results);
  return { screened: results.length, flagged: results.filter(r => r.flagged).length };
}

export function validateEligibility(transaction, rules) {
  const issues = [];
  if (RESTRICTED_JURISDICTIONS.includes(transaction.destination_country ?? '')) issues.push('restricted_jurisdiction');
  if ((transaction.amount ?? 0) > (rules.max_single_transaction ?? Infinity)) issues.push('exceeds_single_tx_limit');
  if (transaction.product_type && !(rules.allowed_products ?? []).includes(transaction.product_type)) issues.push('prohibited_product');
  return { eligible: issues.length === 0, policy_violations: issues };
}

export function detectRestrictedPatterns(transaction) {
  const patterns = RESTRICTED_PATTERNS.filter(p => p.test(JSON.stringify(transaction)));
  return { restricted_patterns: patterns.map(p => p.toString()), detected: patterns.length > 0 };
}

export async function blockAction(txId, reason) {
  await supabase.from(DECISION_TABLE).insert({ tx_id: txId, decision: 'blocked', reason, decided_at: new Date().toISOString() });
  return { tx_id: txId, blocked: true, reason };
}

export async function escalateAmbiguous(txId, reason) {
  await supabase.from(DECISION_TABLE).insert({ tx_id: txId, decision: 'escalated', reason, decided_at: new Date().toISOString() });
  return { tx_id: txId, escalated: true };
}

export async function logDecision(txId, decision, metadata) {
  await supabase.from(DECISION_TABLE).upsert({ tx_id: txId, decision, metadata, logged_at: new Date().toISOString() }, { onConflict: 'tx_id' });
  return { logged: true };
}

export async function outputComplianceStatus() {
  const { data } = await supabase.from(DECISION_TABLE).select('decision');
  const rows = data ?? [];
  const byDecision = rows.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] ?? 0) + 1; return acc; }, {});
  const exceptionQueue = rows.filter(r => r.decision === 'escalated').length;
  return { total_screened: rows.length, by_decision: byDecision, exception_queue: exceptionQueue, generated_at: new Date().toISOString() };
}
