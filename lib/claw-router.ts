import Anthropic from "@anthropic-ai/sdk";
import {
  checkRequest,
  reportFailure,
  reportSuccess,
  withGovernor,
  type QueueClass,
} from "./api-rate-governor";
import { logger } from "./logger";
import { llmRequestDuration, llmRequestTotal } from "./metrics";
import * as fs from "fs";
import * as path from "path";

const log = logger.child({ module: "claw-router" });

const OPENROUTER_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_HTTP_REFERER = "https://openclaw.truthjblue.com";
const OPENROUTER_X_TITLE = "OpenClaw-TruthJBlue";

/**
 * Known Anthropic models for validation - Pure Anthropic migration (Mar 2026)
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
 * 5-Agent Tier Identifiers - Pure Anthropic Architecture
 */
const VALID_TIER_IDS = [
  "anthropic-strategist",
  "anthropic-executor",
  "anthropic-communicator",
  "anthropic-analyst",
  "anthropic-guardian",
] as const;

type TierId = (typeof VALID_TIER_IDS)[number];

export type AgentTier =
  | "STRATEGIST"
  | "EXECUTOR"
  | "COMMUNICATOR"
  | "ANALYST"
  | "GUARDIAN";

type OpenRouterEligibleTier = Extract<AgentTier, "EXECUTOR" | "COMMUNICATOR" | "ANALYST">;

/**
 * ClawRouter - Tier-isolated completion routing.
 * Enforces Sovereign key isolation and manages tier assignments for 5-agent pure Anthropic architecture.
 */
export interface ClawRouterConfig {
  tiers: Record<string, TierConfig>;
  routing_rules: RoutingRule[];
  fallback: FallbackConfig;
}

export type RouterConfig = ClawRouterConfig;

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
  enabled: boolean;
  provider: string;
  trigger_on_http_status: number[];
  eligible_tiers: OpenRouterEligibleTier[];
  sovereign_tiers_excluded: Array<Extract<AgentTier, "STRATEGIST" | "GUARDIAN">>;
  max_fallback_attempts: number;
  fallback_timeout_ms: number;
  model_map: Partial<Record<AgentTier, string>>;
  tool_calling_capable_models: string[];
  log_all_fallbacks: boolean;
}

