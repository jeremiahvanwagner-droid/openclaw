import Anthropic from "@anthropic-ai/sdk";
import { withGovernor, type QueueClass } from "./api-rate-governor";
import { logger } from "./logger";
import { llmRequestDuration, llmRequestTotal } from "./metrics";
import * as fs from "fs";
import * as path from "path";

const log = logger.child({ module: "claw-router" });

/**
 * Known Anthropic models for validation — Pure Anthropic migration (Mar 2026)
 */
const VALID_ANTHROPIC_MODELS = [
  "claude-opus-4-latest",
  "claude-opus-4",
  "claude-sonnet-4.5-latest",
  "claude-sonnet-4-5",
  "claude-haiku-4.5-latest",
  "claude-haiku-4-5",
] as const;

/**
 * 5-Agent Tier Identifiers — Pure Anthropic Architecture
 */
const VALID_TIER_IDS = [
  "anthropic-strategist",
  "anthropic-executor",
  "anthropic-communicator",
  "anthropic-analyst",
  "anthropic-guardian",
] as const;

/**
 * ClawRouter — Tier-isolated completion routing.
 * Enforces Sovereign key isolation and manages tier assignments for 5-agent pure Anthropic architecture.
 */
export interface RouterConfig {
  tiers: Record<string, TierConfig>;
  routing_rules: RoutingRule[];
  fallback: FallbackConfig;
}

export interface TierConfig {
  credential_env: string;
  provider: string;
  model: string;
  max_tokens: number;
  temperature_default: number;
  queue_class: string;
  sovereign_isolation: boolean;
  rate_limit_per_min?: number;
  max_concurrent_requests?: number;
}

export interface RoutingRule {
  rule_id: string;
  priority: number;
  match: {
    tag?: string;
    agent_id?: string;
    default?: boolean;
    any_of?: Array<{ tag?: string; agent_id?: string }>;
  };
  route_to: string;
  enforce_sovereign_isolation: boolean;
}

export interface FallbackConfig {
  provider: string;
  credential_env: string;
  model_map?: Record<string, string>;
}

export interface CompletionOptions {
  prompt: string;
  agentId?: string;
  tags?: string[];
  maxTokens?: number;
  temperature?: number;
}

let configCache: RouterConfig | null = null;
const clients: Record<string, Anthropic> = {};

function loadConfig(): RouterConfig {
  if (configCache) return configCache;
  const configPath = path.join(process.cwd(), "config", "claw-router.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  configCache = JSON.parse(raw) as RouterConfig;
  return configCache;
}

function getAnthropicClient(envVar: string): Anthropic {
  if (clients[envVar]) return clients[envVar];
  const apiKey = process.env[envVar];
  if (!apiKey) throw new Error(`Missing required environment variable: ${envVar}`);
  clients[envVar] = new Anthropic({ apiKey });
  return clients[envVar];
}

/**
 * Validate that a model identifier is a known Anthropic model
 */
function validateModel(model: string): void {
  if (!VALID_ANTHROPIC_MODELS.includes(model as any)) {
    log.warn(
      { model, valid_models: VALID_ANTHROPIC_MODELS },
      "Model not in known list — assuming Anthropic compatible. Ensure model exists."
    );
  }
}

/**
 * Validate that a tier ID is one of the 5-agent tiers
 */
function validateTierId(tierId: string): void {
  if (!VALID_TIER_IDS.includes(tierId as any)) {
    log.warn(
      { tierId, valid_tiers: VALID_TIER_IDS },
      "Tier ID not in standard 5-agent list. If this is intentional, proceed."
    );
  }
}

/**
 * Determine the correct tier based on agent ID and tags.
 * Uses 5-agent pure Anthropic architecture.
 */
export function routeRequest(options: CompletionOptions): { tierId: string; config: TierConfig } {
  const config = loadConfig();
  const rules = [...config.routing_rules].sort((a, b) => a.priority - b.priority);

  for (const rule of rules) {
    let matched = false;
    if (rule.match.default) matched = true;
    else if (rule.match.agent_id && options.agentId === rule.match.agent_id) matched = true;
    else if (rule.match.tag && options.tags?.includes(rule.match.tag)) matched = true;
    else if (rule.match.any_of) {
      matched = rule.match.any_of.some(m =>
        (m.agent_id && options.agentId === m.agent_id) ||
        (m.tag && options.tags?.includes(m.tag))
      );
    }

    if (matched) {
      const tierConfig = config.tiers[rule.route_to];
      if (!tierConfig) {
        const msg = `Invalid route: "${rule.route_to}" — Tier not found in config. Valid tiers: ${Object.keys(config.tiers).join(", ")}`;
        throw new Error(msg);
      }

      // Validate model is Anthropic
      validateModel(tierConfig.model);
      validateTierId(rule.route_to);

      // CRITICAL: SOVEREIGN ISOLATION ENFORCEMENT
      if (rule.enforce_sovereign_isolation && tierConfig.credential_env !== "ANTHROPIC_API_KEY_SOVEREIGN") {
        const msg = `SECURITY_FAULT: Sovereign route "${rule.route_id}" assigned to non-sovereign credential. Expected ANTHROPIC_API_KEY_SOVEREIGN but got ${tierConfig.credential_env}`;
        log.error(msg);
        throw new Error(msg);
      }

      // Verify sovereign isolation is not violated in reverse
      if (tierConfig.sovereign_isolation && !rule.enforce_sovereign_isolation) {
        const msg = `SECURITY_WARNING: Tier "${rule.route_to}" claims sovereign_isolation but rule does not enforce it. Check routing rules.`;
        log.warn(msg);
      }

      return { tierId: rule.route_to, config: tierConfig };
    }
  }

  const msg = `No routing rule matched the request. Agent: ${options.agentId}, Tags: ${options.tags?.join(",")}. Available rules: ${[...config.routing_rules].map(r => r.rule_id).join(", ")}`;
  throw new Error(msg);
}

/**
 * Execute a completion through the routed tier.
 */
export async function complete(options: CompletionOptions): Promise<Anthropic.Message> {
  const { tierId, config } = routeRequest(options);
  const client = getAnthropicClient(config.credential_env);

  const timer = llmRequestDuration.startTimer({
    provider: config.provider,
    model: config.model,
    agent: options.agentId || "unknown"
  });

  try {
    const response = await withGovernor(
      { provider: config.provider, queueClass: config.queue_class as QueueClass, agentId: options.agentId },
      async () => {
        return client.messages.create({
          model: config.model,
          max_tokens: options.maxTokens || config.max_tokens,
          temperature: options.temperature || config.temperature_default,
          messages: [{ role: "user", content: options.prompt }]
        });
      }
    );

    timer({ provider: config.provider, model: config.model, agent: options.agentId || "unknown" });
    llmRequestTotal.inc({ provider: config.provider, model: config.model, status: "success" });

    return response;
  } catch (error) {
    timer({ provider: config.provider, model: config.model, agent: options.agentId || "unknown" });
    llmRequestTotal.inc({ provider: config.provider, model: config.model, status: "error" });

    // Fallback logic could be implemented here using config.fallback
    log.error({ error }, "ClawRouter completion failed.");
    throw error;
  }
}
