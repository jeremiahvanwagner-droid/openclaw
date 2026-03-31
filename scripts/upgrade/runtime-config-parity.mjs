#!/usr/bin/env node

import crypto from "crypto";
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
    primary: path.join(ROOT_DIR, "config", "openclaw.prod.json"),
    secondary: null,
    agents: path.join(ROOT_DIR, "config", "agents_config.json"),
    rollout: "full",
    expectedAgentCount: 107,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--primary" && argv[i + 1]) args.primary = path.resolve(argv[i + 1]);
    if (arg === "--secondary" && argv[i + 1]) args.secondary = path.resolve(argv[i + 1]);
    if (arg === "--agents" && argv[i + 1]) args.agents = path.resolve(argv[i + 1]);
    if (arg === "--rollout" && argv[i + 1]) args.rollout = argv[i + 1];
    if (arg === "--expected-agent-count" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) args.expectedAgentCount = parsed;
    }
    if (arg === "--strict") args.strict = true;
  }

  if (!["full", "canary"].includes(args.rollout)) {
    throw new Error(`Invalid --rollout "${args.rollout}". Use "full" or "canary".`);
  }

  return args;
}

async function readJsonWithRaw(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return { raw, json: JSON.parse(raw) };
}

function hashText(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildSnapshot(filePath, raw, config) {
  const runtimeAgents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const modelById = {};
  for (const agent of runtimeAgents) {
    if (agent?.id && agent?.model) {
      modelById[agent.id] = agent.model;
    }
  }

  return {
    path: filePath,
    sha256: hashText(raw),
    agent_count: runtimeAgents.length,
    default_primary_model: config?.agents?.defaults?.model?.primary || null,
    default_model_catalog: Object.keys(config?.agents?.defaults?.models || {}).sort(),
    model_distribution: summarizeModelDistribution(runtimeAgents),
    agent_ids: runtimeAgents.map((agent) => agent.id).filter(Boolean).sort(),
    model_by_agent: modelById,
    runtime_template_version: config?.meta?.lastTouchedVersion || null,
    rollout_mode: config?.meta?.rollout_mode || null,
  };
}

function compareSnapshots(primary, secondary) {
  const primaryIds = new Set(primary.agent_ids);
  const secondaryIds = new Set(secondary.agent_ids);
  const missingInSecondary = primary.agent_ids.filter((id) => !secondaryIds.has(id));
  const missingInPrimary = secondary.agent_ids.filter((id) => !primaryIds.has(id));

  const sharedIds = primary.agent_ids.filter((id) => secondaryIds.has(id));
  const modelMismatches = [];
  for (const agentId of sharedIds) {
    const left = primary.model_by_agent[agentId] || null;
    const right = secondary.model_by_agent[agentId] || null;
    if (left !== right) {
      modelMismatches.push({ agent_id: agentId, primary: left, secondary: right });
    }
  }

  const primaryCatalog = [...primary.default_model_catalog].sort().join(",");
  const secondaryCatalog = [...secondary.default_model_catalog].sort().join(",");

  return {
    agent_ids_match: missingInSecondary.length === 0 && missingInPrimary.length === 0,
    missing_in_secondary: missingInSecondary,
    missing_in_primary: missingInPrimary,
    defaults_primary_match: primary.default_primary_model === secondary.default_primary_model,
    defaults_catalog_match: primaryCatalog === secondaryCatalog,
    model_assignments_match: modelMismatches.length === 0,
    model_assignment_mismatches: modelMismatches,
  };
}

function validatePolicy(snapshot, agentsConfig, rollout, expectedAgentCount) {
  const llmIndex = buildAgentLlmModelIndex(agentsConfig);
  const configuredAgentIds = new Set((agentsConfig?.agents || []).map((agent) => agent.agent_id));
  const allowedModels = getAllowedCompletionModels(rollout);
  const runtimeFoundationIds = new Set(["main", "marketing", "sales", "support"]);
  const runtimeAgentIds = new Set(snapshot.agent_ids);

  const missingConfiguredAgents = [];
  for (const agentId of configuredAgentIds) {
    if (!runtimeAgentIds.has(agentId)) {
      missingConfiguredAgents.push(agentId);
    }
  }

  const extraAgents = snapshot.agent_ids.filter(
    (agentId) => !configuredAgentIds.has(agentId) && !runtimeFoundationIds.has(agentId),
  );
  const missingModels = [];
  const modelMismatches = [];
  const unsupportedModels = [];
  const nonAnthropicInFull = [];
  const canaryNotAnthropic = [];

  for (const agentId of snapshot.agent_ids) {
    const actualModel = snapshot.model_by_agent[agentId];
    if (!actualModel) {
      missingModels.push(agentId);
      continue;
    }

    if (!allowedModels.has(actualModel)) {
      unsupportedModels.push({ agent_id: agentId, model: actualModel });
    }

    const llmModel = getAgentLlmModel(agentId, llmIndex);
    if (!llmModel) {
      continue;
    }

    const expectedModel = resolveRuntimeModel({ agentId, llmModel, rolloutMode: rollout });
    if (expectedModel !== actualModel) {
      modelMismatches.push({ agent_id: agentId, expected: expectedModel, actual: actualModel });
    }

    if (rollout === "full" && !isAnthropicCompletionModel(actualModel)) {
      nonAnthropicInFull.push({ agent_id: agentId, model: actualModel });
    }

    if (rollout === "canary" && CANARY_AGENT_IDS.has(agentId) && !isAnthropicCompletionModel(actualModel)) {
      canaryNotAnthropic.push({ agent_id: agentId, model: actualModel });
    }
  }

  return {
    expected_agent_count: expectedAgentCount,
    actual_agent_count: snapshot.agent_count,
    configured_agent_count: configuredAgentIds.size,
    missing_configured_agents: missingConfiguredAgents,
    unexpected_runtime_agents: extraAgents,
    missing_models: missingModels,
    model_mismatches: modelMismatches,
    unsupported_models: unsupportedModels,
    non_anthropic_in_full: nonAnthropicInFull,
    canary_not_anthropic: canaryNotAnthropic,
    ok:
      snapshot.agent_count === expectedAgentCount &&
      missingConfiguredAgents.length === 0 &&
      extraAgents.length === 0 &&
      missingModels.length === 0 &&
      modelMismatches.length === 0 &&
      unsupportedModels.length === 0 &&
      nonAnthropicInFull.length === 0 &&
      canaryNotAnthropic.length === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [{ raw: primaryRaw, json: primaryConfig }, { json: agentsConfig }] = await Promise.all([
    readJsonWithRaw(args.primary),
    readJsonWithRaw(args.agents),
  ]);

  const primarySnapshot = buildSnapshot(args.primary, primaryRaw, primaryConfig);
  const policy = validatePolicy(primarySnapshot, agentsConfig, args.rollout, args.expectedAgentCount);

  const packageJson = JSON.parse(await fs.readFile(path.join(ROOT_DIR, "package.json"), "utf8"));
  const report = {
    action: "runtime-config-parity",
    timestamp: new Date().toISOString(),
    rollout: args.rollout,
    runtime_app_version: packageJson.version || null,
    primary: primarySnapshot,
    policy,
  };

  if (args.secondary) {
    const { raw: secondaryRaw, json: secondaryConfig } = await readJsonWithRaw(args.secondary);
    const secondarySnapshot = buildSnapshot(args.secondary, secondaryRaw, secondaryConfig);
    report.secondary = secondarySnapshot;
    report.parity = compareSnapshots(primarySnapshot, secondarySnapshot);
  }

  const parityOk = !report.parity
    || (
      report.parity.agent_ids_match
      && report.parity.defaults_primary_match
      && report.parity.defaults_catalog_match
      && report.parity.model_assignments_match
    );
  report.ok = policy.ok && parityOk;

  console.log(JSON.stringify(report, null, 2));

  if (args.strict && !report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "runtime-config-parity",
        status: "failed",
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
