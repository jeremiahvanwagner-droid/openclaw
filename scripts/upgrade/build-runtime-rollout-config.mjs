#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  buildAgentLlmModelIndex,
  buildRuntimeModelCatalog,
  getAgentLlmModel,
  resolveRuntimeModel,
  summarizeModelDistribution,
} from "../../lib/runtime-model-policy.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    input: path.join(ROOT_DIR, "config", "openclaw.prod.json"),
    agents: path.join(ROOT_DIR, "config", "agents_config.json"),
    output: null,
    rollout: "full",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) args.input = path.resolve(argv[i + 1]);
    if (arg === "--agents" && argv[i + 1]) args.agents = path.resolve(argv[i + 1]);
    if (arg === "--output" && argv[i + 1]) args.output = path.resolve(argv[i + 1]);
    if (arg === "--rollout" && argv[i + 1]) args.rollout = argv[i + 1];
  }

  if (!["full", "canary"].includes(args.rollout)) {
    throw new Error(`Invalid --rollout "${args.rollout}". Use "full" or "canary".`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildConfig(config, agentsConfig, rollout) {
  const llmIndex = buildAgentLlmModelIndex(agentsConfig);
  const list = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const missingModels = [];

  const nextList = list.map((agent) => {
    const agentId = agent?.id;
    if (!agentId) return agent;

    const llmModel = getAgentLlmModel(agentId, llmIndex);
    if (!llmModel) {
      missingModels.push(agentId);
      return agent;
    }

    const runtimeModel = resolveRuntimeModel({ agentId, llmModel, rolloutMode: rollout });
    return {
      ...agent,
      model: runtimeModel,
    };
  });

  if (missingModels.length > 0) {
    throw new Error(
      `Could not determine llm_model mapping for agent(s): ${missingModels.join(", ")}`,
    );
  }

  const mainEntry = nextList.find((agent) => agent.id === "main");
  const primaryModel = mainEntry?.model || "anthropic/claude-sonnet-4-5";

  const nextConfig = {
    ...config,
    meta: {
      ...(config.meta || {}),
      lastTouchedAt: new Date().toISOString(),
      rollout_mode: rollout,
      rollout_generated_by: "scripts/upgrade/build-runtime-rollout-config.mjs",
    },
    agents: {
      ...config.agents,
      defaults: {
        ...(config.agents?.defaults || {}),
        model: {
          ...(config.agents?.defaults?.model || {}),
          primary: primaryModel,
        },
        models: buildRuntimeModelCatalog(rollout),
      },
      list: nextList,
    },
  };

  return {
    config: nextConfig,
    summary: {
      rollout,
      agent_count: nextList.length,
      model_distribution: summarizeModelDistribution(nextList),
      default_primary_model: primaryModel,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await readJson(args.input);
  const agentsConfig = await readJson(args.agents);
  const { config: nextConfig, summary } = buildConfig(config, agentsConfig, args.rollout);

  if (args.output) {
    await writeJson(args.output, nextConfig);
  } else {
    process.stdout.write(`${JSON.stringify(nextConfig, null, 2)}\n`);
  }

  if (args.output) {
    console.log(
      JSON.stringify(
        {
          action: "build-runtime-rollout-config",
          input: args.input,
          agents: args.agents,
          output: args.output,
          ...summary,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        action: "build-runtime-rollout-config",
        status: "failed",
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
