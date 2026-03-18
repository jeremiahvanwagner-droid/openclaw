import { describe, expect, it, vi } from 'vitest';

import { createGhlClient } from '../ghl-client.mjs';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('ghl-client', () => {
  it('creates contacts with the tenant locationId by default', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(String(url)).toBe('https://services.leadconnectorhq.com/contacts/');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer pit_test');
      expect(JSON.parse(String(options.body))).toEqual({
        firstName: 'Jeremiah',
        locationId: 'loc_123',
      });
      return jsonResponse({ contact: { id: 'contact_1' } });
    });

    const client = createGhlClient(undefined, {
      tenant: { alias: 'TEST', token: 'pit_test', locationId: 'loc_123' },
      fetchImpl,
    });

    const result = await client.contacts.create({ firstName: 'Jeremiah' });
    expect(result.contact.id).toBe('contact_1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses location_id for opportunity search', async () => {
    const fetchImpl = vi.fn(async url => {
      expect(String(url)).toBe('https://services.leadconnectorhq.com/opportunities/search?location_id=loc_123&pipelineId=pipe_1');
      return jsonResponse({ opportunities: [] });
    });

    const client = createGhlClient(undefined, {
      tenant: { alias: 'TEST', token: 'pit_test', locationId: 'loc_123' },
      fetchImpl,
    });

    await client.opportunities.search({ pipelineId: 'pipe_1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('posts to invoice send endpoint', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(String(url)).toBe('https://services.leadconnectorhq.com/invoices/inv_1/send');
      expect(options.method).toBe('POST');
      return jsonResponse({ ok: true });
    });

    const client = createGhlClient(undefined, {
      tenant: { alias: 'TEST', token: 'pit_test', locationId: 'loc_123' },
      fetchImpl,
    });

    await client.invoices.send('inv_1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 429 responses using Retry-After', async () => {
    const responses = [
      new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '0',
        },
      }),
      jsonResponse({ contact: { id: 'contact_2' } }),
    ];

    const fetchImpl = vi.fn(async () => responses.shift());
    const client = createGhlClient(undefined, {
      tenant: { alias: 'TEST', token: 'pit_test', locationId: 'loc_123' },
      fetchImpl,
      retryBaseMs: 0,
      retryJitterMs: 0,
    });

    const result = await client.contacts.get('contact_2');
    expect(result.contact.id).toBe('contact_2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
