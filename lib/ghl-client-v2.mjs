/**
 * GHL API Client v2 — Unified Facade
 * Truth J Blue LLC — OpenClaw
 *
 * Combines the original hand-written client (8 namespaces) with
 * all 35 auto-generated namespaces for full GHL API surface coverage.
 *
 * Backward-compatible: all existing callers using the v1 API surface
 * continue working unchanged.
 *
 * Usage:
 *   import { createGhlClientV2 } from '../lib/ghl-client-v2.mjs';
 *
 *   const ghl = createGhlClientV2('TJB', { agentId: 'd1_ceo' });
 *
 *   // Existing v1 namespaces (contacts, conversations, etc.)
 *   const contact = await ghl.contacts.get(contactId);
 *
 *   // New v2 namespaces (blogs, social-media-posting, etc.)
 *   const posts = await ghl.blogs.getAllBlogAuthorsByLocation({ locationId });
 *   const saas = await ghl.saasApi.getSubAccounts({ companyId });
 */

import {
  GHL_BASE,
  API_VERSION,
  resolve as resolveTenant,
  resolveByTokenGroup,
} from './ghl-tenant-resolver.mjs';

import {
  enforceGhlScope,
  getAgentTokenGroup,
  GhlScopeViolation,
} from './ghl-scope-enforcer.mjs';

import { NAMESPACE_NAMES, loadNamespace } from './ghl/index.mjs';

export { GhlScopeViolation };

// Re-export from v1 for full backward compatibility
export { GhlApiError } from './ghl-client.mjs';

// ─── Internal helpers (duplicated from v1 for independence) ─────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(response, attempt, retryBaseMs) {
  const retryAfterRaw = response.headers?.get?.('retry-after');
  if (retryAfterRaw) {
    const parsedSeconds = Number(retryAfterRaw);
    if (!Number.isNaN(parsedSeconds)) return parsedSeconds * 1000;
    const retryDate = new Date(retryAfterRaw);
    const retryAt = retryDate.getTime();
    if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return Math.pow(2, attempt) * retryBaseMs;
}

