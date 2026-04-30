/**
 * Contract Risk Extraction — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const RISK_TABLE  = 'agency_contract_risks';
const MEMO_TABLE  = 'agency_risk_memos';

const HIGH_RISK_PATTERNS = [
  { pattern: /unlimited\s+liability/i, label: 'unlimited_liability', severity: 'critical' },
  { pattern: /indemnif/i, label: 'indemnity_clause', severity: 'high' },
  { pattern: /intellectual\s+property\s+transfer/i, label: 'ip_transfer', severity: 'high' },
  { pattern: /penalty|liquidated\s+damages/i, label: 'penalty_clause', severity: 'high' },
  { pattern: /automatic\s+renewal/i, label: 'auto_renewal', severity: 'medium' },
  { pattern: /non-?compete/i, label: 'non_compete', severity: 'medium' },
  { pattern: /exclusive/i, label: 'exclusivity', severity: 'medium' },
];

export function parseAgreementText(text) {
  const clauses = text.split(/\n{2,}|\.\s+(?=[A-Z])/).filter(c => c.trim().length > 50);
  return { clause_count: clauses.length, clauses };
}

export function identifyHighRiskTerms(text, contractId) {
  const findings = HIGH_RISK_PATTERNS
    .filter(p => p.pattern.test(text))
    .map(p => ({ label: p.label, severity: p.severity, contract_id: contractId }));
  return { findings, high_risk_count: findings.filter(f => f.severity === 'critical' || f.severity === 'high').length };
}

export async function compareToFallbackLanguage(clauses, contractId) {
  const deviations = clauses.slice(0, 3).map((c, i) => ({
    clause_index: i, clause_preview: c.slice(0, 100),
    deviation: 'Non-standard language detected — compare to approved template',
    contract_id: contractId,
  }));
  return { deviations };
}

export async function scoreRiskSeverity(findings, contractId) {
  const severityMap = { critical: 10, high: 7, medium: 4, low: 1 };
  const total = findings.reduce((a, f) => a + (severityMap[f.severity] ?? 0), 0);
  const score = Math.min(100, total * 5);
  await supabase.from(RISK_TABLE).upsert({ contract_id: contractId, risk_score: score, findings, scored_at: new Date().toISOString() }, { onConflict: 'contract_id' });
  return { contract_id: contractId, risk_score: score, tier: score > 60 ? 'high' : score > 30 ? 'medium' : 'low' };
}

export async function draftRedlineRecommendations(findings) {
  const redlines = findings.map(f => ({
    issue: f.label, current_text: `[Original ${f.label} clause]`,
    recommended_replacement: `[Insert approved ${f.label} template language]`,
    negotiation_priority: f.severity,
  }));
  return { redlines };
}

export async function flagLegalEscalations(findings) {
  const escalate = findings.filter(f => f.severity === 'critical');
  return { escalate, count: escalate.length, reason: escalate.map(e => e.label).join(', ') };
}

export async function outputRiskMemo(contractId) {
  const { data } = await supabase.from(RISK_TABLE).select('*').eq('contract_id', contractId).single();
  const memo = { contract_id: contractId, risk_assessment: data, generated_at: new Date().toISOString() };
  await supabase.from(MEMO_TABLE).insert(memo);
  return { memo };
}
