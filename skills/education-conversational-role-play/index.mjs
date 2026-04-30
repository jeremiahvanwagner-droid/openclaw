import { supabase } from '../../lib/agent-memory.js';

const SESSION_TABLE = 'education_roleplay_sessions';
const TURN_TABLE    = 'education_roleplay_turns';

const SCENARIO_LIBRARY = {
  sales_discovery:   { skills: ['questioning', 'listening', 'empathy'], difficulty: 2, context: 'Prospecting call with a skeptical decision-maker' },
  conflict_resolution: { skills: ['empathy', 'de-escalation', 'clarity'], difficulty: 3, context: 'Team member upset about being passed over for promotion' },
  leadership_feedback: { skills: ['directness', 'empathy', 'coaching'], difficulty: 2, context: 'Delivering constructive feedback to an underperforming report' },
  negotiation:         { skills: ['persuasion', 'anchoring', 'listening'], difficulty: 4, context: 'Vendor negotiation with tight budget constraints' },
};

export async function selectScenario(learnerId, targetSkills) {
  const { data: history } = await supabase.from(SESSION_TABLE).select('scenario').eq('learner_id', learnerId);
  const attempted = new Set((history ?? []).map(s => s.scenario));
  const available = Object.entries(SCENARIO_LIBRARY).filter(([key]) => !attempted.has(key)).sort((a, b) => {
    const aSkillMatch = a[1].skills.filter(s => targetSkills.includes(s)).length;
    const bSkillMatch = b[1].skills.filter(s => targetSkills.includes(s)).length;
    return bSkillMatch - aSkillMatch;
  });
  const selected = available[0] ?? Object.entries(SCENARIO_LIBRARY)[0];
  return { scenario_key: selected[0], ...selected[1] };
}

export async function instantiatePersona(scenarioKey) {
  const personas = {
    sales_discovery: { name: 'Alex (VP Operations)', traits: ['skeptical', 'data-driven', 'time-pressured'], opening: 'I only have 10 minutes. What\'s this about?' },
    conflict_resolution: { name: 'Jordan (Team Member)', traits: ['frustrated', 'resentful', 'wants validation'], opening: 'I need to talk about the promotion decision. I\'m pretty upset.' },
    leadership_feedback: { name: 'Casey (Direct Report)', traits: ['defensive', 'nervous', 'eager to please'], opening: 'You wanted to see me?' },
    negotiation: { name: 'Sam (Vendor Rep)', traits: ['confident', 'anchors high', 'flexible'], opening: 'Thanks for meeting. Our standard rate is $50k.' },
  };
  return personas[scenarioKey] ?? { name: 'Unknown', traits: [], opening: 'Hello.' };
}

export function scoreResponse(response) {
  const clarity = response.length >= 20 && response.length <= 400 ? 100 : 50;
  const empathy = /understand|hear|appreciate|sounds|feels|makes sense/i.test(response) ? 100 : 40;
  const structure = response.includes('.') && response.split('.').length >= 2 ? 100 : 60;
  const outcome = /what if|how about|would you|could we|let me|I propose/i.test(response) ? 100 : 50;
  return { clarity, empathy, structure, outcome_orientation: outcome, overall: Math.round((clarity + empathy + structure + outcome) / 4) };
}

export async function conductTurn(sessionId, learnerId, learnerResponse, turnNumber) {
  const score = scoreResponse(learnerResponse);
  const coaching = [];
  if (score.empathy < 60) coaching.push('Lead with acknowledgment before sharing your perspective.');
  if (score.clarity < 70) coaching.push('Keep your response focused — one key point at a time.');
  if (score.outcome_orientation < 60) coaching.push('Move the conversation forward by suggesting a next step or question.');
  await supabase.from(TURN_TABLE).insert({ session_id: sessionId, learner_id: learnerId, turn: turnNumber, response: learnerResponse, score, coaching, recorded_at: new Date().toISOString() });
  return { turn: turnNumber, score, coaching_prompt: coaching[0] ?? null };
}

export async function deliverDebrief(sessionId, learnerId) {
  const { data } = await supabase.from(TURN_TABLE).select('score').eq('session_id', sessionId);
  const turns = data ?? [];
  const avgScore = turns.length > 0 ? Math.round(turns.reduce((s, t) => s + (t.score?.overall ?? 0), 0) / turns.length) : 0;
  return { session_id: sessionId, avg_score: avgScore, strengths: avgScore > 70 ? ['Consistent empathy', 'Clear structure'] : [], improvements: avgScore < 70 ? ['Add acknowledgment before responding', 'Use open questions more'] : [], generated_at: new Date().toISOString() };
}

export async function recommendNextScenario(learnerId, debrief) {
  const weakSkills = debrief.improvements.length > 0 ? ['empathy', 'questioning'] : ['advanced_negotiation'];
  const next = await selectScenario(learnerId, weakSkills);
  return { learner_id: learnerId, next_scenario: next };
}
