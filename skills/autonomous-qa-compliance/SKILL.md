---
name: autonomous-qa-compliance
description: >
  Continuous quality assurance and compliance checks across all 10 businesses.
  Audits funnels for broken links, tracking integrity (UTM flow-through),
  brand compliance, policy guardrails, and mobile UX. Generates scored
  compliance scorecards with category-level drill-down.
owner: ops-ops
risk_tier: draft_only
divisions:
  - division_8_saas_operations
  - division_7_shared_services
agents:
  - d8_compliance_auditor
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
  - ghl
side_effects:
  - write_supabase
triggers:
  - qa/scheduled.audit (cron: 0 3 * * *)
  - qa/funnel.published
  - qa/compliance.alert
  - qa/tracking.broken
---

# Autonomous QA & Compliance

## Purpose
Automated quality and compliance monitoring that catches funnel breakage,
tracking gaps, brand violations, and policy misconfigurations before they
impact customers or revenue.

## Key Functions
- `runFunnelAudit()` — Crawl funnel pages: links, load time, SSL, meta, tracking pixels
- `runTrackingIntegrityCheck()` — Verify UTM parameter flow through entire funnel
- `runBrandComplianceCheck()` — Validate content against brand guidelines
- `runPolicyGuardrailCheck()` — Pre-execution action authorization check
- `runMobileUXAudit()` — Lighthouse-style mobile experience checks
- `generateComplianceScorecard()` — Aggregate scored report (0-100) per category
