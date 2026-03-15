#!/usr/bin/env node
/**
 * Opportunity Mover
 * Moves opportunities through GHL pipeline stages based on events
 *
 * Usage: node opportunity-mover.mjs <command> [args...]
 *
 * Commands:
 *   move <location_id> <opportunity_id> --stage "<stage_name>"              Move to stage
 *   create <location_id> <contact_id> <pipeline_id> --stage "<stage>"      Create opportunity
 *   list <location_id> <pipeline_id>                                        List opportunities
 *   get <location_id> <opportunity_id>                                      Get opportunity details
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

async function moveOpportunity(locationId, opportunityId, args) {
  const opts = parseArgs(args);
  if (!opts.stage) throw new Error('Required: --stage "<stage_name>"');
  const token = findTokenForLocation(locationId);

  // Get pipeline stages to resolve stage name to ID
  const opp = await apiCall('GET', `/opportunities/${opportunityId}`, token);
  const pipeline = await apiCall('GET', `/opportunities/pipelines/${opp.pipelineId}?locationId=${locationId}`, token);
  const stage = (pipeline.stages || []).find(s => s.name.toLowerCase() === opts.stage.toLowerCase());

  if (!stage) {
    const available = (pipeline.stages || []).map(s => s.name).join(', ');
    throw new Error(`Stage "${opts.stage}" not found. Available: ${available}`);
  }

  await apiCall('PUT', `/opportunities/${opportunityId}`, token, {
    pipelineStageId: stage.id
  });

  console.log(JSON.stringify({
    action: 'move', locationId, opportunityId,
    fromStage: opp.pipelineStageName, toStage: opts.stage,
    stageId: stage.id, status: 'success'
  }, null, 2));
}

async function createOpportunity(locationId, contactId, pipelineId, args) {
  const opts = parseArgs(args);
  const token = findTokenForLocation(locationId);

  const pipeline = await apiCall('GET', `/opportunities/pipelines/${pipelineId}?locationId=${locationId}`, token);
  let stageId = (pipeline.stages || [])[0]?.id;

  if (opts.stage) {
    const match = (pipeline.stages || []).find(s => s.name.toLowerCase() === opts.stage.toLowerCase());
    if (match) stageId = match.id;
  }

  const result = await apiCall('POST', '/opportunities/', token, {
    locationId,
    contactId,
    pipelineId,
    pipelineStageId: stageId,
    name: opts.name || `Opportunity - ${contactId}`,
    monetaryValue: opts.value ? parseFloat(opts.value) : 0,
    status: 'open'
  });

  console.log(JSON.stringify({
    action: 'create', locationId, contactId, pipelineId,
    opportunityId: result.opportunity?.id || result.id,
    stage: opts.stage || 'first stage',
    status: 'success'
  }, null, 2));
}

async function listOpportunities(locationId, pipelineId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&limit=100`, token);

  const opps = (result.opportunities || []).map(o => ({
    id: o.id, name: o.name, contactId: o.contactId,
    stage: o.pipelineStageName, monetaryValue: o.monetaryValue,
    status: o.status, dateAdded: o.dateAdded
  }));

  console.log(JSON.stringify({ action: 'list', locationId, pipelineId, total: opps.length, opportunities: opps }, null, 2));
}

async function getOpportunity(locationId, opportunityId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/opportunities/${opportunityId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, opportunity: result }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node opportunity-mover.mjs <command> [args...]'); console.log('Commands: move, create, list, get'); process.exit(1); }
  try {
    switch (command) {
      case 'move': if (!args[0] || !args[1]) throw new Error('Missing location_id or opportunity_id'); await moveOpportunity(args[0], args[1], args.slice(2)); break;
      case 'create': if (!args[0] || !args[1] || !args[2]) throw new Error('Usage: create <location_id> <contact_id> <pipeline_id>'); await createOpportunity(args[0], args[1], args[2], args.slice(3)); break;
      case 'list': if (!args[0] || !args[1]) throw new Error('Usage: list <location_id> <pipeline_id>'); await listOpportunities(args[0], args[1]); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or opportunity_id'); await getOpportunity(args[0], args[1]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
