#!/usr/bin/env node
/**
 * GHL Workflow Builder
 * Creates and manages GHL workflows via API from structured JSON workflow maps
 *
 * Usage: node ghl-workflow-builder.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> --file "<json_path>"       Create workflow from JSON map
 *   list <location_id>                               List all workflows
 *   get <location_id> <workflow_id>                  Get workflow details
 *   toggle <location_id> <workflow_id> --state <on|off>  Enable/disable workflow
 *   delete <location_id> <workflow_id>               Delete a workflow
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

async function createWorkflow(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.file) throw new Error('Required: --file "<json_path>"');
  const filePath = opts.file.startsWith('/') || opts.file.includes(':') ? opts.file : join(OPENCLAW_ROOT, opts.file);
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const workflowMap = JSON.parse(readFileSync(filePath, 'utf-8'));
  const token = findTokenForLocation(locationId);

  // Build GHL workflow payload from structured map
  const payload = {
    locationId,
    name: workflowMap.workflow_name || 'Unnamed Workflow',
    description: workflowMap.description || '',
    triggers: (workflowMap.triggers || []).map(t => ({ type: t.type, ...t.config })),
    actions: (workflowMap.steps || []).map(step => ({
      type: step.action_type || step.type,
      ...step.config,
      id: step.id
    }))
  };

  const result = await apiCall('POST', '/workflows/', token, payload);

  console.log(JSON.stringify({
    action: 'create', locationId,
    workflowId: result.workflow?.id || result.id,
    name: payload.name,
    triggerCount: payload.triggers.length,
    stepCount: payload.actions.length,
    complianceNotes: workflowMap.compliance_notes || [],
    status: 'created'
  }, null, 2));
}

async function listWorkflows(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/workflows/?locationId=${locationId}`, token);
  const workflows = (result.workflows || []).map(w => ({
    id: w.id, name: w.name, status: w.status, createdAt: w.createdAt
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: workflows.length, workflows }, null, 2));
}

async function getWorkflow(locationId, workflowId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/workflows/${workflowId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, workflow: result }, null, 2));
}

async function toggleWorkflow(locationId, workflowId, args) {
  const opts = parseArgs(args);
  if (!opts.state || !['on', 'off'].includes(opts.state)) throw new Error('Required: --state <on|off>');
  const token = findTokenForLocation(locationId);
  const active = opts.state === 'on';
  await apiCall('PATCH', `/workflows/${workflowId}`, token, { active });
  console.log(JSON.stringify({ action: 'toggle', locationId, workflowId, active, status: 'success' }, null, 2));
}

async function deleteWorkflow(locationId, workflowId) {
  const token = findTokenForLocation(locationId);
  await apiCall('DELETE', `/workflows/${workflowId}`, token);
  console.log(JSON.stringify({ action: 'delete', locationId, workflowId, status: 'deleted' }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node ghl-workflow-builder.mjs <command> [args...]'); console.log('Commands: create, list, get, toggle, delete'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0]) throw new Error('Missing location_id'); await createWorkflow(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listWorkflows(args[0]); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or workflow_id'); await getWorkflow(args[0], args[1]); break;
      case 'toggle': if (!args[0] || !args[1]) throw new Error('Missing location_id or workflow_id'); await toggleWorkflow(args[0], args[1], args.slice(2)); break;
      case 'delete': if (!args[0] || !args[1]) throw new Error('Missing location_id or workflow_id'); await deleteWorkflow(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
