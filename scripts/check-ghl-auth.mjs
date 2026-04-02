#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

import { createGhlClient } from '../lib/ghl-client.mjs';
import { listTenants, resolve as resolveTenant } from '../lib/ghl-tenant-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolvePath(__dirname, '..');
const ENV_PATH = join(ROOT_DIR, '.env');
const EXPECTED_TENANTS = ['TJB', 'MSL'];
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const GHL_ENV_KEYS = [
  'GHL_PRIVATE_INTEGRATION_TOKEN',
  'GHL_LOCATION_ID',
  'GHL_PRIVATE_INTEGRATION_TOKEN_TJB',
  'GHL_LOCATION_ID_TJB',
  'GHL_PRIVATE_INTEGRATION_TOKEN_MSL',
  'GHL_LOCATION_ID_MSL',
  'GHL_TOKEN',
];

function unquote(value) {
  if (!value) return value;
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseDotEnv(envPath) {
  if (!existsSync(envPath)) {
    return {};
  }

  const values = {};
  const envText = readFileSync(envPath, 'utf8');
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!GHL_ENV_KEYS.includes(key)) continue;
    values[key] = unquote(line.slice(eqIndex + 1).trim());
  }

  return values;
}

function summarizeValue(value) {
  if (!value) {
    return {
      present: false,
      length: 0,
      tail: null,
    };
  }

  return {
    present: true,
    length: value.length,
    tail: value.slice(-6),
  };
}

function valuesMatch(left, right) {
  return Boolean(left) && Boolean(right) && left === right;
}

function readUserEnv(key) {
  if (process.platform === 'win32') {
    try {
      return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `[Environment]::GetEnvironmentVariable('${key}','User')`],
        { encoding: 'utf8' },
      ).trim();
    } catch {
      return '';
    }
  }

  return process.env[key] || '';
}

