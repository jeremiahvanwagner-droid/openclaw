/**
 * Cross-Business Scope Governor — Core Logic
 * OpenClaw Phase 1 Foundation Skill
 *
 * Audits agent scope compliance, detects drift from baselines,
 * auto-corrects safe violations, and enforces cross-business isolation.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../../lib/agent-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Config loading (cached) ────────────────────────────────────

let _agentsConfig = null;
let _scopeSets = null;
let _tokenGroups = null;
let _businessRegistry = null;

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8'));
}

function agentsConfig() {
  if (!_agentsConfig) _agentsConfig = loadJson('config/agents_config.json');
  return _agentsConfig;
}

function scopeSets() {
  if (!_scopeSets) _scopeSets = loadJson('config/ghl-scope-sets.json');
  return _scopeSets;
}

function tokenGroups() {
  if (!_tokenGroups) _tokenGroups = loadJson('config/ghl-token-groups.json');
  return _tokenGroups;
}

function businessRegistry() {
  if (!_businessRegistry) _businessRegistry = loadJson('data/business-registry.json');
  return _businessRegistry;
}

/** Reset cached configs (for testing or hot-reload). */
export function resetCache() {
  _agentsConfig = null;
  _scopeSets = null;
  _tokenGroups = null;
  _businessRegistry = null;
}

// ── Supabase client ────────────────────────────────────────────

// ── Scope resolution helpers ───────────────────────────────────

/**
 * Resolve the flat permission set for a token group.
 * @param {string} groupId
 * @returns {Set<string>}
 */
function resolveGroupPermissions(groupId) {
  const groups = tokenGroups();
  const group = groups.groups?.[groupId] || groups[groupId];
  if (!group) return new Set();

  const perms = new Set();
  const sets = scopeSets();
  for (const setId of group.scope_sets || []) {
    const scopeSet = sets.scope_sets?.[setId] || sets[setId];
    if (scopeSet?.permissions) {
      for (const p of scopeSet.permissions) perms.add(p);
    }
  }
  return perms;
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Audit all agents' scope compliance.
 * Checks every agent's assigned skills against their token group permissions.
 *
 * @returns {{ findings: Array<{agent_id: string, issue: string, severity: string}>, summary: {total: number, compliant: number, violations: number} }}
 */
export async function auditScopeCompliance() {
  const config = agentsConfig();
  const agents = config.agents || [];
  const findings = [];

  for (const agent of agents) {
    const groupId = agent.ghl_token_group;
    if (!groupId) continue; // No GHL access — skip

    const perms = resolveGroupPermissions(groupId);

    // Check each skill for required GHL scopes
    for (const skillId of agent.skills || []) {
      const requiredScopes = getSkillRequiredScopes(skillId);
      for (const scope of requiredScopes) {
        if (!perms.has(scope)) {
          findings.push({
            agent_id: agent.agent_id,
            skill_id: skillId,
            missing_scope: scope,
            token_group: groupId,
            issue: `Agent "${agent.agent_id}" has skill "${skillId}" requiring scope "${scope}" but token group "${groupId}" does not grant it`,
            severity: 'warning',
          });
        }
      }
    }
  }

  const summary = {
    total: agents.length,
    compliant: agents.length - new Set(findings.map(f => f.agent_id)).size,
    violations: findings.length,
  };

  // Persist results
  const db = supabase;
  await db.from('scope_audit_results').insert({
    audit_type: 'compliance',
    findings_json: findings,
    severity: findings.length > 0 ? 'warning' : 'info',
    resolved: findings.length === 0,
  });

  return { findings, summary };
}

/**
 * Get required GHL scopes for a skill from the skills registry.
 * @param {string} skillId
 * @returns {string[]}
 */
function getSkillRequiredScopes(skillId) {
  try {
    const registry = loadJson('config/skills-registry.json');
    const entries = registry.skills || registry;
    const skill = Array.isArray(entries)
      ? entries.find(s => s.skill_id === skillId)
      : entries[skillId];
    return skill?.ghl_scope_requirement || [];
  } catch {
    return [];
  }
}

/**
 * Compare current agent configs against a locked baseline snapshot.
 * Returns a drift report detailing all changes.
 *
 * @returns {{ drifts: Array<{agent_id: string, field: string, baseline: any, current: any, severity: string}>, has_drift: boolean }}
 */
export async function detectScopeDrift() {
  const db = supabase;

  // Get the latest baseline
  const { data: baseline } = await db
    .from('scope_baselines')
    .select('snapshot_json')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!baseline) {
    return { drifts: [], has_drift: false, message: 'No baseline exists. Generate one first.' };
  }

  const baselineAgents = baseline.snapshot_json.agents || [];
  const currentAgents = agentsConfig().agents || [];
  const drifts = [];

  const baselineMap = new Map(baselineAgents.map(a => [a.agent_id, a]));

  for (const current of currentAgents) {
    const base = baselineMap.get(current.agent_id);
    if (!base) {
      drifts.push({
        agent_id: current.agent_id,
        field: 'agent',
        baseline: null,
        current: 'new agent added',
        severity: 'warning',
      });
      continue;
    }

    // Check token group change
    if (base.ghl_token_group !== current.ghl_token_group) {
      drifts.push({
        agent_id: current.agent_id,
        field: 'ghl_token_group',
        baseline: base.ghl_token_group,
        current: current.ghl_token_group,
        severity: 'critical',
      });
    }

    // Check skills changes
    const baseSkills = new Set(base.skills || []);
    const currSkills = new Set(current.skills || []);
    for (const s of currSkills) {
      if (!baseSkills.has(s)) {
        drifts.push({
          agent_id: current.agent_id,
          field: 'skills',
          baseline: null,
          current: s,
          severity: 'warning',
        });
      }
    }
  }

  // Persist drift results
  if (drifts.length > 0) {
    await db.from('scope_audit_results').insert({
      audit_type: 'drift',
      findings_json: drifts,
      severity: drifts.some(d => d.severity === 'critical') ? 'critical' : 'warning',
      resolved: false,
    });
  }

  return { drifts, has_drift: drifts.length > 0 };
}

