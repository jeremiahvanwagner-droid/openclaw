#!/usr/bin/env node
/**
 * CSAT Collector
 * Collect and analyze Customer Satisfaction scores via GHL surveys/SMS
 *
 * Usage: node csat-collector.mjs <command> [args...]
 *
 * Commands:
 *   send <location_id> --contact_id "<c>" --channel "<sms|email>"   Send CSAT survey
 *   record <location_id> --contact_id "<c>" --score <1-5> [--comment "<c>"]
 *   report <location_id> [--days <n>]                               CSAT report
 *   alerts <location_id>                                            Low-score alerts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const CSAT_PATH = join(OPENCLAW_ROOT, 'data', 'csat-responses.json');
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

function loadCsat() {
  if (!existsSync(CSAT_PATH)) return { responses: [] };
  return JSON.parse(readFileSync(CSAT_PATH, 'utf-8'));
}

function saveCsat(data) {
  const dir = dirname(CSAT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CSAT_PATH, JSON.stringify(data, null, 2), 'utf-8');
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

async function sendSurvey(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.channel) throw new Error('Required: --contact_id "<id>" --channel "<sms|email>"');
  const token = findTokenForLocation(locationId);

  const message = 'How would you rate your experience? Reply with a number 1-5 (1=Poor, 5=Excellent)';

  if (opts.channel === 'sms') {
    await apiCall('POST', `/conversations/messages`, token, {
      type: 'SMS', contactId: opts.contact_id, message
    });
  } else {
    await apiCall('POST', `/conversations/messages`, token, {
      type: 'Email', contactId: opts.contact_id,
      subject: 'How was your experience?',
      message: `<p>${message}</p>`
    });
  }

  console.log(JSON.stringify({ action: 'send', locationId, contactId: opts.contact_id, channel: opts.channel, status: 'sent' }, null, 2));
}

function recordScore(locationId, args) {
  const opts = parseArgs(args);
  if (!opts.contact_id || !opts.score) throw new Error('Required: --contact_id "<id>" --score <1-5>');
  const score = parseInt(opts.score, 10);
  if (score < 1 || score > 5) throw new Error('Score must be 1-5');

  const csat = loadCsat();
  csat.responses.push({
    locationId, contactId: opts.contact_id,
    score, comment: opts.comment || null,
    recordedAt: new Date().toISOString()
  });
  saveCsat(csat);

  const label = score >= 4 ? 'satisfied' : score === 3 ? 'neutral' : 'dissatisfied';
  console.log(JSON.stringify({ action: 'record', locationId, contactId: opts.contact_id, score, label, status: 'recorded' }, null, 2));
}

function csatReport(locationId, args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '30', 10);
  const cutoff = new Date(Date.now() - days * 86400000);
  const csat = loadCsat();
  const responses = csat.responses.filter(r => r.locationId === locationId && new Date(r.recordedAt) >= cutoff);

  if (responses.length === 0) {
    console.log(JSON.stringify({ action: 'report', locationId, days, total: 0, avgScore: 'N/A', nps: 'N/A' }, null, 2));
    return;
  }

  const avgScore = (responses.reduce((s, r) => s + r.score, 0) / responses.length).toFixed(2);
  const promoters = responses.filter(r => r.score >= 4).length;
  const detractors = responses.filter(r => r.score <= 2).length;
  const nps = Math.round((promoters - detractors) / responses.length * 100);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  responses.forEach(r => distribution[r.score]++);

  console.log(JSON.stringify({
    action: 'report', locationId, days,
    total: responses.length, avgScore: parseFloat(avgScore),
    nps, distribution,
    sentiment: parseFloat(avgScore) >= 4 ? 'positive' : parseFloat(avgScore) >= 3 ? 'neutral' : 'negative'
  }, null, 2));
}

function lowScoreAlerts(locationId) {
  const csat = loadCsat();
  const recent = csat.responses
    .filter(r => r.locationId === locationId && r.score <= 2)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, 20);

  console.log(JSON.stringify({
    action: 'alerts', locationId,
    lowScoreCount: recent.length,
    alerts: recent.map(r => ({
      contactId: r.contactId, score: r.score,
      comment: r.comment, recordedAt: r.recordedAt,
      urgency: r.score === 1 ? 'critical' : 'high'
    }))
  }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node csat-collector.mjs <command> [args...]'); console.log('Commands: send, record, report, alerts'); process.exit(1); }
  try {
    switch (command) {
      case 'send': if (!args[0]) throw new Error('Missing location_id'); await sendSurvey(args[0], args.slice(1)); break;
      case 'record': if (!args[0]) throw new Error('Missing location_id'); recordScore(args[0], args.slice(1)); break;
      case 'report': if (!args[0]) throw new Error('Missing location_id'); csatReport(args[0], args.slice(1)); break;
      case 'alerts': if (!args[0]) throw new Error('Missing location_id'); lowScoreAlerts(args[0]); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
