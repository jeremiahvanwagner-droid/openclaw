/**
 * LLM Router Library
 * Open Claw Multi-Agent Network
 *
 * Routes completion requests to appropriate LLM providers based on model key.
 * Supports Anthropic (Claude) models primarily, with OpenAI retained for embeddings only.
 *
 * NOTE: Embeddings still use OpenAI text-embedding-3-small because Anthropic
 * does not provide embedding models.
 *
 * Rate-governed via api-rate-governor to prevent API limit hits and overload.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { withGovernor, type QueueClass } from "./api-rate-governor";
import { logger } from "./logger";
import {
  llmRequestDuration,
  llmRequestTotal,
  llmTokensUsed,
} from "./metrics";

const log = logger.child({ module: "llm-router" });

// ═══════════════════════════════════════════════════════════════════
// RESPONSE CACHE — deduplicates identical P2/P3 requests within TTL
// ═══════════════════════════════════════════════════════════════════
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  result: CompletionResult;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry>();

function cacheKey(model: string, messages: ChatMessage[]): string {
  const msgKey = messages.map(m => `${m.role}:${m.content}`).join("|");
  return `${model}::${msgKey}`;
}

function getCached(key: string): CompletionResult | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: CompletionResult): void {
  // Evict oldest entries if at capacity
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey !== undefined) responseCache.delete(firstKey);
  }
  responseCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Initialize clients lazily
let anthropicSovereign: Anthropic | null = null;
let anthropicShared: Anthropic | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let openaiModule: any = null;

function getAnthropicClient(sovereign: boolean): Anthropic {
  if (sovereign) {
    if (!anthropicSovereign) {
      const key = process.env.ANTHROPIC_API_KEY_SOVEREIGN;
      if (!key) throw new Error("ANTHROPIC_API_KEY_SOVEREIGN and ANTHROPIC_API_KEY_SHARED are required. Legacy ANTHROPIC_API_KEY is not supported.");
      anthropicSovereign = new Anthropic({ apiKey: key });
    }
    return anthropicSovereign;
  } else {
    if (!anthropicShared) {
      const key = process.env.ANTHROPIC_API_KEY_SHARED;
      if (!key) throw new Error("ANTHROPIC_API_KEY_SOVEREIGN and ANTHROPIC_API_KEY_SHARED are required. Legacy ANTHROPIC_API_KEY is not supported.");
      anthropicShared = new Anthropic({ apiKey: key });
    }
    return anthropicShared;
  }
}

// Cached sovereign agent set (loaded once from anthropic-tier-assignment.json)
let _sovereignAgentSet: Set<string> | null = null;

function getSovereignAgentSet(): Set<string> {
  if (_sovereignAgentSet) return _sovereignAgentSet;
  try {
    const configPath = join(process.cwd(), "config", "anthropic-tier-assignment.json");
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const tiers = (raw.tier_assignments ?? {}) as Record<string, unknown>;
    const agentIds: string[] = [];
    for (const tier of Object.values(tiers)) {
      const t = tier as Record<string, unknown>;
      if (t.sovereign_isolation === true && Array.isArray(t.agents)) {
        for (const a of t.agents as Array<Record<string, unknown>>) {
          if (typeof a.agent_id === "string") agentIds.push(a.agent_id);
        }
      }
    }
    _sovereignAgentSet = new Set(agentIds);
  } catch {
    _sovereignAgentSet = new Set();
  }
  return _sovereignAgentSet;
}

function isSovereignRequest(tier: string, agentId?: string): boolean {
  if (tier === "strategic") return true;
  if (agentId && getSovereignAgentSet().has(agentId)) return true;
  return false;
}

/**
 * Lazy-load OpenAI SDK only for embeddings (not for completions).
 * Anthropic handles all LLM completion requests.
 *
 * @throws Error if OPENAI_API_KEY is not configured and embeddings are needed
 */
