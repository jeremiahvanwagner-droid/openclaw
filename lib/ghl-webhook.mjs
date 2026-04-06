import crypto from 'crypto';

export const GHL_ED25519_PUBLIC_KEY = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=',
  '-----END PUBLIC KEY-----',
].join('\n');

const PLATFORM_EVENT_MAP = new Map([
  // ── Contact events ──
  ['ContactCreate', 'contact.created'],
  ['ContactUpdate', 'contact.updated'],
  ['ContactDelete', 'contact.deleted'],
  ['ContactTagUpdate', 'contact.tag.updated'],
  ['ContactDndUpdate', 'contact.dnd.updated'],

  // ── Opportunity events ──
  ['OpportunityCreate', 'opportunity.created'],
  ['OpportunityUpdate', 'opportunity.updated'],
  ['OpportunityDelete', 'opportunity.deleted'],
  ['OpportunityStatusUpdate', 'opportunity.status.changed'],
  ['OpportunityStageUpdate', 'opportunity.stage.changed'],
  ['OpportunityAssignedToUpdate', 'opportunity.assigned.updated'],
  ['OpportunityMonetaryValueUpdate', 'opportunity.monetary.updated'],

  // ── Appointment events ──
  ['AppointmentCreate', 'appointment.created'],
  ['AppointmentUpdate', 'appointment.updated'],
  ['AppointmentDelete', 'appointment.deleted'],

  // ── Task events ──
  ['TaskCreate', 'task.created'],
  ['TaskComplete', 'task.completed'],
  ['TaskDelete', 'task.deleted'],

  // ── Invoice events ──
  ['InvoiceCreate', 'invoice.created'],
  ['InvoiceUpdate', 'invoice.updated'],
  ['InvoiceDelete', 'invoice.deleted'],
  ['InvoiceSent', 'invoice.sent'],
  ['InvoiceVoid', 'invoice.voided'],
  ['InvoicePaid', 'payment.received'],
  ['InvoicePartiallyPaid', 'invoice.partially.paid'],

  // ── Location events ──
  ['LocationCreate', 'location.created'],
  ['LocationUpdate', 'location.updated'],

  // ── User events ──
  ['UserCreate', 'user.created'],
  ['UserUpdate', 'user.updated'],

  // ── Note events ──
  ['NoteCreate', 'note.created'],
  ['NoteUpdate', 'note.updated'],
  ['NoteDelete', 'note.deleted'],

  // ── Campaign events ──
  ['CampaignStatusUpdate', 'campaign.status.updated'],

  // ── Conversation / Message events ──
  ['InboundMessage', 'conversation.message.inbound'],
  ['OutboundMessage', 'conversation.message.outbound'],
  ['ProviderOutboundMessage', 'conversation.message.provider.outbound'],
  ['ConversationUnreadWebhook', 'conversation.unread'],

  // ── Order events ──
  ['OrderCreate', 'order.created'],
  ['OrderStatusUpdate', 'order.status.updated'],

  // ── Product events ──
  ['ProductCreate', 'product.created'],
  ['ProductUpdate', 'product.updated'],
  ['ProductDelete', 'product.deleted'],

  // ── Price events ──
  ['PriceCreate', 'price.created'],
  ['PriceUpdate', 'price.updated'],
  ['PriceDelete', 'price.deleted'],

  // ── Plan events ──
  ['PlanChange', 'plan.changed'],

  // ── App lifecycle events ──
  ['AppInstall', 'app.installed'],
  ['AppUninstall', 'app.uninstalled'],
  ['ExternalAuthConnected', 'auth.external.connected'],

  // ── Custom Objects / Records events ──
  ['ObjectSchemaCreate', 'object.schema.created'],
  ['ObjectSchemaUpdate', 'object.schema.updated'],
  ['RecordCreate', 'record.created'],
  ['RecordUpdate', 'record.updated'],
  ['RecordDelete', 'record.deleted'],

  // ── Relation events ──
  ['RelationCreate', 'relation.created'],
  ['RelationDelete', 'relation.deleted'],

  // ── Association events ──
  ['AssociationCreate', 'association.created'],
  ['AssociationUpdate', 'association.updated'],
  ['AssociationDelete', 'association.deleted'],

  // ── Email/LC Email events ──
  ['LCEmailStats', 'email.stats.updated'],
]);

function getHeader(headers, name) {
  if (!headers) return '';
  const lowerName = name.toLowerCase();

  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(lowerName) || '';
  }

  const entry = headers[name] ?? headers[lowerName];
  if (Array.isArray(entry)) {
    return entry[0] || '';
  }
  return entry || '';
}

function toRawBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  return Buffer.from(body || '');
}

