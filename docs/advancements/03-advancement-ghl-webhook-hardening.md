# Advancement 3 — GHL Webhook Idempotency, Ed25519 Verification & Event Ledger (Phase 10 Opener)

## Summary

- **File Evidence:**
  - `ghl-webhook-handler.mjs:174-182` — signature verification is HMAC-SHA256 against `OPENCLAW_GHL_WEBHOOK_SECRET` only. Note also: `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed))` throws `RangeError` on length mismatch — a malformed header is an exception path, not a clean 401.
  - `.env.example:99-101` — "`OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY` — Optional override for GHL Ed25519 platform webhook verification. Leave blank to use the built-in current HighLevel public key." **No Ed25519 code exists in the handler** (grep for `ed25519|publicKey` in `ghl-webhook-handler.mjs`: zero hits). The env contract promises a verification mode the code does not implement.
  - `ghl-webhook-handler.mjs` (whole file) — zero hits for `dedupe`, `idempot`, `event_id`, `webhookId`, `processed`. Every delivery is processed as new; GHL retries deliveries on non-2xx and can double-deliver.
  - `ghl-webhook-handler.mjs:61-172` — 60+ event types route directly to agents via `openclawSend`; a duplicated `payment.received` or `contact.created` double-fires agent actions (double messages to real contacts).
  - **Live verification (2026-07-03):** `agent_events` table on DB1 = **0 rows** — the event ledger exists (`supabase/migrations/20260312000003_agent_tables.sql`, extended by `20260319000008:9-24` with `status` + `metadata` and an index) and nothing writes to it.
  - `REGGIE-STATE.md:114-124` — Phase 10 scope: "Confirm webhook event → agent routing is airtight."
  - `ghl-webhook-handler.mjs:20` — Phase 3 modules load from `workspace/skills` (see Advancement 5 for the duplication risk on that path).
