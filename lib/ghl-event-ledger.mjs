/**
 * GHL Webhook Event Ledger — Advancement 3
 * (docs/advancements/03-advancement-ghl-webhook-hardening.md)
 *
 * Dedupe + persistence for inbound GHL webhook deliveries, backed by the
 * agent_events table (partial unique index agent_events_ghl_dedupe_uniq on
 * correlation_id WHERE metadata->>'source' = 'ghl-webhook').
 *
 * GHL retries deliveries on non-2xx and can double-deliver; every accepted
 * delivery is claimed exactly once here before any agent action fires.
 *
 * Failure policy: Supabase being down must never drop webhooks — claims fall
 * back to an in-process LRU so processing continues (dedupe then only spans
 * this process's lifetime, which is the pre-ledger status quo).
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

let _client = null;
let _clientFailed = false;

function getSupabase() {
  if (_clientFailed) return null;
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    _clientFailed = true;
    return null;
  }
  try {
    _client = createClient(url, key, { auth: { persistSession: false } });
  } catch {
    _clientFailed = true;
    return null;
  }
  return _client;
}

// ── In-memory fallback (and fast-path guard for same-process retries) ──────
const MEMORY_MAX = 5000;
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const memoryClaims = new Map(); // key -> claimedAtMs

function claimInMemory(key) {
  const now = Date.now();
  const existing = memoryClaims.get(key);
  if (existing && now - existing < MEMORY_TTL_MS) return false;
  memoryClaims.set(key, now);
  if (memoryClaims.size > MEMORY_MAX) {
    // Evict oldest entries (Map preserves insertion order)
    const excess = memoryClaims.size - MEMORY_MAX;
    let index = 0;
    for (const k of memoryClaims.keys()) {
      memoryClaims.delete(k);
      if (++index >= excess) break;
    }
  }
  return true;
}

/**
 * Stable delivery key for a webhook. Prefers GHL's own delivery/webhook id
 * (header or body); falls back to a content hash so identical retried bodies
 * still dedupe.
 */
export function deliveryKey(headers, rawBody, eventType, payload = {}) {
  const headerId =
    headers?.['x-webhook-id'] ||
    headers?.['x-highlevel-webhook-id'] ||
    headers?.['x-wh-id'];
  const bodyId = payload.webhookId || payload.messageId || payload.deliveryId;
  const id = headerId || bodyId;
  if (id) return `ghl:${eventType}:${id}`;
  const hash = crypto.createHash('sha256').update(String(rawBody)).digest('hex');
  return `ghl:${eventType}:${hash}`;
}

/**
 * Claim a delivery. Returns true only for the FIRST claim of this key.
 * The claim row doubles as the event ledger entry (status lifecycle:
 * pending -> completed | failed via settleEvent).
 */
export async function claimEvent(key, eventType, meta = {}) {
  const sb = getSupabase();
  if (!sb) return claimInMemory(key);
  try {
    const { error } = await sb.from('agent_events').insert({
      event_name: eventType,
      source_agent: 'ghl-webhook',
      correlation_id: key,
      status: 'pending',
      payload: meta,
      metadata: { source: 'ghl-webhook', received_at: new Date().toISOString() },
    });
    if (!error) {
      claimInMemory(key); // keep the fast path warm
      return true;
    }
    if (String(error.code) === '23505') return false; // duplicate — already claimed
    console.warn(`[LEDGER] claim insert failed (${error.code || '?'}): ${error.message} — using in-memory fallback`);
    return claimInMemory(key);
  } catch (err) {
    console.warn(`[LEDGER] claim failed: ${err.message} — using in-memory fallback`);
    return claimInMemory(key);
  }
}

/** Mark a claimed delivery processed (or failed). Best-effort. */
export async function settleEvent(key, ok, errorMessage = null) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb
      .from('agent_events')
      .update({
        status: ok ? 'completed' : 'failed',
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('correlation_id', key)
      .eq('source_agent', 'ghl-webhook');
    if (error) console.warn(`[LEDGER] settle failed: ${error.message}`);
  } catch (err) {
    console.warn(`[LEDGER] settle failed: ${err.message}`);
  }
}

/** Test hook: reset module state. */
export function __resetForTests() {
  memoryClaims.clear();
  _client = null;
  _clientFailed = false;
}
