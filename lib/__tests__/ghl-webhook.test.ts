import { createHmac, generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it } from 'vitest';

import {
  authenticateGhlWebhookRequest,
  normalizeGhlWebhookPayload,
  normalizeWebhookEventType,
} from '../ghl-webhook.mjs';

describe('ghl-webhook', () => {
  it('normalizes documented platform event names into internal event keys', () => {
    expect(normalizeWebhookEventType('ContactCreate')).toBe('contact.created');
    expect(normalizeWebhookEventType('OpportunityStageUpdate')).toBe('opportunity.stage.changed');
    expect(normalizeWebhookEventType('appointment.created')).toBe('appointment.created');
  });

  it('normalizes nested GHL payload shapes', () => {
    const normalized = normalizeGhlWebhookPayload({
      eventType: 'ContactCreate',
      data: {
        locationId: 'loc_123',
        contact: { id: 'contact_1', firstName: 'Jeremiah' },
      },
    });

    expect(normalized.rawEventType).toBe('ContactCreate');
    expect(normalized.eventType).toBe('contact.created');
    expect(normalized.payload.locationId).toBe('loc_123');
    expect(normalized.payload.contact.id).toBe('contact_1');
    expect(normalized.payload.type).toBe('contact.created');
  });

  it('authenticates Ed25519-signed GHL webhooks', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const rawBody = Buffer.from(JSON.stringify({ eventType: 'ContactCreate', data: { id: '1' } }));
    const signature = sign(null, rawBody, privateKey).toString('base64');

    const result = authenticateGhlWebhookRequest({
      headers: { 'x-ghl-signature': signature },
      rawBody,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });

    expect(result.ok).toBe(true);
    expect(result.strategy).toBe('ghl_ed25519');
  });

  it('authenticates workflow bearer tokens', () => {
    const result = authenticateGhlWebhookRequest({
      headers: { authorization: 'Bearer workflow-secret' },
      rawBody: Buffer.from('{}'),
      bearerToken: 'workflow-secret',
    });

    expect(result).toEqual({ ok: true, strategy: 'workflow_bearer' });
  });

  it('authenticates OpenClaw HMAC signatures', () => {
    const rawBody = JSON.stringify({ type: 'payment.received' });
    const signature = createHmac('sha256', 'local-secret').update(rawBody).digest('hex');

    const result = authenticateGhlWebhookRequest({
      headers: { 'x-openclaw-signature': signature },
      rawBody,
      openclawSecret: 'local-secret',
    });

    expect(result.ok).toBe(true);
    expect(result.strategy).toBe('openclaw_hmac');
  });
});
