# Hardened Baseline (U07)

## Security Controls

- Filesystem permissions:
  - `.openclaw` directory: `700`
  - `openclaw.json`: `600`
- Operator diagnostics scope: `operator.read` present.
- Gateway reverse-proxy trust: `gateway.trustedProxies` configured when proxied.
- Sensitive token posture: rotated/revalidated after permission and scope remediation.

## Reliability Controls

- OpenClaw target version: `2026.3.23-2`.
- Post-update smoke checks: gateway health, webhook smoke, agent health.
- Runtime alerting enabled for:
  - Active agents + zero events/hour
  - Heartbeat exception summary

## Governance Controls

- Canonical scope schema: `config/schemas/canonical-scope.schema.json`
- Canonical space schema: `config/schemas/canonical-space.schema.json`
- Agent scope/space mapping: `config/governance/agent-scope-space-mapping.json`
- Deny-by-default allowlists: `config/governance/tool-allowlist-policy.json`
- Drift validation: `node scripts/upgrade/check-governance-drift.mjs`

## Revenue Controls

- Offer source of truth: `data/tjb-offer-matrix.json`
- Required funnel path: `data/ghl-funnel-paths.json`
- Recovery automations: `data/recovery-automation-policies.json`
- Telemetry gate: `node scripts/upgrade/validate-funnel-telemetry.mjs`

## Review Cadence

- Weekly deep security audit (U06): every Monday 09:00 America/Chicago.
- Weekly executive review ritual (U25): every Friday 16:00 America/Chicago.
