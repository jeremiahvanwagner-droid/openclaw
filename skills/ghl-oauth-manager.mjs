#!/usr/bin/env node
/**
 * GHL OAuth Manager
 * Manages GoHighLevel OAuth 2.0 flows for multi-SaaS instance credential lifecycle
 *
 * Usage: node ghl-oauth-manager.mjs <command> [args...]
 *
 * Commands:
 *   authorize <saas_instance_id>    Initiate OAuth authorization flow
 *   refresh <saas_instance_id>      Refresh expired OAuth token
 *   revoke <saas_instance_id>       Revoke and cleanup tokens
 *   status                          Show token health for all instances
 *   validate <saas_instance_id>     Validate token is active
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const OPENCLAW_ROOT = join(process.env.USERPROFILE || process.env.HOME || '', '.openclaw');
const TOKENS_PATH = join(OPENCLAW_ROOT, 'credentials', 'ghl-oauth-tokens.json');
const REGISTRY_PATH = join(OPENCLAW_ROOT, 'data', 'saas-instances.json');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const OAUTH_BASE = 'https://marketplace.gohighlevel.com/oauth/chooselocation';
const TOKEN_ENDPOINT = 'https://services.leadconnectorhq.com/oauth/token';

// Rate limit: minimum spacing between GHL API calls (ms)
const MIN_CALL_SPACING_MS = 600; // 100 req/min = 600ms spacing
let lastCallAt = 0;

function loadTokens() {
  if (!existsSync(TOKENS_PATH)) {
    return { instances: {}, lastUpdated: null };
  }
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf-8'));
}

function saveTokens(tokens) {
  tokens.lastUpdated = new Date().toISOString();
  const dir = join(OPENCLAW_ROOT, 'credentials');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + '\n', 'utf-8');
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`SaaS registry not found at ${REGISTRY_PATH}. Run setup first.`);
  }
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

function validateInstanceId(instanceId) {
  const registry = loadRegistry();
  const instance = registry.instances?.[instanceId];
  if (!instance) {
    throw new Error(`Unknown saas_instance_id: ${instanceId}. Check data/saas-instances.json`);
  }
  return instance;
}

async function rateLimitedFetch(url, options) {
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < MIN_CALL_SPACING_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_SPACING_MS - elapsed));
  }
  lastCallAt = Date.now();
  return fetch(url, options);
}

// --- Commands ---

async function authorize(instanceId) {
  const instance = validateInstanceId(instanceId);
  const clientId = instance.ghl_client_id;
  const clientSecret = instance.ghl_client_secret;

  if (!clientId || !clientSecret) {
    throw new Error(`Missing ghl_client_id or ghl_client_secret for instance: ${instanceId}`);
  }

  // Build the OAuth authorization URL
  const scopes = [
    'contacts.readonly', 'contacts.write',
    'locations.readonly', 'locations.write',
    'opportunities.readonly', 'opportunities.write',
    'calendars.readonly', 'calendars.write',
    'workflows.readonly',
    'invoices.readonly', 'invoices.write',
    'funnels.readonly', 'funnels.write',
    'medias.readonly', 'medias.write',
    'surveys.readonly',
    'forms.readonly',
    'links.readonly', 'links.write',
    'campaigns.readonly',
    'conversations.readonly', 'conversations.write',
    'businesses.readonly', 'businesses.write',
    'snapshots.readonly',
    'oauth.readonly', 'oauth.write'
  ].join(' ');

  const redirectUri = instance.oauth_redirect_uri || 'https://openclaw.truthjblue.com/oauth/callback';

  const authUrl = `${OAUTH_BASE}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

  console.log(JSON.stringify({
    action: 'authorize',
    instanceId,
    status: 'pending_user_action',
    authorizationUrl: authUrl,
    instructions: 'Open this URL in a browser to authorize. After approval, the callback will provide an authorization code.',
    nextStep: `After receiving the auth code, exchange it by calling: node ghl-oauth-manager.mjs exchange ${instanceId} <auth_code>`
  }, null, 2));
}

async function exchangeCode(instanceId, authCode) {
  const instance = validateInstanceId(instanceId);
  const clientId = instance.ghl_client_id;
  const clientSecret = instance.ghl_client_secret;
  const redirectUri = instance.oauth_redirect_uri || 'https://openclaw.truthjblue.com/oauth/callback';

  const response = await rateLimitedFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: authCode,
      redirect_uri: redirectUri
    }).toString()
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${err}`);
  }

  const tokenData = await response.json();
  const tokens = loadTokens();
  tokens.instances[instanceId] = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in * 1000),
    location_id: tokenData.locationId || instance.ghl_location_id,
    token_type: tokenData.token_type || 'Bearer',
    scope: tokenData.scope,
    obtained_at: new Date().toISOString(),
    last_refreshed: null
  };
  saveTokens(tokens);

  console.log(JSON.stringify({
    action: 'exchange',
    instanceId,
    status: 'success',
    location_id: tokens.instances[instanceId].location_id,
    expires_at: new Date(tokens.instances[instanceId].expires_at).toISOString()
  }, null, 2));
}

async function refresh(instanceId) {
  validateInstanceId(instanceId);
  const instance = validateInstanceId(instanceId);
  const tokens = loadTokens();
  const tokenEntry = tokens.instances[instanceId];

  if (!tokenEntry?.refresh_token) {
    throw new Error(`No refresh token found for instance: ${instanceId}. Run authorize first.`);
  }

  const response = await rateLimitedFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: instance.ghl_client_id,
      client_secret: instance.ghl_client_secret,
      refresh_token: tokenEntry.refresh_token
    }).toString()
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${err}`);
  }

  const tokenData = await response.json();
  tokens.instances[instanceId] = {
    ...tokenEntry,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || tokenEntry.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in * 1000),
    last_refreshed: new Date().toISOString()
  };
  saveTokens(tokens);

  console.log(JSON.stringify({
    action: 'refresh',
    instanceId,
    status: 'success',
    expires_at: new Date(tokens.instances[instanceId].expires_at).toISOString()
  }, null, 2));
}

async function revoke(instanceId) {
  validateInstanceId(instanceId);
  const tokens = loadTokens();

  if (tokens.instances[instanceId]) {
    delete tokens.instances[instanceId];
    saveTokens(tokens);
  }

  console.log(JSON.stringify({
    action: 'revoke',
    instanceId,
    status: 'success',
    message: 'Token revoked and removed from credential store'
  }, null, 2));
}

async function validate(instanceId) {
  validateInstanceId(instanceId);
  const tokens = loadTokens();
  const tokenEntry = tokens.instances[instanceId];

  if (!tokenEntry) {
    console.log(JSON.stringify({ instanceId, valid: false, reason: 'no_token' }, null, 2));
    return;
  }

  const now = Date.now();
  const expiresIn = tokenEntry.expires_at - now;
  const isExpired = expiresIn <= 0;
  const isExpiringSoon = expiresIn > 0 && expiresIn < 3600000; // < 1 hour

  if (isExpired) {
    console.log(JSON.stringify({
      instanceId,
      valid: false,
      reason: 'expired',
      expired_at: new Date(tokenEntry.expires_at).toISOString(),
      recommendation: 'Run refresh command'
    }, null, 2));
    return;
  }

  // Test with a lightweight API call
  const response = await rateLimitedFetch(`${GHL_BASE}/locations/${tokenEntry.location_id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${tokenEntry.access_token}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    }
  });

  console.log(JSON.stringify({
    instanceId,
    valid: response.ok,
    status: response.status,
    expires_in_hours: Math.round(expiresIn / 3600000 * 10) / 10,
    warning: isExpiringSoon ? 'Token expires within 1 hour — consider refreshing' : null,
    last_refreshed: tokenEntry.last_refreshed
  }, null, 2));
}

function status() {
  const tokens = loadTokens();
  const now = Date.now();
  const report = {};

  for (const [id, entry] of Object.entries(tokens.instances || {})) {
    const expiresIn = entry.expires_at - now;
    report[id] = {
      has_token: true,
      location_id: entry.location_id,
      expired: expiresIn <= 0,
      expires_in_hours: Math.round(expiresIn / 3600000 * 10) / 10,
      last_refreshed: entry.last_refreshed,
      obtained_at: entry.obtained_at,
      health: expiresIn <= 0 ? 'EXPIRED' : expiresIn < 3600000 ? 'WARNING' : 'HEALTHY'
    };
  }

  console.log(JSON.stringify({
    action: 'status',
    total_instances: Object.keys(report).length,
    instances: report,
    tokens_path: TOKENS_PATH
  }, null, 2));
}

// --- Main ---

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.log('Usage: node ghl-oauth-manager.mjs <command> [args...]');
    console.log('Commands: authorize, exchange, refresh, revoke, validate, status');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'authorize':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await authorize(args[0]);
        break;
      case 'exchange':
        if (!args[0] || !args[1]) throw new Error('Missing saas_instance_id or auth_code');
        await exchangeCode(args[0], args[1]);
        break;
      case 'refresh':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await refresh(args[0]);
        break;
      case 'revoke':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await revoke(args[0]);
        break;
      case 'validate':
        if (!args[0]) throw new Error('Missing saas_instance_id');
        await validate(args[0]);
        break;
      case 'status':
        status();
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
