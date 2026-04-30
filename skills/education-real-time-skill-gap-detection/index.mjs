import { supabase } from '../../lib/agent-memory.js';

const GAP_TABLE          = 'education_skill_gaps';
const REMEDIATION_TABLE  = 'education_gap_remediations';

export async function ingestSignals(learnerId, signals) {
  const rows = signals.map(s => ({ learner_id: learnerId, signal_type: s.type, context: s.context, timestamp: s.timestamp ?? new Date().toISOString() }));
  if (rows.length) await supabase.from('education_learner_signals').insert(rows);
  return { learner_id: learnerId, signals_ingested: rows.length };
}

export function mapSignalsToCompetencies(signals, competencyMap) {
  return signals.map(s => ({ ...s, competency: competencyMap[s.context ?? ''] ?? competencyMap[s.signal_type ?? ''] ?? 'general' }));
}

export function scoreGapSeverity(mappedSignals) {
  const competencyErrors = mappedSignals.reduce((acc, s) => {
    if (!acc[s.competency]) acc[s.competency] = { count: 0, recent: 0 };
    acc[s.competency].count++;
    const age = (Date.now() - new Date(s.timestamp).getTime()) / 3600000;
    if (age < 24) acc[s.competency].recent++;
    return acc;
  }, {});
  return Object.entries(competencyErrors).map(([comp, data]) => {
    const severity = data.recent >= 3 ? 'critical' : data.count >= 5 ? 'high' : data.count >= 2 ? 'medium' : 'low';
    return { competency: comp, error_count: data.count, recent_errors: data.recent, severity };
  });
}

export function separateTransientFromPersistent(gaps) {
  const persistent = gaps.filter(g => g.error_count >= 3 || g.severity === 'critical');
  const transient = gaps.filter(g => g.error_count < 3 && g.severity !== 'critical');
  return { persistent, transient };
}

export async function triggerRemediations(learnerId, persistentGaps) {
  const remediations = persistentGaps.map(g => ({ learner_id: learnerId, competency: g.competency, severity: g.severity, action: `Review module covering: ${g.competency}`, triggered_at: new Date().toISOString() }));
  if (remediations.length) await supabase.from(REMEDIATION_TABLE).insert(remediations);
  return { learner_id: learnerId, remediations_triggered: remediations.length };
}

export async function notifyOrchestration(learnerId, gaps) {
  const gapSummary = gaps.map(g => ({ competency: g.competency, severity: g.severity }));
  return { learner_id: learnerId, gap_summary: gapSummary, machine_readable: true, timestamp: new Date().toISOString() };
}

export async function updateGapStatus(learnerId, competency, resolved) {
  await supabase.from(GAP_TABLE).update({ resolved, resolved_at: resolved ? new Date().toISOString() : null }).eq('learner_id', learnerId).eq('competency', competency);
  return { learner_id: learnerId, competency, resolved };
}