- **Current State:** The webhook surface is the front door for the entire GHL → agent pipeline (the attached GoHighLevel Master Capability Guide 2026, Section 14, is the platform contract: workflows POST outbound webhooks; the AI Employee suite emits conversation/appointment events). Today that door has: shared-secret HMAC only, a signature-length crash path, no replay/duplicate protection, and no persistent record of what was received or processed.
- **Proposed Enhancement:** Harden the handler in place: (1) dedupe every delivery against `agent_events` keyed on the GHL delivery/message id with `ON CONFLICT DO NOTHING`; (2) implement the Ed25519 platform-signature path the env contract already documents, keeping HMAC as the fallback for custom-workflow webhooks; (3) guard `timingSafeEqual` with a length check; (4) write every accepted event to `agent_events` (received → completed/failed), lighting up the ledger that Phase 10 pipeline diagnostics will query.
- **Impact / Effort:** 9/10 · 4/10
- **Risk Eliminated:** Duplicate outbound actions to real contacts (SMS/email double-sends damage the brand and can violate A2P 10DLC expectations); forged webhooks if the shared secret ever leaks (Ed25519 verifies HighLevel's platform key instead); handler crash on malformed signature header.
- **Mission Advancement:** This is the first committed deliverable of Phase 10 (GHL Webhook Hardening). Every TJB funnel automation (Divine Seeker Journey intake, payment events, appointment lifecycle) crosses this handler.
- **Unlocks:** `agent_events` becomes the source for stale-lead diagnostics, Speed-to-Lead measurement (received_at → agent action delta), and the Inngest event re-typing follow-on; replay tooling (`scripts/` has `webhook-replay` precedent in skills) becomes safe because replays dedupe.

## Implementation Brief

### Files to Create/Modify/Delete

- **Create:** `lib/ghl-webhook-verify.mjs` (signature module: Ed25519 + HMAC), `lib/ghl-event-ledger.mjs` (Supabase dedupe/ledger)
- **Modify:** `ghl-webhook-handler.mjs` (wire both modules), `lib/__tests__/ghl-webhook.test.ts` (extend), `scripts/smoke-test-ghl-webhook-handler.mjs` (add duplicate + bad-signature cases), `.env.example` (no new vars; clarify comment)
- **Delete:** nothing.

### Step-by-Step Instructions

1. **`lib/ghl-webhook-verify.mjs`:**
   ```js
   import crypto from 'node:crypto';

   // Current HighLevel platform public key (PEM). Override via OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY.
   // Source at implementation time from https://highlevel.stoplight.io / marketplace docs —
   // pin the PEM here and record the retrieval date in this comment.
   const GHL_PLATFORM_PUBLIC_KEY = process.env.OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
   ...pinned-at-implementation...
   -----END PUBLIC KEY-----`;

   export function verifyEd25519(rawBody, signatureB64) {
     if (!signatureB64) return false;
     try {
       return crypto.verify(null, Buffer.from(rawBody),
         crypto.createPublicKey(GHL_PLATFORM_PUBLIC_KEY),
         Buffer.from(signatureB64, 'base64'));
     } catch { return false; }
   }

   export function verifyHmac(rawBody, signatureHex, secret) {
     if (!signatureHex || !secret) return false;
     const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
     const a = Buffer.from(signatureHex); const b = Buffer.from(computed);
     if (a.length !== b.length) return false;          // <- fixes the RangeError path
     return crypto.timingSafeEqual(a, b);
   }
   ```

2. **`lib/ghl-event-ledger.mjs`:** derive a stable delivery key — prefer GHL's `webhookId` / `messageId` header or body field; fall back to `sha256(rawBody)`:
   ```js
   import crypto from 'node:crypto';
   import { createClient } from '@supabase/supabase-js';
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

   export function deliveryKey(headers, rawBody, eventType) {
     const id = headers['x-webhook-id'] || headers['x-highlevel-webhook-id'];
     return id ? `ghl:${eventType}:${id}` : `ghl:${eventType}:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
   }

   // returns true if this is the FIRST time we see the key
   export async function claimEvent(key, eventType, payload) {
     const { error } = await sb.from('agent_events').insert({
       correlation_id: key, event_type: eventType, status: 'pending',
       metadata: { source: 'ghl-webhook', received_at: new Date().toISOString() },
       payload,
     });
     if (!error) return true;
     if (String(error.code) === '23505') return false;   // duplicate — already claimed
     // Supabase down: fail-open with in-memory LRU so webhooks still process
     return claimInMemory(key);
   }
   export async function settleEvent(key, ok, err) {
     await sb.from('agent_events')
       .update({ status: ok ? 'completed' : 'failed', error_message: err ?? null, processed_at: new Date().toISOString() })
       .eq('correlation_id', key);
   }
   ```
   Prereq migration (additive): `create unique index if not exists agent_events_correlation_uniq on agent_events(correlation_id);` — column already TEXT per `20260319000008:9-10`. Confirm `agent_events` column names against `20260312000003_agent_tables.sql` before writing the insert.
   `claimInMemory` = simple `Map` with max 5,000 keys / 24 h TTL.

3. **Wire into `ghl-webhook-handler.mjs`:**
   - Replace `verifySignature` (lines 174-182) with: try Ed25519 header (platform webhooks) → else HMAC (custom workflow webhooks) → else 401. Log which path verified.
   - At dispatch: `const key = deliveryKey(req.headers, rawBody, eventType); if (!(await claimEvent(key, eventType, payload))) { res 200 'duplicate'; return; }` — return 200 (not 4xx) on duplicates so GHL stops retrying.
   - Wrap handler invocation: `settleEvent(key, true)` on success, `settleEvent(key, false, message)` on throw.

4. **Tests (`lib/__tests__/ghl-webhook.test.ts`):** valid Ed25519 accepted; tampered body rejected; HMAC fallback works; short/garbage signature header returns 401 (no throw); same delivery twice → second returns duplicate and handler map fires once (spy on `openclawSend` via mock).

5. **Smoke test:** extend `scripts/smoke-test-ghl-webhook-handler.mjs` with a double-POST of the same payload asserting one processing line, and a bad-signature POST asserting 401.

### Verification Checklist

- [ ] `pnpm test` green including new signature/dedupe suites.
- [ ] Smoke test: duplicate POST → exactly one `agent_events` row, `status='completed'`, second response says duplicate.
- [ ] `select count(*) from agent_events` on DB1 **> 0** after a live GHL test event (send a test webhook from a GHL workflow).
- [ ] Malformed `x-wh-signature` header of wrong length → 401 response, process stays up (previously: uncaught RangeError path).
- [ ] Real platform webhook from GHL verifies via Ed25519 path (log line shows `verify=ed25519`).

### Rollback Procedure

1. `git revert <commit-sha>` — handler returns to HMAC-only, no-dedupe behavior.
2. The unique index is additive; leave it (harmless) or `drop index agent_events_correlation_uniq;`.
3. Rows written to `agent_events` are inert history; no cleanup required.

### Definition of Done

Two identical signed deliveries POSTed to the handler produce exactly **one** agent dispatch and one `agent_events` row with `status='completed'`, verified by the extended smoke test exiting 0. True → done.
