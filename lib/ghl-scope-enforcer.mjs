/**
 * GHL Scope Enforcer
 *
 * Runtime enforcement layer that validates whether an agent is allowed
 * to call a specific GHL API resource:operation based on its assigned
 * token group and the canonical scope sets.
 *
 * Usage:
 *   import { enforceGhlScope, getAgentPermissions } from '../lib/ghl-scope-enforcer.mjs';
 *
 *   // Throws if the agent's token group does not include the required permission:
 *   enforceGhlScope('d1_ceo', 'contacts', 'write');
 *
 *   // Get flat list of all permissions for an agent:
 *   const perms = getAgentPermissions('d1_ceo');
 *   // => ['contacts:read', 'conversations:read', ...]
 */

import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(__dirname, '..');

// ── Config loading (cached, loaded once) ──────────────────────

let _scopeSets = null;
let _tokenGroups = null;
let _agentsConfig = null;

function loadConfig(relPath) {
  return JSON.parse(readFileSync(resolvePath(ROOT, relPath), 'utf8'));
}

function scopeSets() {
  if (!_scopeSets) _scopeSets = loadConfig('config/ghl-scope-sets.json').scope_sets;
  return _scopeSets;
}

function tokenGroups() {
  if (!_tokenGroups) _tokenGroups = loadConfig('config/ghl-token-groups.json').token_groups;
  return _tokenGroups;
}

function agentsConfig() {
  if (!_agentsConfig) _agentsConfig = loadConfig('config/agents_config.json');
  return _agentsConfig;
}

/** Invalidate caches (for tests). */
export function resetCache() {
  _scopeSets = null;
  _tokenGroups = null;
  _agentsConfig = null;
}

// ── Permission resolution ──────────────────────────────────────

/**
 * Resolve the flat set of permissions for a token group.
 * Merges all scope sets referenced by the token group.
 *
 * @param {string} tokenGroupId - e.g. 'token_insight_ops'
 * @returns {Set<string>} - e.g. Set{'contacts:read', 'conversations:read', ...}
 */
export function resolveTokenGroupPermissions(tokenGroupId) {
  const group = tokenGroups()[tokenGroupId];
  if (!group) throw new Error(`Unknown token group: "${tokenGroupId}"`);

  const sets = scopeSets();
  const perms = new Set();

  for (const setId of group.scope_sets) {
    const scopeSet = sets[setId];
    if (!scopeSet) throw new Error(`Unknown scope set "${setId}" referenced by token group "${tokenGroupId}"`);
    for (const perm of scopeSet.permissions) {
      perms.add(perm);
    }
  }

  return perms;
}

/**
 * Look up the token group for an agent.
 *
 * @param {string} agentId
 * @returns {string|null} - token group id or null if agent has no GHL access
 */
export function getAgentTokenGroup(agentId) {
  const config = agentsConfig();
  const agent = config.agents.find(a => a.agent_id === agentId);
  return agent?.ghl_token_group || null;
}

/**
 * Get the flat list of GHL API permissions for an agent.
 *
 * @param {string} agentId
 * @returns {string[]} - sorted array of "resource:operation" strings, empty if no GHL access
 */
export function getAgentPermissions(agentId) {
  const group = getAgentTokenGroup(agentId);
  if (!group) return [];
  return [...resolveTokenGroupPermissions(group)].sort();
}

// ── GHL resource → permission mapping ──────────────────────────

/**
 * Maps GHL client namespace methods to required permissions.
 * Keys are "namespace.method" or "namespace" for the whole namespace.
 */
