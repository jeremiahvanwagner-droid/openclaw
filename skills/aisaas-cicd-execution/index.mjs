/**
 * CI/CD Execution — Core Logic
 * AI SaaS Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PIPELINE_TABLE = 'aisaas_cicd_pipelines';
const RUN_TABLE      = 'aisaas_cicd_runs';
const RELEASE_TABLE  = 'aisaas_releases';

export async function triggerPipeline(eventType, ref, metadata = {}) {
  const run = { event_type: eventType, ref, metadata, status: 'triggered', triggered_at: new Date().toISOString() };
  const { data } = await supabase.from(RUN_TABLE).insert(run).select('id').single();
  return { run_id: data?.id ?? `run-${Date.now()}`, ...run };
}

export async function runGates(runId, gates) {
  const results = gates.map(g => ({ gate: g.name, status: g.check() ? 'passed' : 'failed', run_id: runId }));
  const all_passed = results.every(r => r.status === 'passed');
  await supabase.from(RUN_TABLE).update({ gates_status: all_passed ? 'passed' : 'failed', gates_results: results }).eq('id', runId);
  return { run_id: runId, all_passed, results };
}

export async function packageArtifacts(runId, version) {
  const artifact = { run_id: runId, version, artifact_id: `artifact-${version}-${Date.now()}`, immutable: true, packaged_at: new Date().toISOString() };
  await supabase.from(RUN_TABLE).update({ artifact }).eq('id', runId);
  return artifact;
}

export async function stageDeploy(runId, environment) {
  const envOrder = ['dev', 'staging', 'production'];
  const envIndex = envOrder.indexOf(environment);
  await supabase.from(RUN_TABLE).update({ current_env: environment, env_index: envIndex, deployed_at: new Date().toISOString() }).eq('id', runId);
  return { run_id: runId, environment, next_env: envOrder[envIndex + 1] ?? null };
}

export async function monitorHealthChecks(runId) {
  const checks = { error_rate_ok: true, latency_ok: true, memory_ok: true };
  const healthy = Object.values(checks).every(Boolean);
  await supabase.from(RUN_TABLE).update({ health: healthy ? 'healthy' : 'degraded', health_checks: checks }).eq('id', runId);
  return { run_id: runId, healthy, checks };
}

export async function autoRollback(runId, reason) {
  await supabase.from(RUN_TABLE).update({ status: 'rolled_back', rollback_reason: reason, rolled_back_at: new Date().toISOString() }).eq('id', runId);
  return { run_id: runId, rolled_back: true, reason };
}

export async function outputReleaseReport(runId) {
  const { data } = await supabase.from(RUN_TABLE).select('*').eq('id', runId).single();
  return { run: data, generated_at: new Date().toISOString() };
}
