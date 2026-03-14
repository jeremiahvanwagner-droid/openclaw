---
name: finance-distributed-event-polling
description: Poll and synchronize fragmented market/event feeds for low-latency arbitrage calculations. Use when aggregating distributed data sources that update asynchronously.
---

# Distributed Event Polling

1. Register approved data endpoints and polling cadences.
2. Pull events with monotonic checkpoints per source.
3. Normalize timestamps and resolve clock skew.
4. Deduplicate and merge fragmented event streams.
5. Detect stale feeds and fail over to secondary sources.
6. Publish unified event bus for downstream strategies.
7. Output feed health and latency diagnostics.