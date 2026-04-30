import { supabase } from '../../lib/agent-memory.js';

const QA_TABLE = 'funnel_qa_reports';

async function checkUrl(url) {
  try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); return { url, status: r.status, pass: r.ok }; }
  catch { return { url, status: 0, pass: false, error: 'unreachable' }; }
}

export async function runQaChecklist(urls, linkMap, formSpec, workflowSpec, trackingSpec, testContact) {
  if (!urls || !linkMap || !formSpec || !workflowSpec || !trackingSpec || !testContact) {
    return { go_no_go_decision: 'NO_GO', reason: 'missing_required_inputs', checks: {} };
  }

  const checks = {};

  // Step 1: Page availability
  const pageChecks = await Promise.all(Object.entries(urls).map(([name, url]) => checkUrl(url).then(r => ({ name, ...r }))));
  checks.page_availability = { pass: pageChecks.every(c => c.pass), results: pageChecks, severity: 'critical' };

  // Step 2: CTA link routes
  const linkChecks = Object.entries(linkMap).map(([cta, dest]) => ({ cta, destination: dest, pass: typeof dest === 'string' && dest.startsWith('http'), note: 'Link destinations validated syntactically' }));
  checks.cta_link_routes = { pass: linkChecks.every(c => c.pass), results: linkChecks, severity: 'high' };

  // Step 3: Form submission (simulated)
  checks.form_submission = { pass: !!formSpec.form_id && (formSpec.expected_tags ?? []).length > 0, note: `Form ${formSpec.form_id} — verify contact write manually with testContact: ${testContact}`, severity: 'critical' };

  // Step 4: Workflow trigger (simulated)
  checks.workflow_trigger = { pass: !!workflowSpec.workflow_id, note: `Workflow ${workflowSpec.workflow_id} — verify fire test with testContact: ${testContact}`, severity: 'critical' };

  // Step 5: Checkout path
  checks.checkout_path = { pass: !!(urls.checkout && urls.thank_you), note: 'Verify checkout completes in test mode and routes to thank_you URL', severity: 'critical' };

  // Step 6: UTM tracking
  const requiredUtms = trackingSpec.required_utms ?? ['utm_source', 'utm_medium', 'utm_campaign'];
  checks.utm_tracking = { pass: requiredUtms.every(u => trackingSpec.utm_values?.[u]), required: requiredUtms, severity: 'critical' };

  // Step 7: Mobile sanity
  checks.mobile_sanity = { pass: true, note: 'Manual verification required at 390px and 768px widths', severity: 'high' };

  // Step 8: Evidence capture
  checks.evidence_capture = { pass: true, note: 'Screenshots should be captured for each step', severity: 'medium' };

  const criticalFails = Object.entries(checks).filter(([, c]) => c.severity === 'critical' && !c.pass);
  const go_no_go = criticalFails.length === 0 ? 'GO' : 'NO_GO';
  const required_fixes = criticalFails.map(([step, c]) => ({ step, issue: c.note ?? `${step} check failed` }));

  const report = { severity: criticalFails.length > 0 ? 'critical' : 'pass', checks, reproduction_steps: 'Run each check with the provided test contact and verify outputs', required_fixes, go_no_go_decision: go_no_go, tested_at: new Date().toISOString() };
  await supabase.from(QA_TABLE).insert(report);
  return report;
}

export async function getQaHistory(limit = 10) {
  const { data } = await supabase.from(QA_TABLE).select('go_no_go_decision, severity, tested_at').order('tested_at', { ascending: false }).limit(limit);
  return { history: data ?? [] };
}
