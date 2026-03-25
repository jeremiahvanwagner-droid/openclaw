#!/usr/bin/env node

import fs from 'fs/promises';

const AGENTS_PATH = 'config/agents_config.json';
const OUTPUT_PATH = 'config/governance/tool-allowlist-policy.json';

async function main() {
  const config = JSON.parse(await fs.readFile(AGENTS_PATH, 'utf8'));
  const agents = Array.isArray(config.agents) ? config.agents : [];

  const agentPolicies = agents.map((agent) => ({
    agent_id: agent.agent_id,
    allowed_tools: Array.from(new Set(agent.tools_required || [])).sort(),
  }));

  const policy = {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    enforcement_mode: 'fail',
    default_policy: {
      allow: false,
      reason: 'deny-by-default policy enabled; explicit allowlist required per agent',
    },
    agent_policies: agentPolicies,
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    action: 'generate-tool-allowlist-policy',
    output: OUTPUT_PATH,
    totalAgents: agentPolicies.length,
    enforcementMode: policy.enforcement_mode,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
