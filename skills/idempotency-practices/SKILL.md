---
name: idempotency-practices
description: Design and enforce idempotent write operations for workflows, API calls, and deployments. Use when changes may be retried or replayed to prevent duplicates and drift.
---

# Idempotency Practices

Ensure every write operation can be safely retried.

## Core Rules
- Generate deterministic idempotency keys per intent.
- Check existing state before create.
- Use upsert semantics where possible.
- Record operation ledger (key, timestamp, status).

## Key Format
`op:{resource}:{entityId}:{intentHash}`

## Validation
- Re-run same operation twice in test mode.
- Verify no duplicate objects or side effects.

## Output Contract
Return idempotency audit with key strategy, duplicate checks, and replay test results.
