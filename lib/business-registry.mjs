import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");

export const DEFAULT_BUSINESS_REGISTRY_PATH = join(
  ROOT_DIR,
  "data",
  "business-registry.json",
);

export const TENANCY_REASON_MAP = {
  distinct_legal_entity: "distinct legal entity",
  distinct_billing_stack: "distinct billing stack",
  distinct_brand_domain: "distinct brand/domain",
  distinct_support_team: "distinct support team",
  compliance_sensitive: "compliance-sensitive scope",
  distinct_fulfillment_model: "distinct fulfillment model",
};

export function classifyBusinessTenancy(tenancyInputs = {}, requestedScopeType = "auto") {
  const reasons = Object.entries(TENANCY_REASON_MAP)
    .filter(([key]) => Boolean(tenancyInputs[key]))
    .map(([, label]) => label);
  const explicitScopeType = typeof requestedScopeType === "string"
    ? requestedScopeType.trim()
    : "";

  if (explicitScopeType && explicitScopeType !== "auto") {
    const scopeFamily = explicitScopeType.startsWith("dedicated")
      ? "dedicated"
      : explicitScopeType.startsWith("internal")
        ? "internal"
        : "shared";
    return {
      scope_family: scopeFamily,
      ghl_scope_type: explicitScopeType,
      reasons: tenancyInputs.internal_operations_scope
        ? Array.from(new Set(["internal portfolio control scope", ...reasons]))
        : reasons,
      dedicated: scopeFamily === "dedicated",
    };
  }

  if (tenancyInputs.internal_operations_scope) {
    return {
      scope_family: "internal",
      ghl_scope_type: "internal_operations_subaccount",
      reasons: ["internal portfolio control scope"],
      dedicated: false,
    };
  }

  if (reasons.length > 0) {
    return {
      scope_family: "dedicated",
      ghl_scope_type: "dedicated_subaccount",
      reasons,
      dedicated: true,
    };
  }

  if (tenancyInputs.incubator_shared_candidate) {
    return {
      scope_family: "shared",
      ghl_scope_type: "shared_incubator_subaccount",
      reasons: ["incubator/test business with shared legal, billing, and support model"],
      dedicated: false,
    };
  }

  return {
    scope_family: "shared",
    ghl_scope_type: "shared_subaccount",
    reasons: ["no dedicated-scope trigger provided"],
    dedicated: false,
  };
}

export function summarizeAutomationBlueprint(automationBlueprint = {}) {
  const flags = Object.entries(automationBlueprint).filter(([, value]) => typeof value === "boolean");
  const enabled = flags.filter(([, value]) => value).length;
  const total = flags.length;
  const coverage = total === 0 ? 0 : enabled / total;

  return {
    enabled,
    total,
    coverage,
  };
}

export function enrichBusinessRecord(business) {
  const tenancy = classifyBusinessTenancy(
    business.tenancy_inputs,
    business.ghl_scope_type,
  );
  const blueprint = summarizeAutomationBlueprint(business.automation_blueprint);
  const automationTargetRate = Number(
    business.kpi_targets?.automation_target_rate ?? 0.95,
  );
  const membershipEnabled = Boolean(business.membership?.enabled);
  const communityEnabled = Boolean(business.membership?.community);

  return {
    ...business,
    owner_pod: business.owner_pod || `${business.pod_id}_pod_lead`,
    resolved_ghl_scope_type: tenancy.ghl_scope_type,
    scope_family: tenancy.scope_family,
    tenancy_reasons: tenancy.reasons,
    automation_target_rate: automationTargetRate,
    automation_blueprint_summary: blueprint,
    membership_enabled: membershipEnabled,
    community_enabled: communityEnabled,
    pipeline_count: Array.isArray(business.pipeline_set) ? business.pipeline_set.length : 0,
  };
}

