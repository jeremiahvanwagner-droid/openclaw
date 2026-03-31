#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname, join, posix, resolve, win32 } from "path";
import { fileURLToPath } from "url";

import {
  buildRuntimePods,
  buildPortfolioSummary,
  loadBusinessRegistry,
} from "../lib/business-registry.mjs";
import {
  buildAgentLlmModelIndex,
  buildRuntimeModelCatalog,
  getAgentLlmModel,
  resolveRuntimeModel,
  summarizeModelDistribution,
} from "../lib/runtime-model-policy.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");
const WINDOWS_RUNTIME_ROOT = process.env.OPENCLAW_WINDOWS_RUNTIME_ROOT || ROOT_DIR;
const LINUX_RUNTIME_ROOT = process.env.OPENCLAW_LINUX_RUNTIME_ROOT || "/opt/openclaw";

const AGENT_CONFIG_PATHS = [join(ROOT_DIR, "config", "agents_config.json")];

const OPENCLAW_CONFIGS = [
  {
    path: join(ROOT_DIR, "config", "openclaw.json"),
    platform: "windows",
    workspaceRoot: win32.join(WINDOWS_RUNTIME_ROOT, "workspaces"),
  },
  {
    path: join(ROOT_DIR, "config", "openclaw.prod.json"),
    platform: "linux",
    workspaceRoot: posix.join(LINUX_RUNTIME_ROOT, "workspaces"),
  },
];

const SHARED_SUPERVISOR_IDS = [
  "shared_runtime_ops",
  "shared_exec_orchestrator",
  "shared_data_control",
];
const ESSENTIAL_RUNTIME_AGENT_IDS = [
  "d8_saas_director",
  "d9_store_director",
  ...SHARED_SUPERVISOR_IDS,
];

const DIVISION_METADATA = [
  {
    id: "division_1_core_operations",
    name: "Core Company Operations (Truth J Blue LLC HQ)",
  },
  {
    id: "division_2_ecommerce",
    name: "eCommerce Operations",
  },
  {
    id: "division_3_consulting",
    name: "Consulting Practice",
  },
  {
    id: "division_4_coaching",
    name: "Coaching & Community (Beyond the Veil / Divine Path Walkers)",
  },
  {
    id: "division_5_publishing",
    name: "Publishing (Books & Media)",
  },
  {
    id: "division_6_nonprofit",
    name: "Nonprofit Operations (Inspire Build Motivate, Inc.)",
  },
  {
    id: "division_7_shared_services",
    name: "Cross-Division Shared Services & Runtime Supervisors",
  },
  {
    id: "division_8_saas_operations",
    name: "SaaS Operations (Shared GHL Enablement)",
  },
  {
    id: "division_9_online_store",
    name: "Online Store Operations (store.truthjblue.com - Books & Merch)",
  },
];

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const rolloutFlagIndex = args.indexOf("--rollout");
const rolloutMode =
  rolloutFlagIndex >= 0 && args[rolloutFlagIndex + 1]
    ? args[rolloutFlagIndex + 1]
    : "full";

