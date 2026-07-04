/**
 * Runtime model policy helpers for OpenClaw rollout stages.
 *
 * Source-of-truth llm_model values come from config/agents_config.json.
 * Runtime config model strings are derived from those values.
 */

export const CANARY_AGENT_IDS = new Set([
  "main",
  "marketing",
  "sales",
  "support",
  "d1_ceo",
  "d1_cto",
  "shared_runtime_ops",
  "d8_saas_director",
  "d9_store_director",
  "biz_01_pod_lead",
]);

// Internal llm_model labels are tier names; these maps resolve them to the
// CURRENT gateway model refs (2026-07 refresh: sonnet-4-5 → sonnet-5,
// opus-4/4-5 → opus-4-8; haiku-4-5 remains current).
export const ANTHROPIC_MODEL_BY_LLM = {
  "claude-opus-4": "anthropic/claude-opus-4-8",
  "claude-sonnet-4.5": "anthropic/claude-sonnet-5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
};

// Legacy stable model used for non-canary agents during canary rollout.
// All tiers now point to Anthropic models — the OpenAI migration is complete.
// gpt-5.3-codex was a placeholder that never existed; replaced with real Anthropic equivalents.
export const LEGACY_STABLE_MODEL_BY_LLM = {
  "claude-opus-4": "anthropic/claude-sonnet-5",
  "claude-sonnet-4.5": "anthropic/claude-sonnet-5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
};

const EXTRA_AGENT_LLM_FALLBACK = {
  main: "claude-sonnet-4.5",
  marketing: "claude-sonnet-4.5",
  sales: "claude-sonnet-4.5",
  support: "claude-sonnet-4.5",
};

export function buildAgentLlmModelIndex(agentsConfig) {
  const byId = new Map();
  for (const agent of agentsConfig?.agents || []) {
    if (!agent?.agent_id || !agent?.llm_model) continue;
    byId.set(agent.agent_id, agent.llm_model);
  }
  return byId;
}

export function getAgentLlmModel(agentId, llmModelIndex) {
  const model = llmModelIndex.get(agentId) || EXTRA_AGENT_LLM_FALLBACK[agentId];
  if (!model) return null;
  return model;
}

function assertKnownLlmModel(llmModel, agentId) {
  if (!llmModel) {
    throw new Error(`Missing llm_model for agent "${agentId}" and no fallback is defined`);
  }
  if (!(llmModel in ANTHROPIC_MODEL_BY_LLM)) {
    const allowed = Object.keys(ANTHROPIC_MODEL_BY_LLM).join(", ");
    throw new Error(
      `Unsupported llm_model "${llmModel}" for agent "${agentId}". Allowed: ${allowed}`,
    );
  }
}

export function resolveRuntimeModel({ agentId, llmModel, rolloutMode = "full" }) {
  assertKnownLlmModel(llmModel, agentId);

  if (rolloutMode === "full") {
    return ANTHROPIC_MODEL_BY_LLM[llmModel];
  }

  if (rolloutMode === "canary") {
    if (CANARY_AGENT_IDS.has(agentId)) {
      return ANTHROPIC_MODEL_BY_LLM[llmModel];
    }
    return LEGACY_STABLE_MODEL_BY_LLM[llmModel];
  }

  throw new Error(`Unsupported rollout mode "${rolloutMode}"`);
}

export function getAllowedCompletionModels(rolloutMode = "full") {
  const anthropicModels = new Set(Object.values(ANTHROPIC_MODEL_BY_LLM));
  if (rolloutMode === "full") return anthropicModels;

  if (rolloutMode === "canary") {
    for (const model of Object.values(LEGACY_STABLE_MODEL_BY_LLM)) {
      anthropicModels.add(model);
    }
    return anthropicModels;
  }

  throw new Error(`Unsupported rollout mode "${rolloutMode}"`);
}

export function buildRuntimeModelCatalog(rolloutMode = "full") {
  const models = {};
  for (const model of getAllowedCompletionModels(rolloutMode)) {
    models[model] = {};
  }
  return models;
}

export function isAnthropicCompletionModel(model) {
  return typeof model === "string" && model.startsWith("anthropic/");
}

export function summarizeModelDistribution(agentList = []) {
  const counts = {};
  for (const agent of agentList) {
    if (!agent?.model) continue;
    counts[agent.model] = (counts[agent.model] || 0) + 1;
  }
  return counts;
}
