#!/usr/bin/env node

import fs from 'fs/promises';

const AGENTS_PATH = 'config/agents_config.json';
const MAPPING_PATH = 'config/governance/agent-scope-space-mapping.json';
const POLICY_PATH = 'config/governance/tool-allowlist-policy.json';

const scopePattern = /^scope\.(global|shared\.[a-z0-9_]+|division\.[a-z0-9_]+|business\.[a-z0-9_]+)$/;
const spacePattern = /^space\.(global\.control_plane|shared\.(tjb|msl|control)\.production|division\.[a-z0-9_]+\.operations|business\.[a-z0-9_]+\.production)$/;

async function readJson(pathname) {
  return JSON.parse(await fs.readFile(pathname, 'utf8'));
}

async function main() {
  const agentsCfg = await readJson(AGENTS_PATH);
  const mappingCfg = await readJson(MAPPING_PATH);
  const policyCfg = await readJson(POLICY_PATH);

  const agentIds = new Set((agentsCfg.agents || []).map((agent) => agent.agent_id));
  const mappingIds = new Set((mappingCfg.mappings || []).map((entry) => entry.agent_id));
  const policyIds = new Set((policyCfg.agent_policies || []).map((entry) => entry.agent_id));

  const missingMappings = [];
  const missingPolicies = [];

  for (const agentId of agentIds) {
    if (!mappingIds.has(agentId)) missingMappings.push(agentId);
    if (!policyIds.has(agentId)) missingPolicies.push(agentId);
  }

  const orphanMappings = Array.from(mappingIds).filter((agentId) => !agentIds.has(agentId));
  const orphanPolicies = Array.from(policyIds).filter((agentId) => !agentIds.has(agentId));

  const invalidScopes = (mappingCfg.mappings || [])
    .filter((entry) => !scopePattern.test(entry.scope_id))
    .map((entry) => ({ agent_id: entry.agent_id, scope_id: entry.scope_id }));

  const invalidSpaces = (mappingCfg.mappings || [])
    .filter((entry) => !spacePattern.test(entry.space_id))
    .map((entry) => ({ agent_id: entry.agent_id, space_id: entry.space_id }));

  const emptyToolAllowlists = (policyCfg.agent_policies || [])
    .filter((entry) => !Array.isArray(entry.allowed_tools) || entry.allowed_tools.length === 0)
    .map((entry) => entry.agent_id);

  const ok = missingMappings.length === 0
    && missingPolicies.length === 0
    && orphanMappings.length === 0
    && orphanPolicies.length === 0
    && invalidScopes.length === 0
    && invalidSpaces.length === 0
    && emptyToolAllowlists.length === 0;

  console.log(JSON.stringify({
    action: 'check-governance-drift',
    agentCount: agentIds.size,
    missingMappings,
    missingPolicies,
    orphanMappings,
    orphanPolicies,
    invalidScopes,
    invalidSpaces,
    emptyToolAllowlists,
    ok,
  }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