export interface CompletionOptions {
  prompt: string;
  agentId?: string;
  tags?: string[];
  maxTokens?: number;
  temperature?: number;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicImageBlock {
  type: "image";
  source?: unknown;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | AnthropicContentBlock[];
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | { type: string; [key: string]: unknown };

export interface AnthropicMessage {
  role: "system" | "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema?: unknown;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string | AnthropicContentBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  stop_sequences?: string[];
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
}

interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export type LLMResponse = Anthropic.Message & {
  metadata?: {
    provider: "openrouter_fallback";
    trigger_status: number;
    fallback_model: string;
    latency_ms: number;
    token_count: number;
  };
};

interface AnthropicClientLike {
  messages: {
    create(request: unknown): Promise<Anthropic.Message>;
  };
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type OpenRouterFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponseLike>;

class OpenRouterFallbackError extends Error {
  status?: number;

  constructor(message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = "OpenRouterFallbackError";
    this.status = status;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

let configCache: ClawRouterConfig | null = null;
const clients: Record<string, AnthropicClientLike> = {};
let anthropicClientFactory: ((apiKey: string) => AnthropicClientLike) | null = null;
let openRouterFetchOverride: OpenRouterFetch | null = null;

function clearClientCache(): void {
  for (const key of Object.keys(clients)) {
    delete clients[key];
  }
}

export function __setAnthropicClientFactoryForTest(
  factory: ((apiKey: string) => AnthropicClientLike) | null,
): void {
  anthropicClientFactory = factory;
  clearClientCache();
}

export function __setOpenRouterFetchForTest(fetchImpl: OpenRouterFetch | null): void {
  openRouterFetchOverride = fetchImpl;
}

export function __resetClawRouterTestState(): void {
  anthropicClientFactory = null;
  openRouterFetchOverride = null;
  configCache = null;
  clearClientCache();
}

function loadConfig(): ClawRouterConfig {
  if (configCache) return configCache;
  const configPath = path.join(process.cwd(), "config", "claw-router.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  configCache = JSON.parse(raw) as ClawRouterConfig;
  return configCache;
}

function getAnthropicClient(envVar: string): AnthropicClientLike {
  if (clients[envVar]) return clients[envVar];
  const apiKey = process.env[envVar];
  if (!apiKey) throw new Error(`Missing required environment variable: ${envVar}`);
  clients[envVar] = anthropicClientFactory
    ? anthropicClientFactory(apiKey)
    : (new Anthropic({ apiKey }) as unknown as AnthropicClientLike);
  return clients[envVar];
}

function getOpenRouterFetch(): OpenRouterFetch {
  if (openRouterFetchOverride) return openRouterFetchOverride;
  const fetchImpl = (globalThis as typeof globalThis & { fetch?: OpenRouterFetch }).fetch;
  if (!fetchImpl) {
    throw new Error("Global fetch is not available for OpenRouter fallback");
  }
  return fetchImpl;
}

/**
 * Validate that a model identifier is a known Anthropic model
 */
function validateModel(model: string): void {
  if (!VALID_ANTHROPIC_MODELS.includes(model as (typeof VALID_ANTHROPIC_MODELS)[number])) {
    log.warn(
      { model, valid_models: VALID_ANTHROPIC_MODELS },
      "Model not in known list - assuming Anthropic compatible. Ensure model exists.",
    );
  }
}

/**
 * Validate that a tier ID is one of the 5-agent tiers
 */
function validateTierId(tierId: string): void {
  if (!VALID_TIER_IDS.includes(tierId as TierId)) {
    log.warn(
      { tierId, valid_tiers: VALID_TIER_IDS },
      "Tier ID not in standard 5-agent list. If this is intentional, proceed.",
    );
  }
}

function tierIdToAgentTier(tierId: string): AgentTier {
  switch (tierId) {
    case "anthropic-strategist":
      return "STRATEGIST";
    case "anthropic-executor":
      return "EXECUTOR";
    case "anthropic-communicator":
      return "COMMUNICATOR";
    case "anthropic-analyst":
      return "ANALYST";
    case "anthropic-guardian":
      return "GUARDIAN";
    default:
      throw new Error(`Unknown tier ID: ${tierId}`);
  }
}

function agentTierToTierId(tier: AgentTier): TierId {
  switch (tier) {
    case "STRATEGIST":
      return "anthropic-strategist";
    case "EXECUTOR":
      return "anthropic-executor";
    case "COMMUNICATOR":
      return "anthropic-communicator";
    case "ANALYST":
      return "anthropic-analyst";
    case "GUARDIAN":
      return "anthropic-guardian";
  }
}

function getTierConfigForAgentTier(config: ClawRouterConfig, tier: AgentTier): TierConfig {
  const tierId = agentTierToTierId(tier);
  const tierConfig = config.tiers[tierId];
  if (!tierConfig) {
    throw new Error(`Tier config not found for ${tier}`);
  }
  return tierConfig;
}

function isTextBlock(block: AnthropicContentBlock): block is AnthropicTextBlock {
  return block.type === "text" && typeof (block as { text?: unknown }).text === "string";
}

function isImageBlock(block: AnthropicContentBlock): block is AnthropicImageBlock {
  return block.type === "image";
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return (
    block.type === "tool_use" &&
    typeof (block as { id?: unknown }).id === "string" &&
    typeof (block as { name?: unknown }).name === "string"
  );
}

function isToolResultBlock(block: AnthropicContentBlock): block is AnthropicToolResultBlock {
  return block.type === "tool_result" && typeof (block as { tool_use_id?: unknown }).tool_use_id === "string";
}

function normalizeContentBlocks(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

function flattenAnthropicContent(content: string | AnthropicContentBlock[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;

  return content
    .map((block) => {
      if (isTextBlock(block)) return block.text;
      if (isToolResultBlock(block)) {
        return flattenAnthropicContent(block.content);
      }
      return "";
    })
    .filter((value) => value.length > 0)
    .join("\n\n");
}

function mergeSystemText(request: AnthropicRequest): string | undefined {
  const parts: string[] = [];
  const topLevelSystem = flattenAnthropicContent(request.system);
  if (topLevelSystem) parts.push(topLevelSystem);

  for (const message of request.messages) {
    if (message.role === "system") {
      const systemText = flattenAnthropicContent(message.content);
      if (systemText) parts.push(systemText);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const statusCandidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };

  if (typeof statusCandidate.status === "number") return statusCandidate.status;
  if (typeof statusCandidate.statusCode === "number") return statusCandidate.statusCode;
  if (typeof statusCandidate.response?.status === "number") return statusCandidate.response.status;
  return null;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      status: getErrorStatus(error),
    };
  }
  return { message: String(error), status: getErrorStatus(error) };
}

function shouldUseFallback(tier: AgentTier, status: number | null, config: ClawRouterConfig): boolean {
  if (!status) return false;
  const fallback = config.fallback;
  if (!fallback.enabled) return false;
  if (!fallback.trigger_on_http_status.includes(status)) return false;
  if (fallback.sovereign_tiers_excluded.includes(tier as Extract<AgentTier, "STRATEGIST" | "GUARDIAN">)) {
    return false;
  }
  return fallback.eligible_tiers.includes(tier as OpenRouterEligibleTier);
}

function isToolCapableFallbackModel(model: string, config: ClawRouterConfig): boolean {
  return config.fallback.tool_calling_capable_models.includes(model);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function extractOpenRouterTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const textParts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      textParts.push((block as { text: string }).text);
    }
  }
  return textParts.join("\n\n");
}

function mapOpenRouterFinishReason(finishReason: string | null | undefined): string | null {
  switch (finishReason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "stop":
    case "end_turn":
      return "end_turn";
    default:
      return null;
  }
}

function normalizeOpenRouterResponse(
  response: OpenRouterResponse,
  fallbackModel: string,
  triggerStatus: number,
  latencyMs: number,
): LLMResponse {
  const choice = response.choices?.[0];
  if (!choice?.message) {
    throw new OpenRouterFallbackError("OpenRouter response did not include a completion choice");
  }

  const contentBlocks: AnthropicContentBlock[] = [];
  const textContent = extractOpenRouterTextContent(choice.message.content);
  if (textContent) {
    contentBlocks.push({ type: "text", text: textContent });
  }

  if (Array.isArray(choice.message.tool_calls)) {
    for (const toolCall of choice.message.tool_calls) {
      contentBlocks.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input: safeParseJson(toolCall.function.arguments),
      });
    }
  }

  if (contentBlocks.length === 0) {
    contentBlocks.push({ type: "text", text: "" });
  }

  const usage = response.usage ?? {};
  const tokenCount =
    usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);

  return {
    id: response.id ?? `openrouter-fallback-${Date.now()}`,
    type: "message",
    role: "assistant",
    model: response.model ?? fallbackModel,
    content: contentBlocks as unknown as Anthropic.Message["content"],
    stop_reason: mapOpenRouterFinishReason(choice.finish_reason) as Anthropic.Message["stop_reason"],
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
    metadata: {
      provider: "openrouter_fallback",
      trigger_status: triggerStatus,
      fallback_model: fallbackModel,
      latency_ms: latencyMs,
      token_count: tokenCount,
    },
  } as LLMResponse;
}

function buildPrimaryAnthropicRequest(primaryRequest: AnthropicRequest): Record<string, unknown> {
  const systemText = mergeSystemText(primaryRequest);
  const nonSystemMessages = primaryRequest.messages
    .filter((message): message is AnthropicMessage & { role: "user" | "assistant" } => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : message.content,
    }));

