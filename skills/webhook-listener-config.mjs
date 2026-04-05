#!/usr/bin/env node
/**
 * Workflow Webhook Config
 * Stores OpenClaw's local registry for GHL workflow webhooks.
 *
 * Private Integration Tokens do not natively register platform webhook subscriptions,
 * so this utility manages the local source of truth for:
 * - outbound workflow webhooks configured in GHL Automation > Workflows > Custom Webhook
 * - inbound workflow webhook trigger URLs that OpenClaw posts into
 *
 * Usage: node webhook-listener-config.mjs <command> [args...]
 *
 * Commands:
 *   register <location_id> --event "<event_type>" --url "<callback>" [--direction outbound|inbound]
 *   list <location_id>
 *   test <location_id> <webhook_id>
 *   delete <location_id> <webhook_id>
 */

import { createHmac, randomBytes } from 'crypto';
import { createGhlClient } from '../lib/ghl-client.mjs';
import {
  DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH,
  loadWorkflowWebhookRegistry,
  saveWorkflowWebhookRegistry,
} from '../lib/workflow-webhook-registry.mjs';

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith('--')) continue;
    const key = args[i].slice(2);
    result[key] = (i + 1 < args.length && !args[i + 1].startsWith('--')) ? args[++i] : true;
  }
  return result;
}

