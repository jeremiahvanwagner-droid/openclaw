#!/usr/bin/env node
/**
 * Divine Path Walkers Welcome
 * Trigger a personalized welcome sequence for new Divine Path Walkers members via GHL.
 *
 * Usage: node divine-path-walkers-welcome.mjs <command> [args...]
 *
 * Commands:
 *   welcome <location_id> <contact_id>
 *       Tag member, add to pipeline, send SMS + email, create 3-day follow-up task
 *
 *   check-new <location_id>
 *       List contacts tagged "dpw-member" in last 7 days missing "welcome-sequence-active"
 *
 *   task-followup <location_id> <contact_id>
 *       Create a 3-day follow-up task for the contact
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
  const options = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Version': API_VERSION, 'Content-Type': 'application/json' }
  };
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

function buildWelcomeSms(firstName) {
  return `Welcome to Divine Path Walkers, ${firstName}. You stepped into a space built for Children of God who are ready to walk in their full power and purpose. We're glad you're here. — Truth J Blue`;
}

function buildWelcomeEmailSubject(firstName) {
  return `Welcome home, ${firstName} — your Divine journey begins now`;
}

async function findOrCreatePipelineStage(locationId, token) {
  const result = await apiCall('GET', `/opportunities/pipelines?locationId=${locationId}`, token);
  const pipelines = result.pipelines || [];
  const dpw = pipelines.find(p => p.name?.toLowerCase().includes('divine path walkers'));
  if (!dpw) return { pipelineId: null, stageId: null };
  const stage = (dpw.stages || []).find(s => s.name?.toLowerCase().includes('new member'));
  return { pipelineId: dpw.id, stageId: stage?.id || null };
}

async function createTask(token, locationId, contactId, firstName) {
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const result = await apiCall('POST', `/contacts/${contactId}/tasks`, token, {
    locationId,
    title: `Check in with ${firstName} — Divine Path Walkers Day 3`,
    dueDate,
    status: 'incompleted'
  });
  return { taskId: result.task?.id || result.id || null, dueDate };
}

async function welcome(locationId, contactId) {
  const token = findTokenForLocation(locationId);

  const contactData = await apiCall('GET', `/contacts/${contactId}`, token);
  const c = contactData.contact || contactData;
  const firstName = c.firstName || 'friend';
  const currentTags = c.tags || [];

  const tagsToAdd = ['dpw-member', 'welcome-sequence-active'].filter(t => !currentTags.includes(t));
  const updatedTags = [...currentTags, ...tagsToAdd];
  await apiCall('PUT', `/contacts/${contactId}`, token, { tags: updatedTags });

  const { pipelineId, stageId } = await findOrCreatePipelineStage(locationId, token);
  if (pipelineId && stageId) {
    await apiCall('POST', '/opportunities/', token, {
      locationId,
      contactId,
      pipelineId,
      pipelineStageId: stageId,
      name: `${firstName} — Divine Path Walkers`,
      status: 'open'
    });
  }

  let smsSent = false;
  if (c.phone) {
    await apiCall('POST', '/conversations/messages', token, {
      type: 'SMS',
      contactId,
      locationId,
      message: buildWelcomeSms(firstName)
    });
    smsSent = true;
  }

  let emailSent = false;
  if (c.email) {
    await apiCall('POST', '/conversations/messages', token, {
      type: 'Email',
      contactId,
      locationId,
      subject: buildWelcomeEmailSubject(firstName),
      html: `<p>${buildWelcomeSms(firstName)}</p>`
    });
    emailSent = true;
  }

  const { taskId, dueDate } = await createTask(token, locationId, contactId, firstName);

  console.log(JSON.stringify({
    action: 'welcome',
    contactId,
    tagsAdded: tagsToAdd,
    pipelineUpdated: !!(pipelineId && stageId),
    smsSent,
    emailSent,
    taskCreated: !!taskId,
    taskId,
    dueDate,
    timestamp: new Date().toISOString()
  }, null, 2));
}

async function checkNew(locationId) {
  const token = findTokenForLocation(locationId);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = await apiCall(
    'GET',
    `/contacts/?locationId=${locationId}&tags=dpw-member&startAfter=${encodeURIComponent(since)}&limit=100`,
    token
  );

  const contacts = result.contacts || [];
  const needsWelcome = contacts
    .filter(c => !(c.tags || []).includes('welcome-sequence-active'))
    .map(c => ({
      contactId: c.id,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
      joinDate: c.dateAdded || c.createdAt
    }));

  console.log(JSON.stringify({
    action: 'check-new',
    locationId,
    windowDays: 7,
    total: needsWelcome.length,
    contacts: needsWelcome
  }, null, 2));
}

async function taskFollowup(locationId, contactId) {
  const token = findTokenForLocation(locationId);

  const contactData = await apiCall('GET', `/contacts/${contactId}`, token);
  const c = contactData.contact || contactData;
  const firstName = c.firstName || 'friend';

  const { taskId, dueDate } = await createTask(token, locationId, contactId, firstName);

  console.log(JSON.stringify({
    action: 'task-followup',
    contactId,
    firstName,
    taskId,
    dueDate,
    title: `Check in with ${firstName} — Divine Path Walkers Day 3`,
    timestamp: new Date().toISOString()
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) {
    console.log('Usage: node divine-path-walkers-welcome.mjs <command> [args...]');
    console.log('Commands: welcome, check-new, task-followup');
    process.exit(1);
  }
  try {
    switch (command) {
      case 'welcome':
        if (!args[0] || !args[1]) throw new Error('Usage: welcome <location_id> <contact_id>');
        await welcome(args[0], args[1]);
        break;
      case 'check-new':
        if (!args[0]) throw new Error('Missing location_id');
        await checkNew(args[0]);
        break;
      case 'task-followup':
        if (!args[0] || !args[1]) throw new Error('Usage: task-followup <location_id> <contact_id>');
        await taskFollowup(args[0], args[1]);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