if (!["full", "canary"].includes(rolloutMode)) {
  throw new Error(`Unsupported rollout mode "${rolloutMode}". Use "full" or "canary".`);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, payload) {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function mergeByKey(items, key) {
  const map = new Map();
  for (const item of items) {
    if (!item || !item[key]) continue;
    map.set(item[key], item);
  }
  return Array.from(map.values());
}

function buildPodLeadAgent(business) {
  return {
    agent_id: `${business.pod_id}_pod_lead`,
    display_name: `${business.business_name} Pod Lead`,
    org_unit: "division_7_shared_services",
    role_type: "manager",
    agent_class: "supervisor",
    pod_id: business.pod_id,
    criticality: "critical",
    heartbeat_policy: "always_on",
    queue_class: "P0",
    primary_responsibilities: [
      `Own all growth, sales, delivery, and ops work for ${business.business_name}`,
      "Spawn and supervise on-demand pod workers",
      "Enforce queue budgets and pod concurrency guardrails",
      "Escalate money, legal, compliance, and destructive actions to shared supervisors",
      "Publish daily pod health and scorecard updates",
    ],
    tools_required: [
      "agent_sessions",
      "agent_events",
      "agent_metrics",
      "supabase_analytics",
      "telegram_alerts",
      "ghl_contacts",
      "ghl_workflows",
    ],
    input_triggers: [
      `pod/${business.pod_id}/task`,
      `pod/${business.pod_id}/escalate`,
      "cron.pod_revenue_loop",
      "agent/invoke",
    ],
    output_format: "json",
    escalation_path: "shared_exec_orchestrator",
    llm_model: "claude-sonnet-4.5",
    memory_type: "shared",
    inter_agent_dependencies: [
      "shared_runtime_ops",
      "shared_exec_orchestrator",
      "shared_data_control",
    ],
    workspace_path: `.openclaw/workspaces/${business.pod_id}_pod_lead`,
    cron_schedule: null,
    telegram_delivery: true,
    teams_delivery: false,
    reports_to: "shared_exec_orchestrator",
  };
}

function buildSharedSupervisorAgents() {
  return [
    {
      agent_id: "shared_runtime_ops",
      display_name: "Shared Runtime Ops",
      org_unit: "division_7_shared_services",
      role_type: "manager",
      agent_class: "supervisor",
      pod_id: "shared",
      criticality: "critical",
      heartbeat_policy: "always_on",
      queue_class: "P0",
      primary_responsibilities: [
        "Own runtime heartbeat monitoring and pod quarantine policy",
        "Enforce global queue arbitration and concurrency limits",
        "Route operational incidents to the executive orchestrator",
        "Track supervisor breaches and restore quarantined pods",
      ],
      tools_required: [
        "agent_sessions",
        "agent_events",
        "supabase_admin",
        "supabase_analytics",
        "telegram_alerts",
      ],
      input_triggers: [
        "cron.heartbeat_monitor",
        "cron.network_health",
        "agent/health.check",
        "incident/*",
        "pod/*/quarantine",
      ],
      output_format: "json",
      escalation_path: "shared_exec_orchestrator",
      llm_model: "claude-sonnet-4.5",
      memory_type: "shared",
      inter_agent_dependencies: [
        "shared_exec_orchestrator",
        "shared_data_control",
      ],
      workspace_path: ".openclaw/workspaces/shared_runtime_ops",
      cron_schedule: "*/5 * * * *",
      telegram_delivery: true,
      teams_delivery: false,
      reports_to: "shared_exec_orchestrator",
    },
    {
      agent_id: "shared_exec_orchestrator",
      display_name: "Shared Executive Orchestrator",
      org_unit: "division_7_shared_services",
      role_type: "executive",
      agent_class: "supervisor",
      pod_id: "shared",
      criticality: "critical",
      heartbeat_policy: "always_on",
      queue_class: "P0",
      primary_responsibilities: [
        "Coordinate cross-pod work across all business scopes",
        "Gate high-risk actions before human review is required",
        "Invoke advisory agents for executive or technical decisions",
        "Serve as the final automated escalation point before Telegram alerts",
      ],
      tools_required: [
        "inngest_orchestration",
        "agent_events",
        "supabase_analytics",
        "telegram_alerts",
        "approval_queue",
      ],
      input_triggers: [
        "pod/*/escalate",
        "agent/escalate",
        "cross-pod/*",
        "cron.executive_briefing",
      ],
      output_format: "decision",
      escalation_path: "shared_master_orchestrator",
      llm_model: "claude-opus-4",
      memory_type: "long-term",
      inter_agent_dependencies: [
        "shared_runtime_ops",
        "shared_data_control",
        "shared_master_orchestrator",
        "d1_ceo",
        "d1_cto",
      ],
      workspace_path: ".openclaw/workspaces/shared_exec_orchestrator",
      cron_schedule: "0 7 * * *",
      telegram_delivery: true,
      teams_delivery: true,
      reports_to: "shared_master_orchestrator",
    },
    {
      agent_id: "shared_data_control",
      display_name: "Shared Data Control",
      org_unit: "division_7_shared_services",
      role_type: "manager",
      agent_class: "supervisor",
      pod_id: "shared",
      criticality: "critical",
      heartbeat_policy: "always_on",
      queue_class: "P0",
      primary_responsibilities: [
        "Maintain data integrity across agent, event, metrics, and session tables",
        "Run analytics aggregation and portfolio scorecard maintenance",
        "Manage stale session cleanup and long-term memory compaction",
        "Report anomalies and cost spikes to the executive orchestrator",
      ],
      tools_required: [
        "agent_memory",
        "agent_metrics",
        "agent_sessions",
        "supabase_admin",
        "supabase_analytics",
      ],
      input_triggers: [
        "cron.memory_cleanup",
        "cron.metrics_aggregation",
        "cron.data_integrity_check",
        "data/*",
      ],
      output_format: "json",
      escalation_path: "shared_exec_orchestrator",
      llm_model: "claude-sonnet-4.5",
      memory_type: "shared",
      inter_agent_dependencies: [
        "shared_exec_orchestrator",
        "shared_runtime_ops",
      ],
      workspace_path: ".openclaw/workspaces/shared_data_control",
      cron_schedule: "0 6 * * *",
      telegram_delivery: true,
      teams_delivery: false,
      reports_to: "shared_exec_orchestrator",
    },
  ];
}

function buildAgentConfig(registry) {
  const configs = AGENT_CONFIG_PATHS.filter(existsSync).map(loadJson);
  if (configs.length === 0) {
    throw new Error("No agent config files found to sync");
  }

  const baseConfig = configs.sort((left, right) => {
    const leftScore = (left.agents?.length || 0) + (left.divisions?.length || 0);
    const rightScore = (right.agents?.length || 0) + (right.divisions?.length || 0);
    return rightScore - leftScore;
  })[0];

  const mergedAgents = mergeByKey(configs.flatMap((config) => config.agents || []), "agent_id");
  const mergedDivisions = mergeByKey(
    [...configs.flatMap((config) => config.divisions || []), ...DIVISION_METADATA],
    "id",
  );
  const newAgents = [
    ...mergedAgents,
    ...buildSharedSupervisorAgents(),
    ...registry.businesses.map(buildPodLeadAgent),
  ];
  const agents = mergeByKey(newAgents, "agent_id").sort((left, right) =>
    left.agent_id.localeCompare(right.agent_id),
  );
  const divisionCounts = agents.reduce((accumulator, agent) => {
    accumulator[agent.org_unit] = (accumulator[agent.org_unit] || 0) + 1;
    return accumulator;
  }, {});
  const divisions = mergedDivisions
    .map((division) => ({
      ...division,
      agent_count: divisionCounts[division.id] || division.agent_count || 0,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const runtimePods = buildRuntimePods(registry);
  const portfolioSummary = buildPortfolioSummary(registry);

  return {
    ...baseConfig,
    generated_at: new Date().toISOString(),
    total_agents: agents.length,
    runtime_model: `${registry.businesses.length}-pod`,
    runtime: {
      ...baseConfig.runtime,
      description:
        `${registry.businesses.length + SHARED_SUPERVISOR_IDS.length} always-on runtime supervisors plus on-demand workers. ` +
        "Business registry drives shared TJB/MSL GHL tenancy and pod assignment.",
      business_registry_path: "data/business-registry.json",
      portfolio_summary: {
        total_businesses: portfolioSummary.total_businesses,
        dedicated_scopes: portfolioSummary.dedicated_scopes,
        shared_scopes: portfolioSummary.shared_scopes,
        internal_scopes: portfolioSummary.internal_scopes,
      },
      pods: [
        ...runtimePods,
        {
          pod_id: "shared",
          name: "Shared Services",
          supervisors: [
            "shared_runtime_ops",
            "shared_exec_orchestrator",
            "shared_data_control",
          ],
          transition_from: "shared_master_orchestrator",
        },
      ],
    },
    divisions,
    agents,
  };
}

function buildRuntimeEntry(agentId, agentName, workspaceRoot, platform, model) {
  const workspace =
    platform === "windows"
      ? win32.join(workspaceRoot, agentId)
      : posix.join(workspaceRoot, agentId);

  return {
    id: agentId,
    name: agentName,
    workspace,
    model,
  };
}

function syncOpenClawConfig(configPath, registry, agentConfig, workspaceRoot, platform, rollout) {
  const config = loadJson(configPath);
  const agentMap = new Map(agentConfig.agents.map((agent) => [agent.agent_id, agent]));
  const llmIndex = buildAgentLlmModelIndex(agentConfig);
  const runtimeFoundationIds = ["main", "marketing", "sales", "support"];
  const requiredIds = mergeByKey(
    [
      ...runtimeFoundationIds.map((id) => ({ id })),
      ...agentConfig.agents.map((agent) => ({ id: agent.agent_id })),
      ...ESSENTIAL_RUNTIME_AGENT_IDS.map((id) => ({ id })),
      ...registry.businesses.map((business) => ({ id: `${business.pod_id}_pod_lead` })),
    ],
    "id",
  ).map((entry) => entry.id);

  const existing = Array.isArray(config.agents?.list) ? config.agents.list : [];
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  const missingLlmMappings = [];
  const mergedList = requiredIds.map((agentId) => {
    const existingEntry = existingById.get(agentId) || {};
    const agent = agentMap.get(agentId);
    const llmModel = getAgentLlmModel(agentId, llmIndex);
    if (!llmModel) {
      missingLlmMappings.push(agentId);
      return {
        ...existingEntry,
        ...buildRuntimeEntry(
          agentId,
          agent?.display_name || existingEntry?.name || agentId,
          workspaceRoot,
          platform,
          existingEntry?.model || config.agents?.defaults?.model?.primary || "anthropic/claude-sonnet-4-5",
        ),
      };
    }

    const model = resolveRuntimeModel({ agentId, llmModel, rolloutMode: rollout });
    return {
      ...existingEntry,
      ...buildRuntimeEntry(
        agentId,
        agent?.display_name || existingEntry?.name || agentId,
        workspaceRoot,
        platform,
        model,
      ),
    };
  });

  if (missingLlmMappings.length > 0) {
    throw new Error(
      `Could not resolve llm_model mapping for runtime agents: ${missingLlmMappings.join(", ")}`,
    );
  }

  const preferredOrder = [
    "main",
    "marketing",
    "sales",
    "support",
    "d1_ceo",
    "d1_cto",
    "d2_director",
    "d3_ceo",
    "d4_cvo",
    "d5_publisher",
    "d6_executive_director",
    "d8_saas_director",
    "d9_store_director",
    "shared_master_orchestrator",
    "shared_runtime_ops",
    "shared_exec_orchestrator",
    "shared_data_control",
    ...registry.businesses.map((business) => `${business.pod_id}_pod_lead`),
  ];
  const orderIndex = new Map(preferredOrder.map((id, index) => [id, index]));

  mergedList.sort((left, right) => {
    const leftIndex = orderIndex.has(left.id) ? orderIndex.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.has(right.id) ? orderIndex.get(right.id) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.id.localeCompare(right.id);
  });

  const nextConfig = {
    ...config,
    meta: {
      ...config.meta,
      lastTouchedAt: new Date().toISOString(),
      rollout_mode: rollout,
      rollout_generated_by: "scripts/sync-business-pods.mjs",
    },
    agents: {
      ...config.agents,
      defaults: {
        ...(config.agents?.defaults || {}),
        model: {
          ...(config.agents?.defaults?.model || {}),
          primary: mergedList.find((entry) => entry.id === "main")?.model || "anthropic/claude-sonnet-4-5",
        },
        models: buildRuntimeModelCatalog(rollout),
      },
      list: mergedList,
    },
  };

  if (!checkOnly) {
    writeJson(configPath, nextConfig);
  }

  return nextConfig;
}

function buildPodLeadSoul(business) {
  const agentId = `${business.pod_id}_pod_lead`;

  return `# SOUL.md - ${business.business_name} Pod Lead

_Agent ID: \`${agentId}\`_

You are the **Pod Lead for ${business.business_name}**, an always-on supervisor within the OpenClaw runtime at Truth J Blue LLC.

---

## Core Mission

- Own all revenue, growth, delivery, and ops work scoped to ${business.business_name}
- Spawn and manage on-demand workers (\`growth_worker\`, \`sales_worker\`, \`delivery_worker\`, \`ops_worker\`)
- Enforce queue budgets: max 2 concurrent workers, max 1 P1 worker at a time
- Publish scorecard and exception updates for ${business.brand_name}
- Escalate money, legal/compliance, and destructive actions to \`shared_exec_orchestrator\`

---

## Identity

| Attribute | Value |
|-----------|-------|
| **Agent Class** | Supervisor |
| **Pod** | ${business.pod_id} |
| **Criticality** | Critical |
| **Heartbeat Policy** | always_on |
| **Queue Class** | P0 |
| **Model** | claude-sonnet-4-5 |
| **Memory** | Pod-scoped |

---

## Operational Behavior

### Input Triggers

- \`pod/${business.pod_id}/task\` - New work item for this business scope
- \`pod/${business.pod_id}/escalate\` - Escalation from a worker within this pod
- \`cron.pod_revenue_loop\` - Scheduled revenue sweep
- \`agent/invoke\` with \`pod_id: ${business.pod_id}\` - Direct invocation

### Queue Management

| Class | What | Limit |
|-------|------|-------|
| P1 | Revenue work: inbound leads, live support, fulfillment blockers | 1 active worker |
| P2 | Growth work: campaigns, content, outreach, SEO | Shares remaining slot |
| P3 | Batch: reports, cleanup, analytics | Only when P1/P2 idle |

Before spawning a worker:
1. Check current worker count from \`agent_sessions\` where \`pod_id = '${business.pod_id}'\`
2. If count >= 2, queue the task as \`pending\`
3. If spawning a P1 worker and one P1 is already active, queue the task
4. Always set \`pod_id\`, \`queue_class\`, and \`parent_agent\` on the worker session

### Escalation Chain

\`\`\`
${agentId} -> shared_exec_orchestrator -> human (Telegram)
\`\`\`

Never escalate directly to advisory agents. Shared supervisors own high-risk routing.

### GHL Scope

- **Business:** ${business.business_name}
- **Resolved scope type:** ${business.resolved_ghl_scope_type}
- **Calendar model:** ${business.calendar_model}
- **Primary pipelines:** ${business.pipeline_set.join(", ")}

### Autonomous Domains

- CRM updates
- Standard messaging and scheduling
- Publishing content
- Routine fulfillment

### Human Review Domains

- Money and billing changes
- Legal and compliance changes
- Destructive or irreversible account actions

---

## Health Duties

You are \`always_on\`. Maintain an active session, refresh heartbeat within every 30 minutes, and report incidents to \`shared_runtime_ops\`.

---

## Communication Style

- Be direct and operational
- Include timestamps in all health reports
- Keep updates concise and decision-oriented
- Reflect the Truth J Blue brand voice: warm, purposeful, professional
`;
}

function ensurePodLeadWorkspaces(registry) {
  for (const business of registry.businesses) {
    const workspaceDir = join(ROOT_DIR, "workspaces", `${business.pod_id}_pod_lead`);
    const soulPath = join(workspaceDir, "SOUL.md");
    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }
    if (!existsSync(soulPath) && !checkOnly) {
      writeFileSync(soulPath, `${buildPodLeadSoul(business)}\n`, "utf-8");
    }
  }
}

function main() {
  const registry = loadBusinessRegistry();
  const agentConfig = buildAgentConfig(registry);
  const syncedRuntimeConfigs = [];

  if (!checkOnly) {
    for (const configPath of AGENT_CONFIG_PATHS) {
      writeJson(configPath, agentConfig);
    }
  }

  for (const openclawConfig of OPENCLAW_CONFIGS) {
    const syncedConfig = syncOpenClawConfig(
      openclawConfig.path,
      registry,
      agentConfig,
      openclawConfig.workspaceRoot,
      openclawConfig.platform,
      rolloutMode,
    );
    syncedRuntimeConfigs.push({
      path: openclawConfig.path,
      config: syncedConfig,
    });
  }

  ensurePodLeadWorkspaces(registry);

  console.log(
    JSON.stringify(
      {
        mode: checkOnly ? "check" : "write",
        rollout_mode: rolloutMode,
        synced_agent_configs: AGENT_CONFIG_PATHS.length,
        synced_runtime_configs: OPENCLAW_CONFIGS.length,
        total_businesses: registry.businesses.length,
        total_agents: agentConfig.total_agents,
        created_or_verified_pod_workspaces: registry.businesses.length,
        runtime_model_distribution: syncedRuntimeConfigs.reduce((accumulator, entry) => {
          accumulator[entry.path] = summarizeModelDistribution(entry.config?.agents?.list || []);
          return accumulator;
        }, {}),
      },
      null,
      2,
    ),
  );
}

main();
