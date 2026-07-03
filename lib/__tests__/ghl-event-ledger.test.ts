import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockInsert, mockUpdateEqEq, mockCreateClient } = vi.hoisted(() => {
  const mockInsert = vi.fn(async () => ({ error: null as { code?: string; message: string } | null }));
  const mockUpdateEqEq = vi.fn(async () => ({ error: null }));
  const mockCreateClient = vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: mockUpdateEqEq })),
      })),
    })),
  }));
  return { mockInsert, mockUpdateEqEq, mockCreateClient };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import {
  deliveryKey,
  claimEvent,
  settleEvent,
  __resetForTests,
} from "../ghl-event-ledger.mjs";

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  __resetForTests();
  mockInsert.mockClear();
  mockUpdateEqEq.mockClear();
  mockCreateClient.mockClear();
  mockInsert.mockImplementation(async () => ({ error: null }));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("deliveryKey", () => {
  it("prefers the GHL webhook id header", () => {
    const key = deliveryKey({ "x-webhook-id": "wh_123" }, "{}", "contact.created", {});
    expect(key).toBe("ghl:contact.created:wh_123");
  });

  it("falls back to a body webhookId, then a stable content hash", () => {
    const withBodyId = deliveryKey({}, "{}", "contact.created", { webhookId: "wh_9" });
    expect(withBodyId).toBe("ghl:contact.created:wh_9");

    const a = deliveryKey({}, '{"x":1}', "contact.created", {});
    const b = deliveryKey({}, '{"x":1}', "contact.created", {});
    const c = deliveryKey({}, '{"x":2}', "contact.created", {});
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("claimEvent", () => {
  it("inserts a pending ledger row with the ghl-webhook source marker", async () => {
    const ok = await claimEvent("ghl:contact.created:wh_1", "contact.created", { locationId: "loc" });
    expect(ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.event_name).toBe("contact.created");
    expect(row.source_agent).toBe("ghl-webhook");
    expect(row.correlation_id).toBe("ghl:contact.created:wh_1");
    expect(row.status).toBe("pending");
    expect((row.metadata as { source: string }).source).toBe("ghl-webhook");
  });

  it("returns false on unique-violation (duplicate delivery)", async () => {
    mockInsert.mockImplementationOnce(async () => ({ error: { code: "23505", message: "dup" } }));
    const ok = await claimEvent("ghl:x:1", "x", {});
    expect(ok).toBe(false);
  });

  it("falls back to in-memory dedupe when Supabase errors", async () => {
    mockInsert.mockImplementation(async () => ({ error: { code: "500", message: "down" } }));
    expect(await claimEvent("ghl:x:2", "x", {})).toBe(true); // first claim
    expect(await claimEvent("ghl:x:2", "x", {})).toBe(false); // memory catches retry
  });

  it("uses in-memory dedupe only when env is missing (no client, no throw)", async () => {
    delete process.env.SUPABASE_URL;
    __resetForTests();
    expect(await claimEvent("ghl:x:3", "x", {})).toBe(true);
    expect(await claimEvent("ghl:x:3", "x", {})).toBe(false);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

describe("settleEvent", () => {
  it("marks the ledger row completed", async () => {
    await settleEvent("ghl:x:4", true);
    expect(mockUpdateEqEq).toHaveBeenCalledTimes(1);
  });

  it("never throws when Supabase is unavailable", async () => {
    delete process.env.SUPABASE_URL;
    __resetForTests();
    await expect(settleEvent("ghl:x:5", false, "boom")).resolves.toBeUndefined();
  });
});