async function getOpenAIClient() {
  if (!openaiModule) {
    const OpenAI = (await import("openai")).default;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY not configured. Embeddings require OpenAI API key. " +
        "TODO: Migrate to alternative embedding service (Anthropic does not provide embedding models)"
      );
    }

    openaiModule = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiModule;
}

// Supabase client for cost logging (lazy)
let costSupabase: SupabaseClient | null = null;
function getCostSupabase(): SupabaseClient | null {
  if (costSupabase) return costSupabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  costSupabase = createClient(url, key);
  return costSupabase;
}

// Per-1K-token pricing (USD) — keep updated
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-20250514":     { input: 0.015,   output: 0.075 },
  "claude-sonnet-4-5-20250514": { input: 0.003,   output: 0.015 },
  "claude-haiku-4-5":           { input: 0.00025, output: 0.00125 },
  // Legacy OpenAI pricing retained for historical cost-log lookups only
  "gpt-4o":                     { input: 0.0025,  output: 0.01 },
  "gpt-4o-mini":                { input: 0.00015, output: 0.0006 },
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;

function assertNever(value: never): never {
  throw new Error(`Unknown provider configuration: ${JSON.stringify(value)}`);
}

function calculateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = TOKEN_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

async function logCost(
  agentId: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<void> {
  const sb = getCostSupabase();
  if (!sb) return;
  try {
    await sb.from("agent_costs").insert({
      agent_id: agentId,
      provider,
      model,
      tokens_in: inputTokens,
      tokens_out: outputTokens,
      cost_usd: costUsd,
    });
  } catch (err) {
    log.warn({ err }, "Failed to log cost");
  }
}

// Model configuration — all tiers route to Anthropic
const MODEL_MAP = {
  "claude-opus-4": {
    provider: "anthropic" as const,
    model: "claude-opus-4-20250514",
    tier: "strategic",
    maxTokens: 4096,
  },
  "claude-sonnet-4.5": {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-5-20250514",
    tier: "content",
    maxTokens: 4096,
  },
  "claude-haiku-4-5": {
    provider: "anthropic" as const,
    model: "claude-haiku-4-5",
    tier: "routine",
    maxTokens: 4096,
  },
} as const;

export type ModelKey = keyof typeof MODEL_MAP;

// Types
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  model: ModelKey;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  queueClass?: QueueClass;  // P0-P3 priority for rate governor
  agentId?: string;         // requesting agent for telemetry
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// COMPLETION OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a completion using the specified model.
 * All calls are rate-governed to prevent API limit hits.
 */
export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const {
    model,
    messages,
    maxTokens,
    temperature = 0.7,
    stopSequences,
    queueClass = "P2",
    agentId,
  } = options;

  const config = MODEL_MAP[model];
  if (!config) {
    throw new Error(`Unknown model: ${model}. Valid models: ${Object.keys(MODEL_MAP).join(", ")}`);
  }

  const effectiveMaxTokens = maxTokens || config.maxTokens;

  // Check response cache for P2/P3 requests (routine/low-priority)
  const cacheable = queueClass === "P2" || queueClass === "P3";
  const key = cacheable ? cacheKey(model, messages) : "";
  if (cacheable) {
    const cached = getCached(key);
    if (cached) {
      log.debug({ model, agentId, queueClass }, "LLM cache hit — skipping API call");
      return cached;
    }
  }

  // Estimate cost: ~$0.01 per 1K tokens for Opus, less for others
  const estimatedCostCents = config.tier === "strategic" ? 5 : config.tier === "content" ? 2 : 1;

  const timer = llmRequestDuration.startTimer({
    provider: config.provider,
    model: config.model,
    agent: agentId || "unknown",
  });

  try {
    const result = await withGovernor(
      { provider: config.provider, queueClass, agentId, estimatedCostCents },
      async () => {
        switch (config.provider) {
          case "anthropic":
            return completeWithAnthropic({
              model: config.model,
              messages,
              maxTokens: effectiveMaxTokens,
              temperature,
              stopSequences,
              sovereign: isSovereignRequest(config.tier, agentId),
            });
          default:
            return assertNever(config as never);
        }
      },
    );

    timer({ provider: config.provider, model: config.model, agent: agentId || "unknown" });
    llmRequestTotal.inc({ provider: config.provider, model: config.model, status: "success" });
    if (result.usage) {
      llmTokensUsed.inc({ provider: config.provider, model: config.model, direction: "input" }, result.usage.inputTokens);
      llmTokensUsed.inc({ provider: config.provider, model: config.model, direction: "output" }, result.usage.outputTokens);
      const costUsd = calculateCostUsd(config.model, result.usage.inputTokens, result.usage.outputTokens);
      // Fire-and-forget cost log
      void logCost(agentId || "unknown", config.provider, config.model, result.usage.inputTokens, result.usage.outputTokens, costUsd);
    }
    // Cache P2/P3 results
    if (cacheable) setCache(key, result);
    return result;
  } catch (error) {
    timer({ provider: config.provider, model: config.model, agent: agentId || "unknown" });
    llmRequestTotal.inc({ provider: config.provider, model: config.model, status: "error" });
    throw error;
  }
}

