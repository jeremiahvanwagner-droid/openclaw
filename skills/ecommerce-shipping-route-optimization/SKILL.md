---
name: ecommerce-shipping-route-optimization
description: Select optimal shipping carrier and route using live rates, SLA targets, and delivery risk constraints. Use when minimizing cost while preserving delivery speed and reliability.
---

# Shipping Route Optimization

1. Collect order destination, package profile, SLA requirements, and carrier options.
2. Pull live rate, transit time, and reliability signals.
3. Score candidate routes by cost, delivery promise, and risk.
4. Select best-fit carrier/route under policy constraints.
5. Apply fallback logic for unavailable or degraded carriers.
6. Commit shipment plan and emit tracking initialization.
7. Output route performance metrics for continuous tuning.