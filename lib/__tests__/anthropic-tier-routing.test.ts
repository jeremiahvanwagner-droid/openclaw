/**
 * Integration Tests: 5-Agent Anthropic Tier Routing
 * Tests routing logic, sovereign isolation, and fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Mock configuration types
interface TierConfig {
  model: string;
  provider: string;
  rate_limit_per_min: number;
  max_concurrent_requests: number;
  queue_class: string;
  credential_env: string;
  sovereign_isolation: boolean;
}

interface RoutingRule {
  priority: number;
  agent_tags?: string[];
  division?: string;
  target_tier: string;
  enforce_sovereign_isolation: boolean;
}

interface ClawRouterConfig {
  routing_law: string;
  tiers: Record<string, TierConfig>;
  routing_rules: RoutingRule[];
}

// Helper to load config
function loadRouterConfig(): ClawRouterConfig {
  const configPath = resolve(
    __dirname,
    "../../config/claw-router.json",
  );
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

describe("5-Agent Anthropic Tier Routing System", () => {
  let config: ClawRouterConfig;

  beforeEach(() => {
    config = loadRouterConfig();
  });

  describe("Tier Configuration", () => {
    it("should have exactly 5 tiers defined", () => {
      const tierNames = Object.keys(config.tiers);
      expect(tierNames).toHaveLength(5);
    });

    it("should have strategist tier with claude-opus-4-latest", () => {
      const strategistTier = config.tiers["anthropic-strategist"];
      expect(strategistTier).toBeDefined();
      expect(strategistTier.model).toBe("claude-opus-4-latest");
      expect(strategistTier.rate_limit_per_min).toBe(30);
    });

    it("should have executor tier with claude-sonnet-4.5-latest", () => {
      const executorTier = config.tiers["anthropic-executor"];
      expect(executorTier).toBeDefined();
      expect(executorTier.model).toBe("claude-sonnet-4.5-latest");
      expect(executorTier.rate_limit_per_min).toBe(60);
    });

    it("should have communicator tier with claude-sonnet-4.5-latest", () => {
      const communicatorTier = config.tiers["anthropic-communicator"];
      expect(communicatorTier).toBeDefined();
      expect(communicatorTier.model).toBe("claude-sonnet-4.5-latest");
      expect(communicatorTier.rate_limit_per_min).toBe(90);
    });

    it("should have analyst tier with claude-haiku-4.5-latest", () => {
      const analystTier = config.tiers["anthropic-analyst"];
      expect(analystTier).toBeDefined();
      expect(analystTier.model).toBe("claude-haiku-4.5-latest");
      expect(analystTier.rate_limit_per_min).toBe(120);
    });

    it("should have guardian tier with claude-haiku-4.5-latest and sovereign isolation", () => {
      const guardianTier = config.tiers["anthropic-guardian"];
      expect(guardianTier).toBeDefined();
      expect(guardianTier.model).toBe("claude-haiku-4.5-latest");
      expect(guardianTier.rate_limit_per_min).toBe(40);
      expect(guardianTier.sovereign_isolation).toBe(true);
    });

    it("all tiers should have 'anthropic' provider", () => {
      Object.values(config.tiers).forEach((tier) => {
        expect(tier.provider).toMatch(/^anthropic-/);
      });
    });
  });

  describe("Routing Rules", () => {
    it("should have at least 5 routing rules for the 5 tiers", () => {
      expect(config.routing_rules.length).toBeGreaterThanOrEqual(5);
    });

    it("should have strategist rule prioritizing d1_ceo", () => {
      const strategistRule = config.routing_rules.find(
        (r) => r.target_tier === "anthropic-strategist",
      );
      expect(strategistRule).toBeDefined();
      expect(strategistRule?.agent_tags).toContain("d1_ceo");
    });

    it("executor rule should include d1_fullstack_dev", () => {
      const executorRule = config.routing_rules.find(
        (r) => r.target_tier === "anthropic-executor",
      );
      expect(executorRule).toBeDefined();
      if (executorRule?.agent_tags) {
        expect(executorRule.agent_tags.some((tag) => tag.includes("dev"))).toBe(
          true,
        );
      }
    });

    it("communicator rule should route customer-facing agents", () => {
      const commRule = config.routing_rules.find(
        (r) => r.target_tier === "anthropic-communicator",
      );
      expect(commRule).toBeDefined();
    });

    it("analyst rule should route data/metrics agents", () => {
      const analystRule = config.routing_rules.find(
        (r) => r.target_tier === "anthropic-analyst",
      );
      expect(analystRule).toBeDefined();
    });

    it("guardian rule should have sovereign isolation enforced", () => {
      const guardianRule = config.routing_rules.find(
        (r) => r.target_tier === "anthropic-guardian",
      );
      expect(guardianRule).toBeDefined();
      expect(guardianRule?.enforce_sovereign_isolation).toBe(true);
    });

    it("should have a default fallback rule", () => {
      const defaultRule = config.routing_rules.find(
        (r) => !r.agent_tags && !r.division,
      );
      expect(defaultRule).toBeDefined();
      expect(defaultRule?.target_tier).toBe("anthropic-analyst");
    });

    it("rules should be ordered by priority", () => {
      const priorities = config.routing_rules.map((r) => r.priority);
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i]).toBeLessThanOrEqual(priorities[i - 1]);
      }
    });
  });

  describe("Sovereign Isolation", () => {
    it("strategist tier should have sovereign isolation", () => {
      const strategistTier = config.tiers["anthropic-strategist"];
      expect(strategistTier.sovereign_isolation).toBe(true);
      expect(strategistTier.credential_env).toBe("ANTHROPIC_API_KEY_SOVEREIGN");
    });

    it("guardian tier should have sovereign isolation", () => {
      const guardianTier = config.tiers["anthropic-guardian"];
      expect(guardianTier.sovereign_isolation).toBe(true);
      expect(guardianTier.credential_env).toBe("ANTHROPIC_API_KEY_SOVEREIGN");
    });

    it("executor tier should use shared credentials", () => {
      const executorTier = config.tiers["anthropic-executor"];
      expect(executorTier.sovereign_isolation).toBe(false);
      expect(executorTier.credential_env).toBe("ANTHROPIC_API_KEY_AGENTS");
    });

    it("communicator tier should use shared credentials", () => {
      const commTier = config.tiers["anthropic-communicator"];
      expect(commTier.sovereign_isolation).toBe(false);
      expect(commTier.credential_env).toBe("ANTHROPIC_API_KEY_AGENTS");
    });

    it("analyst tier should use shared credentials", () => {
      const analystTier = config.tiers["anthropic-analyst"];
      expect(analystTier.sovereign_isolation).toBe(false);
      expect(analystTier.credential_env).toBe("ANTHROPIC_API_KEY_AGENTS");
    });
  });

  describe("Model Compatibility", () => {
    const VALID_ANTHROPIC_MODELS = [
      "claude-opus-4-latest",
      "claude-sonnet-4.5-latest",
      "claude-haiku-4.5-latest",
    ];

    it("all tier models should be valid Anthropic models", () => {
      Object.entries(config.tiers).forEach(([tierName, tierConfig]) => {
        const isValid = VALID_ANTHROPIC_MODELS.includes(tierConfig.model);
        expect(isValid).toBe(
          true,
          `Tier ${tierName} has invalid model: ${tierConfig.model}`,
        );
      });
    });

    it("should not contain any OpenAI models (gpt-*)", () => {
      Object.entries(config.tiers).forEach(([tierName, tierConfig]) => {
        expect(tierConfig.model).not.toMatch(
          /^gpt-/,
          `Tier ${tierName} contains OpenAI model: ${tierConfig.model}`,
        );
      });
    });
  });

  describe("Rate Limiting Configuration", () => {
    it("strategist should have 30 req/min limit", () => {
      expect(config.tiers["anthropic-strategist"].rate_limit_per_min).toBe(30);
    });

    it("executor should have 60 req/min limit", () => {
      expect(config.tiers["anthropic-executor"].rate_limit_per_min).toBe(60);
    });

    it("communicator should have 90 req/min limit", () => {
      expect(
        config.tiers["anthropic-communicator"].rate_limit_per_min,
      ).toBe(90);
    });

    it("analyst should have 120 req/min limit", () => {
      expect(config.tiers["anthropic-analyst"].rate_limit_per_min).toBe(120);
    });

    it("guardian should have 40 req/min limit", () => {
      expect(config.tiers["anthropic-guardian"].rate_limit_per_min).toBe(40);
    });

    it("should have max_concurrent_requests defined for each tier", () => {
      Object.entries(config.tiers).forEach(([tierName, tierConfig]) => {
        expect(tierConfig.max_concurrent_requests).toBeDefined();
        expect(tierConfig.max_concurrent_requests).toBeGreaterThan(0);
      });
    });
  });

  describe("Queue Class Configuration", () => {
    it("strategist should be P0 (highest priority)", () => {
      expect(config.tiers["anthropic-strategist"].queue_class).toBe("P0");
    });

    it("guardian should be P0 (highest priority)", () => {
      expect(config.tiers["anthropic-guardian"].queue_class).toBe("P0");
    });

    it("executor should be P1", () => {
      expect(config.tiers["anthropic-executor"].queue_class).toBe("P1");
    });

    it("communicator should be P1", () => {
      expect(config.tiers["anthropic-communicator"].queue_class).toBe("P1");
    });

    it("analyst should be P2 (lowest priority)", () => {
      expect(config.tiers["anthropic-analyst"].queue_class).toBe("P2");
    });
  });

  describe("Agent Assignment", () => {
    it("should have agents configured in topology", () => {
      const tierAssignmentPath = resolve(
        __dirname,
        "../../config/anthropic-tier-assignment.json",
      );
      const tierAssignment = JSON.parse(
        readFileSync(tierAssignmentPath, "utf-8"),
      );
      expect(tierAssignment.tier_assignments).toBeDefined();
      expect(tierAssignment.tier_assignments.length).toBeGreaterThan(0);
    });
  });

  describe("Configuration Completeness", () => {
    it("should have routing_law defined", () => {
      expect(config.routing_law).toBeDefined();
      expect(config.routing_law).toContain("5-AGENT");
      expect(config.routing_law).toContain("ANTHROPIC");
    });

    it("should have tiers, routing_rules defined", () => {
      expect(config.tiers).toBeDefined();
      expect(config.routing_rules).toBeDefined();
    });

    it("should not contain any references to OpenAI or OpenRouter", () => {
      const configStr = JSON.stringify(config);
      expect(configStr).not.toContain("openai");
      expect(configStr).not.toContain("openrouter");
      expect(configStr).not.toContain("gpt-");
    });
  });
});
