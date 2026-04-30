/**
 * Transition State Prompting — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PROMPT_TABLE = 'coaching_transition_prompts';
const LOG_TABLE    = 'coaching_transition_log';

const TRANSITION_PROMPTS = {
  cognitive:   ['What\'s the very next physical action you can take right now?', 'Set a 5-minute timer and just start — momentum follows motion.'],
  emotional:   ['Take three deep breaths. What would feel like a small win today?', 'Name one thing you\'re grateful for, then name the next step.'],
  logistical:  ['Clear your space, then open the one document you need.', 'What tool or resource do you need first? Get that ready.'],
};

export async function detectTransitionPoints(clientId, behaviorSignals) {
  const transitionPoints = behaviorSignals.filter(s => s.activity_gap_minutes > 30 || s.context_switch);
  if (transitionPoints.length) await supabase.from(LOG_TABLE).insert(transitionPoints.map(t => ({ client_id: clientId, ...t, detected_at: new Date().toISOString() })));
  return { client_id: clientId, transitions_detected: transitionPoints.length };
}

export function classifyTransitionType(signal) {
  if (signal.type === 'task_switch' || signal.requires_focus_shift) return 'cognitive';
  if (signal.sentiment === 'frustrated' || signal.energy_level === 'low') return 'emotional';
  return 'logistical';
}

export function generateMicroPrompt(transitionType, task) {
  const prompts = TRANSITION_PROMPTS[transitionType] ?? TRANSITION_PROMPTS.logistical;
  const base = prompts[Math.floor(Math.random() * prompts.length)];
  return { prompt: base, task_context: task, transition_type: transitionType };
}

export async function deliverPrompt(clientId, prompt, timing = 'immediate') {
  const delivery = { client_id: clientId, ...prompt, timing, delivered_at: new Date().toISOString() };
  await supabase.from(PROMPT_TABLE).insert(delivery);
  return { delivered: true, ...delivery };
}

export async function reinforceProgress(clientId, completedTask) {
  const reinforcement = { client_id: clientId, completed_task: completedTask, message: `✅ "${completedTask}" done — you\'re building momentum!`, sent_at: new Date().toISOString() };
  return { reinforced: true, ...reinforcement };
}

export async function trackTransitionOutcomes(clientId) {
  const { data } = await supabase.from(PROMPT_TABLE).select('*').eq('client_id', clientId);
  const completed = (data ?? []).filter(p => p.followed_through);
  return { client_id: clientId, prompts_sent: (data ?? []).length, followed_through: completed.length };
}

export async function outputTransitionInsights(clientId) {
  const { tracked } = await trackTransitionOutcomes(clientId);
  return { client_id: clientId, ...tracked, generated_at: new Date().toISOString() };
}
