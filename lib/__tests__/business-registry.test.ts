import { describe, expect, it } from "vitest";

import {
  buildPortfolioSummary,
  classifyBusinessTenancy,
  loadBusinessRegistry,
  summarizeAutomationBlueprint,
} from "../business-registry.mjs";

describe("business-registry", () => {
  it("classifies dedicated scopes when mixed-tenancy triggers are present", () => {
    const result = classifyBusinessTenancy({
      distinct_billing_stack: true,
      incubator_shared_candidate: false,
    });

    expect(result.scope_family).toBe("dedicated");
    expect(result.ghl_scope_type).toBe("dedicated_subaccount");
    expect(result.reasons).toContain("distinct billing stack");
  });

  it("classifies incubator scopes as shared when no dedicated triggers are present", () => {
    const result = classifyBusinessTenancy({
      incubator_shared_candidate: true,
    });

    expect(result.scope_family).toBe("shared");
    expect(result.ghl_scope_type).toBe("shared_incubator_subaccount");
  });

  it("classifies internal portfolio scopes separately", () => {
    const result = classifyBusinessTenancy({
      internal_operations_scope: true,
    });

    expect(result.scope_family).toBe("internal");
    expect(result.ghl_scope_type).toBe("internal_operations_subaccount");
  });

  it("allows internal portfolio businesses to share TJB or MSL explicitly", () => {
    const result = classifyBusinessTenancy(
      {
        internal_operations_scope: true,
      },
      "shared_tjb_subaccount",
    );

    expect(result.scope_family).toBe("shared");
    expect(result.ghl_scope_type).toBe("shared_tjb_subaccount");
    expect(result.reasons).toContain("internal portfolio control scope");
  });

  it("respects explicit shared tenant scope types", () => {
    const result = classifyBusinessTenancy({}, "shared_tjb_subaccount");

    expect(result.scope_family).toBe("shared");
    expect(result.ghl_scope_type).toBe("shared_tjb_subaccount");
  });

  it("summarizes the automation blueprint coverage", () => {
    const summary = summarizeAutomationBlueprint({
      snapshot_pack: true,
      calendars: false,
      support_routing: true,
    });

    expect(summary.enabled).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.coverage).toBeCloseTo(2 / 3, 5);
  });

  // Counts pin the dashboard truth (Supabase business_registry), reconciled
  // 2026-07-12: +biz_11 MVP Cashflow, +biz_12 Royal Results (dedicated RR),
  // membership/community = 3/3 per the scope-map header. Audits -004/-006.
  it("loads the 12-business portfolio and returns the scope-map summary", () => {
    const registry = loadBusinessRegistry();
    const summary = buildPortfolioSummary(registry);

    expect(registry.businesses).toHaveLength(12);
    expect(summary.total_businesses).toBe(12);
    expect(summary.dedicated_scopes).toBe(1);
    expect(summary.shared_scopes).toBe(11);
    expect(summary.internal_scopes).toBe(0);
    expect(summary.businesses_with_memberships).toBe(3);
    expect(summary.businesses_with_communities).toBe(3);
  });
});
