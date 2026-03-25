#!/usr/bin/env node

import fs from 'fs/promises';

const AGENTS_PATH = 'config/agents_config.json';
const BUSINESSES_PATH = 'data/business-registry.json';
const OUTPUT_PATH = 'config/governance/agent-scope-space-mapping.json';

function scopeForAgent(agent) {
  if (agent.pod_id && agent.pod_id.startsWith('biz_')) {
    return {
      scope_id: `scope.business.${agent.pod_id}`,
      scope_family: 'business',
      rationale: `Business pod ownership for ${agent.pod_id}`,
    };
  }

  if (agent.org_unit === 'division_7_shared_services') {
    return {
      scope_id: 'scope.shared.runtime',
      scope_family: 'shared',
      rationale: 'Shared runtime and supervisory orchestration scope',
    };
  }

  if (agent.org_unit === 'division_8_saas_operations') {
    return {
      scope_id: 'scope.shared.saas',
      scope_family: 'shared',
      rationale: 'Cross-business SaaS enablement scope',
    };
  }

  return {
    scope_id: `scope.division.${agent.org_unit}`,
    scope_family: 'division',
    rationale: `Division bounded scope for ${agent.org_unit}`,
  };
}

function buildPodToSpaceMap(registry) {
  const map = new Map();

  for (const business of registry.businesses || []) {
    const selector = String(business.ghl_location_selector || '').toUpperCase();
    const sharedSpace = selector === 'MSL'
      ? 'space.shared.msl.production'
      : 'space.shared.tjb.production';

    map.set(business.pod_id, {
      space_id: `space.business.${business.pod_id}.production`,
      space_family: 'business',
      rationale: `${business.business_name} execution space (${sharedSpace})`,
      shared_tenant_space: sharedSpace,
    });
  }

  return map;
}

function spaceForAgent(agent, podSpaces) {
  if (agent.pod_id && podSpaces.has(agent.pod_id)) {
    const pod = podSpaces.get(agent.pod_id);
    return {
      space_id: pod.space_id,
      space_family: pod.space_family,
      rationale: pod.rationale,
      shared_tenant_space: pod.shared_tenant_space,
    };
  }

  if (agent.org_unit === 'division_7_shared_services') {
    return {
      space_id: 'space.global.control_plane',
      space_family: 'global',
      rationale: 'Global control plane for runtime orchestration',
    };
  }

  if (agent.org_unit === 'division_8_saas_operations') {
    return {
      space_id: 'space.shared.control.production',
      space_family: 'shared',
      rationale: 'Shared SaaS enablement control space',
    };
  }

  return {
    space_id: `space.division.${agent.org_unit}.operations`,
    space_family: 'division',
    rationale: `Division operations space for ${agent.org_unit}`,
  };
}

async function main() {
  const agents = JSON.parse(await fs.readFile(AGENTS_PATH, 'utf8'));
  const registry = JSON.parse(await fs.readFile(BUSINESSES_PATH, 'utf8'));
  const podSpaces = buildPodToSpaceMap(registry);

  const mappings = (agents.agents || []).map((agent) => {
    const scope = scopeForAgent(agent);
    const space = spaceForAgent(agent, podSpaces);
    return {
      agent_id: agent.agent_id,
      org_unit: agent.org_unit,
      pod_id: agent.pod_id || null,
      ...scope,
      ...space,
    };
  });

  const payload = {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    total_agents: mappings.length,
    mappings,
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    action: 'generate-agent-scope-space-mapping',
    output: OUTPUT_PATH,
    totalAgents: mappings.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