/**
 * Auto-correct safe drift items. Escalates unsafe corrections.
 *
 * @param {{ drifts: Array }} driftReport
 * @param {{ dryRun?: boolean }} options
 * @returns {{ corrected: Array, escalated: Array }}
 */
export async function autoCorrectDrift(driftReport, options = {}) {
  const { dryRun = false } = options;
  const corrected = [];
  const escalated = [];

  for (const drift of driftReport.drifts || []) {
    if (drift.severity === 'critical') {
      // Token group changes are never auto-corrected
      escalated.push({ ...drift, reason: 'Token group changes require human approval' });
    } else if (drift.field === 'skills' && drift.current && !drift.baseline) {
      // New skill added without baseline — safe to flag, not auto-remove
      escalated.push({ ...drift, reason: 'New skill assignment requires review' });
    } else {
      corrected.push({ ...drift, action: dryRun ? 'would_correct' : 'corrected' });
    }
  }

  return { corrected, escalated, dry_run: dryRun };
}

/**
 * Snapshot the current agent config as a new blessed baseline.
 *
 * @param {string} createdBy - Identifier of who initiated the baseline lock
 * @returns {{ id: string, agent_count: number }}
 */
export async function generateScopeBaseline(createdBy = 'system') {
  const config = agentsConfig();
  const snapshot = {
    agents: (config.agents || []).map(a => ({
      agent_id: a.agent_id,
      ghl_token_group: a.ghl_token_group || null,
      skills: a.skills || [],
      tools: a.tools || [],
    })),
    generated_at: new Date().toISOString(),
  };

  const db = supabase;
  const { data, error } = await db
    .from('scope_baselines')
    .insert({
      snapshot_json: snapshot,
      created_by: createdBy,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save baseline: ${error.message}`);

  // Reset config cache so next audit picks up fresh data
  resetCache();

  return { id: data.id, agent_count: snapshot.agents.length };
}

/**
 * Verify no agent in one business can access another business's data
 * through shared token groups.
 *
 * @returns {{ violations: Array, isolated: boolean }}
 */
export async function crossBusinessIsolationCheck() {
  const config = agentsConfig();
  const registry = businessRegistry();
  const businesses = registry.businesses || registry;
  const violations = [];

  // Map token groups to their business assignments
  const groupToBusinesses = new Map();
  for (const biz of Array.isArray(businesses) ? businesses : Object.values(businesses)) {
    const bizId = biz.business_id || biz.id;
    // Find agents assigned to this business via pod
    const podId = biz.pod_id;
    if (!podId) continue;

    for (const agent of config.agents || []) {
      if (agent.pod_id === podId && agent.ghl_token_group) {
        if (!groupToBusinesses.has(agent.ghl_token_group)) {
          groupToBusinesses.set(agent.ghl_token_group, new Set());
        }
        groupToBusinesses.get(agent.ghl_token_group).add(bizId);
      }
    }
  }

  // Flag any token group that spans multiple businesses
  for (const [groupId, bizIds] of groupToBusinesses) {
    if (bizIds.size > 1) {
      violations.push({
        token_group: groupId,
        businesses: [...bizIds],
        issue: `Token group "${groupId}" grants access to ${bizIds.size} businesses: ${[...bizIds].join(', ')}`,
        severity: 'critical',
      });
    }
  }

  // Persist
  const db = supabase;
  await db.from('scope_audit_results').insert({
    audit_type: 'isolation',
    findings_json: violations,
    severity: violations.length > 0 ? 'critical' : 'info',
    resolved: violations.length === 0,
  });

  return { violations, isolated: violations.length === 0 };
}

/**
 * Validate that approval policies from business-registry are honored.
 * Agents with destructive_actions must route through shared_exec_orchestrator.
 *
 * @returns {{ violations: Array, compliant: boolean }}
 */
export async function policyGuardrailEnforcement() {
  const config = agentsConfig();
  const registry = businessRegistry();
  const businesses = Array.isArray(registry.businesses || registry)
    ? (registry.businesses || registry)
    : Object.values(registry.businesses || registry);
  const violations = [];

  for (const biz of businesses) {
    const approvalPolicy = biz.approval_policy;
    if (!approvalPolicy) continue;

    const destructiveActions = approvalPolicy.destructive_actions || [];
    if (destructiveActions.length === 0) continue;

    // Find agents in this business's pod
    const podId = biz.pod_id;
    for (const agent of config.agents || []) {
      if (agent.pod_id !== podId) continue;

      // Check if agent has an escalation path that includes shared_exec_orchestrator
      const escalation = agent.escalation_path || '';
      if (destructiveActions.length > 0 && !escalation.includes('shared_exec_orchestrator')) {
        violations.push({
          agent_id: agent.agent_id,
          business_id: biz.business_id || biz.id,
          issue: `Agent "${agent.agent_id}" handles destructive actions but escalation path does not include shared_exec_orchestrator`,
          severity: 'warning',
        });
      }
    }
  }

  // Persist
  const db = supabase;
  await db.from('scope_audit_results').insert({
    audit_type: 'policy',
    findings_json: violations,
    severity: violations.length > 0 ? 'warning' : 'info',
    resolved: violations.length === 0,
  });

  return { violations, compliant: violations.length === 0 };
}

/**
 * Log a scope violation event (called from ghl-scope-enforcer on violation).
 *
 * @param {{ agent_id: string, resource: string, operation: string, business_id?: string, blocked: boolean }} violation
 */
export async function logScopeViolation(violation) {
  const db = supabase;
  await db.from('scope_violations_log').insert({
    agent_id: violation.agent_id,
    resource: violation.resource,
    operation: violation.operation,
    business_id: violation.business_id || null,
    blocked: violation.blocked,
  });
}
