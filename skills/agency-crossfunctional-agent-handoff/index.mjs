/**
 * Cross-functional Agent Handoff — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const HANDOFF_TABLE = 'agency_agent_handoffs';
const AUDIT_TABLE   = 'agency_handoff_audit';

export async function captureTaskState(taskId) {
  const { data } = await supabase.from(HANDOFF_TABLE).select('*').eq('task_id', taskId).single();
  return {
    task_id: taskId,
    history: data?.history ?? [],
    decisions: data?.decisions ?? [],
    unresolved_questions: data?.unresolved_questions ?? [],
    last_actor: data?.last_actor ?? null,
  };
}

export async function packageHandoffContext(taskId, fromAgent, context) {
  const payload = {
    task_id: taskId, from_agent: fromAgent,
    context: { history: context.history, decisions: context.decisions, unresolved: context.unresolved_questions },
    artifacts: context.artifacts ?? [],
    packaged_at: new Date().toISOString(),
    status: 'pending',
  };
  await supabase.from(HANDOFF_TABLE).upsert(payload, { onConflict: 'task_id' });
  return { task_id: taskId, payload };
}

export async function validateArtifacts(taskId) {
  const { data } = await supabase.from(HANDOFF_TABLE).select('artifacts').eq('task_id', taskId).single();
  const artifacts = data?.artifacts ?? [];
  const missing = artifacts.filter(a => !a.url && !a.content);
  return { task_id: taskId, valid: missing.length === 0, missing_artifacts: missing };
}

export async function routeHandoff(taskId, targetAgent) {
  await supabase.from(HANDOFF_TABLE).update({ target_agent: targetAgent, routed_at: new Date().toISOString() }).eq('task_id', taskId);
  return { task_id: taskId, routed_to: targetAgent };
}

export async function confirmReceipt(taskId, receivingAgent) {
  await supabase.from(HANDOFF_TABLE).update({ status: 'received', received_at: new Date().toISOString(), receiving_agent: receivingAgent }).eq('task_id', taskId);
  return { task_id: taskId, acknowledged: true, receiving_agent: receivingAgent };
}

export async function trackHandoffCompletion(taskId) {
  const { data } = await supabase.from(HANDOFF_TABLE).select('*').eq('task_id', taskId).single();
  const elapsed_ms = data?.received_at ? Date.now() - new Date(data.packaged_at).getTime() : null;
  await supabase.from(AUDIT_TABLE).insert({ task_id: taskId, elapsed_ms, status: data?.status, logged_at: new Date().toISOString() });
  return { task_id: taskId, status: data?.status, elapsed_ms };
}

export async function outputHandoffAuditTrail(taskId) {
  const { data } = await supabase.from(AUDIT_TABLE).select('*').eq('task_id', taskId).order('logged_at', { ascending: true });
  return { task_id: taskId, audit_trail: data ?? [], generated_at: new Date().toISOString() };
}
