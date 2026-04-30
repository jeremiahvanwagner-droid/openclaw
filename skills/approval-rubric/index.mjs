/**
 * Approval Rubric — Core Logic
 * Evaluates approval packets for policy, brand risk, rollback safety,
 * spend controls, and credential handling.
 */

import { supabase } from '../../lib/agent-memory.js';

const DECISION_TABLE  = 'approval_decisions';
const LEARNING_TABLE  = 'approval_learning_loop';

const REJECTION_CATEGORIES = ['compliance', 'rollback_missing', 'spend_unbounded', 'credential_risk', 'unclear_impact'];

/**
 * Evaluate an ApprovalPacket against all required checks.
 * @param {object} packet - The approval packet to evaluate
 * @returns {{ decision: string, requiredConditions: string[], notes: string, rejectionReasonCategory?: string }}
 */
export async function evaluateApprovalPacket(packet) {
  const checks = {
    rollback_feasibility: checkRollbackFeasibility(packet),
    claims_compliance: checkClaimsCompliance(packet),
    spend_guardrails: checkSpendGuardrails(packet),
    security_credentials: checkSecurityCredentials(packet),
    blast_radius: checkBlastRadius(packet),
  };

  const failedChecks = Object.entries(checks).filter(([, v]) => !v.passed);
  const needsInfo = Object.entries(checks).filter(([, v]) => v.needs_info);

  let decision;
  let rejectionReasonCategory;
  const notes = [];

  if (needsInfo.length > 0) {
    decision = 'NeedsInfo';
    notes.push(...needsInfo.map(([k, v]) => `Missing: ${v.missing}`));
  } else if (failedChecks.length > 0) {
    decision = 'Rejected';
    rejectionReasonCategory = mapToCategory(failedChecks[0][0]);
    notes.push(...failedChecks.map(([k, v]) => v.reason));
  } else {
    decision = 'Approved';
  }

  const result = {
    decision,
    requiredConditions: Object.entries(checks).map(([k, v]) => `${k}: ${v.passed ? 'PASS' : 'FAIL'}`),
    notes: notes.join('; ') || 'All checks passed.',
    rejectionReasonCategory,
    evaluated_at: new Date().toISOString(),
  };

  await supabase.from(DECISION_TABLE).insert({ ...result, packet_summary: JSON.stringify(packet).slice(0, 500) });
  return result;
}

function checkRollbackFeasibility(packet) {
  if (!packet.rollback) return { passed: false, needs_info: false, reason: 'No rollback plan provided' };
  const hasTriggers = !!packet.rollback.trigger_thresholds;
  const hasSteps = !!packet.rollback.revert_steps;
  if (!hasTriggers || !hasSteps) return { passed: false, needs_info: true, missing: 'rollback.trigger_thresholds or rollback.revert_steps' };
  return { passed: true };
}

function checkClaimsCompliance(packet) {
  const prohibited = /guarantee|risk.?free|certain|100%/i;
  const content = JSON.stringify(packet.content ?? packet);
  if (prohibited.test(content)) return { passed: false, reason: 'Contains prohibited guarantee or deceptive claim language' };
  return { passed: true };
}

function checkSpendGuardrails(packet) {
  if (packet.spend && !packet.spend.stop_loss) return { passed: false, reason: 'No stop-loss threshold defined for spend action' };
  if (packet.spend && !packet.spend.budget_bound) return { passed: false, reason: 'Budget bounds not defined' };
  return { passed: true };
}

function checkSecurityCredentials(packet) {
  const content = JSON.stringify(packet);
  if (/\b(sk-|Bearer\s+[A-Za-z0-9]{20,}|password\s*=)/i.test(content)) return { passed: false, reason: 'Plaintext credential detected in packet' };
  return { passed: true };
}

function checkBlastRadius(packet) {
  if (!packet.blast_radius?.affected_systems) return { passed: false, needs_info: true, missing: 'blast_radius.affected_systems' };
  if (!packet.blast_radius?.containment_plan) return { passed: false, needs_info: true, missing: 'blast_radius.containment_plan' };
  return { passed: true };
}

function mapToCategory(checkName) {
  const map = { claims_compliance: 'compliance', rollback_feasibility: 'rollback_missing', spend_guardrails: 'spend_unbounded', security_credentials: 'credential_risk', blast_radius: 'unclear_impact' };
  return map[checkName] ?? 'unclear_impact';
}

/**
 * Run weekly learning loop — aggregate rejection reasons and update rubric.
 */
export async function runWeeklyLearningLoop() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from(DECISION_TABLE).select('rejectionReasonCategory').eq('decision', 'Rejected').gte('evaluated_at', since);
  const counts = {};
  for (const r of (data ?? [])) {
    const cat = r.rejectionReasonCategory ?? 'unclear_impact';
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, count]) => ({ category: cat, count }));
  const clarifications = top3.map(t => ({ category: t.category, clarification: `Reinforce ${t.category} requirement in rubric checklist.` }));
  await supabase.from(LEARNING_TABLE).insert({ week_of: since, top_rejections: top3, clarifications, generated_at: new Date().toISOString() });
  return { top3, clarifications };
}
