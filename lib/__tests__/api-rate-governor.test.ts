import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRpc, mockSelect } = vi.hoisted(() => ({
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
  mockSelect: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock("../metrics", () => ({
  circuitBreakerState: { set: vi.fn() },
  budgetUsedDollars: { set: vi.fn() },
  budgetCeilingDollars: { set: vi.fn() },
  concurrencyActive: { set: vi.fn() },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  })),
}));

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

import {
  __resetForTests,
  checkRequest,
  getAllStatus,
  getStatus,
  reportFailure,
  reportSuccess,
  withGovernor,
} from "../api-rate-governor";

describe("api-rate-governor", () => {
  beforeEach(() => {
    __resetForTests({ deleteStateFile: true });
    mockRpc.mockClear();
    mockSelect.mockClear();
    mockRpc.mockResolvedValue({ error: null });
    mockSelect.mockResolvedValue({ data: [], error: null });
  });

  it("allows requests when provider tokens are available", () => {
    const result = checkRequest({ provider: "supabase", queueClass: "P2" });
    expect(result.allowed).toBe(true);
    reportSuccess("supabase", 0);
  });

  it("opens the circuit after repeated failures", () => {
    for (let i = 0; i < 5; i++) {
      reportFailure("anthropic", 500);
    }

    const status = getStatus("anthropic");
    expect(status.circuitState).toBe("open");
    expect(status.consecutiveFailures).toBe(5);
  });

  it("tracks spend inside the daily budget state", () => {
    reportSuccess("openai", 100);
    reportSuccess("openai", 200);

    const status = getStatus("openai");
    expect(status.dailySpentCents).toBe(300);
    expect(status.dailyRequestCount).toBe(2);
    expect(mockRpc).toHaveBeenCalled();
  });

  it("blocks when budget is exhausted", () => {
    reportSuccess("openai", 10_000);
    const result = checkRequest({ provider: "openai", queueClass: "P2" });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily budget exhausted");
  });

  it("wraps allowed calls with governor protection", async () => {
    const result = await withGovernor(
      { provider: "supabase", queueClass: "P0", estimatedCostCents: 50 },
      async () => "hello",
    );

    expect(result).toBe("hello");
    expect(getStatus("supabase").dailySpentCents).toBe(50);
  });

  it("rethrows auth failures and opens the circuit", async () => {
    await expect(
      withGovernor({ provider: "telegram", queueClass: "P2" }, async () => {
        const error = new Error("Unauthorized") as Error & { status: number };
        error.status = 401;
        throw error;
      }),
    ).rejects.toThrow("Unauthorized");

    expect(getStatus("telegram").circuitState).toBe("open");
  });

  it("returns status for all configured providers", () => {
    const providers = getAllStatus().map((status) => status.provider);
    expect(providers).toContain("openai-codex");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("ghl");
    expect(providers).toContain("supabase");
    expect(providers).toContain("telegram");
  });
});
