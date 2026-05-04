/**
 * Ollama Client Adapter
 * OpenClaw Multi-Agent Network
 *
 * Provides local LLM access via Ollama (llama3.1:8b, llama3.2:3b, etc.).
 * Wraps Ollama /api/chat endpoint to match CompletionResult interface.
 * Embeddings remain with OpenAI (text-embedding-3-small).
 *
 * Configuration:
 *   OLLAMA_HOST: http://ollama:11434 (default, set in docker-compose.yml)
 *   OLLAMA_MODEL_CHAT: llama3.1:8b (default, can override per request)
 *   OLLAMA_REQUEST_TIMEOUT_MS: 300000 (5 minutes, adjust for slower machines)
 */

import { logger } from "./logger.js";

const log = logger.child({ module: "ollama-client" });

// Configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_REQUEST_TIMEOUT_MS = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || "300000", 10);
const DEFAULT_CHAT_MODEL = "llama3.1:8b"; // Primary local model
const DEFAULT_FAST_MODEL = "llama3.2:3b"; // Fast, lightweight model

// Models available locally
export enum OllamaModel {
  STANDARD = "llama3.1:8b",    // Primary: balanced quality/speed
  FAST = "llama3.2:3b",         // Lightweight: routine tasks
  NEURAL = "nomic-embed-text",  // Embeddings (if needed in future)
}

export interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  stream: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: "assistant" | "user" | "system";
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Check if Ollama is reachable and healthy
 */
export async function healthcheck(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: "GET",
      timeout: 5000,
    });
    return response.ok;
  } catch (err) {
    log.warn({ err }, "Ollama healthcheck failed");
    return false;
  }
}

/**
 * Get list of available models in Ollama
 */
export async function listModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: "GET",
      timeout: 5000,
    });
    if (!response.ok) {
      log.error({ status: response.status }, "Failed to list Ollama models");
      return [];
    }
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    return (data.models || []).map(m => m.name);
  } catch (err) {
    log.error({ err }, "Error listing Ollama models");
    return [];
  }
}

/**
 * Stream a chat completion from Ollama (internal helper for streaming)
 * Note: OpenClaw currently uses non-streaming completions. This is here for future use.
 */
export async function* chatStream(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  model: string = DEFAULT_CHAT_MODEL,
  temperature: number = 0.7,
  maxTokens?: number
): AsyncGenerator<string, void, unknown> {
  const request: OllamaChatRequest = {
    model,
    messages,
    stream: true,
    temperature,
    num_predict: maxTokens,
  };

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      timeout: OLLAMA_REQUEST_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body from Ollama");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        try {
          const json = JSON.parse(lines[i]) as OllamaChatResponse;
          if (json.message?.content) {
            yield json.message.content;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }

      buffer = lines[lines.length - 1];
    }
  } catch (err) {
    log.error({ err, model }, "Ollama streaming chat failed");
    throw err;
  }
}

/**
 * Non-streaming chat completion from Ollama
 * Returns full response when done (primary method for OpenClaw)
 */
export async function chat(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  model: string = DEFAULT_CHAT_MODEL,
  temperature: number = 0.7,
  maxTokens?: number
): Promise<{
  content: string;
  model: string;
  provider: string;
  usage?: { inputTokens: number; outputTokens: number };
}> {
  const request: OllamaChatRequest = {
    model,
    messages,
    stream: false,
    temperature,
    num_predict: maxTokens,
  };

  try {
    const startTime = Date.now();
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      timeout: OLLAMA_REQUEST_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const durationMs = Date.now() - startTime;

    log.debug(
      {
        model,
        temperature,
        durationMs,
        promptTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
      "Ollama chat completed"
    );

    return {
      content: data.message.content,
      model: data.model,
      provider: "ollama",
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
    };
  } catch (err) {
    log.error({ err, model }, "Ollama chat failed");
    throw err;
  }
}

/**
 * Suggest a model based on role type (local equivalents)
 * Maps Anthropic tier names to Ollama models
 */
export function getModelForRole(roleType: string): OllamaModel {
  switch (roleType) {
    case "executive":
    case "strategic":
      return OllamaModel.STANDARD; // 8B for complex reasoning
    case "manager":
    case "content":
    case "operator":
      return OllamaModel.FAST; // 3B for routine tasks
    default:
      return OllamaModel.STANDARD;
  }
}

/**
 * Convert Anthropic model key to best-fit Ollama model
 */
export function mapAnthropicToOllama(anthropicModel: string): OllamaModel {
  if (anthropicModel.includes("opus")) return OllamaModel.STANDARD;
  if (anthropicModel.includes("sonnet")) return OllamaModel.STANDARD;
  if (anthropicModel.includes("haiku")) return OllamaModel.FAST;
  return OllamaModel.STANDARD;
}
