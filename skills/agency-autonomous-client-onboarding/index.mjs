/**
 * Autonomous Client Onboarding — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const ONBOARDING_TABLE = 'agency_onboarding_sessions';
const CHECKLIST_TABLE  = 'agency_onboarding_checklists';

export async function triggerOnboardingWorkflow(dealId, clientData) {
  const session = {
    deal_id: dealId, client_id: clientData.id, client_name: clientData.name,
    status: 'initiated', triggered_at: new Date().toISOString(), blockers: [],
  };
  const { data } = await supabase.from(ONBOARDING_TABLE).insert(session).select('id').single();
  return { session_id: data?.id, ...session };
}

export async function collectIntakeData(sessionId) {
  const required = ['company_name', 'billing_email', 'primary_contact', 'service_package', 'kick_off_date'];
  const { data } = await supabase.from(ONBOARDING_TABLE).select('intake_data').eq('id', sessionId).single();
  const provided = Object.keys(data?.intake_data ?? {});
  const missing = required.filter(r => !provided.includes(r));
  return { session_id: sessionId, provided, missing, complete: missing.length === 0 };
}

export async function provisionAccess(sessionId) {
  const resources = ['project_space', 'communication_channel', 'tool_access', 'shared_drive'];
  const provisioned = resources.map(r => ({ resource: r, status: 'provisioned', provisioned_at: new Date().toISOString() }));
  await supabase.from(ONBOARDING_TABLE).update({ provisioned_resources: provisioned }).eq('id', sessionId);
  return { session_id: sessionId, provisioned: resources };
}

export async function applyServicePackageTemplate(sessionId, packageName) {
  const templates = {
    starter: { milestones: 3, kickoff_days: 3, deliverables: ['initial_audit', 'strategy_doc'] },
    growth: { milestones: 5, kickoff_days: 5, deliverables: ['full_audit', 'strategy_doc', 'implementation_plan'] },
    enterprise: { milestones: 8, kickoff_days: 7, deliverables: ['comprehensive_audit', 'multi_track_strategy', 'dedicated_support'] },
  };
  const template = templates[packageName] ?? templates.starter;
  await supabase.from(ONBOARDING_TABLE).update({ package_template: template }).eq('id', sessionId);
  return { session_id: sessionId, template };
}

export async function scheduleMilestones(sessionId) {
  const { data } = await supabase.from(ONBOARDING_TABLE).select('package_template, triggered_at').eq('id', sessionId).single();
  const kickoff = new Date(data?.triggered_at ?? new Date());
  const milestones = (Array.from({ length: data?.package_template?.milestones ?? 3 })).map((_, i) => ({
    session_id: sessionId, milestone_number: i + 1,
    due_date: new Date(kickoff.getTime() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  }));
  if (milestones.length) await supabase.from(CHECKLIST_TABLE).insert(milestones);
  return { session_id: sessionId, milestones };
}

export async function validateReadinessGates(sessionId) {
  const { data } = await supabase.from(ONBOARDING_TABLE).select('*').eq('id', sessionId).single();
  const gates = { intake_complete: !!data?.intake_data, access_provisioned: !!data?.provisioned_resources, template_applied: !!data?.package_template };
  const all_passed = Object.values(gates).every(Boolean);
  return { session_id: sessionId, gates, ready: all_passed };
}

export async function outputOnboardingStatusReport(sessionId) {
  const { data } = await supabase.from(ONBOARDING_TABLE).select('*').eq('id', sessionId).single();
  const { data: milestones } = await supabase.from(CHECKLIST_TABLE).select('*').eq('session_id', sessionId);
  return { session: data, milestones: milestones ?? [], generated_at: new Date().toISOString() };
}
