/**
 * Comment Moderation SOP — Core Logic
 * Classifies social comments and generates compliant response options.
 */

import { supabase } from '../../lib/agent-memory.js';

const MOD_TABLE = 'comment_moderation_decisions';

const CLASSIFICATION_RULES = [
  { label: 'spam',     pattern: /buy now|click here|free money|earn \$\d|bit\.ly|t\.co\/\S{5}/i },
  { label: 'hostile',  pattern: /idiot|stupid|scam|fraud|liar|hate you|kill yourself|shut up/i },
  { label: 'sensitive',pattern: /refund|money back|charge|lawsuit|sue|doctor|legal|medical/i },
  { label: 'objection',pattern: /doesn't work|not worth|too expensive|better alternatives|prove it/i },
  { label: 'question', pattern: /\?$|how do|what is|where can|when will|can you/i },
];

const RESPONSE_TEMPLATES = {
  question:  { short: 'Great question! [Answer here].', empathetic: 'We totally understand the curiosity! [Answer here].', authority: 'Based on our experience, [Answer here]. Let us know if you have more questions!' },
  objection: { short: 'We hear you. [Specific counter-point].', empathetic: 'That\'s a fair concern — here\'s our take: [counter-point].', authority: 'Here\'s the evidence: [proof point]. Happy to discuss further.' },
};

const ACTION_RULES = {
  spam:      'delete',
  hostile:   'hide',
  sensitive: 'escalate',
  objection: 'respond',
  question:  'respond',
};

/**
 * Moderate a batch of comments.
 * @param {Array<{ commentId: string, text: string, author?: string }>} comments
 * @returns {{ batch: object[] }}
 */
export async function moderateBatch(comments) {
  const batch = comments.map(comment => {
    const classification = classify(comment.text);
    const action = ACTION_RULES[classification] ?? 'respond';
    const replyOptions = action === 'respond' ? RESPONSE_TEMPLATES[classification] ?? null : null;

    return {
      commentId: comment.commentId,
      classification,
      action,
      replyOptions,
      escalationReason: action === 'escalate' ? `Sensitive topic detected: "${comment.text.slice(0, 60)}"` : null,
      evidenceRefs: [],
    };
  });

  const rows = batch.map(b => ({ ...b, moderated_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(MOD_TABLE).insert(rows);
  return { batch };
}

function classify(text) {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(text)) return rule.label;
  }
  return 'question';
}

/**
 * Get moderation history for audit.
 */
export async function getModerationHistory(limit = 100) {
  const { data } = await supabase.from(MOD_TABLE).select('*').order('moderated_at', { ascending: false }).limit(limit);
  return { decisions: data ?? [], total: (data ?? []).length };
}
