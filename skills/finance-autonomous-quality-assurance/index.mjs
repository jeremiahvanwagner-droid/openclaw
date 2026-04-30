import { supabase } from '../../lib/agent-memory.js';

const GUARDRAIL_TABLE   = 'finance_guardrails';
const QA_RESULT_TABLE   = 'finance_qa_results';
const REMEDIATION_TABLE = 'finance_qa_remediations';

export async function defineGuardrails(systemId, checks) {
  const rows = checks.map(c => ({ system_id: systemId, check_id: c.id, layer: c.layer ?? 'execution', description: c.description, threshold: c.threshold, severity: c.severity ?? 'medium', active: true, defined_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(GUARDRAIL_TABLE).upsert(rows, { onConflict: 'system_id,check_id' });
  return { system_id: systemId, guardrails_defined: rows.length };
}

export async function runAssertions(systemId, liveState) {
  const { data: guardrails } = await supabase.from(GUARDRAIL_TABLE).select('*').eq('system_id', systemId).eq('active', true);
  const results = (guardrails ?? []).map(g => {
    const value = liveState[g.check_id];
    const passed = value !== undefined && value <= (g.threshold ?? Infinity);
    return { check_id: g.check_id, layer: g.layer, passed, value, threshold: g.threshold, severity: g.severity };
  });
  await supabase.from(QA_RESULT_TABLE).insert(results.map(r => ({ system_id: systemId, ...r, asserted_at: new Date().toISOString() })));
  return { system_id: systemId, total: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length };
}

export async function detectDrift(systemId) {
  const { data } = await supabase.from(QA_RESULT_TABLE).select('check_id, passed').eq('system_id', systemId).order('asserted_at', { ascending: false }).limit(50);
  const failureRates = (data ?? []).reduce((acc, r) => { if (!acc[r.check_id]) acc[r.check_id] = { total: 0, failed: 0 }; acc[r.check_id].total++; if (!r.passed) acc[r.check_id].failed++; return acc; }, {});
  const drifted = Object.entries(failureRates).filter(([, v]) => v.failed / v.total > 0.3).map(([k]) => k);
  return { system_id: systemId, drifted_checks: drifted, drift_detected: drifted.length > 0 };
}

export async function triggerContainment(systemId, failedCheck) {
  await supabase.from(QA_RESULT_TABLE).update({ contained: true, contained_at: new Date().toISOString() }).eq('system_id', systemId).eq('check_id', failedCheck);
  return { system_id: systemId, check_id: failedCheck, contained: true };
}

export async function runReplayTests(systemId, scenarios) {
  const results = scenarios.map(s => ({ scenario_id: s.id, passed: s.expected === s.actual, expected: s.expected, actual: s.actual }));
  return { system_id: systemId, replays_run: results.length, passed: results.filter(r => r.passed).length };
}

export async function createRemediationTasks(systemId, failures) {
  const tasks = failures.map(f => ({ system_id: systemId, check_id: f.check_id, owner: f.owner ?? 'unassigned', sla_hours: f.severity === 'critical' ? 4 : 24, status: 'open', created_at: new Date().toISOString() }));
  if (tasks.length) await supabase.from(REMEDIATION_TABLE).insert(tasks);
  return { tasks_created: tasks.length };
}

export async function outputQaScorecard(systemId) {
  const { data: results } = await supabase.from(QA_RESULT_TABLE).select('passed, layer, severity').eq('system_id', systemId).order('asserted_at', { ascending: false }).limit(100);
  const rows = results ?? [];
  const score = rows.length > 0 ? Math.round(rows.filter(r => r.passed).length / rows.length * 100) : 100;
  return { system_id: systemId, health_score: score, by_layer: rows.reduce((acc, r) => { acc[r.layer] = (acc[r.layer] ?? { pass: 0, fail: 0 }); r.passed ? acc[r.layer].pass++ : acc[r.layer].fail++; return acc; }, {}), generated_at: new Date().toISOString() };
}
