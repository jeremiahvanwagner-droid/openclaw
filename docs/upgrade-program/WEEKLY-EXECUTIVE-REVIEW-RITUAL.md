# Weekly Executive Review Ritual (U25)

## Cadence

- Day/time: Friday, 16:00 America/Chicago
- Facilitator: `shared_exec_orchestrator`
- Required attendees: J VW, Runtime Ops owner, Security Ops owner, Revenue Ops owner

## Inputs (must be ready 2 hours before)

- Security report:
  - Output of `validate-filesystem-hardening`, `check-operator-scope`, and weekly audit checklist
- Reliability report:
  - `post-update-smoke`, `active-agents-zero-events-alert`, `daily-heartbeat-summary`
- Governance report:
  - `check-governance-drift` output and exception requests
- Revenue report:
  - `validate-offer-matrix`, `validate-funnel-telemetry`, `pilot-monitor`

## Decision Agenda

1. Go/No-Go on pending gated tasks for next week
2. Exceptions requiring human override (security/governance/revenue)
3. Funnel conversion blockers and payment recovery issues
4. Pilot continuation or rollback decision

## Outputs

- Executive decision log entry with owner + due date per action
- Updated risk register status (`open`, `mitigating`, `closed`)
- Approved change window list for the next 7 days
