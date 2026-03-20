import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { logAgentEvent } from "./human-approval.mjs";
import { childLogger } from "./logger.mjs";

const log = childLogger({ module: "security-governance" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const AGENTS_CONFIG_PATH = path.join(ROOT_DIR, "config", "agents_config.json");
const SKILLS_REGISTRY_PATH = path.join(ROOT_DIR, "config", "skills-registry.json");
const RUNTIME_CONFIG_PATHS = [
  path.join(ROOT_DIR, "config", "openclaw.prod.json"),
  path.join(ROOT_DIR, "openclaw.json"),
];

const DEFAULT_REQUIRES_HITL_FOR = ["ghl_write", "email_send", "payment_action"];
const CAPABILITY_MODE_ENV = "OPENCLAW_CAPABILITY_ENFORCEMENT_MODE";
const SKILL_REGISTRY_MODE_ENV = "OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE";

const DEFAULT_ALIAS_POLICIES = {
  main: {
    allowed_tools: ["agent_messaging", "approval_queue", "dashboard_admin", "runtime_alerting"],
    allowed_channels: ["telegram", "msteams", "email"],
    allowed_action_families: ["ghl_write", "email_send", "payment_action"],
    requires_hitl_for: DEFAULT_REQUIRES_HITL_FOR,
  },
  marketing: {
    allowed_tools: ["agent_messaging", "campaign_delivery"],
    allowed_channels: ["telegram", "email"],
    allowed_action_families: ["ghl_write", "email_send"],
    requires_hitl_for: DEFAULT_REQUIRES_HITL_FOR,
  },
  sales: {
    allowed_tools: ["agent_messaging", "crm_follow_up"],
    allowed_channels: ["telegram", "email", "msteams"],
    allowed_action_families: ["ghl_write", "email_send", "payment_action"],
    requires_hitl_for: DEFAULT_REQUIRES_HITL_FOR,
  },
  support: {
    allowed_tools: ["agent_messaging", "support_follow_up"],
    allowed_channels: ["telegram", "email"],
    allowed_action_families: ["ghl_write", "email_send"],
    requires_hitl_for: DEFAULT_REQUIRES_HITL_FOR,
  },
};

const DEFAULT_TOOL_CHANNEL_MAP = {
  telegram_alerts: "telegram",
  telegram_master_channel: "telegram",
  telegram_broadcast: "telegram",
  msteams_delivery: "msteams",
  teams_delivery: "msteams",
  email_broadcaster: "email",
  email_dispatcher: "email",
  email_marketing: "email",
  m365_email: "email",
};

const DEFAULT_TOOL_ACTION_MAP = {
  ghl: "ghl_write",
  ghl_contacts: "ghl_write",
  ghl_contact: "ghl_write",
  ghl_workflows: "ghl_write",
  ghl_pipeline_view: "ghl_write",
  approval_queue: "ghl_write",
  email_broadcaster: "email_send",
  email_dispatcher: "email_send",
  email_marketing: "email_send",
  stripe_dashboard: "payment_action",
  checkout_integrator: "payment_action",
  payment_plans: "payment_action",
  refunds: "payment_action",
};

const TOOL_CHANNEL_PATTERNS = [
  [/telegram/i, "telegram"],
  [/teams|msteams/i, "msteams"],
  [/email/i, "email"],
];

const TOOL_ACTION_PATTERNS = [
  [/^ghl/i, "ghl_write"],
  [/contact|workflow|crm/i, "ghl_write"],
  [/email|newsletter|broadcast/i, "email_send"],
  [/payment|checkout|invoice|stripe|refund|billing/i, "payment_action"],
];

const jsonCache = new Map();

function normalizeMode(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "off" || normalized === "warn" || normalized === "fail") {
    return normalized;
  }
  return "warn";
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

async function readJsonCached(filePath) {
  try {
    const stat = await fs.stat(filePath);
    const cacheKey = `${filePath}:${stat.mtimeMs}`;
    const cached = jsonCache.get(cacheKey);
    if (cached) return cached;

    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    for (const key of Array.from(jsonCache.keys())) {
      if (key.startsWith(`${filePath}:`) && key !== cacheKey) {
        jsonCache.delete(key);
      }
    }

    jsonCache.set(cacheKey, parsed);
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function getSecurityPolicy(config) {
  if (!config || typeof config !== "object") {
    return {
      defaults: {},
      alias_agents: DEFAULT_ALIAS_POLICIES,
      tool_channel_map: {},
      tool_action_family_map: {},
    };
  }

  const configured = config.security_policy || {};
  return {
    defaults: configured.defaults || {},
    alias_agents: {
      ...DEFAULT_ALIAS_POLICIES,
      ...(configured.alias_agents || {}),
    },
    tool_channel_map: {
      ...DEFAULT_TOOL_CHANNEL_MAP,
      ...(configured.tool_channel_map || {}),
    },
    tool_action_family_map: {
      ...DEFAULT_TOOL_ACTION_MAP,
      ...(configured.tool_action_family_map || {}),
    },
  };
}

function getToolList(agent) {
  return Array.isArray(agent?.tools_required) ? uniqueStrings(agent.tools_required) : [];
}

function addToolDerivedChannels(channels, tools, toolChannelMap) {
  for (const tool of tools) {
    if (toolChannelMap[tool]) {
      channels.add(toolChannelMap[tool]);
      continue;
    }

    for (const [pattern, channel] of TOOL_CHANNEL_PATTERNS) {
      if (pattern.test(tool)) {
        channels.add(channel);
      }
    }
  }
}

function addToolDerivedActionFamilies(actionFamilies, tools, toolActionMap) {
  for (const tool of tools) {
    if (toolActionMap[tool]) {
      actionFamilies.add(toolActionMap[tool]);
      continue;
    }

    for (const [pattern, actionFamily] of TOOL_ACTION_PATTERNS) {
      if (pattern.test(tool)) {
        actionFamilies.add(actionFamily);
      }
    }
  }
}

function deriveCapabilityPolicy(agent, securityPolicy) {
  const defaults = securityPolicy.defaults || {};
  const tools = getToolList(agent);
  const allowedTools = new Set(uniqueStrings(defaults.allowed_tools));
  const allowedChannels = new Set(uniqueStrings(defaults.allowed_channels));
  const allowedActionFamilies = new Set(uniqueStrings(defaults.allowed_action_families));
  const requiresHitlFor = uniqueStrings(defaults.requires_hitl_for || DEFAULT_REQUIRES_HITL_FOR);

  for (const tool of tools) {
    allowedTools.add(tool);
  }

  if (agent?.telegram_delivery) {
    allowedChannels.add("telegram");
  }
  if (agent?.teams_delivery) {
    allowedChannels.add("msteams");
  }

  addToolDerivedChannels(allowedChannels, tools, securityPolicy.tool_channel_map || {});
  addToolDerivedActionFamilies(
    allowedActionFamilies,
    tools,
    securityPolicy.tool_action_family_map || {},
  );

  return {
    allowed_tools: uniqueStrings(Array.from(allowedTools)),
    allowed_channels: uniqueStrings(Array.from(allowedChannels)),
    allowed_action_families: uniqueStrings(Array.from(allowedActionFamilies)),
    requires_hitl_for: requiresHitlFor,
  };
}

function resolveAgentEntry(agentId, config, runtimeConfig) {
  const agents = Array.isArray(config?.agents) ? config.agents : [];
  const match = agents.find((entry) => entry?.agent_id === agentId);
  if (match) return { kind: "configured", entry: match };

  const securityPolicy = getSecurityPolicy(config);
  const aliasPolicy = securityPolicy.alias_agents?.[agentId];
  if (aliasPolicy) {
    return {
      kind: "alias",
      entry: {
        agent_id: agentId,
        display_name: agentId,
        org_unit: "runtime",
        role_type: "specialist",
        tools_required: uniqueStrings(aliasPolicy.allowed_tools),
        telegram_delivery: aliasPolicy.allowed_channels?.includes("telegram") || false,
        teams_delivery: aliasPolicy.allowed_channels?.includes("msteams") || false,
        capability_policy: aliasPolicy,
      },
    };
  }

  const runtimeAgents = Array.isArray(runtimeConfig?.agents?.list) ? runtimeConfig.agents.list : [];
  const runtimeMatch = runtimeAgents.find((entry) => entry?.id === agentId);
  if (runtimeMatch) {
    return {
      kind: "runtime",
      entry: {
        agent_id: runtimeMatch.id,
        display_name: runtimeMatch.name || runtimeMatch.id,
        org_unit: "runtime",
        role_type: "specialist",
        tools_required: [],
        telegram_delivery: false,
        teams_delivery: false,
      },
    };
  }

  return null;
}

async function recordGovernanceEvent(eventName, payload) {
  try {
    await logAgentEvent({
      eventName,
      sourceAgent: payload.sourceAgent || "security-governance",
      targetAgent: payload.targetAgent || null,
      correlationId: payload.correlationId || null,
      payload,
      priority: "high",
      status: payload.status || "failed",
    });
  } catch (error) {
    log.warn({ err: error }, "Failed to record governance event");
  }
}

async function handleViolation(options) {
  const mode = normalizeMode(options.mode);
  await recordGovernanceEvent(options.eventName, {
    sourceAgent: options.agentId || options.skillId || "security-governance",
    targetAgent: options.targetAgent || null,
    correlationId: options.correlationId || null,
    reason: options.reason,
    metadata: options.metadata || {},
    status: mode === "warn" ? "completed" : "failed",
  });

  if (mode === "warn") {
    log.warn(
      {
        agentId: options.agentId,
        skillId: options.skillId,
        reason: options.reason,
        metadata: options.metadata,
      },
      options.logMessage,
    );
    return { allowed: false, mode };
  }

  const error = new Error(options.reason);
  error.code = options.code;
  throw error;
}

export async function loadAgentsConfig() {
  return readJsonCached(AGENTS_CONFIG_PATH);
}

export async function loadRuntimeConfig() {
  for (const candidate of RUNTIME_CONFIG_PATHS) {
    const config = await readJsonCached(candidate);
    if (config) return config;
  }
  return null;
}

export async function loadSkillRegistry() {
  const registry = await readJsonCached(SKILLS_REGISTRY_PATH);
  const skills = Array.isArray(registry?.skills) ? registry.skills : [];
  return {
    version: registry?.version || "1.0.0",
    enforcement_defaults: registry?.enforcement_defaults || {},
    skills,
  };
}

export async function getAgentCapabilityPolicy(agentId) {
  const config = await loadAgentsConfig();
  const runtimeConfig = await loadRuntimeConfig();
  const securityPolicy = getSecurityPolicy(config || {});
  const resolved = resolveAgentEntry(agentId, config || {}, runtimeConfig || {});

  if (!resolved) {
    return null;
  }

  if (resolved.entry.capability_policy) {
    const policy = resolved.entry.capability_policy;
    return {
      allowed_tools: uniqueStrings(policy.allowed_tools),
      allowed_channels: uniqueStrings(policy.allowed_channels),
      allowed_action_families: uniqueStrings(policy.allowed_action_families),
      requires_hitl_for: uniqueStrings(policy.requires_hitl_for || DEFAULT_REQUIRES_HITL_FOR),
    };
  }

  return deriveCapabilityPolicy(resolved.entry, securityPolicy);
}

export function getCapabilityEnforcementMode(config) {
  const configured = config?.security_policy?.enforcement_modes?.capabilities;
  return normalizeMode(process.env[CAPABILITY_MODE_ENV] || configured || "warn");
}

export function getSkillRegistryEnforcementMode(registry) {
  const configured = registry?.enforcement_defaults?.mode;
  return normalizeMode(process.env[SKILL_REGISTRY_MODE_ENV] || configured || "warn");
}

export async function enforceAgentCapability({
  agentId,
  channel,
  actionFamily,
  tool,
  correlationId,
  targetAgent,
  metadata = {},
}) {
  const config = await loadAgentsConfig();
  const mode = getCapabilityEnforcementMode(config || {});
  if (mode === "off") {
    return { allowed: true, mode };
  }

  const policy = await getAgentCapabilityPolicy(agentId);
  if (!policy) {
    return handleViolation({
      mode,
      code: "CAPABILITY_POLICY_UNKNOWN_AGENT",
      eventName: "security/capability_unknown_agent",
      agentId,
      correlationId,
      targetAgent,
      metadata,
      reason: `Capability policy missing for agent "${agentId}"`,
      logMessage: "Capability policy missing for agent",
    });
  }

  if (channel && !policy.allowed_channels.includes(channel)) {
    return handleViolation({
      mode,
      code: "CAPABILITY_POLICY_CHANNEL_BLOCKED",
      eventName: "security/capability_channel_blocked",
      agentId,
      correlationId,
      targetAgent,
      metadata: { ...metadata, channel, allowed_channels: policy.allowed_channels },
      reason: `Agent "${agentId}" is not allowed to use channel "${channel}"`,
      logMessage: "Capability policy blocked channel",
    });
  }

  if (tool && !policy.allowed_tools.includes(tool)) {
    return handleViolation({
      mode,
      code: "CAPABILITY_POLICY_TOOL_BLOCKED",
      eventName: "security/capability_tool_blocked",
      agentId,
      correlationId,
      targetAgent,
      metadata: { ...metadata, tool, allowed_tools: policy.allowed_tools },
      reason: `Agent "${agentId}" is not allowed to use tool "${tool}"`,
      logMessage: "Capability policy blocked tool",
    });
  }

  if (actionFamily && !policy.allowed_action_families.includes(actionFamily)) {
    return handleViolation({
      mode,
      code: "CAPABILITY_POLICY_ACTION_BLOCKED",
      eventName: "security/capability_action_blocked",
      agentId,
      correlationId,
      targetAgent,
      metadata: {
        ...metadata,
        action_family: actionFamily,
        allowed_action_families: policy.allowed_action_families,
      },
      reason: `Agent "${agentId}" is not allowed to perform action family "${actionFamily}"`,
      logMessage: "Capability policy blocked action family",
    });
  }

  return { allowed: true, mode, policy };
}

export function inferCallingSkillId(stack = new Error().stack || "") {
  const lines = stack.split("\n");
  for (const line of lines) {
    const match = line.match(/[\\/]skills[\\/](.+?)\.mjs/);
    if (match?.[1]) {
      return path.basename(match[1]);
    }
  }
  return null;
}

export async function getSkillRegistryEntry(skillId) {
  if (!skillId) return null;
  const registry = await loadSkillRegistry();
  return registry.skills.find((entry) => entry?.skill_id === skillId) || null;
}

export async function enforceSkillRegistry({
  skillId = inferCallingSkillId(),
  externalSystem,
  operation,
  correlationId,
  metadata = {},
}) {
  const registry = await loadSkillRegistry();
  const mode = getSkillRegistryEnforcementMode(registry);
  if (mode === "off" || !skillId) {
    return { allowed: true, mode, skillId };
  }

  const entry = registry.skills.find((item) => item?.skill_id === skillId) || null;
  if (!entry) {
    return handleViolation({
      mode,
      code: "SKILL_REGISTRY_MISSING",
      eventName: "security/skill_registry_missing",
      skillId,
      correlationId,
      metadata: { ...metadata, operation, externalSystem },
      reason: `Skill "${skillId}" is not registered in config/skills-registry.json`,
      logMessage: "Skill registry missing entry",
    });
  }

  const externalSystems = uniqueStrings(entry.external_systems);
  if (externalSystem && externalSystems.length > 0 && !externalSystems.includes(externalSystem)) {
    return handleViolation({
      mode,
      code: "SKILL_REGISTRY_EXTERNAL_SYSTEM_BLOCKED",
      eventName: "security/skill_registry_external_system_blocked",
      skillId,
      correlationId,
      metadata: { ...metadata, operation, externalSystem, externalSystems },
      reason: `Skill "${skillId}" is not allowed to use external system "${externalSystem}"`,
      logMessage: "Skill registry blocked external system",
    });
  }

  if (
    ["write_safe", "irreversible"].includes(entry.risk_tier) &&
    typeof entry.idempotency_key_strategy !== "string"
  ) {
    return handleViolation({
      mode,
      code: "SKILL_REGISTRY_IDEMPOTENCY_MISSING",
      eventName: "security/skill_registry_idempotency_missing",
      skillId,
      correlationId,
      metadata: { ...metadata, operation, risk_tier: entry.risk_tier },
      reason: `Skill "${skillId}" is missing an idempotency strategy`,
      logMessage: "Skill registry missing idempotency strategy",
    });
  }

  return { allowed: true, mode, skillId, entry };
}

export async function getGovernanceSummary() {
  const config = await loadAgentsConfig();
  const registry = await loadSkillRegistry();
  const agents = Array.isArray(config?.agents) ? config.agents : [];

  const capabilityMatrix = await Promise.all(
    agents.map(async (agent) => ({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      org_unit: agent.org_unit,
      capability_policy: await getAgentCapabilityPolicy(agent.agent_id),
    })),
  );

  return {
    generated_at: new Date().toISOString(),
    capability_mode: getCapabilityEnforcementMode(config || {}),
    skill_registry_mode: getSkillRegistryEnforcementMode(registry),
    agents: capabilityMatrix,
    skills: registry.skills,
  };
}
