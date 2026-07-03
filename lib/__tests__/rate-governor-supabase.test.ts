import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fix RUNTIME_ID before the module under test is evaluated.
vi.hoisted(() => {
  process.env.OPENCLAW_RUNTIME_ID = "test-rt";
});

const { mockRpc, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockRpc = vi.fn(async () => ({ error: null }));
  const mockEq = vi.fn(async () => ({ data: [] as unknown[], error: null }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockRpc, mockEq, mockSelect, mockFrom };
});

vi.mock("../agent-memory", () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}));

vi.mock("../logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import { isEnabled, pushDeltas, pullToday, RUNTIME_ID } from "../rate-governor-supabase";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  mockRpc.mockClear();
  mockFrom.mockClear();
  mockEq.mockClear();
  mockEq.mockImplementation(async () => ({ data: [], error: null }));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const sampleDelta = {
  provider: "ghl",
  day: "2026-07-03",
  spentCentsDelta: 12.6,
  requestCountDelta: 3,
  warningEmitted: false,
  circuitState: "closed" as const,
  failures: 0,
  lastFailureAt: 0,
  openedAt: 0,
};

describe("rate-governor-supabase adapter", () => {
  it("uses the pinned runtime id", () => {
    expect(RUNTIME_ID).toBe("test-rt");
  });

  it("is disabled (no-op) when SUPABASE_URL is missing", async () => {
    delete process.env.SUPABASE_URL;
    expect(isEnabled()).toBe(false);
    await pushDeltas([sampleDelta]);
    expect(mockRpc).not.toHaveBeenCalled();
    const map = await pullToday();
    expect(map.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("pushes deltas through the upsert RPC with runtime id and clamped values", async () => {
    await pushDeltas([sampleDelta]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [fn, params] = mockRpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("upsert_rate_governor_state");
    expect(params.p_provider).toBe("ghl");
    expect(params.p_state_day).toBe("2026-07-03");
    expect(params.p_spent_cents_delta).toBe(13); // rounded
    expect(params.p_request_count_delta).toBe(3);
    expect(params.p_runtime_id).toBe("test-rt");
  });

  it("swallows RPC errors (never throws into governor paths)", async () => {
    mockRpc.mockImplementationOnce(async () => ({ error: { message: "boom" } }));
    await expect(pushDeltas([sampleDelta])).resolves.toBeUndefined();
    mockRpc.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    await expect(pushDeltas([sampleDelta])).resolves.toBeUndefined();
  });

  it("pullToday sums rows across runtimes and ORs circuit-open", async () => {
    mockEq.mockImplementationOnce(async () => ({
      data: [
        { provider: "ghl", spent_cents: 10, request_count: 1, circuit_state: "closed" },
        { provider: "ghl", spent_cents: 5, request_count: 2, circuit_state: "open" },
        { provider: "telegram", spent_cents: 0, request_count: 7, circuit_state: "closed" },
      ],
      error: null,
    }));
    const map = await pullToday();
    expect(map.get("ghl")).toEqual({ spentCents: 15, requestCount: 3, circuitOpen: true });
    expect(map.get("telegram")).toEqual({ spentCents: 0, requestCount: 7, circuitOpen: false });
  });

  it("pullToday returns an empty map on query error", async () => {
    mockEq.mockImplementationOnce(async () => ({ data: null, error: { message: "boom" } }));
    const map = await pullToday();
    expect(map.size).toBe(0);
  });
});
