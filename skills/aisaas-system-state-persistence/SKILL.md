---
name: aisaas-system-state-persistence
description: Persist intermediate and final system states to durable storage for recovery and continuity. Use when preventing data loss in long-running AI workflows or distributed execution.
---

# System State Persistence

1. Define checkpoint boundaries across workflow stages.
2. Serialize state with versioned schemas.
3. Write checkpoints to durable external storage.
4. Validate write integrity and recovery readiness.
5. Resume workflows from latest valid checkpoint on failure.
6. Expire stale checkpoints by retention policy.
7. Output persistence health and recovery test results.