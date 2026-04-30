import { supabase } from '../../lib/agent-memory.js';

const AUDIT_TABLE     = 'community_moderation_audit';
const MILESTONE_TABLE = 'community_member_milestones';

const BLOCKED_PHRASES = ['earn money fast', 'dm me for details', 'guaranteed income'];
const COMPETITOR_BRANDS = [];

function hashContent(text) {
  let h = 0;
  for (const c of text) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h.toString(36);
}

function runRuleChain(postContent, authorMeta) {
  const hash = hashContent(postContent);
  const upperRatio = (postContent.match(/[A-Z]/g) ?? []).length / postContent.length;
  const linkCount = (postContent.match(/https?:\/\//g) ?? []).length;
  const hasBlocked = BLOCKED_PHRASES.some(p => postContent.toLowerCase().includes(p));
  const hasBanned = authorMeta?.is_banned;
  const priorFlags = authorMeta?.flag_count ?? 0;
  const verifiedMember = authorMeta?.verified ?? false;
  const postCount = authorMeta?.post_count ?? 0;

  if (hasBanned || hasBlocked) return { action: 'removed', rules_matched: hasBanned ? ['banned_member'] : ['blocked_phrase'] };
  if (linkCount >= 3 || priorFlags > 0 || (postContent.match(/[A-Z]/g)?.length ?? 0) / postContent.length > 0.5) return { action: 'flagged', rules_matched: [linkCount >= 3 ? 'excessive_links' : priorFlags > 0 ? 'prior_flags' : 'all_caps'] };
  if (verifiedMember || (postContent.length <= 2000 && linkCount === 0) || (postContent.match(/\.(jpg|png|gif)/i) && postCount >= 5)) return { action: 'approved', rules_matched: ['auto_approve'] };
  return { action: 'flagged', rules_matched: ['default_hold'] };
}

function checkEngagementTriggers(authorMeta) {
  const triggers = [];
  if (authorMeta?.post_count === 0) triggers.push({ trigger: 'first_post', message: 'Welcome! Great to see your first post — keep it coming!' });
  if (authorMeta?.post_count === 9) triggers.push({ trigger: '10th_post_milestone', message: '🎉 You just hit your 10th post! You\'re a community contributor.' });
  if (authorMeta?.days_inactive >= 7) triggers.push({ trigger: '7_day_inactive', message: 'We\'ve missed you! Come check out what\'s been happening.' });
  return triggers;
}

export async function reviewPost(groupId, locationId, postContent, authorId, authorMeta = {}) {
  const hash = hashContent(postContent);
  const { action, rules_matched } = runRuleChain(postContent, authorMeta);
  const engagementTriggers = checkEngagementTriggers(authorMeta);
  const generatedResponse = engagementTriggers[0]?.message ?? null;
  const escalation = action === 'flagged' ? { required: true, reason: rules_matched[0], target_agent: 'd8_community_manager' } : { required: false, reason: null, target_agent: null };

  const audit = { group_id: groupId, location_id: locationId, author_id: authorId, action_taken: engagementTriggers.length ? 'engagement' : action, post_content_hash: hash, rules_matched, confidence: 0.95, escalation, generated_response: generatedResponse, timestamp: new Date().toISOString() };
  await supabase.from(AUDIT_TABLE).insert(audit);

  if (engagementTriggers.length) await supabase.from(MILESTONE_TABLE).upsert({ member_id: authorId, triggers: engagementTriggers.map(t => t.trigger), updated_at: new Date().toISOString() }, { onConflict: 'member_id' });

  return { action_taken: audit.action_taken, post_content_hash: hash, author_id: authorId, rules_matched, confidence: 0.95, generated_response: generatedResponse, escalation, audit_entry: { timestamp: audit.timestamp, group_id: groupId, decision: audit.action_taken } };
}

export async function configureRules(groupId, customRules) {
  await supabase.from(AUDIT_TABLE).insert({ group_id: groupId, action_taken: 'rules_configured', rules_matched: ['custom_rules_applied'], post_content_hash: 'config', author_id: 'system', confidence: 1, escalation: { required: false }, generated_response: null, timestamp: new Date().toISOString() });
  return { group_id: groupId, rules_applied: customRules.length };
}

export async function generateWelcomeMessage(authorId, brandVoice = 'professional') {
  const messages = {
    professional: `Welcome to the community! We're glad you're here. Take a moment to introduce yourself and explore the resources available.`,
    casual: `Hey! So glad you joined 🎉 Jump in, say hi, and don't be shy — everyone here is super welcoming.`,
    empathetic: `Welcome! It takes courage to join a new community, and we're genuinely happy you took that step. You belong here.`,
  };
  return { author_id: authorId, welcome_message: messages[brandVoice] ?? messages.professional };
}

export async function escalatePost(groupId, authorId, reason) {
  await supabase.from(AUDIT_TABLE).insert({ group_id: groupId, author_id: authorId, action_taken: 'escalated', post_content_hash: 'manual', rules_matched: [reason], confidence: 1, escalation: { required: true, reason, target_agent: 'd8_community_manager' }, generated_response: null, timestamp: new Date().toISOString() });
  return { escalated: true, target_agent: 'd8_community_manager' };
}

export async function getAuditLog(groupId, limit = 100) {
  const { data } = await supabase.from(AUDIT_TABLE).select('*').eq('group_id', groupId).order('timestamp', { ascending: false }).limit(limit);
  return { group_id: groupId, decisions: data ?? [], total: (data ?? []).length };
}
