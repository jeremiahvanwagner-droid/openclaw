/**
 * Direct Message Qualification — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const DM_TABLE    = 'brand_dm_queue';
const TRIAGE_TABLE = 'brand_dm_triage';

const INTENT_PATTERNS = {
  partnership: /sponsor|partner|collab|brand deal|paid/i,
  media: /interview|press|feature|podcast|article/i,
  sales: /buy|purchase|price|cost|how much/i,
  support: /help|problem|issue|can't|broken/i,
  spam: /click here|free money|earn \$|claim your/i,
  fan: /love your|fan|big fan|amazing/i,
};

export async function classifyIncomingDMs(messages) {
  const classified = messages.map(msg => {
    let intent = 'general';
    for (const [type, pattern] of Object.entries(INTENT_PATTERNS)) {
      if (pattern.test(msg.text)) { intent = type; break; }
    }
    return { ...msg, intent, classified_at: new Date().toISOString() };
  });
  await supabase.from(DM_TABLE).insert(classified);
  return { classified };
}

export function filterSpamAndLowValue(messages) {
  const filtered = messages.filter(m => m.intent !== 'spam' && m.intent !== 'fan');
  const removed = messages.length - filtered.length;
  return { filtered, removed_count: removed };
}

export function scoreOpportunities(messages) {
  const scores = { partnership: 90, media: 80, sales: 70, support: 30, general: 20 };
  return messages.map(m => ({ ...m, priority_score: scores[m.intent] ?? 20 })).sort((a, b) => b.priority_score - a.priority_score);
}

export async function routeToReviewQueue(highPriorityMessages) {
  const queue = highPriorityMessages.filter(m => m.priority_score >= 70);
  if (queue.length) await supabase.from(TRIAGE_TABLE).insert(queue.map(m => ({ ...m, status: 'needs_review', routed_at: new Date().toISOString() })));
  return { routed: queue.length };
}

export function generateResponseDrafts(messages) {
  const templates = {
    partnership: 'Thanks for reaching out about a partnership! Please send details about your brand and goals.',
    media: 'Appreciate the interest! Please share more about the opportunity and timeline.',
    sales: 'Great question! You can find all pricing info at [link] or book a call here: [cal-link].',
    support: 'Sorry to hear you\'re having trouble! Please describe the issue and I\'ll get back to you ASAP.',
  };
  return messages.map(m => ({ message_id: m.id, intent: m.intent, draft_response: templates[m.intent] ?? 'Thanks for your message! I\'ll be in touch soon.' }));
}

export async function trackConversionOutcomes(messageId, outcome) {
  await supabase.from(TRIAGE_TABLE).update({ outcome, resolved_at: new Date().toISOString() }).eq('id', messageId);
  return { tracked: true };
}

export async function outputInboxTriageSummary() {
  const { data } = await supabase.from(TRIAGE_TABLE).select('*').order('routed_at', { ascending: false });
  return { queue: data ?? [], total: (data ?? []).length, generated_at: new Date().toISOString() };
}
