import Anthropic from "@anthropic-ai/sdk";
import { withGovernor } from "./api-rate-governor";
import { logger } from "./logger";
import { llmRequestDuration, llmRequestTotal } from "./metrics";
import * as fs from "fs";
import * as path from "path";

const log = logger.child({ module: "claw-router" });

/**
 * ClawRouter — Tier-isolated completion routing.
 * Enforces Sovereign key isolation and manages tier assignments.
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
  model_map: Record<string, string>;
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
 * Determine the correct tier based on agent ID and tags.
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
      if (!tierConfig) throw new Error(`Invalid route: ${rule.route_to}`);
      
      // CRITICAL: SOVEREIGN ISOLATION ENFORCEMENT
      if (rule.enforce_sovereign_isolation && tierConfig.credential_env !== "ANTHROPIC_API_KEY_SOVEREIGN") {
        log.error("SECURITY_FAULT: Sovereign route assigned to non-sovereign credential.");
        throw new Error("Sovereign isolation violation.");
      }
      
      return { tierId: rule.route_to, config: tierConfig };
    }
  }

  throw new Error("No routing rule matched the request.");
}

/**
 * Execute a completion through the routed tier.
 */
export async function complete(options: CompletionOptions): Promise<any> {
  const { tierId, config } = routeRequest(options);
  const client = getAnthropicClient(config.credential_env);
  
  const timer = llmRequestDuration.startTimer({
    provider: config.provider,
    model: config.model,
    agent: options.agentId || "unknown"
  });

  try {
    const response = await withGovernor(
      { provider: config.provider, queueClass: config.queue_class, agentId: options.agentId },
      async () => {
        return client.messages.create({
          model: config.model,
          max_tokens: options.maxTokens || config.max_tokens,
          temperature: options.temperature || config.temperature_default,
          messages: [{ role: "user", content: options.prompt }]
        });
      }
    );

    timer({ status: "success" });
    llmRequestTotal.inc({ tier: tierId, model: config.model, status: "success" });
    
    return response;
  } catch (error) {
    timer({ status: "error" });
    llmRequestTotal.inc({ tier: tierId, model: config.model, status: "error" });
    
    // Fallback logic could be implemented here using config.fallback
    log.error({ error }, "ClawRouter completion failed.");
    throw error;
  }
}
