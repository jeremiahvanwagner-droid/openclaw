#!/usr/bin/env node
/**
 * GHL Subaccount Provisioner
 * Creates and configures GHL sub-accounts (Locations) for SaaS clients
 *
 * Usage: node subaccount-provisioner.mjs <command> [args...]
 *
 * Commands:
 *   create <saas_instance_id> --name "<biz_name>" --email "<email>"  Create sub-account
 *   list <saas_instance_id>                                          List sub-accounts
 *   configure <location_id> --phone --email --stripe                 Configure services
 *   get <location_id>                                                Get sub-account details
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

const MIN_CALL_SPACING_MS = 600;
let lastCallAt = 0;

function getToken(instanceId) {
  if (!existsSync(TOKENS_PATH)) {
    throw new Error('No OAuth tokens found. Run ghl-oauth-manager.mjs authorize first.');
  }
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  const entry = tokens.instances?.[instanceId];
  if (!entry?.access_token) {
    throw new Error(`No token for instance ${instanceId}. Run ghl-oauth-manager.mjs authorize ${instanceId}`);
  }
  if (entry.expires_at && Date.now() > entry.expires_at) {
    throw new Error(`Token expired for instance ${instanceId}. Run ghl-oauth-manager.mjs refresh ${instanceId}`);
  }
  return entry;
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`SaaS registry not found at ${REGISTRY_PATH}`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

function validateInstanceId(instanceId) {
  const registry = loadRegistry();
  if (!registry.instances?.[instanceId]) {
    throw new Error(`Unknown saas_instance_id: ${instanceId}`);
  }
  return registry.instances[instanceId];
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

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Auth failed (${response.status}) — refresh your OAuth token`);
  }
  if (response.status === 429) {
    throw new Error('Rate limited by GHL API. Retry after a delay.');
  }
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
        i += 1;
      }
    } else {
      i++;
    }
  }
  return result;
}

// --- Commands ---

async function create(instanceId, args) {
  const opts = parseArgs(args);
  if (!opts.name || !opts.email) {
    throw new Error('Required: --name "<business_name>" --email "<email>"');
  }

  const instance = validateInstanceId(instanceId);
  const tokenEntry = getToken(instanceId);
  const companyId = instance.ghl_company_id;

  if (!companyId) {
    throw new Error(`Missing ghl_company_id for instance ${instanceId}`);
  }

  const result = await apiCall('POST', '/locations/', tokenEntry.access_token, {
    companyId,
    name: opts.name,
    email: opts.email,
    phone: opts.phone || '',
    address: opts.address || '',
    city: opts.city || '',
    state: opts.state || '',
    postalCode: opts.postalCode || '',
    country: opts.country || 'US',
    timezone: opts.timezone || 'America/New_York',
    settings: {
      allowDuplicateContact: false,
      allowDuplicateOpportunity: false
    }
  });

  console.log(JSON.stringify({
    action: 'create',
    status: 'success',
    instanceId,
    location: {
      id: result.location?.id || result.id,
      name: opts.name,
      email: opts.email
    },
    nextSteps: [
      `Deploy snapshot: node snapshot-deployer.mjs deploy ${instanceId} <snapshot_id> ${result.location?.id || result.id}`,
      `Configure services: node subaccount-provisioner.mjs configure ${result.location?.id || result.id} --phone --email --stripe`
    ]
  }, null, 2));
}

async function list(instanceId) {
  const instance = validateInstanceId(instanceId);
  const tokenEntry = getToken(instanceId);
  const companyId = instance.ghl_company_id;

  const result = await apiCall('GET', `/locations/search?companyId=${companyId}&limit=100`, tokenEntry.access_token);

  const locations = (result.locations || []).map(loc => ({
    id: loc.id,
    name: loc.name,
    email: loc.email,
    phone: loc.phone,
    address: loc.address,
    city: loc.city,
    state: loc.state,
    timezone: loc.timezone
  }));

  console.log(JSON.stringify({
    action: 'list',
    instanceId,
    total: locations.length,
    locations
  }, null, 2));
}

async function configure(locationId, args) {
  const opts = parseArgs(args);
  // Configuration requires finding which instance owns this location
  const registry = loadRegistry();
  let instanceId = null;

  for (const [id, inst] of Object.entries(registry.instances || {})) {
    if (inst.locations?.includes(locationId) || inst.ghl_location_id === locationId) {
      instanceId = id;
      break;
    }
  }

  if (!instanceId) {
    throw new Error(`Cannot determine instance for location ${locationId}. Specify instance in registry.`);
  }

  const tokenEntry = getToken(instanceId);
  const updates = {};

  if (opts.phone) updates.phone = typeof opts.phone === 'string' ? opts.phone : undefined;
  if (opts.email) updates.email = typeof opts.email === 'string' ? opts.email : undefined;

  if (Object.keys(updates).length > 0) {
    await apiCall('PUT', `/locations/${locationId}`, tokenEntry.access_token, updates);
  }

  console.log(JSON.stringify({
    action: 'configure',
    locationId,
    instanceId,
    configured: Object.keys(opts).filter(k => k !== '_'),
    status: 'success',
    note: 'Stripe Connect must be configured manually in GHL dashboard'
  }, null, 2));
}

async function get(locationId) {
  // Try to find token by iterating instances
  const registry = loadRegistry();
  for (const [id] of Object.entries(registry.instances || {})) {
    try {
      const tokenEntry = getToken(id);
      const result = await apiCall('GET', `/locations/${locationId}`, tokenEntry.access_token);
      console.log(JSON.stringify({ action: 'get', locationId, location: result }, null, 2));
      return;
    } catch {
      continue;
    }
  }
  throw new Error(`Could not retrieve location ${locationId} — no valid token found`);
}

// --- Main ---

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.log('Usage: node subaccount-provisioner.mjs <command> [args...]');
    console.log('Commands: create, list, configure, get');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'create':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await create(args[0], args.slice(1));
        break;
      case 'list':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await list(args[0]);
        break;
      case 'configure':
        if (!args[0]) throw new Error('Missing location_id');
        await configure(args[0], args.slice(1));
        break;
      case 'get':
        if (!args[0]) throw new Error('Missing location_id');
        await get(args[0]);
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
