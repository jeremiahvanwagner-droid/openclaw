---
name: finance-high-frequency-execution
description: Execute latency-sensitive trade actions under strict risk and policy controls to capture short-lived market dislocations. Use when running high-frequency strategies that require deterministic safeguards and pre-trade validation.
---

# High-frequency Execution

1. Ingest live market data with deterministic timestamping.
2. Evaluate strategy signals against pre-approved execution rules.
3. Run pre-trade checks (position limits, exposure caps, kill-switch state).
4. Submit orders via low-latency execution pathways.
5. Enforce slippage and adverse-selection guards.
6. Cancel or hedge stale/unfilled orders by policy.
7. Output execution telemetry and post-trade risk summary.