---
name: aisaas-prompt-caching-optimization
description: Optimize prompt and response caching to reduce inference cost and latency. Use when serving repeated query patterns or high-volume assistant traffic.
---

# Prompt Caching Optimization

1. Identify cacheable prompt segments and deterministic templates.
2. Separate static context from dynamic user inputs.
3. Generate stable cache keys with version controls.
4. Apply TTL and invalidation rules by content volatility.
5. Route cache hits before model invocation.
6. Track hit rate, latency delta, and cost savings.
7. Output cache tuning recommendations by endpoint.