  const request: Record<string, unknown> = {
    model: primaryRequest.model,
    max_tokens: primaryRequest.max_tokens,
    messages: nonSystemMessages,
  };

  if (typeof primaryRequest.temperature === "number") {
    request.temperature = primaryRequest.temperature;
  }
  if (systemText) {
    request.system = systemText;
  }
  if (primaryRequest.tools && primaryRequest.tools.length > 0) {
    request.tools = primaryRequest.tools;
  }
  if (primaryRequest.stop_sequences && primaryRequest.stop_sequences.length > 0) {
    request.stop_sequences = primaryRequest.stop_sequences;
  }

  return request;
}

async function callAnthropicPrimaryOnce(
  tierConfig: TierConfig,
  primaryClient: AnthropicClientLike,
  primaryPayload: Record<string, unknown>,
): Promise<LLMResponse> {
  const guard = checkRequest({
    provider: tierConfig.provider,
    queueClass: tierConfig.queue_class as QueueClass,
  });

  if (!guard.allowed) {
    throw new Error(`[RateGovernor] Request blocked: ${guard.reason ?? "unknown reason"}`);
  }

  try {
    const primaryResponse = await primaryClient.messages.create(primaryPayload);
    reportSuccess(tierConfig.provider);
    return primaryResponse as LLMResponse;
  } catch (error) {
    reportFailure(tierConfig.provider, getErrorStatus(error) ?? undefined);
    throw error;
  }
}

