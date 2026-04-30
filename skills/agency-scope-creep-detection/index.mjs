/**
 * Scope Creep Detection — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const SCOPE_TABLE   = 'agency_contract_scope';
const CHANGE_TABLE  = 'agency_scope_changes';

export async function parseIncomingRequests(requests) {
  return requests.map(r => ({ request_id: r.id ?? `req-${Date.now()}`, description: r.description, parsed_at: new Date().toISOString() }));
}

export async function classifyRequests(requests, contractId) {
  const { data } = await supabase.from(SCOPE_TABLE).select('deliverables').eq('contract_id', contractId).single();
  const deliverables = data?.deliverables ?? [];
  return requests.map(r => {
    const inScope = deliverables.some(d => r.description.toLowerCase().includes(d.toLowerCase()));
    return { ...r, classification: inScope ? 'in_scope' : r.description.length > 100 ? 'out_of_scope' : 'borderline' };
  });
}

export function estimateEffortImpact(outOfScopeRequests) {
  return outOfScopeRequests.map(r => ({
    ...r,
    estimated_hours: Math.ceil(r.description.split(' ').length / 10),
    estimated_cost: Math.ceil(r.description.split(' ').length / 10) * 150,
  }));
}

export function generateChangeOrderLanguage(requests) {
  return requests.map(r => ({
    request_id: r.request_id,
    change_order_title: `Change Order: ${r.description.slice(0, 50)}`,
    scope_addition: r.description,
    additional_investment: `$${r.estimated_cost ?? 500}`,
    timeline_impact: `${r.estimated_hours ?? 4} additional hours`,
  }));
}

export async function alertAccountLead(changeOrders, accountLeadId) {
  return { alerted: true, account_lead: accountLeadId, change_order_count: changeOrders.length, alerted_at: new Date().toISOString() };
}

export async function trackScopeChanges(contractId, changeOrders) {
  const rows = changeOrders.map(co => ({ contract_id: contractId, ...co, status: 'pending', created_at: new Date().toISOString() }));
  if (rows.length) await supabase.from(CHANGE_TABLE).insert(rows);
  return { tracked: rows.length };
}

export async function outputScopeVarianceReport(contractId) {
  const { data } = await supabase.from(CHANGE_TABLE).select('*').eq('contract_id', contractId);
  const total_cost = (data ?? []).reduce((a, c) => a + parseInt((c.additional_investment ?? '$0').replace(/\D/g, '') || 0), 0);
  return { contract_id: contractId, changes: data ?? [], total_added_cost: total_cost, generated_at: new Date().toISOString() };
}
