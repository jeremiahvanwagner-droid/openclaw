#!/usr/bin/env node
/**
 * GHL Custom Value Manager
 * Manages Custom Values across GHL sub-accounts for dynamic template injection
 *
 * Usage: node custom-value-manager.mjs <command> [args...]
 *
 * Commands:
 *   set <location_id> --key "<key>" --value "<value>"         Set custom value
 *   get <location_id> --key "<key>"                           Get custom value
 *   bulk-set <location_id> --file "<json_path>"               Bulk set from JSON
 *   list <location_id>                                        List all custom values
 *   delete <location_id> --key "<key>"                        Delete custom value
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function findTokenForLocation(locationId) {
  if (!existsSync(TOKENS_PATH)) {
    throw new Error('No OAuth tokens found.');
  }
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));

  // Direct match on location_id
  for (const [id, entry] of Object.entries(tokens.instances || {})) {
    if (entry.location_id === locationId) return { instanceId: id, token: entry.access_token };
  }

  // Check registry for location ownership
  if (existsSync(REGISTRY_PATH)) {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    for (const [id, inst] of Object.entries(registry.instances || {})) {
      if (inst.locations?.includes(locationId)) {
        const tokenEntry = tokens.instances?.[id];
        if (tokenEntry?.access_token) return { instanceId: id, token: tokenEntry.access_token };
      }
    }
  }

  throw new Error(`No token found for location ${locationId}`);
}

async function apiCall(method, endpoint, token, body = null) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  }
  lastCallAt = Date.now();

  const url = `${GHL_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Version': API_VERSION,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GHL API error (${response.status}): ${err}`);
  }
  return response.json();
}

function parseArgs(args) {
  const result = {};
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result[key] = args[i + 1];
        i += 2;
      } else {
        result[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }
  return result;
}

// --- Commands ---

async function set(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.key || !opts.value) {
    throw new Error('Required: --key "<key>" --value "<value>"');
  }

  const { token } = findTokenForLocation(locationId);

  const result = await apiCall('POST', `/locations/${locationId}/customValues`, token, {
    name: opts.key,
    value: opts.value
  });

  console.log(JSON.stringify({
    action: 'set',
    locationId,
    key: opts.key,
    value: opts.value,
    status: 'success',
    customValueId: result.customValue?.id || result.id
  }, null, 2));
}

async function get(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.key) {
    throw new Error('Required: --key "<key>"');
  }

  const { token } = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/locations/${locationId}/customValues`, token);

  const match = (result.customValues || []).find(cv => cv.name === opts.key);
  if (!match) {
    console.log(JSON.stringify({ action: 'get', locationId, key: opts.key, found: false }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    action: 'get',
    locationId,
    key: opts.key,
    value: match.value,
    id: match.id,
    found: true
  }, null, 2));
}

async function bulkSet(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.file) {
    throw new Error('Required: --file "<json_path>"');
  }

  const filePath = join(OPENCLAW_ROOT, opts.file);
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const values = JSON.parse(readFileSync(filePath, 'utf-8'));
  const { token } = findTokenForLocation(locationId);
  const results = [];

  for (const [key, value] of Object.entries(values)) {
    try {
      await apiCall('POST', `/locations/${locationId}/customValues`, token, {
        name: key,
        value: String(value)
      });
      results.push({ key, status: 'success' });
    } catch (err) {
      results.push({ key, status: 'error', error: err.message });
    }
  }

  console.log(JSON.stringify({
    action: 'bulk-set',
    locationId,
    total: results.length,
    succeeded: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length,
    results
  }, null, 2));
}

async function list(locationId) {
  const { token } = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/locations/${locationId}/customValues`, token);

  const values = (result.customValues || []).map(cv => ({
    id: cv.id,
    name: cv.name,
    value: cv.value,
    fieldKey: cv.fieldKey
  }));

  console.log(JSON.stringify({
    action: 'list',
    locationId,
    total: values.length,
    customValues: values
  }, null, 2));
}

async function deleteValue(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.key) {
    throw new Error('Required: --key "<key>"');
  }

  const { token } = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/locations/${locationId}/customValues`, token);
  const match = (result.customValues || []).find(cv => cv.name === opts.key);

  if (!match) {
    throw new Error(`Custom value "${opts.key}" not found in location ${locationId}`);
  }

  await apiCall('DELETE', `/locations/${locationId}/customValues/${match.id}`, token);

  console.log(JSON.stringify({
    action: 'delete',
    locationId,
    key: opts.key,
    status: 'success'
  }, null, 2));
}

// --- Main ---

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.log('Usage: node custom-value-manager.mjs <command> [args...]');
    console.log('Commands: set, get, bulk-set, list, delete');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'set':
        if (!args[0]) throw new Error('Missing location_id');
        await set(args[0], args.slice(1));
        break;
      case 'get':
        if (!args[0]) throw new Error('Missing location_id');
        await get(args[0], args.slice(1));
        break;
      case 'bulk-set':
        if (!args[0]) throw new Error('Missing location_id');
        await bulkSet(args[0], args.slice(1));
        break;
      case 'list':
        if (!args[0]) throw new Error('Missing location_id');
        await list(args[0]);
        break;
      case 'delete':
        if (!args[0]) throw new Error('Missing location_id');
        await deleteValue(args[0], args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
