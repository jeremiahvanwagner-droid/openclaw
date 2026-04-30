import { supabase } from '../../lib/agent-memory.js';

const CHECK_TABLE = 'sms_compliance_checks';

const OPT_OUT_PATTERNS = [/reply STOP/i, /text STOP/i, /opt.?out/i, /unsubscribe/i, /to cancel/i];
const SHAFT_PATTERNS   = [/\b(sex|porn|adult content|xxx)\b/i, /\b(hate|racist|slur)\b/i, /\b(alcohol|beer|wine|liquor)\b/i, /\b(firearm|gun|ammo|pistol)\b/i, /\b(tobacco|cigarette|vape|nicotine)\b/i];
const MISLEADING       = [/guaranteed|risk.?free|free money|100% sure/i, /winner|you('ve| have) won/i];
const PHISHING         = [/bit\.ly|tinyurl|t\.co\/\S{4}/i, /act now|expires in \d+ minutes/i];
const FINANCIAL        = [/loan offer|pre.?approved|credit|borrow/i];

function isGsm7(text) {
  const gsm7 = /^[\x00-\x7F@£$¥èéùìòÇ\nØø\rÅå\x1bÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà]*$/.test(text);
  return gsm7;
}

function countSegments(text, messageType) {
  const gsm7 = isGsm7(text);
  const singleMax = gsm7 ? 160 : 70;
  const multiMax  = gsm7 ? 153 : 67;
  const len = text.length;
  if (len <= singleMax) return 1;
  return Math.ceil(len / multiMax);
}

export function checkCompliance(message, messageType, options = {}) {
  const { recipientConsentVerified = false } = options;
  const issues = [];
  const contentFlags = [];

  const hasOptOut = OPT_OUT_PATTERNS.some(p => p.test(message));
  if (messageType === 'marketing' && !hasOptOut) issues.push({ severity: 'critical', rule: 'opt_out_language', description: 'Marketing SMS must include opt-out language', fix: 'Add "Reply STOP to unsubscribe" to message end' });
  if (messageType === 'marketing' && !recipientConsentVerified) issues.push({ severity: 'critical', rule: 'consent_required', description: 'Marketing SMS requires prior opt-in confirmation', fix: 'Verify recipient has opted in before sending' });

  for (const pattern of SHAFT_PATTERNS) {
    if (pattern.test(message)) { issues.push({ severity: 'critical', rule: 'shaft_content', description: 'SHAFT content detected', fix: 'Remove prohibited content' }); contentFlags.push('shaft'); break; }
  }
  for (const pattern of MISLEADING) {
    if (pattern.test(message)) { issues.push({ severity: 'critical', rule: 'misleading_claim', description: 'Misleading claim detected', fix: 'Remove guaranteed/risk-free language or add required disclaimers' }); contentFlags.push('misleading'); break; }
  }
  for (const pattern of PHISHING) {
    if (pattern.test(message)) { issues.push({ severity: 'critical', rule: 'phishing_indicator', description: 'Phishing indicator detected (URL shortener or urgency manipulation)', fix: 'Use full URLs and remove urgency manipulation language' }); contentFlags.push('phishing'); break; }
  }
  for (const pattern of FINANCIAL) {
    if (pattern.test(message)) { issues.push({ severity: 'critical', rule: 'financial_solicitation', description: 'Financial solicitation without required disclosures', fix: 'Add required financial disclosures' }); contentFlags.push('financial'); break; }
  }

  const upperRatio = (message.match(/[A-Z]/g) ?? []).length / message.length;
  if (upperRatio > 0.3) issues.push({ severity: 'warning', rule: 'all_caps', description: `${Math.round(upperRatio * 100)}% uppercase characters`, fix: 'Reduce ALL CAPS usage to improve deliverability' });
  if ((message.match(/!/g) ?? []).length >= 3) issues.push({ severity: 'warning', rule: 'multiple_exclamation', description: '3+ exclamation marks detected', fix: 'Reduce exclamation marks to 1-2 maximum' });
  if (/https?:\/\//.test(message)) issues.push({ severity: 'warning', rule: 'url_included', description: 'URL included — verify domain reputation', fix: 'Ensure URL is a known, trusted domain' });

  const segments = countSegments(message, messageType);
  if (message.length > 160 && segments > 1) issues.push({ severity: 'warning', rule: 'multi_part_sms', description: `Message spans ${segments} SMS segments`, fix: 'Shorten to 160 chars or confirm multi-part is intended' });

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const score = Math.max(0, 100 - (criticalCount * 25) - (issues.filter(i => i.severity === 'warning').length * 5));
  const verdict = criticalCount > 0 ? 'blocked' : issues.length > 0 ? 'warnings' : 'pass';
  return { verdict, compliance_score: score, message_length: message.length, segments, issues, opt_out_present: hasOptOut, content_flags: contentFlags, checked_at: new Date().toISOString() };
}

export async function checkAndLog(message, messageType, options = {}) {
  const result = checkCompliance(message, messageType, options);
  await supabase.from(CHECK_TABLE).insert({ message_type: messageType, ...result, campaign_id: options.campaignId ?? null });
  return result;
}

export async function getComplianceHistory(limit = 50) {
  const { data } = await supabase.from(CHECK_TABLE).select('verdict, compliance_score, message_type, checked_at').order('checked_at', { ascending: false }).limit(limit);
  return { history: data ?? [], blocked: (data ?? []).filter(r => r.verdict === 'blocked').length };
}
