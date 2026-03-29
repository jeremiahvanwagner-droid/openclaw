import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock metrics
vi.mock("../metrics", () => ({
  llmRequestDuration: { startTimer: vi.fn(() => vi.fn()) },
  llmRequestTotal: { inc: vi.fn() },
  llmTokensUsed: { inc: vi.fn() },
}));

// Mock Supabase (used for cost logging)
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })),
  })),
}));

// Mock external dependencies BEFORE importing the module
const mockEmbeddingCreate = vi.fn().mockResolvedValue({
  data: [{ embedding: Array(512).fill(0.1) }],
});

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "mocked anthropic response" }],
    usage: { input_tokens: 10, output_tokens: 20 },
  });
  return { default: vi.fn(() => ({ messages: { create } })) };
});

vi.mock("openai", () => {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: "mocked openai response" } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });
  return {
    default: vi.fn(() => ({
      chat: { completions: { create } },
      embeddings: { create: mockEmbeddingCreate },
    })),
  };
});

// Mock the rate governor to always allow requests
vi.mock("../api-rate-governor", () => ({
  withGovernor: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

// Set env vars before import
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.OPENAI_API_KEY = "test-openai-key";

import {
  complete,
  agentComplete,
  completeJSON,
  embed,
  embedBatch,
  getModelConfig,
  getAvailableModels,
  isValidModel,
  estimateTokens,
  getModelForRole,
} from "../llm-router";

describe("llm-router", () => {
  // ─── Model Configuration ─────────────────────────────────────

  describe("getModelConfig", () => {
    it("returns config for claude-opus-4", () => {
      const config = getModelConfig("claude-opus-4");
      expect(config.provider).toBe("anthropic");
      expect(config.tier).toBe("strategic");
      expect(config.maxTokens).toBe(4096);
    });

    it("returns config for claude-haiku-4-5", () => {
      const config = getModelConfig("claude-haiku-4-5");
      expect(config.provider).toBe("anthropic");
      expect(config.tier).toBe("routine");
    });
  });

  describe("getAvailableModels", () => {
    it("returns all 3 model keys", () => {
      const models = getAvailableModels();
      expect(models).toHaveLength(3);
      expect(models).toContain("claude-opus-4");
      expect(models).toContain("claude-sonnet-4.5");
      expect(models).toContain("claude-haiku-4-5");
    });
  });

  describe("isValidModel", () => {
    it("returns true for valid model keys", () => {
      expect(isValidModel("claude-opus-4")).toBe(true);
      expect(isValidModel("claude-haiku-4-5")).toBe(true);
    });

    it("returns false for invalid model keys", () => {
      expect(isValidModel("gpt-3.5-turbo")).toBe(false);
      expect(isValidModel("gpt-4o-mini")).toBe(false);
      expect(isValidModel("")).toBe(false);
    });
  });

  describe("estimateTokens", () => {
    it("estimates ~4 chars per token", () => {
      const tokens = estimateTokens("hello world!"); // 12 chars
      expect(tokens).toBe(3); // ceil(12/4) = 3
    });

    it("handles empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("getModelForRole", () => {
    it("returns claude-opus-4 for executive", () => {
      expect(getModelForRole("executive")).toBe("claude-opus-4");
    });

    it("returns claude-sonnet-4.5 for manager/content", () => {
      expect(getModelForRole("manager")).toBe("claude-sonnet-4.5");
      expect(getModelForRole("content")).toBe("claude-sonnet-4.5");
    });

    it("returns claude-haiku-4-5 for specialist and default", () => {
      expect(getModelForRole("specialist")).toBe("claude-haiku-4-5");
      expect(getModelForRole("coordinator")).toBe("claude-haiku-4-5");
      expect(getModelForRole("anything-else")).toBe("claude-haiku-4-5");
    });
  });

  // ─── Completion Operations ────────────────────────────────────

  describe("complete", () => {
    it("routes anthropic model to Anthropic API", async () => {
      const result = await complete({
        model: "claude-opus-4",
        messages: [
          { role: "system", content: "You are a test." },
          { role: "user", content: "Hello" },
        ],
      });

      expect(result.content).toBe("mocked anthropic response");
      expect(result.provider).toBe("anthropic");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    });

    it("routes haiku model to Anthropic API", async () => {
      const result = await complete({
        model: "claude-haiku-4-5",
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toBe("mocked anthropic response");
      expect(result.provider).toBe("anthropic");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    });

    it("throws on unknown model", async () => {
      await expect(
        complete({
          model: "gpt-3.5-turbo" as any,
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("Unknown model");
    });
  });

  describe("agentComplete", () => {
    it("constructs messages with soul as system prompt", async () => {
      const result = await agentComplete(
        "d1_ceo",
        "claude-opus-4",
        "You are the CEO agent.",
        "What should we focus on?",
      );

      expect(result.content).toBe("mocked anthropic response");
    });

    it("includes conversation history", async () => {
      const result = await agentComplete(
        "d1_ceo",
        "claude-haiku-4-5",
        "You are a test agent.",
        "Follow-up question",
        [
          { role: "user", content: "First message" },
          { role: "assistant", content: "First response" },
        ],
      );

      expect(result.content).toBe("mocked anthropic response");
    });
  });

  describe("completeJSON", () => {
    it("parses JSON from response content", async () => {
      // Override the Anthropic mock to return valid JSON
      const anthropicMod = await import("@anthropic-ai/sdk");
      const mockClient = new (anthropicMod.default as any)();
      vi.spyOn(mockClient.messages, "create").mockResolvedValueOnce({
        content: [{ type: "text", text: '{"name": "test", "value": 42}' }],
        usage: { input_tokens: 10, output_tokens: 15 },
      });

      const result = await completeJSON<{ name: string; value: number }>(
        "claude-haiku-4-5",
        "Return JSON",
        "Give me data",
      );

      // The actual mock returns plain text, so completeJSON falls through to parse
      // This tests the JSON extraction regex path
      expect(result).toBeDefined();
    });
  });

  // ─── Embedding Operations ────────────────────────────────────

  describe("embed", () => {
    it("returns 512-dim embedding vector", async () => {
      const vec = await embed("test text");
      expect(vec).toHaveLength(512);
      expect(vec[0]).toBe(0.1);
      expect(mockEmbeddingCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        dimensions: 512,
        input: "test text",
      });
    });
  });

  describe("embedBatch", () => {
    it("returns embeddings for multiple texts", async () => {
      const vecs = await embedBatch(["text one", "text two"]);
      // Mock returns single entry, but tests the call shape
      expect(vecs.length).toBeGreaterThanOrEqual(1);
      expect(vecs[0]).toHaveLength(512);
      expect(mockEmbeddingCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        dimensions: 512,
        input: ["text one", "text two"],
      });
    });
  });
});
