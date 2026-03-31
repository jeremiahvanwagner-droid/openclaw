#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  CANARY_AGENT_IDS,
  buildAgentLlmModelIndex,
  getAgentLlmModel,
  getAllowedCompletionModels,
  isAnthropicCompletionModel,
  resolveRuntimeModel,
  summarizeModelDistribution,
} from "../../lib/runtime-model-policy.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    config: path.join(ROOT_DIR, "config", "openclaw.prod.json"),
    agents: path.join(ROOT_DIR, "config", "agents_config.json"),
    rollout: "full",
    expectedAgentCount: 107,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) args.config = path.resolve(argv[i + 1]);
    if (arg === "--agents" && argv[i + 1]) args.agents = path.resolve(argv[i + 1]);
    if (arg === "--rollout" && argv[i + 1]) args.rollout = argv[i + 1];
    if (arg === "--expected-agent-count" && argv[i + 1]) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) args.expectedAgentCount = value;
    }
  }

  if (!["full", "canary"].includes(args.rollout)) {
    throw new Error(`Invalid --rollout "${args.rollout}". Use "full" or "canary".`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function unique(values) {
  return [...new Set(values)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runtimeConfig = await readJson(args.config);
  const agentsConfig = await readJson(args.agents);

  const runtimeAgents = Array.isArray(runtimeConfig?.agents?.list)
    ? runtimeConfig.agents.list
    : [];
  const llmIndex = buildAgentLlmModelIndex(agentsConfig);
  const allowedModels = getAllowedCompletionModels(args.rollout);
  const configuredAgentIds = new Set((agentsConfig?.agents || []).map((a) => a.agent_id));

  const missingConfiguredAgents = [];
  for (const agentId of configuredAgentIds) {
    if (!runtimeAgents.some((entry) => entry.id === agentId)) {
      missingConfiguredAgents.push(agentId);
    }
  }

  const missingModel = [];
  const unknownLlmMapping = [];
  const modelMismatches = [];
  const nonAnthropicInFull = [];
  const canaryNotAnthropic = [];
  const unsupportedModels = [];

  for (const agent of runtimeAgents) {
    const agentId = agent?.id;
    const model = agent?.model;

    if (!agentId) continue;
    if (!model) {
      missingModel.push(agentId);
      continue;
    }

    if (!allowedModels.has(model)) {
      unsupportedModels.push({ agent_id: agentId, model });
    }

    const llmModel = getAgentLlmModel(agentId, llmIndex);
    if (!llmModel) {
      unknownLlmMapping.push(agentId);
      continue;
    }

    const expectedModel = resolveRuntimeModel({ agentId, llmModel, rolloutMode: args.rollout });
    if (expectedModel !== model) {
      modelMismatches.push({ agent_id: agentId, expected: expectedModel, actual: model });
    }

    if (args.rollout === "full" && !isAnthropicCompletionModel(model)) {
      nonAnthropicInFull.push({ agent_id: agentId, model });
    }

    if (args.rollout === "canary" && CANARY_AGENT_IDS.has(agentId) && !isAnthropicCompletionModel(model)) {
      canaryNotAnthropic.push({ agent_id: agentId, model });
    }
  }

  const report = {
    action: "validate-completion-model-policy",
    config: args.config,
    agents: args.agents,
    rollout: args.rollout,
    expected_agent_count: args.expectedAgentCount,
    actual_agent_count: runtimeAgents.length,
    model_distribution: summarizeModelDistribution(runtimeAgents),
    configured_agent_count: configuredAgentIds.size,
    missing_configured_agents: missingConfiguredAgents,
    missing_model: unique(missingModel),
    unknown_llm_mapping: unique(unknownLlmMapping),
    model_mismatches: modelMismatches,
    non_anthropic_in_full: nonAnthropicInFull,
    canary_not_anthropic: canaryNotAnthropic,
    unsupported_models: unsupportedModels,
  };

  const ok =
    runtimeAgents.length === args.expectedAgentCount &&
    report.missing_configured_agents.length === 0 &&
    report.missing_model.length === 0 &&
    report.unknown_llm_mapping.length === 0 &&
    report.model_mismatches.length === 0 &&
    report.non_anthropic_in_full.length === 0 &&
    report.canary_not_anthropic.length === 0 &&
    report.unsupported_models.length === 0;

  report.ok = ok;
  console.log(JSON.stringify(report, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "validate-completion-model-policy",
        status: "failed",
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
