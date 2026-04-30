import { supabase } from '../../lib/agent-memory.js';

const FUNNEL_TABLE = 'checkout_funnel_metrics';
const FIXES_TABLE  = 'checkout_friction_fixes';

export async function baselineMetrics(funnelId, stepData) {
  const rows = stepData.map(s => ({ funnel_id: funnelId, ...s, recorded_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(FUNNEL_TABLE).insert(rows);
  const overallConversion = stepData.length > 0 ? stepData[stepData.length - 1].conversion_rate : 0;
  return { funnel_id: funnelId, steps: stepData.length, overall_conversion: overallConversion };
}

export async function identifyFrictionPoints(funnelId) {
  const { data } = await supabase.from(FUNNEL_TABLE).select('*').eq('funnel_id', funnelId).order('step_number');
  const steps = data ?? [];
  const highFriction = steps.filter(s => (s.drop_off_rate ?? 0) > 0.3).map(s => ({ step: s.step_name, drop_off: s.drop_off_rate, bottleneck: s.avg_time_seconds > 60 ? 'slow_form' : 'cognitive_load' }));
  return { funnel_id: funnelId, high_friction_steps: highFriction };
}

export function simplifyInputs(formFields) {
  const removed = formFields.filter(f => ['middle_name', 'company_size', 'how_did_you_hear'].includes(f.name));
  const optimized = formFields.filter(f => !removed.includes(f)).map(f => ({ ...f, autofill: true, inline_validation: true }));
  return { optimized_fields: optimized, removed_fields: removed.map(f => f.name), cognitive_load_reduction: removed.length };
}

export function improveTrustSignals(currentSignals = []) {
  const recommended = ['SSL badge near CTA', '30-day money-back guarantee badge', 'Payment logos (Visa/Mastercard/PayPal)', 'Testimonial snippet near form', 'Transparent total before submit'];
  const missing = recommended.filter(r => !currentSignals.includes(r));
  return { current: currentSignals, missing_trust_signals: missing, priority_adds: missing.slice(0, 3) };
}

export function optimizePaymentFlow(options = {}) {
  return { recommendations: ['Add PayPal/Apple Pay as one-click options', 'Show price summary persistently in sidebar', 'Replace generic "Submit" with "Complete My Order"', 'Add inline card number formatting', 'Show estimated delivery/access time'], mobile_fixes: ['Increase tap targets to 44px min', 'Enable numeric keyboard for card fields', 'Sticky CTA button at bottom of screen'] };
}

export async function defineRecoveryTriggers(funnelId) {
  const triggers = [
    { event: 'cart_idle_5min', action: 'exit_intent_popup', message: 'Still thinking? Your cart is saved!' },
    { event: 'partial_form_filled', action: 'email_recovery', delay_minutes: 30 },
    { event: 'payment_error', action: 'retry_prompt', message: 'Let\'s try a different payment method.' },
  ];
  await supabase.from(FIXES_TABLE).insert(triggers.map(t => ({ funnel_id: funnelId, ...t, created_at: new Date().toISOString() })));
  return { funnel_id: funnelId, recovery_triggers: triggers };
}

export async function outputPrioritizedFixes(funnelId) {
  const friction = await identifyFrictionPoints(funnelId);
  const fixes = [
    { fix: 'Reduce required form fields to 5 or fewer', expected_lift: '8-12%', effort: 'low' },
    { fix: 'Add money-back guarantee badge near CTA', expected_lift: '3-5%', effort: 'low' },
    { fix: 'Implement one-click payment option', expected_lift: '5-8%', effort: 'medium' },
    { fix: 'Fix mobile CTA tap target sizing', expected_lift: '4-6%', effort: 'low' },
  ];
  return { funnel_id: funnelId, high_friction_steps: friction.high_friction_steps, prioritized_fixes: fixes, generated_at: new Date().toISOString() };
}