/**
 * Adapt Anthropic request messages/tools into the OpenAI chat-completions format expected by OpenRouter.
 */
export function adaptAnthropicToOpenAI(
  messages: AnthropicMessage[],
  tools?: AnthropicTool[],
): { messages: OpenAIMessage[]; tools?: OpenAITool[] } {
  const openAiMessages: OpenAIMessage[] = [];

  for (const message of messages) {
    const blocks = normalizeContentBlocks(message.content);
    const textParts: string[] = [];
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: OpenAIMessage[] = [];

    for (const block of blocks) {
      if (isTextBlock(block)) {
        textParts.push(block.text);
        continue;
      }

      if (isImageBlock(block)) {
        log.warn(
          { role: message.role, event: "openrouter_fallback_image_strip" },
          "OpenRouter fallback stripped unsupported image content.",
        );
        continue;
      }

      if (isToolUseBlock(block)) {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
        continue;
      }

      if (isToolResultBlock(block)) {
        toolResults.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: flattenAnthropicContent(block.content) || (block.is_error ? "Tool execution failed." : ""),
        });
      }
    }

    const textContent = textParts.join("\n\n");
    if (message.role === "system") {
      if (textContent) {
        openAiMessages.push({ role: "system", content: textContent });
      }
      continue;
    }

    if (textContent || toolCalls.length > 0) {
      const nextMessage: OpenAIMessage = { role: message.role };
      if (textContent) nextMessage.content = textContent;
      if (toolCalls.length > 0) nextMessage.tool_calls = toolCalls;
      openAiMessages.push(nextMessage);
    }

    openAiMessages.push(...toolResults);
  }

  const openAiTools =
    tools && tools.length > 0
      ? tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        }))
      : undefined;

  if (openAiTools && openAiTools.length > 0) {
    return { messages: openAiMessages, tools: openAiTools };
  }
  return { messages: openAiMessages };
}