const GHL_METHOD_PERMISSIONS = {
  // contacts
  'contacts.search': 'contacts:read',
  'contacts.get': 'contacts:read',
  'contacts.create': 'contacts:write',
  'contacts.update': 'contacts:write',
  'contacts.delete': 'contacts:write',
  'contacts.addTags': 'contacts:write',
  'contacts.removeTags': 'contacts:write',
  'contacts.notes.list': 'contacts:read',
  'contacts.notes.add': 'contacts:write',
  'contacts.tasks.list': 'contacts:read',
  'contacts.tasks.add': 'contacts:write',
  'contacts.workflows.enroll': 'workflows:write',
  'contacts.workflows.remove': 'workflows:write',

  // conversations
  'conversations.list': 'conversations:read',
  'conversations.get': 'conversations:read',
  'conversations.create': 'conversations:write',
  'conversations.messages.list': 'conversations:read',
  'conversations.messages.send': 'conversations:write',
  'conversations.messages.addInbound': 'conversations:write',
  'conversations.messages.get': 'conversations:read',
  'conversations.messages.getRecording': 'conversations:read',
  'conversations.messages.getTranscription': 'conversations:read',

  // opportunities
  'opportunities.search': 'opportunities:read',
  'opportunities.get': 'opportunities:read',
  'opportunities.create': 'opportunities:write',
  'opportunities.update': 'opportunities:write',
  'opportunities.delete': 'opportunities:write',
  'opportunities.pipelines': 'opportunities:read',

  // calendars & appointments
  'calendars.list': 'calendars:read',
  'calendars.getFreeSlots': 'calendars:read',
  'calendars.appointments.list': 'calendars:read',
  'calendars.appointments.get': 'calendars:read',
  'calendars.appointments.create': 'calendars:write',
  'calendars.appointments.update': 'calendars:write',
  'calendars.appointments.delete': 'calendars:write',

  // workflows
  'workflows.list': 'workflows:read',

  // locations
  'locations.get': 'contacts:read', // same scope as basic read
  'locations.customFields.list': 'custom_fields:read',
  'locations.customFields.create': 'custom_fields:write',
  'locations.customValues.list': 'custom_fields:read',

  // invoices / payments
  'invoices.list': 'transactions:read',
  'invoices.get': 'transactions:read',
  'invoices.create': 'transactions:write',
  'invoices.send': 'transactions:write',
  'invoices.void': 'transactions:write',
  'payments.invoices.list': 'transactions:read',
  'payments.invoices.get': 'transactions:read',
  'payments.invoices.create': 'transactions:write',
  'payments.invoices.send': 'transactions:write',
  'payments.invoices.void': 'transactions:write',
};

/**
 * Infer the required permission for a resource:operation pair.
 *
 * @param {string} resource - e.g. 'contacts', 'conversations'
 * @param {string} operation - 'read' or 'write'
 * @returns {string} - e.g. 'contacts:read'
 */
function toPermission(resource, operation) {
  return `${resource}:${operation}`;
}

// ── Enforcement ─────────────────────────────────────────────────

export class GhlScopeViolation extends Error {
  constructor(agentId, permission, tokenGroup) {
    super(
      `GHL scope violation: agent "${agentId}" (token group "${tokenGroup}") ` +
      `is not permitted "${permission}"`
    );
    this.name = 'GhlScopeViolation';
    this.agentId = agentId;
    this.permission = permission;
    this.tokenGroup = tokenGroup;
  }
}

/**
 * Enforce that an agent is allowed to perform a specific GHL operation.
 *
 * @param {string} agentId - The calling agent's ID
 * @param {string} resource - GHL resource (e.g. 'contacts', 'conversations')
 * @param {string} operation - 'read' or 'write'
 * @throws {GhlScopeViolation} if the agent lacks the required permission
 * @returns {{ tokenGroup: string, permission: string }} on success
 */
export function enforceGhlScope(agentId, resource, operation) {
  const tokenGroup = getAgentTokenGroup(agentId);
  if (!tokenGroup) {
    throw new GhlScopeViolation(agentId, `${resource}:${operation}`, 'none');
  }

  const permission = toPermission(resource, operation);
  const allowed = resolveTokenGroupPermissions(tokenGroup);

  if (!allowed.has(permission)) {
    throw new GhlScopeViolation(agentId, permission, tokenGroup);
  }

  return { tokenGroup, permission };
}

/**
 * Enforce that an agent is allowed to call a specific GHL client method.
 *
 * @param {string} agentId
 * @param {string} methodPath - e.g. 'contacts.create', 'conversations.messages.send'
 * @throws {GhlScopeViolation}
 * @returns {{ tokenGroup: string, permission: string }}
 */
export function enforceGhlMethod(agentId, methodPath) {
  const permission = GHL_METHOD_PERMISSIONS[methodPath];
  if (!permission) {
    throw new Error(`Unknown GHL method path: "${methodPath}". Cannot determine required permission.`);
  }

  const [resource, operation] = permission.split(':');
  return enforceGhlScope(agentId, resource, operation);
}

/**
 * Returns the env var name for the token an agent should use.
 *
 * @param {string} agentId
 * @returns {string|null} - env var name or null if agent has no GHL access
 */
export function getAgentTokenEnvVar(agentId) {
  const groupId = getAgentTokenGroup(agentId);
  if (!groupId) return null;

  const group = tokenGroups()[groupId];
  return group?.env_var || null;
}

export { GHL_METHOD_PERMISSIONS };
