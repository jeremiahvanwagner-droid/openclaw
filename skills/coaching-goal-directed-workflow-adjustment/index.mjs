/**
 * Goal-directed Workflow Adjustment — Core Logic
 * Coaching Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const WORKFLOW_TABLE = 'coaching_workflows';

export async function compareWorkflowToPriorities(clientId, updatedPriorities) {
  const { data } = await supabase.from(WORKFLOW_TABLE).select('*').eq('client_id', clientId).single();
  const currentTasks = data?.tasks ?? [];
  const misaligned = currentTasks.filter(t => !updatedPriorities.includes(t.goal_alignment));
  return { client_id: clientId, total_tasks: currentTasks.length, misaligned_count: misaligned.length, misaligned };
}

export async function identifyMisalignedTasks(clientId) {
  const { data } = await supabase.from(WORKFLOW_TABLE).select('tasks').eq('client_id', clientId).single();
  const obsolete = (data?.tasks ?? []).filter(t => t.status === 'stale' || t.deprecated);
  return { obsolete };
}

export async function resequenceTasks(clientId, priorities) {
  const { data } = await supabase.from(WORKFLOW_TABLE).select('tasks').eq('client_id', clientId).single();
  const resequenced = (data?.tasks ?? [])
    .filter(t => !t.deprecated)
    .sort((a, b) => (priorities.indexOf(a.goal_alignment) - priorities.indexOf(b.goal_alignment)));
  await supabase.from(WORKFLOW_TABLE).update({ tasks: resequenced }).eq('client_id', clientId);
  return { resequenced: resequenced.length };
}

export async function reallocateEffort(clientId, effortMap) {
  await supabase.from(WORKFLOW_TABLE).update({ effort_allocation: effortMap, updated_at: new Date().toISOString() }).eq('client_id', clientId);
  return { client_id: clientId, reallocated: Object.keys(effortMap).length };
}

export async function updateMilestones(clientId, milestones) {
  await supabase.from(WORKFLOW_TABLE).update({ milestones, milestone_updated_at: new Date().toISOString() }).eq('client_id', clientId);
  return { updated: milestones.length };
}

export function communicateChanges(oldPriorities, newPriorities) {
  const added = newPriorities.filter(p => !oldPriorities.includes(p));
  const removed = oldPriorities.filter(p => !newPriorities.includes(p));
  return { added, removed, summary: `${added.length} priorities added, ${removed.length} deprioritized.` };
}

export async function outputAdjustedWorkflow(clientId) {
  const { data } = await supabase.from(WORKFLOW_TABLE).select('*').eq('client_id', clientId).single();
  return { client_id: clientId, workflow: data, generated_at: new Date().toISOString() };
}
