/**
 * System State Persistence — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const CHECKPOINT_TABLE = 'aisaas_checkpoints';
const RETENTION_DAYS   = 7;

export function defineCheckpointBoundaries(workflowSteps) {
  const boundaries = workflowSteps
    .filter((_, i) => i === 0 || i === workflowSteps.length - 1 || i % 3 === 0)
    .map(s => ({ step_id: s.id, step_name: s.name, is_checkpoint: true }));
  return { boundaries, checkpoint_count: boundaries.length };
}

export function serializeState(state, version = 'v1') {
  return { payload: JSON.stringify(state), version, schema_version: version, size_bytes: JSON.stringify(state).length };
}

export async function writeCheckpoint(workflowId, stepId, state) {
  const serialized = serializeState(state);
  const entry = { workflow_id: workflowId, step_id: stepId, ...serialized, written_at: new Date().toISOString(), valid: true };
  const { data, error } = await supabase.from(CHECKPOINT_TABLE).insert(entry).select('id').single();
  return { checkpoint_id: data?.id ?? `cp-${Date.now()}`, success: !error };
}

export async function validateWriteIntegrity(checkpointId) {
  const { data } = await supabase.from(CHECKPOINT_TABLE).select('payload, valid').eq('id', checkpointId).single();
  if (!data) return { valid: false, reason: 'not_found' };
  try { JSON.parse(data.payload); return { valid: true }; }
  catch { return { valid: false, reason: 'json_parse_error' }; }
}

export async function resumeFromCheckpoint(workflowId) {
  const { data } = await supabase.from(CHECKPOINT_TABLE).select('*').eq('workflow_id', workflowId).eq('valid', true).order('written_at', { ascending: false }).limit(1).single();
  if (!data) return { resumed: false, reason: 'no_valid_checkpoint' };
  return { resumed: true, step_id: data.step_id, state: JSON.parse(data.payload), checkpoint_id: data.id };
}

export async function expireStaleCheckpoints() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from(CHECKPOINT_TABLE).delete().lt('written_at', cutoff).select('id');
  return { expired: (data ?? []).length };
}

export async function outputPersistenceHealth() {
  const { data } = await supabase.from(CHECKPOINT_TABLE).select('valid, written_at').order('written_at', { ascending: false }).limit(100);
  const valid = (data ?? []).filter(c => c.valid).length;
  return { total: (data ?? []).length, valid, invalid: (data ?? []).length - valid, health_pct: Math.round(valid / ((data ?? []).length || 1) * 100), generated_at: new Date().toISOString() };
}
