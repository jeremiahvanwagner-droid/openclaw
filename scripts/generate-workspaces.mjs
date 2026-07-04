#!/usr/bin/env node
/**
 * Workspace Generator Script
 * Open Claw Multi-Agent Network
 * 
 * Generates agent workspaces from agents_config.json using templates.
 * 
 * Usage:
 *   node scripts/generate-workspaces.mjs                    # Generate all
 *   node scripts/generate-workspaces.mjs --filter "d1_*"    # Filter by pattern
 *   node scripts/generate-workspaces.mjs --force            # Overwrite existing
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Paths
// canonical config (A5) — the root agents_config.json is a generated mirror
const CONFIG_PATH = path.join(ROOT_DIR, "config", "agents_config.json");
const WORKSPACES_DIR = path.join(ROOT_DIR, "workspaces");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

// Parse CLI arguments
const args = process.argv.slice(2);
const filterPattern = args.includes("--filter") 
  ? args[args.indexOf("--filter") + 1] 
  : null;
const forceOverwrite = args.includes("--force");
const verbose = args.includes("--verbose") || args.includes("-v");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logVerbose(message) {
  if (verbose) {
    console.log(`${colors.dim}  ${message}${colors.reset}`);
  }
}

/**
 * Load and parse the agents configuration
 */
async function loadConfig() {
  try {
    const configRaw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(configRaw);
  } catch (error) {
    log(`❌ Failed to load config: ${error.message}`, "red");
    process.exit(1);
  }
}

/**
 * Load all template files
 */
async function loadTemplates() {
  const templates = {};
  const templateFiles = [
    "SOUL.md.template",
    "AGENTS.md.template",
    "TOOLS.md.template",
    "USER.md.template",
    "MEMORY.md.template",
  ];

  for (const file of templateFiles) {
    const name = file.replace(".template", "");
    try {
      templates[name] = await fs.readFile(path.join(TEMPLATES_DIR, file), "utf-8");
      logVerbose(`Loaded template: ${file}`);
    } catch (error) {
      log(`⚠️  Template not found: ${file}`, "yellow");
    }
  }

  return templates;
}

/**
 * Format organization unit for display
 */