function parseSignature(signature) {
  if (!signature) return null;
  const cleaned = signature.trim();
  if (!cleaned) return null;

  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0) {
    return Buffer.from(cleaned, 'hex');
  }

  try {
    return Buffer.from(cleaned, 'base64');
  } catch {
    return null;
  }
}

function verifyEd25519Signature(rawBody, signature, publicKey) {
  const parsedSignature = parseSignature(signature);
  if (!parsedSignature) return false;
  try {
    return crypto.verify(null, toRawBuffer(rawBody), publicKey, parsedSignature);
  } catch {
    return false;
  }
}

function verifyHmacSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(toRawBuffer(rawBody)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function normalizeWebhookEventType(rawType) {
  if (!rawType) return 'unknown';
  if (PLATFORM_EVENT_MAP.has(rawType)) {
    return PLATFORM_EVENT_MAP.get(rawType);
  }
  if (rawType.includes('.')) {
    return rawType.toLowerCase();
  }
  return rawType
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .replace(/[_\s-]+/g, '.')
    .toLowerCase();
}

function mergePayload(payload) {
  const nested = [
    payload.data,
    payload.object,
    payload.payload,
    payload.body,
  ].find(candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) || {};

  return {
    ...payload,
    ...nested,
    data: payload.data || nested.data || nested,
    contact: payload.contact || nested.contact || payload.customer || nested.customer || null,
    opportunity: payload.opportunity || nested.opportunity || payload.deal || nested.deal || null,
    appointment: payload.appointment || nested.appointment || payload.event || nested.event || null,
    payment: payload.payment || nested.payment || payload.invoice || nested.invoice || null,
    subscription: payload.subscription || nested.subscription || null,
    product: payload.product || nested.product || null,
    form: payload.form || nested.form || null,
    calendar: payload.calendar || nested.calendar || null,
    fields: payload.fields || nested.fields || payload.formData || nested.formData || null,
    locationId: payload.locationId || payload.location_id || nested.locationId || nested.location_id || null,
  };
}

export function normalizeGhlWebhookPayload(payload) {
  const rawEventType =
    payload.type ||
    payload.event ||
    payload.eventType ||
    payload.eventName ||
    payload.data?.type ||
    payload.data?.event ||
    payload.object?.type ||
    'unknown';

  const mergedPayload = mergePayload(payload);
  const eventType = normalizeWebhookEventType(rawEventType);

  return {
    rawEventType,
    eventType,
    payload: {
      ...mergedPayload,
      type: eventType,
      eventType,
      rawEventType,
    },
  };
}

export function authenticateGhlWebhookRequest({
  headers,
  rawBody,
  bearerToken,
  openclawSecret,
  publicKey = GHL_ED25519_PUBLIC_KEY,
} = {}) {
  const ghlSignature = getHeader(headers, 'x-ghl-signature');
  const authorization = getHeader(headers, 'authorization');
  const openclawSignature = getHeader(headers, 'x-openclaw-signature');
  const openclawSecretHeader = getHeader(headers, 'x-openclaw-secret');

  if (ghlSignature) {
    const ok = verifyEd25519Signature(rawBody, ghlSignature, publicKey);
    return ok
      ? { ok: true, strategy: 'ghl_ed25519' }
      : { ok: false, strategy: 'ghl_ed25519', reason: 'invalid GHL Ed25519 signature' };
  }

  if (authorization && bearerToken) {
    const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!provided) {
      return { ok: false, strategy: 'workflow_bearer', reason: 'missing bearer token value' };
    }
    if (provided === bearerToken) {
      return { ok: true, strategy: 'workflow_bearer' };
    }
    return { ok: false, strategy: 'workflow_bearer', reason: 'invalid bearer token' };
  }

  if (openclawSignature && openclawSecret) {
    const ok = verifyHmacSignature(rawBody, openclawSignature, openclawSecret);
    return ok
      ? { ok: true, strategy: 'openclaw_hmac' }
      : { ok: false, strategy: 'openclaw_hmac', reason: 'invalid OpenClaw HMAC signature' };
  }

  if (openclawSecretHeader && openclawSecret) {
    try {
      const ok = crypto.timingSafeEqual(
        Buffer.from(openclawSecretHeader),
        Buffer.from(openclawSecret),
      );
      return ok
        ? { ok: true, strategy: 'openclaw_shared_secret' }
        : { ok: false, strategy: 'openclaw_shared_secret', reason: 'invalid OpenClaw shared secret' };
    } catch {
      return { ok: false, strategy: 'openclaw_shared_secret', reason: 'invalid OpenClaw shared secret' };
    }
  }

  return {
    ok: false,
    strategy: 'none',
    reason: 'missing supported webhook authentication',
  };
}
