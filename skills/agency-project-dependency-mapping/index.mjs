/**
 * Project Dependency Mapping — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const TASK_TABLE = 'agency_project_tasks';
const DEP_TABLE  = 'agency_task_dependencies';

export async function importProjectTasks(projectId, tasks) {
  const rows = tasks.map(t => ({ project_id: projectId, ...t, imported_at: new Date().toISOString(), status: t.status ?? 'pending' }));
  await supabase.from(TASK_TABLE).upsert(rows, { onConflict: 'task_id' });
  return { project_id: projectId, imported: rows.length };
}

export async function identifyPrerequisites(projectId) {
  const { data } = await supabase.from(DEP_TABLE).select('*').eq('project_id', projectId);
  return { project_id: projectId, dependencies: data ?? [], dependency_count: (data ?? []).length };
}

export async function detectInvalidSequencing(projectId) {
  const { data: tasks } = await supabase.from(TASK_TABLE).select('*').eq('project_id', projectId);
  const { data: deps } = await supabase.from(DEP_TABLE).select('*').eq('project_id', projectId);
  const issues = (deps ?? []).filter(d => {
    const prereq = (tasks ?? []).find(t => t.task_id === d.prerequisite_id);
    const task = (tasks ?? []).find(t => t.task_id === d.task_id);
    return prereq?.status !== 'complete' && task?.status === 'in_progress';
  });
  return { issues, count: issues.length };
}

export async function reorderExecutionPlan(projectId) {
  const { data: tasks } = await supabase.from(TASK_TABLE).select('*').eq('project_id', projectId).order('priority', { ascending: false });
  return { project_id: projectId, reordered: (tasks ?? []).map((t, i) => ({ ...t, execution_order: i + 1 })) };
}

export async function alertOnBlockers(projectId) {
  const { issues } = await detectInvalidSequencing(projectId);
  const alerts = issues.map(i => ({ project_id: projectId, blocked_task: i.task_id, blocker: i.prerequisite_id, alerted_at: new Date().toISOString() }));
  return { alerts };
}

export async function trackDependencyCompletion(taskId) {
  const { data } = await supabase.from(DEP_TABLE).select('*').eq('task_id', taskId);
  const completedCount = (data ?? []).filter(d => d.status === 'complete').length;
  return { task_id: taskId, dependencies_met: completedCount, total: (data ?? []).length };
}

export async function outputDependencyGraph(projectId) {
  const { data: tasks } = await supabase.from(TASK_TABLE).select('*').eq('project_id', projectId);
  const { data: deps } = await supabase.from(DEP_TABLE).select('*').eq('project_id', projectId);
  return { project_id: projectId, tasks: tasks ?? [], dependencies: deps ?? [], generated_at: new Date().toISOString() };
}
