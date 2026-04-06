#!/usr/bin/env node
/**
 * GHL SaaS Manager Skill
 * Manages GoHighLevel SaaS sub-account provisioning, plan management,
 * and subscription lifecycle via the GHL API v2 saasApi namespace.
 *
 * Primary Division: Division 8 (SaaS Operations)
 *
 * Usage: node ghl-saas-manager.mjs <command> [args...]
 *
 * Commands:
 *   list-locations <companyId>                      List SaaS locations
 *   get-subscription <locationId> <companyId>       Get subscription details
 *   get-plans <companyId>                           List agency plans
 *   get-plan <planId> <companyId>                   Get single plan details
 *   enable <locationId> <json>                      Enable SaaS for location
 *   bulk-enable <companyId> <json>                  Bulk enable SaaS
 *   disable <companyId> <json>                      Bulk disable SaaS
 *   pause <locationId> <json>                       Pause location
 *   update-subscription <locationId> <json>         Update SaaS subscription
 *   update-rebilling <companyId> <json>             Update rebilling config
 *   find-by-stripe <companyId> --customerId <id>    Find location by Stripe ID
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createGhlClientV2 } from '../lib/ghl-client-v2.mjs';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const LOG_DIR = join(OPENCLAW_ROOT, 'logs', 'saas-manager');
const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─── Helpers ────────────────────────────────────────────────────

function parseArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function log(action, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ...data,
  };
  const logFile = join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function getClient(agentId) {
  const location = parseArg('location');
  return createGhlClientV2(location, {
    agentId: agentId || parseArg('agent') || 'd8_saas_director',
    minCallSpacingMs: 3000,
  });
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { instances: {} };
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

function saveRegistry(registry) {
  registry.lastUpdated = new Date().toISOString();
  const dir = join(OPENCLAW_ROOT, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
}

// ─── Commands ───────────────────────────────────────────────────

async function listLocations(companyId) {
  const client = getClient();
  const allLocations = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await client.saasApi.getSaasLocations(companyId, { page });
    const locations = result?.locations || result?.data || [];
    allLocations.push(...locations);
    hasMore = locations.length > 0 && (result?.meta?.nextPage || locations.length >= 20);
    page++;
  }

  console.log(JSON.stringify({
    action: 'list-locations',
    companyId,
    count: allLocations.length,
    locations: allLocations.map(l => ({
      id: l.id || l._id,
      name: l.name,
      email: l.email,
      status: l.status || l.saasStatus,
      plan: l.planName || l.plan,
    })),
  }, null, 2));
}

async function getSubscription(locationId, companyId) {
  const client = getClient();
  const sub = await client.saasApi.getLocationSubscription(locationId, { companyId });
  console.log(JSON.stringify({
    action: 'get-subscription',
    locationId,
    subscription: sub,
  }, null, 2));
}

async function getPlans(companyId) {
  const client = getClient();
  const plans = await client.saasApi.getAgencyPlans(companyId);
  console.log(JSON.stringify({
    action: 'get-plans',
    companyId,
    plans,
  }, null, 2));
}

async function getPlan(planId, companyId) {
  const client = getClient();
  const plan = await client.saasApi.getSaasPlan(planId, { companyId });
  console.log(JSON.stringify({
    action: 'get-plan',
    planId,
    plan,
  }, null, 2));
}

async function enableSaas(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.saasApi.enableSaasLocation(locationId, body);

  // Update local registry
  const registry = loadRegistry();
  const instanceId = body.saas_instance_id || locationId;
  registry.instances[instanceId] = {
    ...registry.instances[instanceId],
    location_id: locationId,
    saas_enabled: true,
    enabled_at: new Date().toISOString(),
    plan: body.planId || body.plan_id,
  };
  saveRegistry(registry);

  console.log(JSON.stringify({
    action: 'enable-saas',
    locationId,
    result,
    status: 'enabled',
  }, null, 2));
}

async function bulkEnable(companyId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.saasApi.bulkEnableSaas(companyId, body);
  console.log(JSON.stringify({
    action: 'bulk-enable-saas',
    companyId,
    locationCount: body.locationIds?.length || 0,
    result,
  }, null, 2));
}

async function bulkDisable(companyId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.saasApi.bulkDisableSaas(companyId, body);
  console.log(JSON.stringify({
    action: 'bulk-disable-saas',
    companyId,
    locationCount: body.locationIds?.length || 0,
    result,
  }, null, 2));
}

async function pauseLocation(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.saasApi.pauseLocation(locationId, body);
  console.log(JSON.stringify({
    action: 'pause-location',
    locationId,
    result,
  }, null, 2));
}

async function updateSubscription(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.saasApi.generatePaymentLink(locationId, body);
  console.log(JSON.stringify({
    action: 'update-subscription',
    locationId,
    result,
  }, null, 2));
}

async function updateRebilling(companyId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.saasApi.updateRebilling(companyId, body);
  console.log(JSON.stringify({
    action: 'update-rebilling',
    companyId,
    result,
  }, null, 2));
}

async function findByStripe(companyId) {
  const client = getClient();
  const customerId = parseArg('customerId');
  const subscriptionId = parseArg('subscriptionId');
  const result = await client.saasApi.locations({ companyId, customerId, subscriptionId });
  console.log(JSON.stringify({
    action: 'find-by-stripe',
    companyId,
    customerId,
    subscriptionId,
    result,
  }, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'list-locations': () => listLocations(args[0]),
  'get-subscription': () => getSubscription(args[0], args[1]),
  'get-plans': () => getPlans(args[0]),
  'get-plan': () => getPlan(args[0], args[1]),
  'enable': () => enableSaas(args[0], args[1]),
  'bulk-enable': () => bulkEnable(args[0], args[1]),
  'disable': () => bulkDisable(args[0], args[1]),
  'pause': () => pauseLocation(args[0], args[1]),
  'update-subscription': () => updateSubscription(args[0], args[1]),
  'update-rebilling': () => updateRebilling(args[0], args[1]),
  'find-by-stripe': () => findByStripe(args[0]),
};

if (!command || !commands[command]) {
  console.error(`Usage: node ghl-saas-manager.mjs <command> [args...]
Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

try {
  await commands[command]();
} catch (error) {
  console.error(JSON.stringify({
    error: error.message,
    status: error.status || 500,
    command,
  }));
  process.exit(1);
}
