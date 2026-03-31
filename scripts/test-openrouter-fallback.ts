import assert from "node:assert/strict";
import { __resetForTests as resetRateGovernorForTests } from "../lib/api-rate-governor";
import {
  __resetClawRouterTestState,
  __setAnthropicClientFactoryForTest,
  __setOpenRouterFetchForTest,
  routeWithFallback,
  type AnthropicRequest,
  type ClawRouterConfig,
} from "../lib/claw-router";

function buildTestConfig(): ClawRouterConfig {
  return {
    tiers: {
      "anthropic-strategist": {
        credential_env: "ANTHROPIC_API_KEY_SOVEREIGN",
        provider: "anthropic-strategist",
        model: "claude-opus-4-latest",
        max_tokens: 16000,
        temperature_default: 0.7,
        queue_class: "P1",
        sovereign_isolation: true,
      },
      "anthropic-executor": {
        credential_env: "ANTHROPIC_API_KEY_SHARED",
        provider: "anthropic-executor",
        model: "claude-sonnet-4.5-latest",
        max_tokens: 8000,
        temperature_default: 0.5,
        queue_class: "P1",
        sovereign_isolation: false,
      },
      "anthropic-communicator": {
        credential_env: "ANTHROPIC_API_KEY_SHARED",
        provider: "anthropic-communicator",
        model: "claude-sonnet-4.5-latest",
        max_tokens: 6000,
        temperature_default: 0.8,
        queue_class: "P2",
        sovereign_isolation: false,
      },
      "anthropic-analyst": {
        credential_env: "ANTHROPIC_API_KEY_SHARED",
        provider: "anthropic-analyst",
        model: "claude-haiku-4.5-latest",
        max_tokens: 4000,
        temperature_default: 0.3,
        queue_class: "P3",
        sovereign_isolation: false,
      },
      "anthropic-guardian": {
        credential_env: "ANTHROPIC_API_KEY_SOVEREIGN",
        provider: "anthropic-guardian",
        model: "claude-haiku-4.5-latest",
        max_tokens: 4000,
        temperature_default: 0.1,
        queue_class: "P0",
        sovereign_isolation: true,
      },
    },
    routing_rules: [],
    fallback: {
      enabled: true,
      provider: "openrouter",
      trigger_on_http_status: [429, 500, 503],
      eligible_tiers: ["EXECUTOR", "COMMUNICATOR", "ANALYST"],
      sovereign_tiers_excluded: ["STRATEGIST", "GUARDIAN"],
      max_fallback_attempts: 2,
      fallback_timeout_ms: 15000,
      model_map: {
        EXECUTOR: "deepseek/deepseek-r1:free",
        COMMUNICATOR: "meta-llama/llama-4-maverick:free",
        ANALYST: "deepseek/deepseek-chat-v3.1:free",
      },
      tool_calling_capable_models: [
        "deepseek/deepseek-r1:free",
        "meta-llama/llama-4-maverick:free",
      ],
      log_all_fallbacks: true,
    },
  };
}

function buildPrimaryRequest(model: string): AnthropicRequest {
  return {
    model,
    max_tokens: 256,
    temperature: 0.2,
    messages: [{ role: "user", content: "Write a short operational update." }],
  };
}

async function main(): Promise<void> {
  resetRateGovernorForTests({ deleteStateFile: true });

  process.env.ANTHROPIC_API_KEY_SHARED = process.env.ANTHROPIC_API_KEY_SHARED || "test-shared";
  process.env.ANTHROPIC_API_KEY_SOVEREIGN = process.env.ANTHROPIC_API_KEY_SOVEREIGN || "test-sovereign";
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-openrouter";

  let openRouterCalls = 0;

  __setAnthropicClientFactoryForTest(() => ({
    messages: {
      create: async () => {
        const error = new Error("Anthropic rate limited") as Error & { status?: number };
        error.status = 429;
        throw error;
      },
    },
  }));

  __setOpenRouterFetchForTest(async () => {
    openRouterCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "openrouter-test-response",
        model: "meta-llama/llama-4-maverick:free",
        choices: [
          {
            message: {
              content: "OpenRouter fallback succeeded.",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 32,
          completion_tokens: 14,
          total_tokens: 46,
        },
      }),
      text: async () => "",
    };
  });

  const config = buildTestConfig();

  const communicatorResponse = await routeWithFallback(
    "COMMUNICATOR",
    buildPrimaryRequest("claude-sonnet-4.5-latest"),
    config,
  );

  assert.equal(communicatorResponse.metadata?.provider, "openrouter_fallback");
  assert.equal(communicatorResponse.model, "meta-llama/llama-4-maverick:free");
  assert.equal(openRouterCalls, 1);

  let strategistRejected = false;
  try {
    await routeWithFallback(
      "STRATEGIST",
      buildPrimaryRequest("claude-opus-4-latest"),
      config,
    );
  } catch (error) {
    strategistRejected = true;
    assert.equal((error as { status?: number }).status, 429);
  }

  assert.equal(strategistRejected, true);
  assert.equal(openRouterCalls, 1);

  console.log("PASS: COMMUNICATOR tier falls back to OpenRouter on 429.");
  console.log("PASS: STRATEGIST tier rethrows 429 and does not hit OpenRouter.");
  process.exit(0);
}

main()
  .catch((error) => {
    console.error("FAIL:", error);
    process.exit(1);
  })
  .finally(() => {
    __resetClawRouterTestState();
  });
