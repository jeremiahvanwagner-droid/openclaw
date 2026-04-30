import { supabase } from '../../lib/agent-memory.js';

const SCAN_TABLE    = 'community_content_scans';
const OFFENDER_TABLE = 'community_repeat_offenders';
const EVIDENCE_TABLE = 'community_moderation_evidence';

const SEVERITY_RULES = [
  { label: 'hate',       pattern: /\b(slur|hate speech|racist|bigot)\b/i,         tier: 4, action: 'remove' },
  { label: 'fraud',      pattern: /guaranteed returns|wire transfer|send bitcoin/i, tier: 4, action: 'remove' },
  { label: 'harassment', pattern: /kill yourself|you're worthless|go die/i,        tier: 3, action: 'remove' },
  { label: 'spam',       pattern: /click here|buy now|earn \$\d+|bit\.ly/i,        tier: 2, action: 'hide' },
  { label: 'hostile',    pattern: /idiot|moron|you suck|shut up/i,                 tier: 1, action: 'warn' },
];

function scoreContent(text) {
  for (const rule of SEVERITY_RULES) {
    if (rule.pattern.test(text)) return { label: rule.label, tier: rule.tier, action: rule.action };
  }
  return { label: 'clean', tier: 0, action: 'allow' };
}

export async function scanContent(contentId, text, authorId) {
  const result = scoreContent(text);
  const scan = { content_id: contentId, author_id: authorId, ...result, text_preview: text.slice(0, 200), scanned_at: new Date().toISOString() };
  await supabase.from(SCAN_TABLE).insert(scan);
  return scan;
}

export async function applyPolicyAction(contentId, action) {
  await supabase.from(SCAN_TABLE).update({ policy_applied: action, actioned_at: new Date().toISOString() }).eq('content_id', contentId);
  return { content_id: contentId, action_applied: action };
}

export async function preserveEvidence(contentId, text, authorId) {
  await supabase.from(EVIDENCE_TABLE).insert({ content_id: contentId, original_text: text, author_id: authorId, preserved_at: new Date().toISOString() });
  return { evidence_preserved: true };
}

export async function escalateAmbiguous(contentId, authorId, reason) {
  await supabase.from(SCAN_TABLE).update({ escalated: true, escalation_reason: reason }).eq('content_id', contentId);
  return { content_id: contentId, escalated: true };
}

export async function applyProgressiveEnforcement(authorId) {
  const { data } = await supabase.from(SCAN_TABLE).select('action').eq('author_id', authorId).in('action', ['warn', 'hide', 'remove']).order('scanned_at', { ascending: false }).limit(10);
  const violations = (data ?? []).length;
  const enforcement = violations >= 5 ? 'ban' : violations >= 3 ? 'rate_limit' : violations >= 1 ? 'warn' : 'none';
  await supabase.from(OFFENDER_TABLE).upsert({ author_id: authorId, violation_count: violations, enforcement_level: enforcement, updated_at: new Date().toISOString() }, { onConflict: 'author_id' });
  return { author_id: authorId, violations, enforcement_applied: enforcement };
}

export async function outputModerationSummary() {
  const { data } = await supabase.from(SCAN_TABLE).select('action, escalated, label');
  const rows = data ?? [];
  const byAction = rows.reduce((acc, r) => { acc[r.action] = (acc[r.action] ?? 0) + 1; return acc; }, {});
  const falsePositiveQueue = rows.filter(r => r.action === 'hide' && !r.escalated);
  return { total_scanned: rows.length, by_action: byAction, false_positive_review_queue: falsePositiveQueue.length, generated_at: new Date().toISOString() };
}
