/**
 * LLM Router Library
 * Open Claw Multi-Agent Network
 * 
 * Routes completion requests to appropriate LLM providers based on model key.
 * Supports Anthropic (Claude) and OpenAI (GPT) models.
 * 
 * Rate-governed via api-rate-governor to prevent API limit hits and overload.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { withGovernor, type QueueClass } from "./api-rate-governor";

// Initialize clients lazily
let anthropic: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// Model configuration
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
  "gpt-4o-mini": {
    provider: "openai" as const,
    model: "gpt-4o-mini",
    tier: "routine",
    maxTokens: 4096,
  },
  "gpt-4o": {
    provider: "openai" as const,
    model: "gpt-4o",
    tier: "content",
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

  // Estimate cost: ~$0.01 per 1K tokens for Opus, less for others
  const estimatedCostCents = config.tier === "strategic" ? 5 : config.tier === "content" ? 2 : 1;

  return withGovernor(
    { provider: config.provider, queueClass, agentId, estimatedCostCents },
    async () => {
      if (config.provider === "anthropic") {
        return completeWithAnthropic({
          model: config.model,
          messages,
          maxTokens: effectiveMaxTokens,
          temperature,
          stopSequences,
        });
      }

      if (config.provider === "openai") {
        return completeWithOpenAI({
          model: config.model,
          messages,
          maxTokens: effectiveMaxTokens,
          temperature,
          stopSequences,
        });
      }

      throw new Error(`Unknown provider: ${config.provider}`);
    }
  );
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
}): Promise<CompletionResult> {
  const { model, messages, maxTokens, temperature, stopSequences } = options;

  // Extract system message
  const systemMessage = messages.find(m => m.role === "system")?.content;
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  const response = await getAnthropic().messages.create({
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

/**
 * Complete using OpenAI GPT
 */
async function completeWithOpenAI(options: {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  stopSequences?: string[];
}): Promise<CompletionResult> {
  const { model, messages, maxTokens, temperature, stopSequences } = options;

  const response = await getOpenAI().chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stop: stopSequences,
  });

  const content = response.choices[0].message.content || "";

  return {
    content,
    model,
    provider: "openai",
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
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
    console.error("Failed to parse JSON response:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EMBEDDING OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate embedding using OpenAI ada-002
 */
export async function embed(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-ada-002",
    input: texts,
  });
  return response.data.map(d => d.embedding);
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
      return "gpt-4o-mini";
  }
}
