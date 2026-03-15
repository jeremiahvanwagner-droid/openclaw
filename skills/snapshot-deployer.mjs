#!/usr/bin/env node
/**
 * GHL Snapshot Deployer
 * Deploys niche snapshots into GHL sub-accounts on client signup
 *
 * Usage: node snapshot-deployer.mjs <command> [args...]
 *
 * Commands:
 *   deploy <saas_instance_id> <snapshot_id> <location_id>  Deploy snapshot into sub-account
 *   list <saas_instance_id>                                 List available snapshots
 *   status <deployment_id>                                  Check deployment status
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

function getToken(instanceId) {
  if (!existsSync(TOKENS_PATH)) {
    throw new Error('No OAuth tokens found. Run ghl-oauth-manager.mjs authorize first.');
  }
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
  const entry = tokens.instances?.[instanceId];
  if (!entry?.access_token) {
    throw new Error(`No token for instance ${instanceId}`);
  }
  if (entry.expires_at && Date.now() > entry.expires_at) {
    throw new Error(`Token expired for instance ${instanceId}. Run refresh.`);
  }
  return entry;
}

function validateInstanceId(instanceId) {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`SaaS registry not found at ${REGISTRY_PATH}`);
  }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
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
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GHL API error (${response.status}): ${err}`);
  }
  return response.json();
}

// --- Commands ---

async function deploy(instanceId, snapshotId, locationId) {
  const instance = validateInstanceId(instanceId);
  const tokenEntry = getToken(instanceId);
  const companyId = instance.ghl_company_id;

  if (!companyId) {
    throw new Error(`Missing ghl_company_id for instance ${instanceId}`);
  }

  const result = await apiCall('POST', `/snapshots/share`, tokenEntry.access_token, {
    snapshot_id: snapshotId,
    companyId,
    locationId,
    type: 'location'
  });

  console.log(JSON.stringify({
    action: 'deploy',
    status: 'initiated',
    instanceId,
    snapshotId,
    locationId,
    deploymentId: result.id || result.shareId || 'pending',
    note: 'Snapshot deployment is async. Check status with: node snapshot-deployer.mjs status <deployment_id>'
  }, null, 2));
}

async function listSnapshots(instanceId) {
  const instance = validateInstanceId(instanceId);
  const tokenEntry = getToken(instanceId);
  const companyId = instance.ghl_company_id;

  const result = await apiCall('GET', `/snapshots?companyId=${companyId}`, tokenEntry.access_token);

  const snapshots = (result.snapshots || []).map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    createdAt: s.createdAt,
    description: s.description || ''
  }));

  console.log(JSON.stringify({
    action: 'list',
    instanceId,
    total: snapshots.length,
    snapshots
  }, null, 2));
}

async function checkStatus(deploymentId) {
  // Snapshot deployment status requires company-level token
  console.log(JSON.stringify({
    action: 'status',
    deploymentId,
    note: 'Check GHL dashboard for deployment progress. Typical deployment takes 2-5 minutes.',
    recommendation: 'Verify by checking if workflows, funnels, and pipelines exist in the target location.'
  }, null, 2));
}

// --- Main ---

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.log('Usage: node snapshot-deployer.mjs <command> [args...]');
    console.log('Commands: deploy, list, status');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'deploy':
        if (!args[0] || !args[1] || !args[2]) {
          throw new Error('Usage: deploy <saas_instance_id> <snapshot_id> <location_id>');
        }
        await deploy(args[0], args[1], args[2]);
        break;
      case 'list':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await listSnapshots(args[0]);
        break;
      case 'status':
        if (!args[0]) throw new Error('Missing deployment_id');
        await checkStatus(args[0]);
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
