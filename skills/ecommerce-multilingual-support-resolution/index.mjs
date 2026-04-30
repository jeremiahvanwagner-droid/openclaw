import { supabase } from '../../lib/agent-memory.js';

const TICKET_TABLE     = 'ecommerce_support_tickets';
const RESOLUTION_TABLE = 'ecommerce_ticket_resolutions';

const LANGUAGE_DETECTION = { spanish: /hola|gracias|ayuda|problema/i, french: /bonjour|merci|aide|problème/i, german: /hallo|danke|hilfe|problem/i, portuguese: /olá|obrigado|ajuda|problema/i };
const INTENT_PATTERNS = { refund: /refund|money back|return|charge/i, order_status: /where.*order|tracking|shipped|deliver/i, product_issue: /broken|defective|not working|damaged/i, account: /login|password|account|access/i };
const POLICY_WORKFLOWS = { refund: 'initiate_return_flow', order_status: 'query_fulfillment_api', product_issue: 'escalate_to_quality_team', account: 'trigger_password_reset' };

export async function detectLanguageAndIntent(ticketId, text) {
  let language = 'english';
  for (const [lang, pattern] of Object.entries(LANGUAGE_DETECTION)) {
    if (pattern.test(text)) { language = lang; break; }
  }
  let intent = 'general';
  for (const [type, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(text)) { intent = type; break; }
  }
  await supabase.from(TICKET_TABLE).upsert({ ticket_id: ticketId, original_text: text, detected_language: language, intent, created_at: new Date().toISOString() }, { onConflict: 'ticket_id' });
  return { ticket_id: ticketId, language, intent };
}

export function translateContext(text, language) {
  return { translated: `[${language.toUpperCase()} → EN]: ${text}`, entities_preserved: ['order_id', 'email', 'sku'], original_language: language };
}

export function mapToWorkflow(intent) {
  return { workflow: POLICY_WORKFLOWS[intent] ?? 'general_support', intent };
}

export async function generateLocalizedResponse(ticketId, workflow, language) {
  const baseResponses = {
    initiate_return_flow: 'We\'ve initiated your return. You\'ll receive a return label within 24 hours.',
    query_fulfillment_api: 'Your order is on its way! Expected delivery: 3-5 business days.',
    escalate_to_quality_team: 'We\'re so sorry about this. Our quality team will contact you within 24 hours.',
    trigger_password_reset: 'We\'ve sent a password reset link to your email.',
    general_support: 'Thank you for reaching out. Our team will respond within 24 hours.',
  };
  const response = baseResponses[workflow] ?? baseResponses.general_support;
  const localized = `[${language.toUpperCase()}]: ${response}`;
  await supabase.from(RESOLUTION_TABLE).insert({ ticket_id: ticketId, workflow, response: localized, language, created_at: new Date().toISOString() });
  return { ticket_id: ticketId, response: localized };
}

export async function escalateSensitive(ticketId, reason) {
  await supabase.from(TICKET_TABLE).update({ escalated: true, escalation_reason: reason, escalated_at: new Date().toISOString() }).eq('ticket_id', ticketId);
  return { ticket_id: ticketId, escalated: true };
}

export async function syncTicketSystems(ticketId) {
  return { ticket_id: ticketId, synced_to: ['order_management', 'crm', 'support_desk'], synced_at: new Date().toISOString() };
}

export async function outputResolutionMetrics() {
  const { data } = await supabase.from(RESOLUTION_TABLE).select('language, workflow');
  const rows = data ?? [];
  const byLanguage = rows.reduce((acc, r) => { acc[r.language] = (acc[r.language] ?? 0) + 1; return acc; }, {});
  const byIssueType = rows.reduce((acc, r) => { acc[r.workflow] = (acc[r.workflow] ?? 0) + 1; return acc; }, {});
  return { total_resolved: rows.length, by_language: byLanguage, by_issue_type: byIssueType, generated_at: new Date().toISOString() };
}
