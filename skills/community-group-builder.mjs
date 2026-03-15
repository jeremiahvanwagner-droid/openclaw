#!/usr/bin/env node
/**
 * Community Group Builder
 * Create and manage community groups in GHL membership areas
 *
 * Usage: node community-group-builder.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> --name "<n>" --description "<d>" [--visibility "public|private"]
 *   list <location_id>
 *   get <location_id> <group_id>
 *   add-member <location_id> <group_id> --contact_id "<c>"
 *   remove-member <location_id> <group_id> --contact_id "<c>"
 *   update <location_id> <group_id> --name "<n>" [--description "<d>"]
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) throw new Error('No OAuth tokens found.');
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  for (const [, entry] of Object.entries(tokens.instances || {})) {
    if (entry.location_id === locationId) return entry.access_token;
  }
  throw new Error(`No token found for location ${locationId}`);
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  lastCallAt = Date.now();
  const options = { method, headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${GHL_BASE}${endpoint}`, options);
  if (!response.ok) { const err = await response.text(); throw new Error(`GHL API (${response.status}): ${err}`); }
  if (response.status === 204) return {};
  return response.json();
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = (i + 1 < args.length && !args[i + 1].startsWith('--')) ? args[++i] : true;
    }
  }
  return result;
}

async function createGroup(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<group_name>"');
  const token = findTokenForLocation(locationId);
  const result = await apiCall('POST', '/communities/groups', token, {
    locationId, name: opts.name,
    description: opts.description || '',
    visibility: opts.visibility || 'public'
  });
  console.log(JSON.stringify({
    action: 'create', locationId,
    groupId: result.group?.id || result.id,
    name: opts.name, visibility: opts.visibility || 'public',
    status: 'created'
  }, null, 2));
}

async function listGroups(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/communities/groups?locationId=${locationId}`, token);
  const groups = (result.groups || []).map(g => ({
    id: g.id, name: g.name, visibility: g.visibility,
    memberCount: g.memberCount || 0
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: groups.length, groups }, null, 2));
}

async function getGroup(locationId, groupId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/communities/groups/${groupId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, group: result }, null, 2));
}

async function addMember(locationId, groupId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id) throw new Error('Required: --contact_id "<id>"');
  const token = findTokenForLocation(locationId);
  await apiCall('POST', `/communities/groups/${groupId}/members`, token, {
    contactId: opts.contact_id
  });
  console.log(JSON.stringify({ action: 'add-member', locationId, groupId, contactId: opts.contact_id, status: 'added' }, null, 2));
}

async function removeMember(locationId, groupId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id) throw new Error('Required: --contact_id "<id>"');
  const token = findTokenForLocation(locationId);
  await apiCall('DELETE', `/communities/groups/${groupId}/members/${opts.contact_id}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'remove-member', locationId, groupId, contactId: opts.contact_id, status: 'removed' }, null, 2));
}

async function updateGroup(locationId, groupId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);
  const body = {};
  if (opts.name) body.name = opts.name;
  if (opts.description) body.description = opts.description;
  if (opts.visibility) body.visibility = opts.visibility;
  await apiCall('PUT', `/communities/groups/${groupId}`, token, body);
  console.log(JSON.stringify({ action: 'update', locationId, groupId, updated: Object.keys(body), status: 'updated' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node community-group-builder.mjs <command> [args...]'); console.log('Commands: create, list, get, add-member, remove-member, update'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0]) throw new Error('Missing location_id'); await createGroup(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listGroups(args[0]); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or group_id'); await getGroup(args[0], args[1]); break;
      case 'add-member': if (!args[0] || !args[1]) throw new Error('Missing location_id or group_id'); await addMember(args[0], args[1], args.slice(2)); break;
      case 'remove-member': if (!args[0] || !args[1]) throw new Error('Missing location_id or group_id'); await removeMember(args[0], args[1], args.slice(2)); break;
      case 'update': if (!args[0] || !args[1]) throw new Error('Missing location_id or group_id'); await updateGroup(args[0], args[1], args.slice(2)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