/**
 * Complete using Anthropic Claude
 */
async function completeWithAnthropic(options: {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  stopSequences?: string[];
  sovereign: boolean;
}): Promise<CompletionResult> {
  const { model, messages, maxTokens, temperature, stopSequences } = options;

  // Extract system message
  const systemMessage = messages.find(m => m.role === "system")?.content;
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const response = await getAnthropicClient(options.sovereign).messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemMessage,
    stop_sequences: stopSequences,
    messages: nonSystemMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const content = response.content[0].type === "text"
    ? response.content[0].text
    : "";

  return {
    content,
    model,
    provider: "anthropic",
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// AGENT COMPLETION HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Complete a task for an agent using their configured model
 */
export async function agentComplete(
  agentId: string,
  llmModel: ModelKey,
  soul: string,
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<CompletionResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: soul },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  return complete({
    model: llmModel,
    messages,
  });
}

/**
 * Generate a structured JSON response
 */
export async function completeJSON<T>(
  model: ModelKey,
  systemPrompt: string,
  userPrompt: string,
  schema?: string
): Promise<T | null> {
  const schemaInstruction = schema
    ? `\n\nRespond with valid JSON matching this schema:\n${schema}`
    : "\n\nRespond with valid JSON only. No markdown, no explanation.";

  const result = await complete({
    model,
    messages: [
      { role: "system", content: systemPrompt + schemaInstruction },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3, // Lower temperature for structured output
  });

  try {
    // Try to parse JSON from the response
    const jsonMatch = result.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    return JSON.parse(result.content) as T;
  } catch (error) {
    log.error({ err: error }, "Failed to parse JSON response");
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EMBEDDING OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate embedding using OpenAI text-embedding-3-small.
 *
 * NOTE: Anthropic does not provide embedding models. Embeddings still use OpenAI.
 * TODO: Migrate to alternative embedding service (Cohere, Hugging Face, etc.)
 */
export async function embed(text: string): Promise<number[]> {
  const openai = await getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const openai = await getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: texts,
  });
  return response.data.map((d: any) => d.embedding);
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get model configuration
 */
export function getModelConfig(model: ModelKey) {
  return MODEL_MAP[model];
}

/**
 * Get all available models
 */
export function getAvailableModels(): ModelKey[] {
  return Object.keys(MODEL_MAP) as ModelKey[];
}

/**
 * Check if a model key is valid
 */
export function isValidModel(model: string): model is ModelKey {
  return model in MODEL_MAP;
}

/**
 * Estimate token count (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Get the recommended model for a role type
 */
export function getModelForRole(roleType: string): ModelKey {
  switch (roleType) {
    case "executive":
      return "claude-opus-4";
    case "manager":
    case "content":
      return "claude-sonnet-4.5";
    case "specialist":
    case "coordinator":
    default:
      return "claude-haiku-4-5";
  }
}
