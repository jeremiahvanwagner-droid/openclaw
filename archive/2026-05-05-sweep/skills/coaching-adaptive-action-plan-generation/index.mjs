/**
 * Adaptive Action Plan Generation — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PLAN_TABLE = 'coaching_action_plans';

export async function captureBlockerContext(clientId, objective, blockerType, constraintContext) {
  const session = { client_id: clientId, objective, blocker_type: blockerType, constraint_context: constraintContext, captured_at: new Date().toISOString() };
  const { data } = await supabase.from(PLAN_TABLE).insert(session).select('id').single();
  return { plan_id: data?.id, ...session };
}

export function diagnoseRootCause(blockerType, constraintContext) {
  const causes = {
    time: 'Competing priorities preventing execution window.',
    knowledge: 'Missing information or skill to proceed.',
    motivation: 'Energy or confidence deficit.',
    resource: 'Missing tool, budget, or access.',
    clarity: 'Goal or next step is unclear.',
  };
  return { root_cause: causes[blockerType] ?? 'Unknown friction source.', blocker_type: blockerType };
}

export function generateAlternativePaths(objective, rootCause) {
  const paths = [
    { path_id: 1, description: `Micro-step approach: break "${objective}" into daily 15-min tasks.`, friction: 'low' },
    { path_id: 2, description: `Delegate or outsource the blocker component.`, friction: 'medium' },
    { path_id: 3, description: `Reframe objective with reduced scope for immediate momentum.`, friction: 'low' },
  ];
  return { paths, root_cause: rootCause };
}

export function prioritizePaths(paths) {
  const scores = { low: 3, medium: 2, high: 1 };
  return paths.map(p => ({ ...p, priority_score: scores[p.friction] ?? 1 })).sort((a, b) => b.priority_score - a.priority_score);
}

export function convertToNextSteps(selectedPath) {
  return {
    path_id: selectedPath.path_id,
    next_steps: [
      `Step 1: ${selectedPath.description}`,
      'Step 2: Complete first unit within 24 hours.',
      'Step 3: Report back on checkpoint.',
    ],
  };
}

export function addCheckpointTriggers(planId, nextSteps) {
  return nextSteps.map((s, i) => ({ step: i + 1, description: s, checkpoint_trigger: i === nextSteps.length - 1 ? 'Review with coach' : 'Auto-check via app' }));
}

export async function outputRevisedPlan(planId, steps, timeline) {
  await supabase.from(PLAN_TABLE).update({ steps, timeline, status: 'active', updated_at: new Date().toISOString() }).eq('id', planId);
  return { plan_id: planId, steps, timeline, generated_at: new Date().toISOString() };
}
