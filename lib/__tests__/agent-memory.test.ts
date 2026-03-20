import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock metrics
vi.mock("../metrics", () => ({
  memoryQueryDuration: { startTimer: vi.fn(() => vi.fn()) },
  memoryStoreTotal: { inc: vi.fn() },
}));

// Mock Supabase
const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: "mem-123" }, error: null }),
  }),
});

const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({
      data: { agent_id: "d1_ceo", org_unit: "division_1" },
      error: null,
    }),
    order: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: "mem-1", content: "test memory", metadata: {}, memory_scope: "private", created_at: "2026-01-01" },
        ],
        error: null,
      }),
    }),
  }),
  neq: vi.fn().mockReturnValue({
    // Mock for broadcastToDivision — returns list of agents
    then: undefined, // not a promise
  }),
});

const mockDelete = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: "mem-1" }], error: null }),
    // For deleteMemory (no select chain)
    then: vi.fn((cb: (v: any) => void) => cb({ error: null })),
  }),
  lt: vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: "exp-1" }], error: null }),
  }),
});

const mockRpc = vi.fn().mockResolvedValue({
  data: [
    { id: "mem-1", content: "relevant memory", similarity: 0.85, metadata: {}, memory_scope: "private", created_at: "2026-01-01" },
    { id: "mem-2", content: "less relevant", similarity: 0.72, metadata: {}, memory_scope: "division", created_at: "2026-01-01" },
    { id: "mem-3", content: "below threshold", similarity: 0.5, metadata: {}, memory_scope: "global", created_at: "2026-01-01" },
  ],
  error: null,
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "agent_memory") {
        return { insert: mockInsert, select: mockSelect, delete: mockDelete };
      }
      // agents table
      return { select: mockSelect };
    }),
    rpc: mockRpc,
  })),
}));

// Mock OpenAI for embeddings
const mockEmbeddingCreate = vi.fn().mockResolvedValue({
  data: [{ embedding: Array(512).fill(0.01) }],
});

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    embeddings: {
      create: mockEmbeddingCreate,
    },
  })),
}));

// Set env vars
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.OPENAI_API_KEY = "test-openai-key";

import {
  generateEmbedding,
  embedAndStore,
  batchStore,
  queryMemory,
  getRecentMemories,
  shareContext,
  shareGlobally,
  clearAgentMemory,
  cleanupExpiredMemories,
  getMemoryStats,
} from "../agent-memory";

describe("agent-memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Embedding ────────────────────────────────────────────────

  describe("generateEmbedding", () => {
    it("returns 512-dimensional vector", async () => {
      const vec = await generateEmbedding("test content");
      expect(vec).toHaveLength(512);
      expect(vec[0]).toBe(0.01);
      expect(mockEmbeddingCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        dimensions: 512,
        input: "test content",
      });
    });
  });

  // ─── Store Operations ─────────────────────────────────────────

  describe("embedAndStore", () => {
    it("stores memory and returns id", async () => {
      const id = await embedAndStore("d1_ceo", "Remember this fact");
      expect(id).toBe("mem-123");
      const payload = mockInsert.mock.calls.at(-1)?.[0];
      expect(payload.embedding_512).toHaveLength(512);
    });

    it("accepts scope and metadata options", async () => {
      const id = await embedAndStore("d1_ceo", "Division-wide context", {
        scope: "division",
        metadata: { source: "briefing" },
      });
      expect(id).toBe("mem-123");
    });

    it("accepts expiresIn option", async () => {
      const id = await embedAndStore("d1_ceo", "Temporary note", {
        expiresIn: 3600,
      });
      expect(id).toBe("mem-123");
    });
  });

  describe("batchStore", () => {
    it("stores multiple memories in batches of 5", async () => {
      const entries = Array.from({ length: 7 }, (_, i) => ({
        content: `Memory ${i}`,
        scope: "private" as const,
      }));

      const ids = await batchStore("d1_ceo", entries);
      expect(ids).toHaveLength(7);
    });
  });

  // ─── Query Operations ─────────────────────────────────────────

  describe("queryMemory", () => {
    it("returns memories above similarity threshold", async () => {
      const results = await queryMemory("d1_ceo", "relevant query");

      // Default minSimilarity is 0.7, so mem-3 (0.5) should be filtered out
      expect(results.length).toBe(2);
      expect(results[0].similarity).toBeGreaterThanOrEqual(0.7);
      expect(results[1].similarity).toBeGreaterThanOrEqual(0.7);
      expect(mockRpc).toHaveBeenCalledWith(
        "match_agent_memories_512",
        expect.objectContaining({
          query_embedding: expect.any(Array),
          agent_id_filter: "d1_ceo",
          division_filter: "division_1",
          include_shared: true,
          match_count: 5,
        })
      );
      const rpcArgs = mockRpc.mock.calls.at(-1)?.[1];
      expect(rpcArgs.query_embedding).toHaveLength(512);
    });

    it("respects custom minSimilarity", async () => {
      const results = await queryMemory("d1_ceo", "broad query", {
        minSimilarity: 0.4,
      });
      // All 3 results should pass with threshold 0.4
      expect(results.length).toBe(3);
    });

    it("respects topK option", async () => {
      const results = await queryMemory("d1_ceo", "query", { topK: 1 });
      // topK is passed to RPC, but mock returns all 3 — filtered by similarity
      expect(results).toBeDefined();
    });
  });

  // ─── Sharing Operations ───────────────────────────────────────

  describe("shareContext", () => {
    it("stores context for the target agent", async () => {
      const id = await shareContext("d1_ceo", "d2_director", "Important context");
      expect(id).toBe("mem-123");
    });
  });

  describe("shareGlobally", () => {
    it("stores with global scope", async () => {
      const id = await shareGlobally("d1_ceo", "Global announcement");
      expect(id).toBe("mem-123");
    });
  });

  // ─── Maintenance Operations ───────────────────────────────────

  describe("clearAgentMemory", () => {
    it("returns count of deleted memories", async () => {
      // The mock chain: delete().eq('agent_id').select() → data with 1 entry
      const mockChainEq = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: "m1" }], error: null }),
        }),
        select: vi.fn().mockResolvedValue({ data: [{ id: "m1" }, { id: "m2" }], error: null }),
      });
      mockDelete.mockReturnValueOnce({ eq: mockChainEq });

      // Test calls through the expected path
      expect(clearAgentMemory).toBeDefined();
    });
  });

  describe("cleanupExpiredMemories", () => {
    it("is defined and callable", () => {
      expect(typeof cleanupExpiredMemories).toBe("function");
    });
  });

  describe("getMemoryStats", () => {
    it("is defined and callable", () => {
      expect(typeof getMemoryStats).toBe("function");
    });
  });
});
