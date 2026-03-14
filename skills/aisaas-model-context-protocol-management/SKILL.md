---
name: aisaas-model-context-protocol-management
description: Manage model context protocols so AI applications preserve relevant historical state across sessions and workflows. Use when implementing long-horizon memory, context window policies, and selective recall logic.
---

# Model Context Protocol Management

1. Define context layers (session, user, workspace, durable memory).
2. Establish retention and eviction policies by relevance and recency.
3. Segment context into retrievable chunks with metadata tags.
4. Apply context compaction before token budget thresholds.
5. Rehydrate only task-relevant context at runtime.
6. Log context inclusion decisions for auditability.
7. Output context health metrics and drift alerts.