async function checkUserPrimaryAuth(token, locationId) {
  if (!token || !locationId) {
    return {
      ok: false,
      status: null,
      mode: 'user_primary_env',
      message: 'Missing GHL_PRIVATE_INTEGRATION_TOKEN or GHL_LOCATION_ID in user env',
    };
  }

  const response = await fetch(`${GHL_BASE}/locations/${locationId}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
    },
  });

  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    mode: 'user_primary_env',
    bodyKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 10) : [],
    message: response.ok
      ? null
      : typeof body === 'string'
        ? body.slice(0, 200)
        : JSON.stringify(body).slice(0, 200),
  };
}

async function checkResolverTenant(alias) {
  try {
    const tenant = resolveTenant(alias);
    const client = createGhlClient(alias, {
      retryBaseMs: 0,
      retryJitterMs: 0,
      maxRetries: 0,
    });
    const result = await client.locations.get();
    return {
      alias,
      configured: Boolean(tenant.token && tenant.locationId),
      token: summarizeValue(tenant.token),
      locationId: summarizeValue(tenant.locationId),
      auth: {
        ok: true,
        status: 200,
        mode: 'resolver_client',
        bodyKeys: result && typeof result === 'object' ? Object.keys(result).slice(0, 10) : [],
        message: null,
      },
    };
  } catch (error) {
    const tenant = (() => {
      try {
        return resolveTenant(alias);
      } catch {
        return { token: '', locationId: '' };
      }
    })();

    return {
      alias,
      configured: Boolean(tenant.token && tenant.locationId),
      token: summarizeValue(tenant.token),
      locationId: summarizeValue(tenant.locationId),
      auth: {
        ok: false,
        status: error.status || null,
        mode: 'resolver_client',
        bodyKeys: [],
        message: error.message,
      },
    };
  }
}

async function main() {
  const dotEnvValues = parseDotEnv(ENV_PATH);
  const userPrimaryToken = readUserEnv('GHL_PRIVATE_INTEGRATION_TOKEN');
  const userPrimaryLocationId = readUserEnv('GHL_LOCATION_ID');
  const resolverDefault = resolveTenant();
  const resolverTenants = listTenants();
  const tenantChecks = await Promise.all(EXPECTED_TENANTS.map(checkResolverTenant));
  const userPrimaryAuth = await checkUserPrimaryAuth(userPrimaryToken, userPrimaryLocationId);
  const warnings = [];

  if (!dotEnvValues.GHL_LOCATION_ID && !dotEnvValues.GHL_LOCATION_ID_TJB) {
    warnings.push('.env is missing GHL_LOCATION_ID (and no GHL_LOCATION_ID_TJB fallback); scripts that rely on the primary alias may drift.');
  }

  if (/^\$\{[A-Z0-9_]+\}$/.test(dotEnvValues.GHL_TOKEN || '')) {
    warnings.push('.env GHL_TOKEN is a literal ${...} alias; raw env loaders may send that string and get a 401.');
  }

  if (
    dotEnvValues.GHL_PRIVATE_INTEGRATION_TOKEN
    && !valuesMatch(dotEnvValues.GHL_PRIVATE_INTEGRATION_TOKEN, resolverDefault.token)
  ) {
    warnings.push('.env GHL_PRIVATE_INTEGRATION_TOKEN does not match the resolver default tenant token.');
  }

  if (
    dotEnvValues.GHL_LOCATION_ID
    && !valuesMatch(dotEnvValues.GHL_LOCATION_ID, resolverDefault.locationId)
  ) {
    warnings.push('.env GHL_LOCATION_ID does not match the resolver default tenant location.');
  }

  if (
    userPrimaryToken
    && !valuesMatch(userPrimaryToken, resolverDefault.token)
  ) {
    warnings.push('User-level GHL_PRIVATE_INTEGRATION_TOKEN does not match the resolver default tenant token.');
  }

  if (
    userPrimaryLocationId
    && !valuesMatch(userPrimaryLocationId, resolverDefault.locationId)
  ) {
    warnings.push('User-level GHL_LOCATION_ID does not match the resolver default tenant location.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    envFile: {
      path: ENV_PATH,
      exists: existsSync(ENV_PATH),
      keys: Object.fromEntries(
        GHL_ENV_KEYS.map(key => [key, summarizeValue(dotEnvValues[key] || '')]),
      ),
    },
    resolver: {
      configuredTenants: resolverTenants.map(tenant => ({
        alias: tenant.alias,
        locationId: summarizeValue(tenant.locationId),
      })),
      defaultTenant: {
        alias: resolverDefault.alias,
        token: summarizeValue(resolverDefault.token),
        locationId: summarizeValue(resolverDefault.locationId),
      },
    },
    userEnv: {
      primary: {
        token: summarizeValue(userPrimaryToken),
        locationId: summarizeValue(userPrimaryLocationId),
        matchesResolverDefault: {
          token: Boolean(userPrimaryToken) && userPrimaryToken === resolverDefault.token,
          locationId: Boolean(userPrimaryLocationId) && userPrimaryLocationId === resolverDefault.locationId,
        },
        auth: userPrimaryAuth,
      },
      tenantSpecific: {
        TJB: {
          token: summarizeValue(readUserEnv('GHL_PRIVATE_INTEGRATION_TOKEN_TJB')),
          locationId: summarizeValue(readUserEnv('GHL_LOCATION_ID_TJB')),
        },
        MSL: {
          token: summarizeValue(readUserEnv('GHL_PRIVATE_INTEGRATION_TOKEN_MSL')),
          locationId: summarizeValue(readUserEnv('GHL_LOCATION_ID_MSL')),
        },
      },
    },
    warnings,
    tenantChecks,
  };

  report.overallHealthy = tenantChecks.every(check => check.auth.ok) && userPrimaryAuth.ok;
  report.overallConsistent = warnings.length === 0;
  report.status = report.overallHealthy
    ? report.overallConsistent ? 'healthy' : 'healthy_with_drift'
    : 'unhealthy';

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallHealthy ? 0 : 1);
}

main().catch(error => {
  console.error(JSON.stringify({
    generatedAt: new Date().toISOString(),
    fatal: true,
    message: error.message,
  }, null, 2));
  process.exit(1);
});
