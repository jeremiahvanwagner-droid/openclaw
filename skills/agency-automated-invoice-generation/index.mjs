/**
 * Automated Invoice Generation — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const BILLING_TABLE  = 'agency_billing_terms';
const INVOICE_TABLE  = 'agency_invoices';
const PAYMENT_TABLE  = 'agency_payment_tracking';

export async function pullBillingTerms(contractId) {
  const { data } = await supabase.from(BILLING_TABLE).select('*').eq('contract_id', contractId).single();
  return { contract_id: contractId, terms: data ?? { milestones: [], tax_rate: 0, discount_rules: [] } };
}

export function calculateLineItems(terms, billableEvents) {
  const lines = billableEvents.map(e => {
    const base = e.amount ?? 0;
    const tax = base * (terms.tax_rate ?? 0);
    const discount = terms.discount_rules?.find(d => d.event_type === e.type)?.discount ?? 0;
    return { description: e.description, base, tax, discount, total: base + tax - discount };
  });
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  return { lines, subtotal };
}

export function validateInvoice(invoice, terms) {
  const errors = [];
  if (invoice.subtotal < 0) errors.push('Negative invoice total');
  if (!invoice.client_id) errors.push('Missing client_id');
  if (!invoice.due_date) errors.push('Missing due_date');
  return { valid: errors.length === 0, errors };
}

export async function generateInvoiceArtifact(clientId, contractId, lines, dueDate) {
  const invoice = {
    client_id: clientId, contract_id: contractId, lines,
    subtotal: lines.reduce((a, l) => a + l.total, 0),
    due_date: dueDate, status: 'draft',
    invoice_number: `INV-${Date.now()}`,
    generated_at: new Date().toISOString(),
  };
  const { data } = await supabase.from(INVOICE_TABLE).insert(invoice).select('id').single();
  return { invoice_id: data?.id ?? invoice.invoice_number, ...invoice };
}

export async function dispatchInvoice(invoiceId, channel = 'email') {
  await supabase.from(INVOICE_TABLE).update({ status: 'sent', sent_at: new Date().toISOString(), channel }).eq('id', invoiceId);
  return { invoice_id: invoiceId, dispatched: true, channel };
}

export async function trackPaymentStatus(invoiceId) {
  const { data } = await supabase.from(INVOICE_TABLE).select('status, due_date, subtotal').eq('id', invoiceId).single();
  const overdue = data?.due_date && new Date(data.due_date) < new Date() && data?.status !== 'paid';
  if (overdue) await supabase.from(PAYMENT_TABLE).upsert({ invoice_id: invoiceId, overdue: true, checked_at: new Date().toISOString() }, { onConflict: 'invoice_id' });
  return { invoice_id: invoiceId, status: data?.status, overdue };
}

export async function outputReceivablesReport() {
  const { data } = await supabase.from(INVOICE_TABLE).select('*').order('generated_at', { ascending: false });
  const total_outstanding = (data ?? []).filter(i => i.status !== 'paid').reduce((a, i) => a + (i.subtotal ?? 0), 0);
  const overdue = (data ?? []).filter(i => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'paid');
  return { invoices: data ?? [], total_outstanding, overdue_count: overdue.length, generated_at: new Date().toISOString() };
}
