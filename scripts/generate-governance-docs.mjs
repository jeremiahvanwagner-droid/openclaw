#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import {
  getGovernanceSummary,
  loadAgentsConfig,
  loadSkillRegistry,
} from "../lib/security-governance.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// MEMORY.md and SOUL.md in the repo root are hand-written documents (operator
// memory and the Phase 1 constitution) and must never be generated or
// overwritten by this script. Only AGENTS.md and TOOLS.md are derived from config.
const OUTPUTS = {
  agents: path.join(ROOT_DIR, "AGENTS.md"),
  tools: path.join(ROOT_DIR, "TOOLS.md"),
};

function renderTable(headers, rows) {
  const headerRow = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerRow, divider, body].filter(Boolean).join("\n");
}

export function renderAgentsDoc({ config, summary }) {
  const divisions = (config.divisions || []).map((division) => [
    division.id,
    division.name,
    String(division.agent_count || 0),
  ]);

  const sampleAgents = summary.agents.slice(0, 20).map((agent) => [
    agent.agent_id,
    agent.org_unit,
    String(agent.capability_policy?.allowed_tools.length || 0),
    String(agent.capability_policy?.allowed_channels.length || 0),
    String(agent.capability_policy?.allowed_action_families.length || 0),
  ]);

  return `# AGENTS

Generated from [config/agents_config.json](./config/agents_config.json). Do not edit manually.

## Canonical Config Rule (Advancement 5)

Hand-edit only \`config/agents_config.json\` and \`skills/\`. The root
\`agents_config.json\` and \`workspace/skills/\` are **generated mirrors** — after
canonical edits run \`node scripts/sync-canonical-config.mjs --write\`.
\`pnpm config:check\` (part of \`pnpm validate\`) fails CI on drift.

## Divisions

${renderTable(["Division", "Name", "Agent Count"], divisions)}

## Capability Snapshot

${renderTable(
  ["Agent", "Org Unit", "Tools", "Channels", "Action Families"],
  sampleAgents,
)}

Total configured agents: ${config.agents.length}
`;
}

export function renderToolsDoc({ config, registry }) {
  const toolChannelRows = Object.entries(config.security_policy?.tool_channel_map || {}).map(
    ([tool, channel]) => [tool, channel],
  );
  const toolActionRows = Object.entries(
    config.security_policy?.tool_action_family_map || {},
  ).map(([tool, actionFamily]) => [tool, actionFamily]);
  const riskySkills = registry.skills
    .filter((skill) => ["write_safe", "irreversible"].includes(skill.risk_tier))
    .map((skill) => [
      skill.skill_id,
      skill.risk_tier,
      skill.external_systems.join(", "),
      skill.idempotency_key_strategy,
    ]);

  return `# TOOLS

Generated from [config/agents_config.json](./config/agents_config.json) and [config/skills-registry.json](./config/skills-registry.json). Do not edit manually.

## Tool to Channel Map

${renderTable(["Tool", "Channel"], toolChannelRows)}

## Tool to Action Family Map

${renderTable(["Tool", "Action Family"], toolActionRows)}

## Risky Skills

${renderTable(["Skill", "Risk Tier", "External Systems", "Idempotency"], riskySkills)}
`;
}

export async function buildGovernanceDocs() {
  const config = await loadAgentsConfig();
  const summary = await getGovernanceSummary();
  const registry = await loadSkillRegistry();

  if (!config) {
    throw new Error("config/agents_config.json is missing");
  }

  return {
    [OUTPUTS.agents]: renderAgentsDoc({ config, summary }),
    [OUTPUTS.tools]: renderToolsDoc({ config, registry }),
  };
}

export async function writeGovernanceDocs() {
  const docs = await buildGovernanceDocs();
  await Promise.all(
    Object.entries(docs).map(([filePath, content]) => fs.writeFile(filePath, `${content.trim()}\n`)),
  );
}

if (process.argv[1] === __filename) {
  writeGovernanceDocs().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
