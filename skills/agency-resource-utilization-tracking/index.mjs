/**
 * Resource Utilization Tracking — Core Logic
 * Agency Skill
 */

import { supabase } from '../../lib/agent-memory.js';

const RESOURCE_TABLE = 'agency_resources';
const UTIL_TABLE     = 'agency_utilization_snapshots';

export async function aggregateWorkloadAssignments(resources) {
  const rows = resources.map(r => ({ resource_id: r.id, name: r.name, type: r.type ?? 'human', capacity_hours: r.capacity_hours ?? 40, assigned_hours: r.assigned_hours ?? 0, updated_at: new Date().toISOString() }));
  await supabase.from(RESOURCE_TABLE).upsert(rows, { onConflict: 'resource_id' });
  return { resources: rows.length };
}

export async function computeUtilizationRates() {
  const { data } = await supabase.from(RESOURCE_TABLE).select('*');
  const rates = (data ?? []).map(r => ({ ...r, utilization_rate: Math.min(1, (r.assigned_hours ?? 0) / (r.capacity_hours ?? 40)) }));
  await supabase.from(UTIL_TABLE).insert({ rates, snapshot_at: new Date().toISOString() });
  return { rates };
}

export async function detectOverAllocation() {
  const { data } = await supabase.from(RESOURCE_TABLE).select('*');
  const over = (data ?? []).filter(r => (r.assigned_hours ?? 0) > (r.capacity_hours ?? 40) * 1.1);
  return { over_allocated: over, count: over.length };
}

export function recommendRebalancing(rates) {
  const over = rates.filter(r => r.utilization_rate > 0.9);
  const under = rates.filter(r => r.utilization_rate < 0.5);
  const recommendations = over.flatMap(o => under.slice(0, 1).map(u => ({ move_from: o.name, move_to: u.name, recommended_hours: 5 })));
  return { recommendations };
}

export function simulateAllocationChange(rates, rebalanceActions) {
  const simulated = rates.map(r => {
    const action = rebalanceActions.find(a => a.move_from === r.name || a.move_to === r.name);
    if (!action) return r;
    const delta = r.name === action.move_from ? -action.recommended_hours : action.recommended_hours;
    return { ...r, simulated_hours: (r.assigned_hours ?? 0) + delta };
  });
  return { simulated };
}

export async function monitorPostReallocation(resourceId) {
  const { data } = await supabase.from(RESOURCE_TABLE).select('*').eq('resource_id', resourceId).single();
  return { resource_id: resourceId, current_utilization: (data?.assigned_hours ?? 0) / (data?.capacity_hours ?? 40) };
}

export async function outputUtilizationHeatmap() {
  const { data } = await supabase.from(RESOURCE_TABLE).select('*');
  return { heatmap: data ?? [], total_resources: (data ?? []).length, generated_at: new Date().toISOString() };
}
