/**
 * Brand Governance Enforcement — Core Logic
 * Brand Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const GOVERNANCE_TABLE = 'brand_governance_log';
const POLICY_TABLE     = 'brand_governance_policies';

export async function loadBrandPolicies(brandId) {
  const { data } = await supabase.from(POLICY_TABLE).select('*').eq('brand_id', brandId).single();
  return { brand_id: brandId, policies: data ?? { red_lines: [], approved_claims: [], tone_rules: [] } };
}

export async function scanContentForViolations(content, policies) {
  const violations = [];
  for (const redLine of (policies.red_lines ?? [])) {
    if (new RegExp(redLine, 'i').test(content)) violations.push({ type: 'red_line', term: redLine, severity: 'high' });
  }
  if (!/\b(we help|you can|discover|learn)\b/i.test(content)) violations.push({ type: 'tone', term: 'missing brand voice', severity: 'low' });
  return { violations, count: violations.length };
}

export async function flagHighRiskStatements(violations) {
  const high_risk = violations.filter(v => v.severity === 'high');
  return { high_risk, count: high_risk.length };
}

export async function applyCorrectives(content, violations) {
  let corrected = content;
  for (const v of violations) {
    if (v.type === 'red_line') corrected = corrected.replace(new RegExp(v.term, 'gi'), '[REMOVED: policy violation]');
  }
  return { corrected, corrections_applied: violations.filter(v => v.type === 'red_line').length };
}

export async function escalateForHumanApproval(contentId, violations) {
  const highRisk = violations.filter(v => v.severity === 'high');
  if (highRisk.length === 0) return { escalated: false };
  await supabase.from(GOVERNANCE_TABLE).insert({ content_id: contentId, violations: highRisk, status: 'pending_review', created_at: new Date().toISOString() });
  return { escalated: true, pending_review: highRisk.length };
}

export async function logGovernanceDecision(contentId, decision, correctedContent) {
  await supabase.from(GOVERNANCE_TABLE).upsert({ content_id: contentId, decision, corrected_content: correctedContent?.slice(0, 1000), logged_at: new Date().toISOString() }, { onConflict: 'content_id' });
  return { logged: true };
}

export async function outputApprovedContent(contentId) {
  const { data } = await supabase.from(GOVERNANCE_TABLE).select('*').eq('content_id', contentId).single();
  return { content_id: contentId, status: data?.decision, generated_at: new Date().toISOString() };
}
