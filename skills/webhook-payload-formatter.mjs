#!/usr/bin/env node
/**
 * Webhook Payload Formatter
 * Format and send structured JSON payloads to external integrations
 *
 * Usage: node webhook-payload-formatter.mjs <command> [args...]
 *
 * Commands:
 *   send --url "<u>" --type "<zapier|make|slack|custom>" --data '<json>'
 *   test --url "<u>"                        Send test ping
 *   log [--days <n>]                        View send history
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const LOG_PATH = join(OPENCLAW_ROOT, 'data', 'webhook-send-log.json');
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000;

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

function loadLog() {
  if (!existsSync(LOG_PATH)) return { sends: [] };
  return JSON.parse(readFileSync(LOG_PATH, 'utf-8'));
}

function saveLog(data) {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error('Only HTTPS URLs allowed (except localhost)');
    }
    return parsed;
  } catch (e) {
    if (e.message.includes('HTTPS')) throw e;
    throw new Error(`Invalid URL: ${url}`);
  }
}

function formatPayload(type, data) {
  const ts = new Date().toISOString();
  switch (type) {
    case 'zapier': {
      // Flatten nested objects for Zapier
      const flat = {};
      const flatten = (obj, prefix = '') => {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}_${k}` : k;
          if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
          else flat[key] = v;
        }
      };
      flatten(data);
      return { event: data.event || 'openclaw_event', timestamp: ts, ...flat };
    }
    case 'make':
      return { trigger: data.event || 'openclaw_trigger', payload: data, metadata: { source: 'openclaw', sent_at: ts } };
    case 'slack':
      return { text: data.summary || data.message || JSON.stringify(data).slice(0, 200), blocks: [{ type: 'section', text: { type: 'mrkdwn', text: data.message || data.summary || 'OpenClaw notification' }}] };
    case 'discord':
      return { content: data.message || data.summary || 'OpenClaw notification', embeds: data.embeds || [] };
    default:
      return { ...data, _source: 'openclaw', _sent_at: ts };
  }
}

function redactSensitive(obj) {
  const sensitiveKeys = ['token', 'password', 'secret', 'api_key', 'apiKey', 'access_token', 'refresh_token'];
  const redacted = { ...obj };
  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) redacted[key] = '[REDACTED]';
    else if (typeof redacted[key] === 'object' && redacted[key]) redacted[key] = redactSensitive(redacted[key]);
  }
  return redacted;
}

async function sendWithRetry(url, payload, headers = {}) {
  let lastError = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * Math.pow(2, attempt - 1)));

    try {
      const start = Date.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      });
      const duration = Date.now() - start;
      const body = await response.text();

      if (response.ok) {
        return { status: 'sent', http_status: response.status, attempts: attempt + 1, response_body: body.slice(0, 500), duration_ms: duration };
      }
      lastStatus = response.status;
      lastError = body.slice(0, 500);
    } catch (error) {
      lastError = error.message;
    }
  }

  return { status: 'failed', http_status: lastStatus, attempts: MAX_RETRIES + 1, error: lastError };
}

async function sendWebhook(args) {
  const opts = parseArgs(args);
  if (!opts.url || !opts.type || !opts.data) throw new Error('Required: --url "<url>" --type "<type>" --data \'<json>\'');

  validateUrl(opts.url);
  const data = JSON.parse(opts.data);
  const payload = formatPayload(opts.type, data);
  const headers = opts.auth ? { 'Authorization': `Bearer ${opts.auth}` } : {};

  const result = await sendWithRetry(opts.url, payload, headers);
  result.destination = opts.url;
  result.payload_size_bytes = Buffer.byteLength(JSON.stringify(payload));
  result.sent_at = new Date().toISOString();

  // Log (with redaction)
  const log = loadLog();
  log.sends.push({ ...result, payload: redactSensitive(payload) });
  if (log.sends.length > 500) log.sends = log.sends.slice(-500);
  saveLog(log);

  console.log(JSON.stringify(result, null, 2));
}

async function testWebhook(args) {
  const opts = parseArgs(args);
  if (!opts.url) throw new Error('Required: --url "<url>"');
  validateUrl(opts.url);
  const payload = { test: true, source: 'openclaw', timestamp: new Date().toISOString() };
  const result = await sendWithRetry(opts.url, payload);
  console.log(JSON.stringify({ action: 'test', ...result, destination: opts.url }, null, 2));
}

function viewLog(args) {
  const opts = parseArgs(args);
  const days = parseInt(opts.days || '7', 10);
  const cutoff = new Date(Date.now() - days * 86400000);
  const log = loadLog();
  const recent = log.sends.filter(s => new Date(s.sent_at) >= cutoff);
  const sent = recent.filter(s => s.status === 'sent').length;
  const failed = recent.filter(s => s.status === 'failed').length;
  console.log(JSON.stringify({ action: 'log', days, total: recent.length, sent, failed, sends: recent.slice(-20) }, null, 2));
}

async function main() {
  const [,, command, ...args] = process.argv;
  if (!command) { console.log('Usage: node webhook-payload-formatter.mjs <command> [args...]'); console.log('Commands: send, test, log'); process.exit(1); }
  try {
    switch (command) {
      case 'send': await sendWebhook(args); break;
      case 'test': await testWebhook(args); break;
      case 'log': viewLog(args); break;
      default: console.error(`Unknown command: ${command}`); process.exit(1);
    }
  } catch (error) { console.error('Error:', error.message); process.exit(1); }
}

main();
