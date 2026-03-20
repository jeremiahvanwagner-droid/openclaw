import { readFileSync } from 'fs';

/**
 * GHL Multi-Tenant Token Resolver
 *
 * Resolves the correct Private Integration Token and Location ID for
 * GoHighLevel sub-accounts.  Every skill that needs GHL API access
 * should call `resolve()` instead of reading env vars directly.
 *
 * Usage:
 *   import { resolve, listTenants, GHL_BASE, API_VERSION } from '../lib/ghl-tenant-resolver.mjs';
 *
 *   // Default tenant (TJB):
 *   const { token, locationId, alias } = resolve();
 *
 *   // Specific tenant by alias:
 *   const msl = resolve('MSL');
 *
 *   // Specific tenant by location ID:
 *   const t = resolve('GbOalFzTAMvZGAobM9Cu');
 */

export const GHL_BASE = 'https://services.leadconnectorhq.com';
export const API_VERSION = '2021-07-28';

// ── Tenant registry (built once from env vars) ──────────────
const GHL_ENV_KEYS = [
  'GHL_PRIVATE_INTEGRATION_TOKEN',
  'GHL_LOCATION_ID',
  'GHL_PRIVATE_INTEGRATION_TOKEN_TJB',
  'GHL_LOCATION_ID_TJB',
  'GHL_PRIVATE_INTEGRATION_TOKEN_MSL',
  'GHL_LOCATION_ID_MSL',
  'GHL_TOKEN',
];

function stripOuterQuotes(value) {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function expandEnvValue(value, parsedValues) {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => parsedValues[key] || process.env[key] || '');
}

function hydrateGhlEnvFromDotEnv() {
  const missingKeys = GHL_ENV_KEYS.filter(key => !process.env[key]);
  if (missingKeys.length === 0) return;

  const envPath = new URL('../.env', import.meta.url);
  let envText = '';

  try {
    envText = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  const parsedValues = {};

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!GHL_ENV_KEYS.includes(key)) continue;

    const rawValue = line.slice(eqIndex + 1).trim();
    parsedValues[key] = stripOuterQuotes(rawValue);
  }

  for (const key of Object.keys(parsedValues)) {
    parsedValues[key] = expandEnvValue(parsedValues[key], parsedValues);
  }

  for (const key of missingKeys) {
    if (!process.env[key] && parsedValues[key]) {
      process.env[key] = parsedValues[key];
    }
  }
}

hydrateGhlEnvFromDotEnv();

// Tenant registry (built once from env vars)
const tenants = [];

function addTenant(alias, tokenEnv, locationEnv) {
  const token = process.env[tokenEnv] || '';
  const locationId = process.env[locationEnv] || '';
  if (token && locationId) {
    tenants.push({ alias, token, locationId });
  }
}

addTenant('TJB', 'GHL_PRIVATE_INTEGRATION_TOKEN_TJB', 'GHL_LOCATION_ID_TJB');
addTenant('MSL', 'GHL_PRIVATE_INTEGRATION_TOKEN_MSL', 'GHL_LOCATION_ID_MSL');

// Fallback: the "primary" token + a default location
const primaryToken = process.env.GHL_PRIVATE_INTEGRATION_TOKEN
  || process.env.GHL_TOKEN
  || '';
const primaryLocation = process.env.GHL_LOCATION_ID || '';

/**
 * Resolve a tenant's token + locationId.
 *
 * @param {string} [aliasOrLocationId] - 'TJB', 'MSL', a raw location ID, or
 *   omit for the default (TJB) tenant.
 * @returns {{ token: string, locationId: string, alias: string }}
 */
export function resolve(aliasOrLocationId) {
  if (!aliasOrLocationId) {
    // Default: first registered tenant, or the primary token
    if (tenants.length > 0) return { ...tenants[0] };
    return { alias: 'PRIMARY', token: primaryToken, locationId: primaryLocation };
  }

  const upper = aliasOrLocationId.toUpperCase();

  // Match by alias
  const byAlias = tenants.find(t => t.alias === upper);
  if (byAlias) return { ...byAlias };

  // Match by location ID
  const byLoc = tenants.find(t => t.locationId === aliasOrLocationId);
  if (byLoc) return { ...byLoc };

  // Fallback: use primary token with the given locationId
  if (primaryToken) {
    return { alias: 'PRIMARY', token: primaryToken, locationId: aliasOrLocationId };
  }

  throw new Error(`No GHL token found for tenant "${aliasOrLocationId}"`);
}

/**
 * Return all configured tenants.
 * @returns {Array<{ alias: string, locationId: string }>}
 */
export function listTenants() {
  return tenants.map(({ alias, locationId }) => ({ alias, locationId }));
}

/**
 * Build standard GHL request headers for a tenant.
 * @param {string} [aliasOrLocationId]
 * @returns {{ Authorization: string, Version: string, 'Content-Type': string }}
 */
export function headersFor(aliasOrLocationId) {
  const { token } = resolve(aliasOrLocationId);
  return {
    Authorization: `Bearer ${token}`,
    Version: API_VERSION,
    'Content-Type': 'application/json',
  };
}