function createRegistryId() {
  return `wf_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function normalizeDirection(value) {
  const direction = String(value || 'outbound').toLowerCase();
  if (!['outbound', 'inbound'].includes(direction)) {
    throw new Error('direction must be outbound or inbound');
  }
  return direction;
}

function normalizeAuthMode(value) {
  const mode = String(value || 'bearer').toLowerCase();
  if (!['bearer', 'hmac', 'none'].includes(mode)) {
    throw new Error('auth mode must be bearer, hmac, or none');
  }
  return mode;
}

function resolveRequiredSigningSecret(opts) {
  const secret = opts.signing_secret || process.env.OPENCLAW_GHL_WEBHOOK_SECRET || '';
  if (!secret) {
    throw new Error('hmac auth requires --signing-secret or OPENCLAW_GHL_WEBHOOK_SECRET');
  }
  if (['replace-with-32byte-random-secret', 'your-32-byte-random-webhook-secret'].includes(secret)) {
    throw new Error('hmac auth requires a non-placeholder signing secret');
  }
  if (secret.length < 32) {
    throw new Error('hmac auth requires a signing secret with at least 32 characters');
  }
  return secret;
}

function buildAuthConfig(opts) {
  const authMode = normalizeAuthMode(opts.auth_mode);

  if (authMode === 'none') {
    return { mode: 'none' };
  }

  if (authMode === 'bearer') {
    const token = opts.auth_token || process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || '';
    if (!token) {
      throw new Error('bearer auth requires --auth-token or OPENCLAW_GATEWAY_AUTH_TOKEN');
    }
    return { mode: 'bearer', token };
  }

  const secret = resolveRequiredSigningSecret(opts);
  return { mode: 'hmac', signingSecret: secret };
}

function buildInstructions(entry) {
  if (entry.direction === 'inbound') {
    return [
      'In GHL Workflow Builder, add the "Inbound Webhook" trigger.',
      `Use OpenClaw to POST JSON to the generated GHL URL for event "${entry.event}".`,
      entry.workflowId ? `Attach it to workflow ${entry.workflowId}.` : 'Map the payload into workflow fields in GHL.',
    ];
  }

  const authLine = entry.auth.mode === 'bearer'
    ? `Add header Authorization: Bearer ${entry.auth.token}`
    : entry.auth.mode === 'hmac'
      ? `Sign the JSON body with HMAC-SHA256 and send X-OpenClaw-Signature using secret ${entry.auth.signingSecret}`
      : 'No auth header required.';

  return [
    'In GHL Workflow Builder, add the "Custom Webhook" action.',
    `Point it at ${entry.url} using ${entry.method}.`,
    authLine,
  ];
}

async function validateLocation(locationId) {
  const client = createGhlClient(locationId);
  const resolvedLocationId = client.tenant.locationId;
  const location = await client.locations.get(resolvedLocationId);
  return {
    resolvedLocationId,
    location: location.location || location,
  };
}

async function registerWebhook(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.event) throw new Error('Required: --event "<event_type>"');
  if (!opts.url && normalizeDirection(opts.direction) === 'outbound') {
    throw new Error('Required: --url "<callback_url>" for outbound workflow webhooks');
  }

  const { resolvedLocationId, location } = await validateLocation(locationId);
  const registry = loadWorkflowWebhookRegistry(DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH);
  const entry = {
    id: createRegistryId(),
    locationId: resolvedLocationId,
    locationName: location.name || location.companyName || '',
    direction: normalizeDirection(opts.direction),
    event: opts.event,
    url: opts.url || '',
    method: String(opts.method || 'POST').toUpperCase(),
    workflowId: opts.workflow_id || '',
    description: opts.description || '',
    auth: buildAuthConfig(opts),
    createdAt: new Date().toISOString(),
    active: true,
  };

  registry.webhooks.push(entry);
  saveWorkflowWebhookRegistry(registry, DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH);

  console.log(JSON.stringify({
    action: 'register',
    webhookId: entry.id,
    locationId: resolvedLocationId,
    direction: entry.direction,
    event: entry.event,
    url: entry.url,
    authMode: entry.auth.mode,
    status: 'stored',
    instructions: buildInstructions(entry),
    note: 'Private Integration Tokens rely on GHL workflow webhooks, not direct /webhooks registration.',
  }, null, 2));
}

async function listWebhooks(locationId) {
  const { resolvedLocationId } = await validateLocation(locationId);
  const registry = loadWorkflowWebhookRegistry(DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH);
  const webhooks = registry.webhooks.filter(entry => entry.locationId === resolvedLocationId);

  console.log(JSON.stringify({
    action: 'list',
    locationId: resolvedLocationId,
    total: webhooks.length,
    webhooks: webhooks.map(entry => ({
      id: entry.id,
      direction: entry.direction,
      event: entry.event,
      url: entry.url,
      method: entry.method,
      authMode: entry.auth.mode,
      workflowId: entry.workflowId,
      active: entry.active,
      createdAt: entry.createdAt,
    })),
  }, null, 2));
}

function buildTestPayload(entry) {
  return {
    type: entry.event,
    eventType: entry.event,
    locationId: entry.locationId,
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      source: 'webhook-listener-config',
      webhookId: entry.id,
      workflowId: entry.workflowId || null,
    },
  };
}

async function testWebhook(locationId, webhookId) {
  const { resolvedLocationId } = await validateLocation(locationId);
  const registry = loadWorkflowWebhookRegistry(DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH);
  const entry = registry.webhooks.find(record => record.id === webhookId && record.locationId === resolvedLocationId);
  if (!entry) {
    throw new Error(`Webhook ${webhookId} not found for location ${locationId}`);
  }
  if (entry.direction !== 'outbound') {
    throw new Error('Only outbound workflow webhooks can be tested from this utility');
  }

  const payload = buildTestPayload(entry);
  const serialized = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };

  if (entry.auth.mode === 'bearer') {
    headers.Authorization = `Bearer ${entry.auth.token}`;
  } else if (entry.auth.mode === 'hmac') {
    headers['X-OpenClaw-Signature'] = createHmac('sha256', entry.auth.signingSecret)
      .update(serialized)
      .digest('hex');
  }

  const response = await fetch(entry.url, {
    method: entry.method,
    headers,
    body: serialized,
  });

  const responseText = await response.text();
  console.log(JSON.stringify({
    action: 'test',
    locationId: resolvedLocationId,
    webhookId,
    url: entry.url,
    responseStatus: response.status,
    success: response.ok,
    responseBody: responseText,
  }, null, 2));
}

async function deleteWebhook(locationId, webhookId) {
  const { resolvedLocationId } = await validateLocation(locationId);
  const registry = loadWorkflowWebhookRegistry(DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH);
  const next = registry.webhooks.filter(entry => !(entry.id === webhookId && entry.locationId === resolvedLocationId));
  saveWorkflowWebhookRegistry({ ...registry, webhooks: next }, DEFAULT_WORKFLOW_WEBHOOK_REGISTRY_PATH);

  console.log(JSON.stringify({
    action: 'delete',
    locationId: resolvedLocationId,
    webhookId,
    status: 'deleted',
    note: 'This removes only the local registry entry. Remove the workflow step manually inside GHL.',
  }, null, 2));
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    console.log('Usage: node webhook-listener-config.mjs <command> [args...]');
    console.log('Commands: register, list, test, delete');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'register':
        if (!args[0]) throw new Error('Missing location_id');
        await registerWebhook(args[0], args.slice(1));
        break;
      case 'list':
        if (!args[0]) throw new Error('Missing location_id');
        await listWebhooks(args[0]);
        break;
      case 'test':
        if (!args[0] || !args[1]) throw new Error('Missing location_id or webhook_id');
        await testWebhook(args[0], args[1]);
        break;
      case 'delete':
        if (!args[0] || !args[1]) throw new Error('Missing location_id or webhook_id');
        await deleteWebhook(args[0], args[1]);
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
