#!/usr/bin/env node
/**
 * Pipeline Manager
 * Creates and manages GHL sales pipelines and stages
 *
 * Usage: node pipeline-manager.mjs <command> [args...]
 *
 * Commands:
 *   create <location_id> --name "<name>" --stages "<s1,s2,s3>"   Create pipeline
 *   list <location_id>                                             List pipelines
 *   get <location_id> <pipeline_id>                               Get pipeline details
 *   add-stage <location_id> <pipeline_id> --name "<stage>"       Add stage
 *   reorder <location_id> <pipeline_id> --stages "<s1,s2,s3>"   Reorder stages
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

async function createPipeline(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<pipeline_name>"');
  const token = findTokenForLocation(locationId);

  const stages = (opts.stages || 'New,Qualified,Proposal,Won,Lost').split(',').map((name, i) => ({
    name: name.trim(), position: i
  }));

  const result = await apiCall('POST', '/opportunities/pipelines/', token, {
    locationId, name: opts.name, stages
  });

  console.log(JSON.stringify({
    action: 'create', locationId,
    pipelineId: result.pipeline?.id || result.id,
    name: opts.name, stageCount: stages.length,
    stages: stages.map(s => s.name),
    status: 'created'
  }, null, 2));
}

async function listPipelines(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/opportunities/pipelines?locationId=${locationId}`, token);
  const pipelines = (result.pipelines || []).map(p => ({
    id: p.id, name: p.name, stageCount: (p.stages || []).length,
    stages: (p.stages || []).map(s => s.name)
  }));
  console.log(JSON.stringify({ action: 'list', locationId, total: pipelines.length, pipelines }, null, 2));
}

async function getPipeline(locationId, pipelineId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/opportunities/pipelines/${pipelineId}?locationId=${locationId}`, token);
  console.log(JSON.stringify({ action: 'get', locationId, pipeline: result }, null, 2));
}

async function addStage(locationId, pipelineId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<stage_name>"');
  const token = findTokenForLocation(locationId);

  // Get current pipeline to determine position
  const pipeline = await apiCall('GET', `/opportunities/pipelines/${pipelineId}?locationId=${locationId}`, token);
  const position = (pipeline.stages || []).length;

  await apiCall('POST', `/opportunities/pipelines/${pipelineId}/stages`, token, {
    name: opts.name, position
  });

  console.log(JSON.stringify({
    action: 'add-stage', locationId, pipelineId,
    stageName: opts.name, position, status: 'added'
  }, null, 2));
}

async function reorderStages(locationId, pipelineId, args) {
  const opts = parseArgs(args);
  if (!opts.stages) throw new Error('Required: --stages "<stage1,stage2,stage3>"');
  const stageNames = opts.stages.split(',').map(s => s.trim());
  const token = findTokenForLocation(locationId);

  const pipeline = await apiCall('GET', `/opportunities/pipelines/${pipelineId}?locationId=${locationId}`, token);
  const stageMap = {};
  for (const s of (pipeline.stages || [])) { stageMap[s.name.toLowerCase()] = s.id; }

  const reordered = stageNames.map((name, i) => {
    const id = stageMap[name.toLowerCase()];
    if (!id) throw new Error(`Stage "${name}" not found in pipeline`);
    return { id, position: i };
  });

  await apiCall('PUT', `/opportunities/pipelines/${pipelineId}`, token, {
    stages: reordered
  });

  console.log(JSON.stringify({
    action: 'reorder', locationId, pipelineId,
    newOrder: stageNames, status: 'reordered'
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node pipeline-manager.mjs <command> [args...]'); console.log('Commands: create, list, get, add-stage, reorder'); process.exit(1); }
  try {
    switch (command) {
      case 'create': if (!args[0]) throw new Error('Missing location_id'); await createPipeline(args[0], args.slice(1)); break;
      case 'list': if (!args[0]) throw new Error('Missing location_id'); await listPipelines(args[0]); break;
      case 'get': if (!args[0] || !args[1]) throw new Error('Missing location_id or pipeline_id'); await getPipeline(args[0], args[1]); break;
      case 'add-stage': if (!args[0] || !args[1]) throw new Error('Missing location_id or pipeline_id'); await addStage(args[0], args[1], args.slice(2)); break;
      case 'reorder': if (!args[0] || !args[1]) throw new Error('Missing location_id or pipeline_id'); await reorderStages(args[0], args[1], args.slice(2)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
