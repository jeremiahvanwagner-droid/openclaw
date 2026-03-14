---
name: webhook-replay-tooling
description: Capture, validate, and safely replay webhook events for debugging and recovery. Use when webhook deliveries fail, handlers change, or event processing needs deterministic re-test.
---

# Webhook Replay Tooling

Replay webhook events safely without duplicate side effects.

## Steps
1. Capture failed payload + headers + signature metadata.
2. Validate signature and schema before replay.
3. Replay to staging handler first.
4. Replay to production only with idempotency guard active.
5. Compare expected vs actual outcomes.

## Safety
- Never replay without idempotency protection.
- Redact secrets in logs.
- Limit replay window and count.

## Output Contract
Return replay report with event id, replay count, handler result, and remediation notes.
