import { supabase } from '../../lib/agent-memory.js';

const DUNNING_TABLE = 'subscription_dunning_records';

const SEQUENCE = [
  { day: 1,  channel: 'sms',   tag: 'dunning_day_1',  tone: 'empathetic', subject: null },
  { day: 3,  channel: 'email', tag: 'dunning_day_3',  tone: 'firm',       subject: 'Action needed: Update your payment for {{plan_name}}' },
  { day: 7,  channel: 'both',  tag: 'dunning_day_7',  tone: 'urgent',     subject: 'Final notice: Your {{plan_name}} access expires in 7 days' },
  { day: 14, channel: 'none',  tag: 'dunning_cancelled', tone: 'cancel', subject: null },
];

function buildSmsMessage(customerName, planName, amountDue, paymentLink) {
  return `Hi ${customerName ?? 'there'}, heads up — your ${planName ?? 'subscription'} payment of $${amountDue} didn't go through. It's probably just an expired card. Update here: ${paymentLink ?? '[payment-link]'} Reply if you need help! Reply STOP to unsubscribe.`;
}

function buildEmailBody(failureReason, planName, amountDue, customerName, day) {
  const offerDowngrade = failureReason === 'insufficient_funds' && day === 3 ? '\n\nIf budget is a concern, we also have a lighter plan that may work better. Reply to this email and we can explore options.' : '';
  return `Hi ${customerName ?? 'there'},\n\nYour ${planName ?? 'subscription'} payment of $${amountDue} was unsuccessful (reason: ${failureReason ?? 'declined'}).\n\nPlease update your payment information to maintain access: [payment-link]${offerDowngrade}\n\nIf you need help, reply to this email or contact support.`;
}

function isWithinQuietHours() {
  const h = new Date().getUTCHours();
  return h < 8 || h >= 21;
}

export async function initiateDunningSequence(contactId, locationId, saasInstanceId, failureReason, amountDue, options = {}) {
  const { customerName, planName, retryCount = 0, daysOverdue = 0, isVip = false } = options;
  const cancellationDay = isVip ? 21 : 14;
  const record = { contact_id: contactId, location_id: locationId, saas_instance_id: saasInstanceId, failure_reason: failureReason, amount_due: amountDue, customer_name: customerName, plan_name: planName, is_vip: isVip, cancellation_day: cancellationDay, current_step: 0, status: 'active', started_at: new Date().toISOString() };
  await supabase.from(DUNNING_TABLE).upsert(record, { onConflict: 'contact_id' });
  return { contact_id: contactId, sequence_started: true, cancellation_day: cancellationDay };
}

export async function executeDunningStep(contactId, day, paymentLink) {
  const { data } = await supabase.from(DUNNING_TABLE).select('*').eq('contact_id', contactId).single();
  if (!data || data.status !== 'active') return { skipped: true, reason: 'sequence_not_active' };
  if (isWithinQuietHours() && SEQUENCE.find(s => s.day === day)?.channel !== 'none') return { skipped: true, reason: 'quiet_hours' };

  const step = SEQUENCE.find(s => s.day === day);
  if (!step) return { skipped: true, reason: 'invalid_day' };

  const smsBody = step.channel !== 'email' ? buildSmsMessage(data.customer_name, data.plan_name, data.amount_due, paymentLink) : null;
  const emailBody = step.channel !== 'sms' ? buildEmailBody(data.failure_reason, data.plan_name, data.amount_due, data.customer_name, day) : null;
  const emailSubject = step.subject?.replace('{{plan_name}}', data.plan_name ?? 'subscription') ?? null;
  const complianceCheck = step.channel === 'sms' && smsBody ? (smsBody.includes('STOP') ? 'pass' : 'fail') : 'pass';

  if (day >= data.cancellation_day) {
    await supabase.from(DUNNING_TABLE).update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('contact_id', contactId);
    return { action: 'dunning_step', contact_id: contactId, day, channel: 'none', message_preview: null, tags_applied: ['dunning_cancelled', 'win_back_30d'], compliance_check: 'pass', notes: 'Subscription cancelled. Added to win-back sequence.' };
  }

  await supabase.from(DUNNING_TABLE).update({ current_step: day, [`step_${day}_at`]: new Date().toISOString() }).eq('contact_id', contactId);
  const nextStep = SEQUENCE.find(s => s.day > day);
  return { action: 'dunning_step', contact_id: contactId, day, channel: step.channel, message_preview: (smsBody ?? emailBody ?? '').slice(0, 100), next_step_date: nextStep ? new Date(Date.now() + (nextStep.day - day) * 86400000).toISOString().slice(0, 10) : null, tags_applied: [step.tag], compliance_check: complianceCheck, notes: `Sent via ${step.channel}. Subject: ${emailSubject ?? 'N/A'}` };
}

export async function handlePaymentSuccess(contactId) {
  await supabase.from(DUNNING_TABLE).update({ status: 'recovered', recovered_at: new Date().toISOString() }).eq('contact_id', contactId);
  return { contact_id: contactId, sequence_cancelled: true, reason: 'payment_succeeded' };
}

export async function getDunningStatus(contactId) {
  const { data } = await supabase.from(DUNNING_TABLE).select('*').eq('contact_id', contactId).single();
  return data ?? { contact_id: contactId, status: 'not_found' };
}
