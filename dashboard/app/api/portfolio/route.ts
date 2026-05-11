import { NextResponse } from "next/server";

import { getServiceSupabase } from "../../../lib/server-auth";

interface BusinessRow {
  business_id: string;
  pod_id: string;
  business_name: string;
  brand_name: string;
  vertical: string;
  status: string;
  ghl_scope_type: string;
  owner_pod: string;
  rollout: { wave?: number } | null;
  kpi_targets: { automation_target_rate?: number } | null;
  membership_config: { enabled?: boolean; community?: boolean } | null;
  automation_blueprint: Record<string, boolean> | null;
}

function scopeFamily(ghlScopeType: string): string {
  if (ghlScopeType.includes("internal")) return "internal";
  if (ghlScopeType.includes("incubator")) return "shared";
  if (ghlScopeType.includes("dedicated")) return "dedicated";
  return "shared";
}

function blueprintCoverage(blueprint: Record<string, boolean> | null): number {
  if (!blueprint) return 0;
  const values = Object.values(blueprint);
  if (values.length === 0) return 0;
  return values.filter(Boolean).length / values.length;
}

export async function GET() {
  const supabase = await getServiceSupabase();

  const { data: businesses, error } = await supabase
    .from("business_registry")
    .select(
      "business_id, pod_id, business_name, brand_name, vertical, status, ghl_scope_type, owner_pod, rollout, kpi_targets, membership_config, automation_blueprint",
    )
    .order("pod_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load business registry" }, { status: 500 });
  }

  const rows = (businesses ?? []) as BusinessRow[];

  const dedicated = rows.filter((b) => b.ghl_scope_type?.includes("dedicated")).length;
  const shared = rows.filter(
    (b) => b.ghl_scope_type?.includes("shared") && !b.ghl_scope_type?.includes("incubator"),
  ).length;
  const internal = rows.filter((b) => b.ghl_scope_type?.includes("internal")).length;

  const automationRates = rows
    .map((b) => b.kpi_targets?.automation_target_rate ?? 0)
    .filter((r) => r > 0);
  const avgAutomationRate =
    automationRates.length > 0
      ? automationRates.reduce((a, b) => a + b, 0) / automationRates.length
      : 0;

  const avgBlueprintCoverage =
    rows.length > 0
      ? rows.reduce((sum, b) => sum + blueprintCoverage(b.automation_blueprint), 0) / rows.length
      : 0;

  const rolloutWaveCounts = rows.reduce<Record<string, number>>((acc, b) => {
    const wave = String(b.rollout?.wave ?? "unknown");
    acc[wave] = (acc[wave] ?? 0) + 1;
    return acc;
  }, {});

  const mappedBusinesses = rows.map((b) => ({
    business_id: b.business_id,
    pod_id: b.pod_id,
    business_name: b.business_name,
    brand_name: b.brand_name,
    vertical: b.vertical,
    status: b.status,
    scope_family: scopeFamily(b.ghl_scope_type ?? ""),
    resolved_ghl_scope_type: b.ghl_scope_type ?? "unknown",
    rollout_wave: b.rollout?.wave ?? 0,
    automation_target_rate: b.kpi_targets?.automation_target_rate ?? 0,
    blueprint_coverage_rate: blueprintCoverage(b.automation_blueprint),
    membership_enabled: b.membership_config?.enabled ?? false,
    community_enabled: b.membership_config?.community ?? false,
    owner_pod: b.owner_pod,
  }));

  return NextResponse.json({
    portfolio_name: "Truth J Blue 10-Business GHL Portfolio",
    total_businesses: rows.length,
    dedicated_scopes: dedicated,
    shared_scopes: shared,
    internal_scopes: internal,
    businesses_with_memberships: rows.filter((b) => b.membership_config?.enabled).length,
    businesses_with_communities: rows.filter((b) => b.membership_config?.community).length,
    automation_target_rate: avgAutomationRate,
    blueprint_coverage_rate: avgBlueprintCoverage,
    rollout_wave_counts: rolloutWaveCounts,
    businesses: mappedBusinesses,
  });
}
