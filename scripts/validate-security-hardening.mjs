#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { buildGovernanceDocs } from "./generate-governance-docs.mjs";
import { loadAgentsConfig, loadSkillRegistry } from "../lib/security-governance.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const REQUIRED_ALIAS_AGENTS = ["main", "marketing", "sales", "support"];
const REQUIRED_ENV_EXAMPLE_KEYS = [
  "DASHBOARD_ADMIN_EMAILS",
  "OPENCLAW_BROWSER_DATA_DIR",
  "OPENCLAW_BROWSER_ALLOW_UNSAFE_NO_SANDBOX",
  "OPENCLAW_CAPABILITY_ENFORCEMENT_MODE",
  "OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE",
  "OPENCLAW_GHL_WEBHOOK_SECRET",
  "OPENCLAW_TELEGRAM_WEBHOOK_SECRET",
];

function fail(message) {
  throw new Error(message);
}

async function walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

async function validateConfig() {
  const config = await loadAgentsConfig();
  if (!config) {
    fail("config/agents_config.json is missing");
  }

  const schemaPath = path.join(ROOT_DIR, "config", "schemas", "agent-config.schema.json");
  await fs.access(schemaPath);

  if (config.$schema !== "./schemas/agent-config.schema.json") {
    fail("config/agents_config.json must reference ./schemas/agent-config.schema.json");
  }

  const securityPolicy = config.security_policy;
  if (!securityPolicy) {
    fail("security_policy is required in config/agents_config.json");
  }

  for (const alias of REQUIRED_ALIAS_AGENTS) {
    if (!securityPolicy.alias_agents?.[alias]) {
      fail(`security_policy.alias_agents.${alias} is required`);
    }
  }

  return config;
}

async function validateRegistry() {
  const registry = await loadSkillRegistry();
  const requiredFields = [
    "skill_id",
    "owner",
    "risk_tier",
    "side_effects",
    "external_systems",
    "idempotency_key_strategy",
    "approval_policy",
    "replay_policy",
    "required_tests",
  ];

  for (const entry of registry.skills) {
    for (const field of requiredFields) {
      if (!(field in entry)) {
        fail(`config/skills-registry.json entry missing field ${field}: ${entry.skill_id || "<unknown>"}`);
      }
    }
  }

  const skillFiles = (await walk(path.join(ROOT_DIR, "skills"))).filter((filePath) =>
    filePath.endsWith(".mjs"),
  );

  const riskySkillIds = new Set();
  for (const filePath of skillFiles) {
    const content = await fs.readFile(filePath, "utf8");
    if (
      content.includes("../lib/safe-exec.mjs") ||
      content.includes("./browser-security.mjs") ||
      content.includes("social-media-publisher.mjs") ||
      content.includes("ghl-browser-control.mjs")
    ) {
      riskySkillIds.add(path.basename(filePath, ".mjs"));
    }
  }

  const registeredIds = new Set(registry.skills.map((entry) => entry.skill_id));
  for (const skillId of riskySkillIds) {
    if (!registeredIds.has(skillId)) {
      fail(`Risky skill ${skillId} is missing from config/skills-registry.json`);
    }
  }

  return registry;
}

async function validateGeneratedDocs() {
  const docs = await buildGovernanceDocs();
  for (const [filePath, generated] of Object.entries(docs)) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing.trim() !== generated.trim()) {
      fail(`${path.basename(filePath)} is out of date. Run node scripts/generate-governance-docs.mjs`);
    }
  }
}

async function validateReadme() {
  const readme = await fs.readFile(path.join(ROOT_DIR, "README.md"), "utf8");
  for (const filename of ["SOUL.md", "AGENTS.md", "MEMORY.md", "TOOLS.md"]) {
    if (readme.includes(filename)) {
      await fs.access(path.join(ROOT_DIR, filename));
    }
  }
}

async function validateEnvExample() {
  const envExample = await fs.readFile(path.join(ROOT_DIR, ".env.example"), "utf8");
  for (const key of REQUIRED_ENV_EXAMPLE_KEYS) {
    if (!envExample.includes(`${key}=`)) {
      fail(`.env.example is missing ${key}`);
    }
  }
}

async function main() {
  await validateConfig();
  await validateRegistry();
  await validateGeneratedDocs();
  await validateReadme();
  await validateEnvExample();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
