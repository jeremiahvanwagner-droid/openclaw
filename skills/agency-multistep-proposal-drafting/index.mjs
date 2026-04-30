/**
 * Multi-step Proposal Drafting — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const PROPOSAL_TABLE = 'agency_proposals';

export async function ingestCallNotes(sessionId, notes) {
  await supabase.from(PROPOSAL_TABLE).upsert({ session_id: sessionId, call_notes: notes, stage: 'ingested', created_at: new Date().toISOString() }, { onConflict: 'session_id' });
  return { session_id: sessionId, notes_length: notes.length };
}

export function mapNeedsToModules(callNotes) {
  const keywords = callNotes.toLowerCase();
  const modules = [];
  if (/crm|contact/i.test(keywords)) modules.push({ module: 'CRM Setup', scope: 'Configure CRM pipeline and automation' });
  if (/email|newsletter/i.test(keywords)) modules.push({ module: 'Email Marketing', scope: 'Email sequences and broadcast system' });
  if (/funnel|landing/i.test(keywords)) modules.push({ module: 'Funnel Build', scope: 'Landing pages and conversion optimization' });
  if (/seo|search/i.test(keywords)) modules.push({ module: 'SEO Strategy', scope: 'Keyword research and content plan' });
  if (!modules.length) modules.push({ module: 'Discovery Package', scope: 'Full business analysis and roadmap' });
  return { modules };
}

export function buildPhasedStructure(modules) {
  const phases = modules.map((m, i) => ({ phase: i + 1, module: m.module, timeline_weeks: 2, deliverables: [m.scope], outcome: `Fully operational ${m.module}` }));
  return { phases, total_weeks: phases.reduce((a, p) => a + p.timeline_weeks, 0) };
}

export function generatePricingOptions(phases, baseRate = 5000) {
  const options = [
    { tier: 'starter', phases: phases.slice(0, 1), price: baseRate, description: 'Core implementation' },
    { tier: 'growth', phases: phases.slice(0, Math.ceil(phases.length / 2)), price: baseRate * 2, description: 'Expanded scope' },
    { tier: 'enterprise', phases, price: baseRate * phases.length, description: 'Full engagement' },
  ];
  return { options };
}

export function addAssumptions(phases) {
  const assumptions = ['Client provides all brand assets within 5 business days', 'Scope excludes paid media management', 'Client reviews have 48-hour turnaround'];
  const checkpoints = phases.map(p => ({ phase: p.phase, approval_required: true, milestone: p.deliverables[0] }));
  return { assumptions, checkpoints };
}

export function generateExecutiveSummary(clientGoals, phases) {
  const summary = `This proposal outlines a ${phases.length}-phase engagement to achieve ${clientGoals}. Total investment covers ${phases.map(p => p.module).join(', ')}.`;
  const cta = 'To move forward, please review and approve the proposal below.';
  return { summary, cta };
}

export async function outputProposal(sessionId) {
  const { data } = await supabase.from(PROPOSAL_TABLE).select('*').eq('session_id', sessionId).single();
  return { session_id: sessionId, proposal: data, generated_at: new Date().toISOString() };
}
