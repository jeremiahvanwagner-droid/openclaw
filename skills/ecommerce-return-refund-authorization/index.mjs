import { supabase } from '../../lib/agent-memory.js';

const RETURN_TABLE = 'ecommerce_returns';
const REFUND_TABLE = 'ecommerce_refunds';

const RETURN_WINDOW_DAYS = 30;
const FRAUD_SIGNALS = ['excessive_returns', 'no_receipt', 'high_value_repeat'];

export async function validateEligibility(orderId, orderData) {
  const orderAge = (Date.now() - new Date(orderData.purchased_at).getTime()) / 86400000;
  const withinWindow = orderAge <= RETURN_WINDOW_DAYS;
  const policyAllows = orderData.product_type !== 'digital' && !orderData.final_sale;
  return { order_id: orderId, eligible: withinWindow && policyAllows, order_age_days: Math.round(orderAge), reason_ineligible: !withinWindow ? 'outside_return_window' : !policyAllows ? 'non_returnable_item' : null };
}

export function classifyReturnReason(reason, customerData) {
  const fraudSignals = FRAUD_SIGNALS.filter(s => s === 'excessive_returns' && (customerData.return_count ?? 0) > 3).length;
  const riskLevel = fraudSignals > 0 ? 'high' : customerData.return_count > 1 ? 'medium' : 'low';
  const reasonType = /defective|broken|damaged/.test(reason) ? 'product_defect' : /not as described/.test(reason) ? 'misrepresentation' : /changed mind/.test(reason) ? 'buyer_remorse' : 'other';
  return { reason_type: reasonType, fraud_risk: riskLevel, fraud_signals: fraudSignals };
}

export async function authorizeReturn(orderId, eligibility, classification) {
  if (!eligibility.eligible) return { authorized: false, reason: eligibility.reason_ineligible };
  if (classification.fraud_risk === 'high') return { authorized: false, reason: 'fraud_risk_hold', requires_manual_review: true };
  const partial = classification.reason_type === 'buyer_remorse';
  const authorization = { order_id: orderId, authorized: true, partial, refund_pct: partial ? 80 : 100, auth_at: new Date().toISOString() };
  await supabase.from(RETURN_TABLE).insert(authorization);
  return authorization;
}

export async function generateReturnLabel(orderId) {
  const labelId = `RL-${orderId}-${Date.now()}`;
  return { order_id: orderId, label_id: labelId, instructions: 'Pack items securely. Drop off at any carrier location within 7 days.', label_url: `https://returns.example.com/label/${labelId}` };
}

export async function triggerRefundWorkflow(orderId, authorization) {
  if (!authorization.authorized) return { refund_initiated: false };
  const refund = { order_id: orderId, refund_pct: authorization.refund_pct, status: 'pending', method: 'original_payment', initiated_at: new Date().toISOString() };
  await supabase.from(REFUND_TABLE).insert(refund);
  return { refund_initiated: true, ...refund };
}

export async function updateSystemRecords(orderId) {
  return { order_id: orderId, systems_updated: ['order_management', 'inventory', 'finance'], updated_at: new Date().toISOString() };
}

export async function outputReturnAnalytics() {
  const { data: returns } = await supabase.from(RETURN_TABLE).select('authorized, partial');
  const { data: refunds } = await supabase.from(REFUND_TABLE).select('refund_pct, status');
  const rows = returns ?? [];
  return { total_returns: rows.length, authorized: rows.filter(r => r.authorized).length, partial_refunds: rows.filter(r => r.partial).length, refunds_pending: (refunds ?? []).filter(r => r.status === 'pending').length, generated_at: new Date().toISOString() };
}
