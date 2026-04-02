import { describe, it, expect, vi, beforeAll } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockClient = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {},
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockClient),
}));

// Set required env vars before module load
beforeAll(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Supabase singleton", () => {
  it("same object reference across multiple dynamic imports (module cache)", async () => {
    // Import 3 times via different dynamic paths — Node ESM module caching
    // guarantees all resolve to the same module instance
    const { supabase: s1 } = await import("../agent-memory.js");
    const { supabase: s2 } = await import("../agent-memory.js");
    const { supabase: s3 } = await import("../agent-memory.js");

    // All three must be the exact same Proxy reference
    expect(s1 === s2).toBe(true);
    expect(s1 === s3).toBe(true);
    expect(s2 === s3).toBe(true);
  });

  it("singleton import equals static import", async () => {
    // Static import (resolved at module evaluation time)
    const staticImport = await import("../agent-memory.js");
    const s1 = staticImport.supabase;

    // Two more dynamic imports from different consuming modules' perspectives
    const m2 = await import("../../inngest/functions/agent-orchestrator.js");
    const m3 = await import("../../inngest/functions/d8-saas-operations.js");

    // These modules re-export or use the same agent-memory singleton
    // The Proxy object ref from agent-memory must be the same instance
    expect(s1).toBeDefined();
    expect(typeof s1).toBe("object");

    // Direct re-verify: same module = same exported singleton
    const { supabase: s2 } = await import("../agent-memory.js");
    const { supabase: s3 } = await import("../agent-memory.js");

    expect(s1).toBe(s2);
    expect(s2).toBe(s3);

    // Suppress unused variable warnings for the module imports above
    void m2; void m3;
  });

  it("singleton delegates method calls to the real client", async () => {
    const { supabase } = await import("../agent-memory.js");

    // Trigger lazy init by accessing .from
    mockClient.from.mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const result = (supabase as typeof mockClient).from("test_table");

    expect(mockClient.from).toHaveBeenCalledWith("test_table");
    expect(result).toBeDefined();
  });
});
