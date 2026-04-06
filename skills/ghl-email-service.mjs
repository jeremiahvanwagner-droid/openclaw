#!/usr/bin/env node
/**
 * GHL Email Service Skill
 * Manages email campaigns, templates, and email verification
 * via the GHL API v2 emails + emailIsv namespaces.
 *
 * Primary Divisions: Division 2 (eCommerce), Division 3 (Consulting)
 *
 * Usage: node ghl-email-service.mjs <command> [args...]
 *
 * Commands:
 *   list-campaigns <locationId> [--status draft|scheduled|sent]  List email campaigns
 *   list-templates <locationId> [--search <term>]                 List email templates
 *   create-template <json>                                         Create email template
 *   update-template <json>                                         Update email template
 *   delete-template <locationId> <templateId>                     Delete email template
 *   verify-email <locationId> <json>                               Verify email address
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createGhlClientV2 } from '../lib/ghl-client-v2.mjs';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const LOG_DIR = join(OPENCLAW_ROOT, 'logs', 'email-service');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─── Helpers ────────────────────────────────────────────────────

function parseArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function log(action, data) {
  const entry = { timestamp: new Date().toISOString(), action, ...data };
  const logFile = join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

function getClient() {
  const location = parseArg('location');
  return createGhlClientV2(location, {
    agentId: parseArg('agent') || 'd2_digital_marketing',
    minCallSpacingMs: 3000,
  });
}

// ─── Commands ───────────────────────────────────────────────────

async function listCampaigns(locationId) {
  const client = getClient();
  const params = { locationId };
  const status = parseArg('status');
  if (status) params.status = status;
  const emailStatus = parseArg('emailStatus');
  if (emailStatus) params.emailStatus = emailStatus;
  const limit = parseArg('limit');
  if (limit) params.limit = parseInt(limit, 10);
  const offset = parseArg('offset');
  if (offset) params.offset = parseInt(offset, 10);
  params.showStats = parseArg('showStats') !== 'false';

  const result = await client.emails.fetchCampaigns(params);
  const campaigns = result?.campaigns || result?.schedules || result?.data || [];
  console.log(JSON.stringify({
    action: 'list-campaigns',
    locationId,
    count: Array.isArray(campaigns) ? campaigns.length : 0,
    campaigns: Array.isArray(campaigns) ? campaigns.map(c => ({
      id: c.id || c._id,
      name: c.name,
      status: c.status,
      emailStatus: c.emailStatus,
      scheduledAt: c.scheduledAt,
      stats: c.stats,
    })) : campaigns,
  }, null, 2));
}

async function listTemplates(locationId) {
  const client = getClient();
  const params = { locationId };
  const search = parseArg('search');
  if (search) params.search = search;
  const limit = parseArg('limit');
  if (limit) params.limit = parseInt(limit, 10);
  const offset = parseArg('offset');
  if (offset) params.offset = parseInt(offset, 10);
  params.templatesOnly = true;

  const result = await client.emails.fetchTemplate(params);
  const templates = result?.templates || result?.data || [];
  console.log(JSON.stringify({
    action: 'list-templates',
    locationId,
    count: Array.isArray(templates) ? templates.length : 0,
    templates: Array.isArray(templates) ? templates.map(t => ({
      id: t.id || t._id,
      name: t.name,
      builderVersion: t.builderVersion,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })) : templates,
  }, null, 2));
}

async function createTemplate(bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.emails.createTemplate(body);
  log('create-template', { templateId: result?.id, name: body.name });
  console.log(JSON.stringify({
    action: 'create-template',
    result,
    status: 'created',
  }, null, 2));
}

async function updateTemplate(bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.emails.updateTemplate(body);
  log('update-template', { templateId: body.templateId || body.id });
  console.log(JSON.stringify({
    action: 'update-template',
    result,
    status: 'updated',
  }, null, 2));
}

async function deleteTemplate(locationId, templateId) {
  const client = getClient();
  const result = await client.emails.deleteTemplate(locationId, templateId);
  log('delete-template', { locationId, templateId });
  console.log(JSON.stringify({
    action: 'delete-template',
    locationId,
    templateId,
    result,
    status: 'deleted',
  }, null, 2));
}

async function verifyEmail(locationId, bodyJson) {
  const client = getClient();
  const body = JSON.parse(bodyJson);
  const result = await client.emailIsv.verifyEmail({ locationId }, body);
  log('verify-email', { locationId, email: body.email });
  console.log(JSON.stringify({
    action: 'verify-email',
    locationId,
    result,
  }, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

const commands = {
  'list-campaigns': () => listCampaigns(args[0]),
  'list-templates': () => listTemplates(args[0]),
  'create-template': () => createTemplate(args[0]),
  'update-template': () => updateTemplate(args[0]),
  'delete-template': () => deleteTemplate(args[0], args[1]),
  'verify-email': () => verifyEmail(args[0], args[1]),
};

if (!command || !commands[command]) {
  console.error(`Usage: node ghl-email-service.mjs <command> [args...]
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
