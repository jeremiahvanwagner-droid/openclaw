#!/usr/bin/env node
/**
 * Form & Survey Builder
 * Create custom fields, forms, and surveys via GHL API
 *
 * Usage: node form-and-survey-builder.mjs <command> [args...]
 *
 * Commands:
 *   create-form <location_id> --name "<n>" --fields "<json>"   Create form
 *   create-survey <location_id> --name "<n>" --questions "<json>"  Create survey
 *   list-forms <location_id>                                    List forms
 *   list-fields <location_id>                                   List custom fields
 *   create-field <location_id> --name "<n>" --type "<t>"       Create custom field
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

async function createForm(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<form_name>"');
  const token = findTokenForLocation(locationId);

  let fields = [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }];
  if (opts.fields) fields = JSON.parse(opts.fields);

  const result = await apiCall('POST', '/forms/', token, {
    locationId,
    name: opts.name,
    fields: fields.map(f => ({ label: f.label, fieldType: f.type, required: f.required || false })),
    buttonText: opts.button || 'Submit'
  });

  console.log(JSON.stringify({
    action: 'create-form', locationId,
    formId: result.form?.id || result.id,
    name: opts.name, fieldCount: fields.length,
    status: 'created'
  }, null, 2));
}

async function createSurvey(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name) throw new Error('Required: --name "<survey_name>"');
  const token = findTokenForLocation(locationId);

  let questions = [{ question: 'How did you hear about us?', type: 'text' }];
  if (opts.questions) questions = JSON.parse(opts.questions);

  const result = await apiCall('POST', '/surveys/', token, {
    locationId,
    name: opts.name,
    questions: questions.map(q => ({ question: q.question, type: q.type || 'text', options: q.options }))
  });

  console.log(JSON.stringify({
    action: 'create-survey', locationId,
    surveyId: result.survey?.id || result.id,
    name: opts.name, questionCount: questions.length,
    status: 'created'
  }, null, 2));
}

async function listForms(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/forms/?locationId=${locationId}`, token);
  const forms = (result.forms || []).map(f => ({ id: f.id, name: f.name, submissions: f.submissions }));
  console.log(JSON.stringify({ action: 'list-forms', locationId, total: forms.length, forms }, null, 2));
}

async function listFields(locationId) {
  const token = findTokenForLocation(locationId);
  const result = await apiCall('GET', `/locations/${locationId}/customFields`, token);
  const fields = (result.customFields || []).map(f => ({ id: f.id, name: f.name, fieldKey: f.fieldKey, dataType: f.dataType }));
  console.log(JSON.stringify({ action: 'list-fields', locationId, total: fields.length, fields }, null, 2));
}

async function createField(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.name || !opts.type) throw new Error('Required: --name "<name>" --type "<text|number|date|checkbox|select>"');
  const token = findTokenForLocation(locationId);

  const result = await apiCall('POST', `/locations/${locationId}/customFields`, token, {
    name: opts.name,
    dataType: opts.type,
    options: opts.options ? opts.options.split(',').map(o => o.trim()) : undefined
  });

  console.log(JSON.stringify({
    action: 'create-field', locationId,
    fieldId: result.customField?.id || result.id,
    name: opts.name, type: opts.type,
    status: 'created'
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node form-and-survey-builder.mjs <command> [args...]'); console.log('Commands: create-form, create-survey, list-forms, list-fields, create-field'); process.exit(1); }
  try {
    switch (command) {
      case 'create-form': if (!args[0]) throw new Error('Missing location_id'); await createForm(args[0], args.slice(1)); break;
      case 'create-survey': if (!args[0]) throw new Error('Missing location_id'); await createSurvey(args[0], args.slice(1)); break;
      case 'list-forms': if (!args[0]) throw new Error('Missing location_id'); await listForms(args[0]); break;
      case 'list-fields': if (!args[0]) throw new Error('Missing location_id'); await listFields(args[0]); break;
      case 'create-field': if (!args[0]) throw new Error('Missing location_id'); await createField(args[0], args.slice(1)); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
