import { supabase } from '../../lib/agent-memory.js';

const GRADE_TABLE   = 'education_assignment_grades';
const RUBRIC_TABLE  = 'education_rubrics';

export async function loadRubric(assignmentId) {
  const { data } = await supabase.from(RUBRIC_TABLE).select('*').eq('assignment_id', assignmentId).single();
  return data ?? { criteria: [], passing_score: 70 };
}

export function evaluateSubmission(submission, rubric) {
  const criteriaScores = (rubric.criteria ?? []).map(criterion => {
    const textMatch = new RegExp(criterion.keyword_indicators?.join('|') ?? '', 'i').test(submission.text ?? '');
    const lengthOk = (submission.text ?? '').length >= (criterion.min_length ?? 0);
    const score = textMatch && lengthOk ? criterion.max_points : textMatch || lengthOk ? Math.round(criterion.max_points * 0.6) : 0;
    return { criterion: criterion.name, score, max_points: criterion.max_points, evidence: textMatch ? 'Key concepts present' : 'Key concepts missing', comment: score >= criterion.max_points ? 'Meets criteria' : 'Needs improvement — see guidance' };
  });
  const total = criteriaScores.reduce((s, c) => s + c.score, 0);
  const maxTotal = criteriaScores.reduce((s, c) => s + c.max_points, 0);
  const pct = maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0;
  return { criteria_scores: criteriaScores, total_score: total, max_score: maxTotal, percentage: pct };
}

export function detectEscalationNeeds(evaluation, submission) {
  const reasons = [];
  if (evaluation.percentage === 0) reasons.push('blank_submission');
  if (/plagiarism|copied|exact match/i.test(submission.text ?? '')) reasons.push('suspected_plagiarism');
  if (submission.format_violations) reasons.push('format_violation');
  return { requires_human_review: reasons.length > 0, reasons };
}

export function generateFeedback(evaluation) {
  const passed = evaluation.percentage >= 70;
  const strengths = evaluation.criteria_scores.filter(c => c.score >= c.max_points * 0.8).map(c => c.criterion);
  const improvements = evaluation.criteria_scores.filter(c => c.score < c.max_points * 0.6).map(c => `${c.criterion}: ${c.comment}`);
  return { passed, feedback: passed ? `Strong work — your submission scored ${evaluation.percentage}%.` : `Your submission scored ${evaluation.percentage}%. Here\'s how to improve:`, strengths, improvements, revision_guidance: improvements.length > 0 ? `Focus on: ${improvements[0]}` : null };
}

export async function storeGrade(submissionId, learnerId, evaluation, feedback) {
  const grade = { submission_id: submissionId, learner_id: learnerId, percentage: evaluation.percentage, criteria_scores: evaluation.criteria_scores, feedback: feedback.feedback, passed: feedback.passed, graded_at: new Date().toISOString() };
  await supabase.from(GRADE_TABLE).insert(grade);
  return grade;
}

export async function outputInstructorAnalytics(assignmentId) {
  const { data } = await supabase.from(GRADE_TABLE).select('percentage, passed').eq('assignment_id', assignmentId);
  const rows = data ?? [];
  const avgScore = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (r.percentage ?? 0), 0) / rows.length) : 0;
  const passRate = rows.length > 0 ? Math.round(rows.filter(r => r.passed).length / rows.length * 100) : 0;
  return { assignment_id: assignmentId, submissions: rows.length, avg_score: avgScore, pass_rate: passRate, generated_at: new Date().toISOString() };
}
