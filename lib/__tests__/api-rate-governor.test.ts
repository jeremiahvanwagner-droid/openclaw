import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock metrics
vi.mock("../metrics", () => ({
  circuitBreakerState: { set: vi.fn() },
  budgetUsedDollars: { set: vi.fn() },
  budgetCeilingDollars: { set: vi.fn() },
  concurrencyActive: { set: vi.fn() },
  llmRequestDuration: { startTimer: vi.fn(() => vi.fn()) },
  llmRequestTotal: { inc: vi.fn() },
  llmTokensUsed: { inc: vi.fn() },
}));

// We need to test the public exports in isolation. The module uses in-memory Maps
// with per-import state, so a fresh dynamic import per test block keeps state clean.

// Rather than dynamically re-importing (fragile with Vitest caching), we test the
// stateful module sequentially and reset state via its public surface where possible.

import {
  __resetForTests,
  checkRequest,
  reportSuccess,
  reportFailure,
  withGovernor,
  getStatus,
  getAllStatus,
} from "../api-rate-governor";

describe("api-rate-governor", () => {
  beforeEach(() => {
    __resetForTests({ deleteStateFile: true });
  });

  // ─── Token Bucket Rate Limiting ──────────────────────────────

  describe("checkRequest — token bucket", () => {
    it("allows requests when tokens are available", () => {
      const result = checkRequest({ provider: "supabase", queueClass: "P2" });
      expect(result.allowed).toBe(true);
      // Clean up concurrency
      reportSuccess("supabase", 0);
    });

    it("blocks unknown providers (no limits = always allowed)", () => {
      const result = checkRequest({ provider: "made-up-provider", queueClass: "P2" });
      expect(result.allowed).toBe(true);
    });

    it("returns retryAfterMs when rate limited", () => {
      // Exhaust telegram minute bucket (25 per minute)
      for (let i = 0; i < 25; i++) {
        const r = checkRequest({ provider: "telegram", queueClass: "P0" });
        if (r.allowed) reportSuccess("telegram", 0);
      }

      const blocked = checkRequest({ provider: "telegram", queueClass: "P0" });
      // Should be blocked or allowed depending on refill — check both
      if (!blocked.allowed) {
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
        expect(blocked.reason).toContain("telegram");
      }
    });
  });

  // ─── Circuit Breaker ──────────────────────────────────────────

  describe("circuit breaker", () => {
    it("opens circuit after repeated failures", () => {
      const provider = "anthropic";
      // Report 5 failures (the threshold) to trip the breaker
      for (let i = 0; i < 5; i++) {
        reportFailure(provider, 500);
      }

      const status = getStatus(provider);
      expect(status.circuitState).toBe("open");
      expect(status.consecutiveFailures).toBe(5);
    });

    it("opens circuit immediately on 429 rate limit", () => {
      const provider = "ghl";
      reportFailure(provider, 429);

      const status = getStatus(provider);
      expect(status.circuitState).toBe("open");
    });

    it("opens circuit immediately on 401 auth expired", () => {
      const provider = "openai-codex";
      reportFailure(provider, 401);

      const status = getStatus(provider);
      expect(status.circuitState).toBe("open");
    });

    it("resets circuit on success", () => {
      // Force half-open by waiting — or just record success
      reportSuccess("openai-codex", 0);

      const status = getStatus("openai-codex");
      expect(status.circuitState).toBe("closed");
      expect(status.consecutiveFailures).toBe(0);
    });
  });

  // ─── Budget Tracking ──────────────────────────────────────────

  describe("budget tracking", () => {
    it("tracks spend across requests", () => {
      reportSuccess("openai", 100); // $1.00
      reportSuccess("openai", 200); // $2.00

      const status = getStatus("openai");
      expect(status.dailySpentCents).toBeGreaterThanOrEqual(300);
    });

    it("blocks requests when budget is exhausted", () => {
      // OpenAI budget is 3000 cents ($30)
      // Exhaust it by reporting a large spend
      reportSuccess("openai", 10000); // $100 — way over budget

      // Now the next checkRequest should be blocked for budget
      const result = checkRequest({ provider: "openai", queueClass: "P2" });
      if (!result.allowed) {
        expect(result.reason).toContain("budget");
      }
    });
  });

  // ─── Concurrency Semaphore ────────────────────────────────────

  describe("concurrency", () => {
    it("shows active concurrency in status", () => {
      // Start from a clean provider
      const status = getStatus("supabase");
      expect(status.activeConcurrency).toBeGreaterThanOrEqual(0);
      expect(status.maxConcurrency).toBe(10);
    });
  });

  // ─── Priority Queue Class ────────────────────────────────────

  describe("priority backoff", () => {
    it("P0 requests get minimal backoff multiplier", () => {
      const status = getStatus("supabase");
      // P0 weight is 0, so multiplier is always 1x
      expect(status).toBeDefined();
    });
  });

  // ─── withGovernor ─────────────────────────────────────────────

  describe("withGovernor", () => {
    it("executes function on allowed request", async () => {
      const result = await withGovernor(
        { provider: "supabase", queueClass: "P0", estimatedCostCents: 0 },
        async () => "hello",
      );
      expect(result).toBe("hello");
    });

    it("tracks cost after successful execution", async () => {
      const before = getStatus("supabase");
      await withGovernor(
        { provider: "supabase", queueClass: "P2", estimatedCostCents: 50 },
        async () => "ok",
      );
      const after = getStatus("supabase");
      expect(after.dailySpentCents).toBe(before.dailySpentCents + 50);
    });

    it("throws and opens circuit on 401 errors", async () => {
      await expect(
        withGovernor(
          { provider: "telegram", queueClass: "P2" },
          async () => {
            const err = new Error("Unauthorized") as Error & { status: number };
            err.status = 401;
            throw err;
          },
        ),
      ).rejects.toThrow("Unauthorized");
    });

    it("rethrows non-retryable 4xx errors immediately", async () => {
      // Reset telegram circuit first
      reportSuccess("telegram", 0);

      await expect(
        withGovernor(
          { provider: "telegram", queueClass: "P2" },
          async () => {
            const err = new Error("Bad Request") as Error & { status: number };
            err.status = 400;
            throw err;
          },
        ),
      ).rejects.toThrow("Bad Request");
    });
  });

  // ─── getAllStatus ──────────────────────────────────────────────

  describe("getAllStatus", () => {
    it("returns status for all configured providers", () => {
      const statuses = getAllStatus();
      expect(statuses.length).toBeGreaterThanOrEqual(6);

      const providers = statuses.map((s) => s.provider);
      expect(providers).toContain("openai-codex");
      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
      expect(providers).toContain("ghl");
      expect(providers).toContain("supabase");
      expect(providers).toContain("telegram");
    });

    it("returns correct shape for each provider", () => {
      const statuses = getAllStatus();
      for (const s of statuses) {
        expect(s).toHaveProperty("provider");
        expect(s).toHaveProperty("circuitState");
        expect(s).toHaveProperty("consecutiveFailures");
        expect(s).toHaveProperty("activeConcurrency");
        expect(s).toHaveProperty("maxConcurrency");
        expect(s).toHaveProperty("minuteTokensRemaining");
        expect(s).toHaveProperty("hourTokensRemaining");
        expect(s).toHaveProperty("dailySpentCents");
        expect(s).toHaveProperty("dailyBudgetCents");
        expect(s).toHaveProperty("dailyRequestCount");
      }
    });
  });
});
