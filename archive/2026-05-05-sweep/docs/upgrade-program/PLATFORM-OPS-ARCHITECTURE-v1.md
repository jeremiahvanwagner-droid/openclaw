# Platform Ops Architecture Blueprint v1

## Scope
Production-grade multi-browser, multi-platform operating model for GoHighLevel, social channels, Skool, and Substack with deterministic routing and enforceable safety controls.

## Browser Topology

| Profile | Primary Purpose | Isolation Model | Login and Session Policy | Timeout and Retry | Failure Handling |
| --- | --- | --- | --- | --- | --- |
| `ghl-live` | Live CRM, pipeline, and workflow operations | Dedicated persisted profile directory (`profiles/ghl-live`), GHL-only platform allowlist | Persisted session, 24-hour max session age, re-login on expiry, MFA required | `timeout_ms: 60000`, retry max 2 with backoff | Retry then alert, pause profile after 3 consecutive failures, fallback to `sandbox-test` |
| `social-live` | Social publishing, moderation, and response operations | Dedicated persisted profile directory (`profiles/social-live`), social platform allowlist | Persisted session, 48-hour max session age, expiry alert, MFA required | `timeout_ms: 90000`, retry max 1 | Retry then alert, throttle after 2 consecutive failures, fallback to `sandbox-test` |
| `content-live` | Substack editorial and Skool community operations | Dedicated persisted profile directory (`profiles/content-live`), Substack+Skool allowlist | Persisted session, 72-hour max session age, re-login on expiry, MFA required | `timeout_ms: 60000`, retry max 2 | Retry then alert, route to manual queue after 3 consecutive failures, fallback to `sandbox-test` |
| `sandbox-test` | Safe rehearsals and dry runs | Non-persistent isolated profile (`profiles/sandbox-test`) | No session reuse, 1-hour session age, non-production tokens only | `timeout_ms: 30000`, retry max 1 | Fail fast and halt run |

## Platform Lane Model

### GHL Lane
- Browser profile: `ghl-live`
- Boundaries: CRM reads/writes, pipeline moves, workflow and funnel operations
- Human gate: workflow edits/deletes and bulk deletes require approval

### Social Lane
- Browser profile: `social-live`
- Boundaries: draft generation, scheduling, moderation, publish/delete actions
- Human gate: publish, DM send, reply send, delete actions require approval

### Skool Lane
- Browser profile: `content-live`
- Boundaries: moderation, engagement drafting, community publishing, member operations
- Human gate: member bans, member DMs, and publish actions require approval

### Substack Lane
- Browser profile: `content-live`
- Boundaries: draft lifecycle, QA checks, issue scheduling/publishing
- Human gate: `issue_publish` and `post_delete` require approval

## Task Routing Model

Routing policy is deterministic first, then safe fallback:
1. Explicit lane request wins.
2. Source-based routing maps to lane (`ghl` -> GHL, social platforms -> Social, `skool` -> Skool, `substack` -> Substack).
3. Unknown source routes to fallback lane using forced `sandbox-test` plus human confirmation.

Reference: `config/governance/platform-routing-policy.json`.

## Risk Tier Matrix

| Tier | Approval | Typical Actions | Blast Radius | Required Controls |
| --- | --- | --- | --- | --- |
| Low | No | Read/list/preview/analytics | Minimal | Audit optional, anti-loop enabled |
| Medium | No (audit required) | Update/schedule/move/tag | Localized | Audit required, rollback path required |
| High | Yes | Publish/send/workflow edit | External and user-visible | Human approval, audit, rate-limit, idempotency |
| Critical | Yes (explicit phrase) | Delete/ban/bulk destructive actions | High | Human approval + explicit phrase + wait window + circuit breaker |

Reference: `config/approval-policies.json` and `config/governance/platform-risk-tier-matrix.json`.

## Runtime Enforcement Path

1. Incoming request resolved to lane.
2. Lane action checked against profile allow/gate/forbid sets.
3. Required input validation runs.
4. Pause switch check (`OPENCLAW_AUTONOMOUS_PAUSED`).
5. Anti-loop check runs on lane fingerprint.
6. Idempotency key dedupe check runs.
7. Rate-limit check runs at profile/platform level.
8. Decision emitted: `approved_auto`, `approved_dry_run`, `approval_required`, or blocked status.
9. Audit event recorded to `logs/platform-ops-audit.jsonl`.

Runtime module: `lib/platform-ops-governance.mjs`.
