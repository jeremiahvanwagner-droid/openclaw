/**
 * Objections Handling Simulation — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SESSION_TABLE = 'coaching_simulation_sessions';
const SCORE_TABLE   = 'coaching_simulation_scores';

const OBJECTIONS_BY_STAGE = {
  discovery: ['We already have a solution.', 'We don\'t have budget for this.', 'Can you send me more info?'],
  proposal: ['Your price is too high.', 'We need to think about it.', 'I need to check with my team.'],
  closing: ['We\'re not ready to move forward yet.', 'What\'s your guarantee?', 'We need a pilot first.'],
};

export async function selectObjectionScenarios(buyerType, dealStage) {
  const pool = OBJECTIONS_BY_STAGE[dealStage] ?? OBJECTIONS_BY_STAGE.discovery;
  const selected = pool.slice(0, 3).map((text, i) => ({ id: i + 1, text, stage: dealStage, buyer_type: buyerType, difficulty: i + 1 }));
  return { scenarios: selected };
}

export async function runRolePlayTurn(sessionId, objection, response) {
  const turn = { session_id: sessionId, objection_text: objection.text, client_response: response, turn_at: new Date().toISOString() };
  await supabase.from(SESSION_TABLE).insert(turn);
  return { turn_id: turn.turn_at, recorded: true };
}

export function evaluateResponse(response, objection) {
  const clarity = response.length > 20 && response.length < 300 ? 1 : 0;
  const empathy = /understand|appreciate|hear you|makes sense/i.test(response) ? 1 : 0;
  const persuasion = /because|value|result|proven|here's what/i.test(response) ? 1 : 0;
  const total = Math.round(((clarity + empathy + persuasion) / 3) * 100);
  return { clarity_score: clarity * 100, empathy_score: empathy * 100, persuasion_score: persuasion * 100, overall: total };
}

export function provideCoachingFeedback(evaluation, objection) {
  const feedback = [];
  if (evaluation.empathy_score < 50) feedback.push('Add empathy: acknowledge the concern before responding.');
  if (evaluation.persuasion_score < 50) feedback.push('Strengthen your value case with a specific result or proof point.');
  if (evaluation.clarity_score < 50) feedback.push('Keep response between 2-4 sentences for clarity.');
  return { feedback, coaching_prompt: `Objection: "${objection.text}" — try again with these improvements.` };
}

export async function introduceCurveballs(sessionId, difficulty = 2) {
  const curveballs = ['Actually, your competitor is 30% cheaper.', 'Our CEO just said no budget this quarter.', 'We had a bad experience with your company before.'];
  const ball = curveballs[Math.min(difficulty - 1, curveballs.length - 1)];
  return { session_id: sessionId, curveball: ball };
}

export async function scoreProgression(clientId) {
  const { data } = await supabase.from(SCORE_TABLE).select('overall').eq('client_id', clientId).order('scored_at', { ascending: true });
  const scores = (data ?? []).map(d => d.overall ?? 0);
  const trend = scores.length > 1 ? (scores[scores.length - 1] > scores[0] ? 'improving' : 'declining') : 'insufficient_data';
  return { client_id: clientId, sessions: scores.length, latest_score: scores[scores.length - 1] ?? 0, trend };
}

export async function outputPerformanceSummary(clientId) {
  const { data } = await supabase.from(SCORE_TABLE).select('*').eq('client_id', clientId);
  return { client_id: clientId, sessions: (data ?? []).length, avg_score: Math.round((data ?? []).reduce((a, s) => a + (s.overall ?? 0), 0) / Math.max((data ?? []).length, 1)), generated_at: new Date().toISOString() };
}