function buildUrl(endpoint, query) {
  const url = new URL(endpoint, `${GHL_BASE}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null && item !== '') {
            url.searchParams.append(key, String(item));
          }
        }
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function parseResponseBody(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Scope-based namespace resource mapping ─────────────────────

/**
 * Maps generated namespace names to the RBAC resource used by
 * ghl-scope-enforcer.mjs. Namespaces not listed here use their own
 * name as the resource key.
 */
const NAMESPACE_RESOURCE_MAP = {
  // v1 original mappings
  contacts: 'contacts',
  conversations: 'conversations',
  opportunities: 'opportunities',
  calendars: 'calendars',
  appointments: 'calendars',
  workflows: 'workflows',
  locations: 'contacts',
  invoices: 'transactions',
  payments: 'transactions',
  // v2 new mappings
  blogs: 'blogs',
  businesses: 'businesses',
  campaigns: 'campaigns',
  companies: 'companies',
  courses: 'courses',
  customFields: 'custom_fields',
  customMenus: 'custom_menus',
  emailIsv: 'emails',
  emails: 'emails',
  forms: 'forms',
  funnels: 'funnels',
  links: 'links',
  marketplace: 'marketplace',
  medias: 'medias',
  objects: 'objects',
  phoneSystem: 'phone_system',
  products: 'products',
  proposals: 'proposals',
  saasApi: 'saas',
  snapshots: 'snapshots',
  socialMediaPosting: 'social_media',
  store: 'store',
  surveys: 'surveys',
  users: 'users',
  voiceAi: 'voice_ai',
  associations: 'associations',
};

const WRITE_METHODS = new Set([
  'create', 'update', 'delete', 'send', 'void',
  'add', 'remove', 'enroll', 'addTags', 'removeTags', 'addInbound',
  'put', 'post', 'patch',
]);

function inferOperation(methodName) {
  const lower = methodName.toLowerCase();
  if (lower.startsWith('create') || lower.startsWith('update') || lower.startsWith('delete')
    || lower.startsWith('add') || lower.startsWith('remove') || lower.startsWith('send')
    || lower.startsWith('void') || lower.startsWith('cancel') || lower.startsWith('enroll')
    || lower.startsWith('schedule') || lower.startsWith('upload') || lower.startsWith('upsert')) {
    return 'write';
  }
  if (WRITE_METHODS.has(methodName)) return 'write';
  return 'read';
}

// ─── Client Factory ─────────────────────────────────────────────

/**
 * Create a full-surface GHL API client.
 *
 * @param {string} [aliasOrLocationId] — tenant alias (TJB/MSL) or location ID
 * @param {object} [options]
 * @param {string} [options.agentId] — agent ID for RBAC scope enforcement
 * @param {string} [options.tokenGroup] — explicit token group ID
 * @param {Function} [options.fetchImpl] — custom fetch implementation
 * @param {number} [options.minCallSpacingMs] — minimum ms between calls
 * @param {number} [options.maxRetries] — max retries on 429 (default 2)
 * @param {number} [options.retryBaseMs] — base retry delay (default 3000)
 * @param {number} [options.retryJitterMs] — jitter range (default 1000)
 * @returns {Proxy} — client with lazy-loaded namespace access
 */
export function createGhlClientV2(aliasOrLocationId, options = {}) {
  const { agentId, tokenGroup: tokenGroupOpt } = options;

  // Resolve tenant
  let tenant;
  let resolvedTokenGroup = tokenGroupOpt || null;

  if (agentId && !resolvedTokenGroup) {
    resolvedTokenGroup = getAgentTokenGroup(agentId);
  }

  if (resolvedTokenGroup) {
    tenant = options.tenant || resolveByTokenGroup(resolvedTokenGroup);
  } else {
    tenant = options.tenant || resolveTenant(aliasOrLocationId);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const minCallSpacingMs = options.minCallSpacingMs || 0;
  const maxRetries = options.maxRetries ?? 2;
  const retryBaseMs = options.retryBaseMs ?? 3000;
  const retryJitterMs = options.retryJitterMs ?? 1000;

  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable and no fetchImpl was provided');
  }
  if (!tenant.token) {
    throw new Error(`Missing GHL private integration token for tenant "${tenant.alias}"`);
  }

  let lastCallAt = 0;

  /**
   * Core request function — shared by all namespaces.
   */
  async function request(method, endpoint, requestOptions = {}) {
    const {
      body,
      query,
      headers = {},
      locationId,
      responseType = 'json',
      isMultipart = false,
      attempt = 0,
    } = requestOptions;

    const elapsed = Date.now() - lastCallAt;
    if (minCallSpacingMs > 0 && elapsed < minCallSpacingMs) {
      await sleep(minCallSpacingMs - elapsed);
    }
    lastCallAt = Date.now();

    const url = buildUrl(endpoint, query);

    const reqHeaders = {
      Accept: 'application/json',
      Authorization: `Bearer ${tenant.token}`,
      Version: API_VERSION,
      ...headers,
    };

    let reqBody;
    if (isMultipart && body instanceof FormData) {
      reqBody = body;
      // Let fetch set the Content-Type for FormData
    } else if (body !== undefined && body !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = JSON.stringify(body);
    }

    const response = await fetchImpl(url, {
      method,
      headers: reqHeaders,
      body: reqBody,
    });

    if (response.status === 429 && attempt < maxRetries) {
      const waitMs = getRetryDelayMs(response, attempt, retryBaseMs) + Math.random() * retryJitterMs;
      await sleep(waitMs);
      return request(method, endpoint, { ...requestOptions, attempt: attempt + 1 });
    }

    const parsedBody = responseType === 'raw' ? response : await parseResponseBody(response);

    if (!response.ok) {
      const { GhlApiError } = await import('./ghl-client.mjs');
      const summary = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
      throw new GhlApiError(
        `GHL API ${response.status} for ${method} ${url.pathname}${url.search}: ${summary}`,
        { status: response.status, url: url.toString(), body: parsedBody, method },
      );
    }

    return parsedBody;
  }

  // ── Namespace cache (lazy-loaded) ──────────────────────────────

  const ctx = { request };
  const nsCache = new Map();

  /**
   * Apply scope enforcement to a namespace object.
   */
  function guardNamespace(ns, nsName) {
    if (!agentId) return ns;
    const resource = NAMESPACE_RESOURCE_MAP[nsName] || nsName;

    const guarded = {};
    for (const [key, value] of Object.entries(ns)) {
      if (typeof value === 'function') {
        guarded[key] = (...args) => {
          const op = inferOperation(key);
          enforceGhlScope(agentId, resource, op);
          return value(...args);
        };
      } else if (typeof value === 'object' && value !== null) {
        guarded[key] = guardNamespace(value, nsName);
      } else {
        guarded[key] = value;
      }
    }
    return guarded;
  }

  /**
   * Synchronously load a generated namespace.
   * Uses dynamic import with caching.
   */
  async function getNamespace(name) {
    if (nsCache.has(name)) return nsCache.get(name);

    const factory = await loadNamespace(name);
    const ns = factory(ctx);
    const guarded = guardNamespace(ns, name);
    nsCache.set(name, guarded);
    return guarded;
  }

  // ── Build the client object ────────────────────────────────────

  // Pre-create a set of available namespace names for the proxy
  const nsSet = new Set(NAMESPACE_NAMES);

  /**
   * The client object uses a Proxy so that accessing any namespace name
   * (e.g. client.blogs, client.saasApi) returns a promise-like namespace
   * that auto-initializes on first access.
   *
   * Direct properties (tenant, request) are returned synchronously.
   */
  const directProps = {
    tenant,
    request,
    /** Explicitly load a namespace by name. Returns the namespace object. */
    ns: (name) => getNamespace(name),
    /** List all available namespace names. */
    namespaces: NAMESPACE_NAMES,
  };

  // For each namespace, create a synchronous lazy proxy that loads on first method call
  const client = { ...directProps };

  for (const nsName of NAMESPACE_NAMES) {
    let cached = null;
    let loading = null;

    client[nsName] = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then' || prop === Symbol.toPrimitive || prop === Symbol.toStringTag) {
          return undefined; // Don't trap thenable checks
        }

        // Return a function that lazily loads the namespace and calls the method
        return async (...args) => {
          if (!cached) {
            if (!loading) loading = getNamespace(nsName);
            cached = await loading;
          }
          if (typeof cached[prop] !== 'function') {
            throw new Error(`GHL ${nsName}.${String(prop)} is not a function`);
          }
          return cached[prop](...args);
        };
      },
    });
  }

  return client;
}