async function callOpenRouter(
  request: OpenRouterRequest,
  timeoutMs: number,
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterFallbackError("OPENROUTER_API_KEY is not configured");
  }

  const fetchImpl = getOpenRouterFetch();
  const responsePromise = fetchImpl(OPENROUTER_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": OPENROUTER_HTTP_REFERER,
      "X-Title": OPENROUTER_X_TITLE,
    },
    body: JSON.stringify(request),
  });

  const timeoutPromise = new Promise<FetchResponseLike>((_, reject) => {
    setTimeout(() => {
      reject(new OpenRouterFallbackError(`OpenRouter fallback timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const response = (await Promise.race([responsePromise, timeoutPromise])) as FetchResponseLike;
  if (!response.ok) {
    const errorBody = await response.text();
    throw new OpenRouterFallbackError(
      `OpenRouter fallback failed with status ${response.status}: ${errorBody}`,
      response.status,
    );
  }

  return (await response.json()) as OpenRouterResponse;
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
      matched = rule.match.any_of.some(
        (matchRule) =>
          (matchRule.agent_id && options.agentId === matchRule.agent_id) ||
          (matchRule.tag && options.tags?.includes(matchRule.tag)),
      );
    }

    if (matched) {
      const tierConfig = config.tiers[rule.route_to];
      if (!tierConfig) {
        const msg = `Invalid route: "${rule.route_to}" - Tier not found in config. Valid tiers: ${Object.keys(config.tiers).join(", ")}`;
        throw new Error(msg);
      }

      validateModel(tierConfig.model);
      validateTierId(rule.route_to);

      if (rule.enforce_sovereign_isolation && tierConfig.credential_env !== "ANTHROPIC_API_KEY_SOVEREIGN") {
        const msg = `SECURITY_FAULT: Sovereign route "${rule.rule_id}" assigned to non-sovereign credential. Expected ANTHROPIC_API_KEY_SOVEREIGN but got ${tierConfig.credential_env}`;
        log.error(msg);
        throw new Error(msg);
      }

      if (tierConfig.sovereign_isolation && !rule.enforce_sovereign_isolation) {
        const msg = `SECURITY_WARNING: Tier "${rule.route_to}" claims sovereign_isolation but rule does not enforce it. Check routing rules.`;
        log.warn(msg);
      }

      return { tierId: rule.route_to, config: tierConfig };
    }
  }

  const msg = `No routing rule matched the request. Agent: ${options.agentId}, Tags: ${options.tags?.join(",")}. Available rules: ${[...config.routing_rules].map((rule) => rule.rule_id).join(", ")}`;
  throw new Error(msg);
}

export async function routeWithFallback(
  tier: AgentTier,
  primaryRequest: AnthropicRequest,
  config: ClawRouterConfig,
): Promise<LLMResponse> {
  const tierConfig = getTierConfigForAgentTier(config, tier);
  const primaryClient = getAnthropicClient(tierConfig.credential_env);
  const primaryPayload = buildPrimaryAnthropicRequest(primaryRequest);

  try {
    return await callAnthropicPrimaryOnce(tierConfig, primaryClient, primaryPayload);
  } catch (primaryError) {
    const triggerStatus = getErrorStatus(primaryError);
    if (!shouldUseFallback(tier, triggerStatus, config)) {
      throw primaryError;
    }

    const fallbackModel = config.fallback.model_map[tier];
    if (!fallbackModel) {
      log.warn(
        { event: "openrouter_fallback", tier, trigger_status: triggerStatus, success: false },
        "No fallback model configured for tier; rethrowing primary Anthropic error.",
      );
      throw primaryError;
    }

    if (!process.env.OPENROUTER_API_KEY) {
      log.warn(
        { event: "openrouter_fallback", tier, trigger_status: triggerStatus, model: fallbackModel, success: false },
        "OpenRouter fallback requested but OPENROUTER_API_KEY is not configured.",
      );
      throw primaryError;
    }

    let adaptedTools = primaryRequest.tools;
    if (adaptedTools && adaptedTools.length > 0 && !isToolCapableFallbackModel(fallbackModel, config)) {
      if (tier === "ANALYST") {
        // TODO: Replace with model capability registry when available.
        adaptedTools = undefined;
        log.warn(
          { event: "openrouter_fallback", tier, trigger_status: triggerStatus, model: fallbackModel, success: false },
          "Analyst fallback model lacks reliable tool support; stripping tools before OpenRouter fallback.",
        );
      } else {
        log.warn(
          { event: "openrouter_fallback", tier, trigger_status: triggerStatus, model: fallbackModel, success: false },
          "Fallback model lacks tool support; aborting OpenRouter fallback.",
        );
        throw primaryError;
      }
    }

    const fallbackMessages: AnthropicMessage[] = [];
    const systemText = mergeSystemText(primaryRequest);
    if (systemText) {
      fallbackMessages.push({ role: "system", content: systemText });
    }
    fallbackMessages.push(...primaryRequest.messages.filter((message) => message.role !== "system"));

    const adaptedRequest = adaptAnthropicToOpenAI(fallbackMessages, adaptedTools);
    const openRouterRequest: OpenRouterRequest = {
      model: fallbackModel,
      messages: adaptedRequest.messages,
      temperature: primaryRequest.temperature,
      max_tokens: primaryRequest.max_tokens,
    };

    if (adaptedRequest.tools && adaptedRequest.tools.length > 0) {
      openRouterRequest.tools = adaptedRequest.tools;
    }
    if (primaryRequest.stop_sequences && primaryRequest.stop_sequences.length > 0) {
      openRouterRequest.stop = primaryRequest.stop_sequences;
    }

    let lastFallbackError: unknown = primaryError;

    for (let attempt = 1; attempt <= config.fallback.max_fallback_attempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const openRouterResponse = await callOpenRouter(
          openRouterRequest,
          config.fallback.fallback_timeout_ms,
        );
        const normalizedResponse = normalizeOpenRouterResponse(
          openRouterResponse,
          fallbackModel,
          triggerStatus ?? 0,
          Date.now() - startedAt,
        );

        if (config.fallback.log_all_fallbacks) {
          log.info(
            {
              event: "openrouter_fallback",
              tier,
              trigger_status: triggerStatus,
              model: fallbackModel,
              token_count: normalizedResponse.metadata?.token_count ?? 0,
              latency_ms: normalizedResponse.metadata?.latency_ms ?? 0,
              success: true,
              attempt,
            },
            "OpenRouter fallback succeeded.",
          );
        }

        return normalizedResponse;
      } catch (openRouterError) {
        const latencyMs = Date.now() - startedAt;
        lastFallbackError = openRouterError;
        log.error(
          {
            event: "openrouter_fallback",
            tier,
            trigger_status: triggerStatus,
            model: fallbackModel,
            token_count: 0,
            latency_ms: latencyMs,
            success: false,
            attempt,
            primary_error: serializeError(primaryError),
            fallback_error: serializeError(openRouterError),
          },
          "OpenRouter fallback attempt failed.",
        );
      }
    }

    log.error(
      {
        tier,
        trigger_status: triggerStatus,
        primary_error: serializeError(primaryError),
        fallback_error: serializeError(lastFallbackError),
      },
      "Primary Anthropic request failed and OpenRouter fallback was exhausted.",
    );
    throw lastFallbackError;
  }
}

/**
 * Execute a completion through the routed tier.
 */
export async function complete(options: CompletionOptions): Promise<Anthropic.Message> {
  const routerConfig = loadConfig();
  const { tierId, config } = routeRequest(options);
  const tier = tierIdToAgentTier(tierId);

  const primaryRequest: AnthropicRequest = {
    model: config.model,
    max_tokens: options.maxTokens || config.max_tokens,
    temperature: options.temperature ?? config.temperature_default,
    messages: [{ role: "user", content: options.prompt }],
  };

  const timer = llmRequestDuration.startTimer({
    provider: config.provider,
    model: config.model,
    agent: options.agentId || "unknown",
  });

  try {
    let response: LLMResponse;

    if (tier === "STRATEGIST" || tier === "GUARDIAN") {
      // SOVEREIGN TIER - Anthropic-only. Do not route through fallback. See claw-router.json.
      const client = getAnthropicClient(config.credential_env);
      response = (await withGovernor(
        {
          provider: config.provider,
          queueClass: config.queue_class as QueueClass,
          agentId: options.agentId,
        },
        async () => client.messages.create(buildPrimaryAnthropicRequest(primaryRequest)),
      )) as LLMResponse;
    } else {
      response = await routeWithFallback(tier, primaryRequest, routerConfig);
    }

    const metricProvider = response.metadata?.provider ?? config.provider;
    const metricModel = response.model ?? config.model;

    timer({
      provider: metricProvider,
      model: metricModel,
      agent: options.agentId || "unknown",
    });
    llmRequestTotal.inc({ provider: metricProvider, model: metricModel, status: "success" });

    return response;
  } catch (error) {
    timer({
      provider: config.provider,
      model: config.model,
      agent: options.agentId || "unknown",
    });
    llmRequestTotal.inc({ provider: config.provider, model: config.model, status: "error" });
    log.error({ error, tier }, "ClawRouter completion failed.");
    throw error;
  }
}
