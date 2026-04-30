import { supabase } from '../../lib/agent-memory.js';

const BILLING_TABLE       = 'community_billing_events';
const RECONCILIATION_TABLE = 'community_billing_reconciliations';

export async function ingestPaymentEvents(events) {
  const rows = events.map(e => ({ ...e, ingested_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(BILLING_TABLE).insert(rows);
  return { ingested: rows.length };
}

export async function detectFailures(memberId) {
  const { data } = await supabase.from(BILLING_TABLE).select('*').eq('member_id', memberId).eq('status', 'failed').order('created_at', { ascending: false });
  const failures = data ?? [];
  const dunning = failures.filter(f => f.retry_count >= 1);
  return { member_id: memberId, failed_count: failures.length, dunning_count: dunning.length, access_mismatch: failures.some(f => f.access_granted) };
}

export async function triggerDunning(memberId, policy) {
  const dunning = { member_id: memberId, policy, status: 'active', next_retry: new Date(Date.now() + (policy.retry_days ?? 3) * 86400000).toISOString(), triggered_at: new Date().toISOString() };
  await supabase.from(RECONCILIATION_TABLE).insert(dunning);
  return { member_id: memberId, dunning_active: true, next_retry: dunning.next_retry };
}

export async function applyAccessRules(memberId, subscriptionStatus) {
  const accessGranted = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  await supabase.from(RECONCILIATION_TABLE).update({ access_granted: accessGranted, access_updated_at: new Date().toISOString() }).eq('member_id', memberId);
  return { member_id: memberId, access_granted: accessGranted, subscription_status: subscriptionStatus };
}

export async function logReconciliationAction(memberId, action, details) {
  await supabase.from(RECONCILIATION_TABLE).insert({ member_id: memberId, action, details, logged_at: new Date().toISOString() });
  return { logged: true };
}

export async function escalateEdgeCases(memberId, reason) {
  await supabase.from(RECONCILIATION_TABLE).update({ escalated: true, escalation_reason: reason, escalated_at: new Date().toISOString() }).eq('member_id', memberId);
  return { member_id: memberId, escalated: true };
}

export async function outputReconciliationReport(date = new Date().toISOString().slice(0, 10)) {
  const { data } = await supabase.from(RECONCILIATION_TABLE).select('*').gte('logged_at', `${date}T00:00:00Z`);
  const rows = data ?? [];
  const exceptions = rows.filter(r => r.escalated);
  return { date, total_actions: rows.length, exceptions: exceptions.length, exception_list: exceptions, generated_at: new Date().toISOString() };
}