export function validateBusinessRegistry(registry) {
  const issues = [];

  if (!registry || typeof registry !== "object") {
    return ["Registry payload is missing or not an object"];
  }

  if (!Array.isArray(registry.businesses)) {
    return ["Registry must include a businesses array"];
  }

  const businessIds = new Set();
  const podIds = new Set();

  registry.businesses.forEach((business, index) => {
    const label = business?.business_id || `businesses[${index}]`;
    for (const field of [
      "business_id",
      "pod_id",
      "business_name",
      "brand_name",
      "legal_entity",
      "offer_model",
      "payment_provider",
      "calendar_model",
      "owner_pod",
    ]) {
      if (!business?.[field]) {
        issues.push(`${label} missing required field: ${field}`);
      }
    }

    if (!Array.isArray(business?.pipeline_set) || business.pipeline_set.length === 0) {
      issues.push(`${label} must define at least one pipeline`);
    }

    if (businessIds.has(business?.business_id)) {
      issues.push(`Duplicate business_id: ${business.business_id}`);
    }
    businessIds.add(business?.business_id);

    if (podIds.has(business?.pod_id)) {
      issues.push(`Duplicate pod_id: ${business.pod_id}`);
    }
    podIds.add(business?.pod_id);
  });

  return issues;
}

export function loadBusinessRegistry(registryPath = DEFAULT_BUSINESS_REGISTRY_PATH) {
  if (!existsSync(registryPath)) {
    throw new Error(`Business registry not found: ${registryPath}`);
  }

  const registry = JSON.parse(readFileSync(registryPath, "utf-8"));
  const issues = validateBusinessRegistry(registry);

  if (issues.length > 0) {
    throw new Error(`Business registry validation failed:\n- ${issues.join("\n- ")}`);
  }

  const businesses = registry.businesses.map(enrichBusinessRecord);

  return {
    ...registry,
    businesses,
  };
}

export function buildRuntimePods(registry) {
  return registry.businesses
    .slice()
    .sort((left, right) => left.pod_id.localeCompare(right.pod_id))
    .map((business) => ({
      pod_id: business.pod_id,
      name: business.business_name,
      pod_lead: `${business.pod_id}_pod_lead`,
      worker_types: ["growth_worker", "sales_worker", "delivery_worker", "ops_worker"],
      max_concurrent_workers: 2,
      max_p1_workers: 1,
    }));
}

export function buildPortfolioSummary(registry) {
  const businesses = registry.businesses.map(enrichBusinessRecord);
  const scopeCounts = {
    dedicated: 0,
    shared: 0,
    internal: 0,
  };
  const waveCounts = {};
  let membershipsEnabled = 0;
  let communitiesEnabled = 0;
  let automationTargetTotal = 0;
  let blueprintCoverageTotal = 0;

  for (const business of businesses) {
    scopeCounts[business.scope_family] += 1;
    waveCounts[business.rollout_wave] = (waveCounts[business.rollout_wave] || 0) + 1;
    membershipsEnabled += business.membership_enabled ? 1 : 0;
    communitiesEnabled += business.community_enabled ? 1 : 0;
    automationTargetTotal += business.automation_target_rate;
    blueprintCoverageTotal += business.automation_blueprint_summary.coverage;
  }

  return {
    portfolio_name: registry.portfolio_name,
    total_businesses: businesses.length,
    dedicated_scopes: scopeCounts.dedicated,
    shared_scopes: scopeCounts.shared,
    internal_scopes: scopeCounts.internal,
    businesses_with_memberships: membershipsEnabled,
    businesses_with_communities: communitiesEnabled,
    automation_target_rate:
      businesses.length === 0 ? 0 : automationTargetTotal / businesses.length,
    blueprint_coverage_rate:
      businesses.length === 0 ? 0 : blueprintCoverageTotal / businesses.length,
    rollout_wave_counts: waveCounts,
    businesses: businesses.map((business) => ({
      business_id: business.business_id,
      pod_id: business.pod_id,
      business_name: business.business_name,
      brand_name: business.brand_name,
      vertical: business.vertical,
      status: business.status,
      scope_family: business.scope_family,
      resolved_ghl_scope_type: business.resolved_ghl_scope_type,
      rollout_wave: business.rollout_wave,
      automation_target_rate: business.automation_target_rate,
      blueprint_coverage_rate: business.automation_blueprint_summary.coverage,
      membership_enabled: business.membership_enabled,
      community_enabled: business.community_enabled,
      owner_pod: business.owner_pod,
    })),
  };
}
