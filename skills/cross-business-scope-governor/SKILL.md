---
name: cross-business-scope-governor
description: >
  Enforces scope boundaries across all 10 businesses — data isolation,
  tool access, and policy rules — with automated drift detection and
  self-correction. Audits all 103 agents' permissions against their
  assigned scope sets, detects configuration drift from locked baselines,
  and auto-corrects safe violations while escalating unsafe ones.
owner: ops-ops
risk_tier: write_safe
divisions:
  - division_7_shared_services
agents:
  - shared_exec_orchestrator
  - biz_01_pod_lead
  - biz_02_pod_lead
  - biz_03_pod_lead
  - biz_04_pod_lead
  - biz_05_pod_lead
  - biz_06_pod_lead
  - biz_07_pod_lead
  - biz_08_pod_lead
  - biz_09_pod_lead
  - biz_10_pod_lead
external_systems:
  - supabase
side_effects:
  - modify_agent_config
  - write_supabase
triggers:
  - scope/audit.scheduled (cron: 0 2 * * *)
  - scope/drift.detected
  - scope/violation.attempted
---

# Cross-Business Scope Governor

## Purpose
Ensures every agent operates strictly within its authorized scope across all
10 businesses in the OpenClaw portfolio. Prevents data leakage between
businesses, enforces token group boundaries, and maintains an auditable trail
of every scope violation or drift event.

## Key Functions
- `auditScopeCompliance()` — Full 103-agent audit against scope sets
- `detectScopeDrift()` — Diff current config vs locked baseline
- `autoCorrectDrift()` — Safe auto-fix or HITL escalation
- `generateScopeBaseline()` — Lock current state as blessed baseline
- `crossBusinessIsolationCheck()` — Verify cross-business data isolation
- `policyGuardrailEnforcement()` — Validate approval policies are honored
