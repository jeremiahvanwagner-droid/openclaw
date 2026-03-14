---
name: aisaas-api-rate-limit-handling
description: Handle third-party API throttling safely using retries, backoff, and circuit controls. Use when preventing outages or data loss during bursty integration traffic.
---

# API Rate Limit Handling

1. Detect rate-limit headers, status codes, and quota windows.
2. Queue and prioritize requests by criticality.
3. Apply exponential backoff with jitter for retries.
4. Honor Retry-After and provider-specific constraints.
5. Open circuit breakers on persistent throttle/failure states.
6. Degrade gracefully with fallback responses.
7. Output throttle telemetry and retry effectiveness metrics.