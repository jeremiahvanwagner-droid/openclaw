---
name: retry-backoff-wrapper
description: Apply safe retry and exponential backoff patterns for API/tool calls with jitter, retry caps, and circuit breakers. Use when handling transient failures, 429/5xx responses, or flaky integrations.
---

# Retry + Backoff Wrapper

Use retries only for transient failures.

## Retryable Conditions
- HTTP 429, 502, 503, 504
- network timeout/reset

## Non-Retryable Conditions
- 400/401/403 (unless auth refresh flow explicitly configured)
- validation/schema errors

## Policy
- exponential backoff with jitter
- max retries: 5
- honor Retry-After when present
- open circuit breaker on retry storms

## Output Contract
Return execution report with attempts, delays, final result, and error class.
