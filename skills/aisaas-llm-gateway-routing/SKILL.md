---
name: aisaas-llm-gateway-routing
description: Route requests to the best-fit model tier based on complexity, latency, and cost constraints. Use when balancing performance and quality across mixed AI workloads.
---

# LLM Gateway Routing

1. Classify request complexity and quality requirements.
2. Map request class to model tiers and fallback policies.
3. Enforce per-tenant budget and latency constraints.
4. Dispatch query with routing rationale metadata.
5. Escalate to stronger models when confidence is low.
6. Capture outcomes to refine routing decisions.
7. Output routing efficiency and quality tradeoff report.