function formatOrgUnit(orgUnit) {
  return orgUnit
    .replace(/_/g, " ")
    .replace(/division (\d)/gi, "Division $1 —")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate SOUL.md content from agent config and template
 */
function generateSoul(agent, template) {
  const responsibilities = agent.primary_responsibilities
    .map((r) => `- ${r}`)
    .join("\n");

  const triggers = agent.input_triggers
    .map((t) => `- \`${t}\``)
    .join("\n");

  const dependencies = agent.inter_agent_dependencies.length > 0
    ? agent.inter_agent_dependencies.map((d) => `- \`${d}\``).join("\n")
    : "- _No direct dependencies_";

  return template
    .replace(/{{AGENT_ID}}/g, agent.agent_id)
    .replace(/{{DISPLAY_NAME}}/g, agent.display_name)
    .replace(/{{ORG_UNIT}}/g, formatOrgUnit(agent.org_unit))
    .replace(/{{ROLE_TYPE}}/g, capitalize(agent.role_type))
    .replace(/{{PRIMARY_RESPONSIBILITIES}}/g, responsibilities)
    .replace(/{{ESCALATION_PATH}}/g, agent.escalation_path)
    .replace(/{{LLM_MODEL}}/g, agent.llm_model)
    .replace(/{{MEMORY_TYPE}}/g, agent.memory_type)
    .replace(/{{INTER_AGENT_DEPENDENCIES}}/g, dependencies)
    .replace(/{{OUTPUT_FORMAT}}/g, agent.output_format)
    .replace(/{{INPUT_TRIGGERS}}/g, triggers);
}

/**
 * Generate TOOLS.md content from agent config and template
 */
function generateTools(agent, template) {
  const toolsList = agent.tools_required.length > 0
    ? agent.tools_required.map((t) => `- **${t}**: [Configure access]`).join("\n")
    : "- _No specific tools configured_";

  return template
    .replace(/{{AGENT_ID}}/g, agent.agent_id)
    .replace(/{{DISPLAY_NAME}}/g, agent.display_name)
    .replace(/{{TOOLS_LIST}}/g, toolsList);
}

/**
 * Generate USER.md content from template
 */
function generateUser(agent, template) {
  return template
    .replace(/{{AGENT_ID}}/g, agent.agent_id)
    .replace(/{{DISPLAY_NAME}}/g, agent.display_name);
}

/**
 * Generate MEMORY.md content from template
 */
function generateMemory(agent, template) {
  return template
    .replace(/{{AGENT_ID}}/g, agent.agent_id)
    .replace(/{{DISPLAY_NAME}}/g, agent.display_name);
}

/**
 * Check if path matches filter pattern
 */
function matchesFilter(agentId, pattern) {
  if (!pattern) return true;
  
  // Convert glob-like pattern to regex
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return regex.test(agentId);
}

/**
 * Main execution
 */
async function main() {
  log("\n🚀 Open Claw Workspace Generator", "cyan");
  log("=" .repeat(40), "dim");

  // Load configuration and templates
  const config = await loadConfig();
  const templates = await loadTemplates();

  log(`\n📋 Found ${config.agents.length} agents in config`, "cyan");

  if (filterPattern) {
    log(`🔍 Filtering agents matching: ${filterPattern}`, "yellow");
  }

  // Ensure workspaces directory exists
  await fs.mkdir(WORKSPACES_DIR, { recursive: true });

  // Stats
  let created = 0;
  let skipped = 0;
  let updated = 0;
  let errors = 0;

  // Process each agent
  for (const agent of config.agents) {
    // Apply filter
    if (!matchesFilter(agent.agent_id, filterPattern)) {
      continue;
    }

    const workspacePath = path.join(WORKSPACES_DIR, agent.agent_id);
    const memoryDir = path.join(workspacePath, "memory");

    // Check if workspace already exists
    let exists = false;
    try {
      await fs.access(workspacePath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists && !forceOverwrite) {
      log(`⏭️  Skipping ${agent.agent_id} (already exists)`, "dim");
      skipped++;
      continue;
    }

    try {
      // Create workspace directories
      await fs.mkdir(workspacePath, { recursive: true });
      await fs.mkdir(memoryDir, { recursive: true });

      // Generate and write SOUL.md
      if (templates["SOUL.md"]) {
        const soulContent = generateSoul(agent, templates["SOUL.md"]);
        await fs.writeFile(path.join(workspacePath, "SOUL.md"), soulContent);
        logVerbose("Created SOUL.md");
      }

      // Write AGENTS.md (standard framework)
      if (templates["AGENTS.md"]) {
        await fs.writeFile(
          path.join(workspacePath, "AGENTS.md"),
          templates["AGENTS.md"]
        );
        logVerbose("Created AGENTS.md");
      }

      // Generate and write TOOLS.md
      if (templates["TOOLS.md"]) {
        const toolsContent = generateTools(agent, templates["TOOLS.md"]);
        await fs.writeFile(path.join(workspacePath, "TOOLS.md"), toolsContent);
        logVerbose("Created TOOLS.md");
      }

      // Generate and write USER.md
      if (templates["USER.md"]) {
        const userContent = generateUser(agent, templates["USER.md"]);
        await fs.writeFile(path.join(workspacePath, "USER.md"), userContent);
        logVerbose("Created USER.md");
      }

      // Generate and write MEMORY.md
      if (templates["MEMORY.md"]) {
        const memoryContent = generateMemory(agent, templates["MEMORY.md"]);
        await fs.writeFile(path.join(workspacePath, "MEMORY.md"), memoryContent);
        logVerbose("Created MEMORY.md");
      }

      // Create today's memory file
      const today = new Date().toISOString().split("T")[0];
      const dailyMemoryPath = path.join(memoryDir, `${today}.md`);
      try {
        await fs.access(dailyMemoryPath);
      } catch {
        await fs.writeFile(
          dailyMemoryPath,
          `# Daily Notes — ${today}\n\n_Agent: ${agent.display_name}_\n\n---\n\n## Session Log\n\n_No sessions recorded yet._\n`
        );
        logVerbose(`Created memory/${today}.md`);
      }

      if (exists) {
        log(`🔄 Updated workspace: ${agent.agent_id}`, "yellow");
        updated++;
      } else {
        log(`✅ Created workspace: ${agent.agent_id}`, "green");
        created++;
      }
    } catch (error) {
      log(`❌ Error creating ${agent.agent_id}: ${error.message}`, "red");
      errors++;
    }
  }

  // Summary
  log("\n" + "=".repeat(40), "dim");
  log("📊 Summary:", "cyan");
  log(`   ✅ Created: ${created}`, "green");
  if (updated > 0) log(`   🔄 Updated: ${updated}`, "yellow");
  if (skipped > 0) log(`   ⏭️  Skipped: ${skipped}`, "dim");
  if (errors > 0) log(`   ❌ Errors: ${errors}`, "red");
  log("");

  if (errors > 0) {
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, "red");
  console.error(error);
  process.exit(1);
});
