import { supabase } from '../../lib/agent-memory.js';

const RUBRIC_TABLE = 'education_rubrics';
const SCORE_TABLE  = 'education_rubric_scores';

export async function loadRubric(rubricId, assignmentContext) {
  const { data } = await supabase.from(RUBRIC_TABLE).select('*').eq('id', rubricId).single();
  const compatible = data?.applicable_contexts?.includes(assignmentContext.type) ?? true;
  return { rubric: data, compatible, version: data?.version ?? '1.0' };
}

export function validateRubricCompatibility(rubric, assignment) {
  const issues = [];
  if (!rubric) issues.push('rubric_not_found');
  if (rubric && (rubric.criteria ?? []).length === 0) issues.push('empty_rubric');
  if (rubric?.version !== assignment.required_rubric_version && assignment.required_rubric_version) issues.push('version_mismatch');
  return { valid: issues.length === 0, issues };
}

export function applyScoring(submission, rubric) {
  const scores = (rubric.criteria ?? []).map(c => {
    const rawScore = c.scoring_function ? eval(`(${c.scoring_function})(submission)`) : ((submission.text ?? '').length >= (c.min_length ?? 0) ? c.max_points : 0);
    const score = Math.min(c.max_points, Math.max(0, rawScore));
    return { criterion_id: c.id, criterion_name: c.name, score, max_points: c.max_points, evidence: `Scored ${score}/${c.max_points}` };
  });
  const total = scores.reduce((s, c) => s + c.score, 0);
  const maxTotal = scores.reduce((s, c) => s + c.max_points, 0);
  return { criteria_scores: scores, total_score: total, max_score: maxTotal, percentage: maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0 };
}

export function calibrationCheck(score, expectedRange) {
  const { min = 0, max = 100 } = expectedRange ?? {};
  const drifted = score.percentage < min || score.percentage > max;
  return { drift_detected: drifted, expected_range: expectedRange, actual_pct: score.percentage };
}

export function flagAmbiguousEvidence(criteriaScores, threshold = 0.5) {
  return criteriaScores.filter(c => c.score > 0 && c.score < c.max_points * threshold).map(c => ({ criterion: c.criterion_name, reason: 'Partial evidence — human review recommended' }));
}

export async function generateScoreBreakdown(submissionId, learnerId, scoring, rubricVersion) {
  const breakdown = { submission_id: submissionId, learner_id: learnerId, rubric_version: rubricVersion, ...scoring, graded_at: new Date().toISOString() };
  await supabase.from(SCORE_TABLE).insert(breakdown);
  return breakdown;
}

export async function logRubricApplication(submissionId, rubricId) {
  await supabase.from(SCORE_TABLE).update({ rubric_id: rubricId, application_logged: true }).eq('submission_id', submissionId);
  return { submission_id: submissionId, logged: true };
}
