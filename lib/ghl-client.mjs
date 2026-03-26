import { GHL_BASE, API_VERSION, resolve as resolveTenant, resolveByTokenGroup } from './ghl-tenant-resolver.mjs';
import { enforceGhlScope, getAgentTokenGroup, GhlScopeViolation } from './ghl-scope-enforcer.mjs';

export { GhlScopeViolation };

export class GhlApiError extends Error {
  constructor(message, { status, url, body, method } = {}) {
    super(message);
    this.name = 'GhlApiError';
    this.status = status;
    this.url = url;
    this.body = body;
    this.method = method;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(response, attempt, retryBaseMs) {
  const retryAfterRaw = response.headers.get('retry-after');
  if (retryAfterRaw) {
    const parsedSeconds = Number(retryAfterRaw);
    if (!Number.isNaN(parsedSeconds)) {
      return parsedSeconds * 1000;
    }

    const retryDate = new Date(retryAfterRaw);
    const retryAt = retryDate.getTime();
    if (!Number.isNaN(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
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
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function addLocationId(body, locationId) {
  if (!locationId || !body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  if (body.locationId || body.location_id) {
    return body;
  }
  return { ...body, locationId };
}

export function createGhlClient(aliasOrLocationId, options = {}) {
  const { agentId, tokenGroup: tokenGroupOpt } = options;

  // Resolve tenant: prefer tokenGroup (from agent config or explicit), then alias
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

  async function request(method, endpoint, requestOptions = {}) {
    const {
      body,
      query,
      headers = {},
      locationId,
      includeLocationId = false,
      responseType = 'json',
      attempt = 0,
    } = requestOptions;

    const elapsed = Date.now() - lastCallAt;
    if (minCallSpacingMs > 0 && elapsed < minCallSpacingMs) {
      await sleep(minCallSpacingMs - elapsed);
    }
    lastCallAt = Date.now();

    const resolvedLocationId = locationId || tenant.locationId;
    const url = buildUrl(endpoint, query);
    const payload = includeLocationId ? addLocationId(body, resolvedLocationId) : body;

    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tenant.token}`,
        Version: API_VERSION,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: payload === undefined || payload === null ? undefined : JSON.stringify(payload),
    });

    if (response.status === 429 && attempt < maxRetries) {
      const waitMs = getRetryDelayMs(response, attempt, retryBaseMs) + Math.random() * retryJitterMs;
      await sleep(waitMs);
      return request(method, endpoint, {
        ...requestOptions,
        attempt: attempt + 1,
      });
    }

    const parsedBody = responseType === 'raw' ? response : await parseResponseBody(response);

    if (!response.ok) {
      const summary = typeof parsedBody === 'string'
        ? parsedBody
        : JSON.stringify(parsedBody);
      throw new GhlApiError(
        `GHL API ${response.status} for ${method} ${url.pathname}${url.search}: ${summary}`,
        { status: response.status, url: url.toString(), body: parsedBody, method },
      );
    }

    return parsedBody;
  }

  const contacts = {
    search: ({ query, locationId = tenant.locationId } = {}) =>
      request('GET', '/contacts/', { query: { locationId, query } }),
    get: contactId => request('GET', `/contacts/${contactId}`),
    create: (body, { locationId = tenant.locationId } = {}) =>
      request('POST', '/contacts/', { body, includeLocationId: true, locationId }),
    update: (contactId, body) => request('PUT', `/contacts/${contactId}`, { body }),
    delete: contactId => request('DELETE', `/contacts/${contactId}`),
    addTags: (contactId, tags) => request('POST', `/contacts/${contactId}/tags`, { body: { tags } }),
    removeTags: (contactId, tags) => request('DELETE', `/contacts/${contactId}/tags`, { body: { tags } }),
    notes: {
      list: contactId => request('GET', `/contacts/${contactId}/notes`),
      add: (contactId, body) => request('POST', `/contacts/${contactId}/notes`, { body }),
    },
    tasks: {
      list: contactId => request('GET', `/contacts/${contactId}/tasks`),
      add: (contactId, body) => request('POST', `/contacts/${contactId}/tasks`, { body }),
    },
    workflows: {
      enroll: (contactId, workflowId) => request('POST', `/contacts/${contactId}/workflow/${workflowId}`),
      remove: (contactId, workflowId) => request('DELETE', `/contacts/${contactId}/workflow/${workflowId}`),
    },
  };

  const conversations = {
    list: ({ contactId, locationId = tenant.locationId } = {}) =>
      request('GET', '/conversations/', { query: { locationId, contactId } }),
    get: conversationId => request('GET', `/conversations/${conversationId}`),
    create: (body, { locationId = tenant.locationId } = {}) =>
      request('POST', '/conversations/', { body, includeLocationId: true, locationId }),
    messages: {
      list: (conversationId, query = {}) =>
        request('GET', `/conversations/${conversationId}/messages`, { query }),
      send: body => request('POST', '/conversations/messages', { body }),
      addInbound: body => request('POST', '/conversations/messages/inbound', { body }),
      get: messageId => request('GET', `/conversations/messages/${messageId}`),
      getRecording: messageId =>
        request('GET', `/conversations/messages/${messageId}/recording`, { responseType: 'raw' }),
      getTranscription: messageId =>
        request('GET', `/conversations/messages/${messageId}/transcription`),
    },
  };

  const opportunities = {
    search: ({ locationId = tenant.locationId, ...query } = {}) =>
      request('GET', '/opportunities/search', { query: { location_id: locationId, ...query } }),
    get: opportunityId => request('GET', `/opportunities/${opportunityId}`),
    create: body => request('POST', '/opportunities/', { body, includeLocationId: true }),
    update: (opportunityId, body) => request('PUT', `/opportunities/${opportunityId}`, { body }),
    delete: opportunityId => request('DELETE', `/opportunities/${opportunityId}`),
    pipelines: ({ locationId = tenant.locationId } = {}) =>
      request('GET', '/opportunities/pipelines', { query: { locationId } }),
  };

  const appointments = {
    list: (query = {}) =>
      request('GET', '/calendars/events/appointments', { query: { locationId: tenant.locationId, ...query } }),
    create: (body, { locationId = tenant.locationId } = {}) =>
      request('POST', '/calendars/events/appointments', { body, includeLocationId: true, locationId }),
    get: appointmentId => request('GET', `/calendars/events/appointments/${appointmentId}`),
    update: (appointmentId, body) =>
      request('PUT', `/calendars/events/appointments/${appointmentId}`, { body }),
    delete: appointmentId => request('DELETE', `/calendars/events/appointments/${appointmentId}`),
  };

  const calendars = {
    list: ({ locationId = tenant.locationId } = {}) =>
      request('GET', '/calendars/', { query: { locationId } }),
    getFreeSlots: (calendarId, query = {}) =>
      request('GET', `/calendars/${calendarId}/free-slots`, { query }),
    appointments,
  };

  const workflows = {
    list: ({ locationId = tenant.locationId } = {}) =>
      request('GET', '/workflows/', { query: { locationId } }),
  };

  const locations = {
    get: (locationId = tenant.locationId) => request('GET', `/locations/${locationId}`),
    customFields: {
      list: (locationId = tenant.locationId) =>
        request('GET', `/locations/${locationId}/customFields`),
      create: (body, { locationId = tenant.locationId } = {}) =>
        request('POST', `/locations/${locationId}/customFields`, { body }),
    },
    customValues: {
      list: (locationId = tenant.locationId) =>
        request('GET', `/locations/${locationId}/customValues`),
    },
  };

  const invoices = {
    list: ({ locationId = tenant.locationId, ...query } = {}) =>
      request('GET', '/invoices/', { query: { locationId, ...query } }),
    get: invoiceId => request('GET', `/invoices/${invoiceId}`),
    create: (body, { locationId = tenant.locationId } = {}) =>
      request('POST', '/invoices/', { body, includeLocationId: true, locationId }),
    send: invoiceId => request('POST', `/invoices/${invoiceId}/send`),
    void: invoiceId => request('POST', `/invoices/${invoiceId}/void`),
  };

  const rawClient = {
    tenant,
    request,
    contacts,
    conversations,
    opportunities,
    calendars,
    appointments,
    workflows,
    locations,
    invoices,
    payments: {
      invoices,
    },
  };

  // If no agentId, return raw client (backwards-compatible)
  if (!agentId) return rawClient;

  // Wrap with scope enforcement proxy
  return wrapWithScopeEnforcement(rawClient, agentId);
}

/**
 * Wraps a GHL client's namespace methods with scope enforcement.
 * Each method call is checked against the agent's permitted scopes.
 */
function wrapWithScopeEnforcement(client, agentId) {
  const GHL_NAMESPACE_RESOURCE_MAP = {
    contacts: 'contacts',
    conversations: 'conversations',
    opportunities: 'opportunities',
    calendars: 'calendars',
    appointments: 'calendars',
    workflows: 'workflows',
    locations: 'contacts', // location reads share contacts:read scope
    invoices: 'transactions',
    payments: 'transactions',
  };

  const WRITE_METHODS = new Set([
    'create', 'update', 'delete', 'send', 'void',
    'addTags', 'removeTags', 'add', 'enroll', 'remove',
    'addInbound',
  ]);

  function inferOperation(methodName) {
    return WRITE_METHODS.has(methodName) ? 'write' : 'read';
  }

  function guardNamespace(namespace, namespaceName, resource) {
    if (typeof namespace !== 'object' || namespace === null) return namespace;

    const guarded = {};
    for (const [key, value] of Object.entries(namespace)) {
      if (typeof value === 'function') {
        guarded[key] = (...args) => {
          const op = inferOperation(key);
          enforceGhlScope(agentId, resource, op);
          return value(...args);
        };
      } else if (typeof value === 'object' && value !== null) {
        // Nested namespace (e.g., contacts.notes, conversations.messages)
        guarded[key] = guardNamespace(value, `${namespaceName}.${key}`, resource);
      } else {
        guarded[key] = value;
      }
    }
    return guarded;
  }

  const wrapped = { tenant: client.tenant, request: client.request };
  for (const [nsName, nsObj] of Object.entries(client)) {
    if (nsName === 'tenant' || nsName === 'request') continue;
    const resource = GHL_NAMESPACE_RESOURCE_MAP[nsName] || nsName;
    wrapped[nsName] = guardNamespace(nsObj, nsName, resource);
  }

  return wrapped;
}

export function ghlRequest(aliasOrLocationId, method, endpoint, options = {}) {
  return createGhlClient(aliasOrLocationId, options).request(method, endpoint, options);
}
