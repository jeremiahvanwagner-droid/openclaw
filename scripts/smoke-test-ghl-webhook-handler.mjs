#!/usr/bin/env node

import { createHmac } from 'crypto';

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    result[key] = index + 1 < args.length && !args[index + 1].startsWith('--')
      ? args[++index]
      : true;
  }
  return result;
}

function buildPayload(eventType, businessId) {
  return {
    type: eventType,
    eventType,
    businessId,
    timestamp: new Date().toISOString(),
    contact: {
      id: 'smoke_contact_001',
      firstName: 'Smoke',
      lastName: 'Test',
      email: 'smoke@example.com',
    },
    data: {
      test: true,
      businessId,
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const endpoint = opts.url || `${process.env.OPENCLAW_PUBLIC_WEBHOOK_BASE_URL || 'http://127.0.0.1:8788'}/webhook/ghl`;
  const eventType = opts.event || 'contact.created';
  const authMode = opts['auth-mode'] || 'bearer';
  const businessId = opts['business-id'] || 'smoke_test_business';
  const payload = buildPayload(eventType, businessId);
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };

  if (authMode === 'bearer') {
    const token = process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '';
    if (!token) throw new Error('OPENCLAW_GATEWAY_AUTH_TOKEN (or OPENCLAW_GATEWAY_TOKEN) is required for bearer smoke tests');
    headers.Authorization = `Bearer ${token}`;
  } else if (authMode === 'hmac') {
    const secret = process.env.OPENCLAW_GHL_WEBHOOK_SECRET || '';
    if (!secret) throw new Error('OPENCLAW_GHL_WEBHOOK_SECRET is required for hmac smoke tests');
    headers['X-OpenClaw-Signature'] = createHmac('sha256', secret).update(body).digest('hex');
  } else if (authMode !== 'none') {
    throw new Error('auth-mode must be bearer, hmac, or none');
  }

  const endpointUrl = new URL(endpoint);
  const healthUrl = new URL('/health', endpointUrl).toString();

  const [healthResponse, webhookResponse] = await Promise.all([
    fetch(healthUrl),
    fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    }),
  ]);

  const healthBody = await healthResponse.text();
  const webhookBody = await webhookResponse.text();

  console.log(JSON.stringify({
    action: 'smoke-test-ghl-webhook-handler',
    endpoint,
    eventType,
    authMode,
    health: {
      status: healthResponse.status,
      ok: healthResponse.ok,
      body: healthBody,
    },
    webhook: {
      status: webhookResponse.status,
      ok: webhookResponse.ok,
      body: webhookBody,
    },
  }, null, 2));
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
