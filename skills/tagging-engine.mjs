#!/usr/bin/env node
/**
 * Tagging Engine
 * Apply and manage behavioral tags on GHL contacts to trigger automations
 *
 * Usage: node tagging-engine.mjs <command> [args...]
 *
 * Commands:
 *   add <location_id> <contact_id> --tags "<tag1,tag2>"       Add tags
 *   remove <location_id> <contact_id> --tags "<tag1,tag2>"    Remove tags
 *   list <location_id>                                         List all tags
 *   bulk-tag <location_id> --filter "<json>" --tags "<tag1>"  Bulk tag by filter
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
  const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');
  if (existsSync(REGISTRY_PATH)) {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    for (const [id, inst] of Object.entries(registry.instances || {})) {
      if (inst.locations?.includes(locationId)) {
        const entry = tokens.instances?.[id];
        if (entry?.access_token) return entry.access_token;
      }
    }
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

async function addTags(locationId, contactId, args) {
  const opts = parseArgs(args);
  if (!opts.tags) throw new Error('Required: --tags "<tag1,tag2>"');
  const tags = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
  const token = findTokenForLocation(locationId);

  await apiCall('POST', `/contacts/${contactId}/tags`, token, { tags });

  console.log(JSON.stringify({ action: 'add', locationId, contactId, tags, status: 'success' }, null, 2));
}

async function removeTags(locationId, contactId, args) {
  const opts = parseArgs(args);
  if (!opts.tags) throw new Error('Required: --tags "<tag1,tag2>"');
  const tags = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
  const token = findTokenForLocation(locationId);

  await apiCall('DELETE', `/contacts/${contactId}/tags`, token, { tags });

  console.log(JSON.stringify({ action: 'remove', locationId, contactId, tags, status: 'success' }, null, 2));
}

async function listTags(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/locations/${locationId}/tags`, token);
  const tags = (result.tags || []).map(t => ({ id: t.id, name: t.name }));

  console.log(JSON.stringify({ action: 'list', locationId, total: tags.length, tags }, null, 2));
}

async function bulkTag(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.filter || !opts.tags) throw new Error('Required: --filter "<json>" --tags "<tag1>"');
  const filter = JSON.parse(opts.filter);
  const tags = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
  const token = findTokenForLocation(locationId);

  // Search contacts matching filter
  const searchParams = new URLSearchParams({ locationId, ...filter, limit: '100' });
  const result = await apiCall('GET', `/contacts/?${searchParams}`, token);
  const contacts = result.contacts || [];

  let tagged = 0;
  for (const contact of contacts) {
    await apiCall('POST', `/contacts/${contact.id}/tags`, token, { tags });
    tagged++;
  }

  console.log(JSON.stringify({ action: 'bulk-tag', locationId, filter, tags, matchedContacts: contacts.length, tagged }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node tagging-engine.mjs <command> [args...]'); console.log('Commands: add, remove, list, bulk-tag'); process.exit(1); }
  try {
    switch (command) {
      case 'add': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await addTags(args[0], args[1], args.slice(2)); break;
      case 'remove': if (!args[0] || !args[1]) throw new Error('Missing location_id or contact_id'); await removeTags(args[0], args[1], args.slice(2)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listTags(args[0]); break;
      case 'bulk-tag': if (!args[0]) throw new Error('Missing location_id'); await bulkTag(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
