# OpenClaw Upgrade Program Implementation (U01-U25)

This folder operationalizes the 2026-03-25 upgrade program into executable checks, governance artifacts, and runbooks.

## Execution Order

1. `node scripts/upgrade/validate-filesystem-hardening.mjs --root /opt/openclaw/.openclaw`
2. `node scripts/upgrade/check-operator-scope.mjs`
3. `node scripts/upgrade/check-trusted-proxies.mjs --config config/openclaw.prod.json`
4. `node scripts/upgrade/revalidate-sensitive-tokens.mjs`
5. `node scripts/upgrade/post-update-smoke.mjs`
6. `node scripts/upgrade/generate-agent-scope-space-mapping.mjs`
7. `node scripts/upgrade/generate-tool-allowlist-policy.mjs`
8. `node scripts/upgrade/check-governance-drift.mjs`
9. `node scripts/upgrade/validate-offer-matrix.mjs`
10. `node scripts/upgrade/validate-worker-env.mjs --expected production`
11. `node scripts/upgrade/active-agents-zero-events-alert.mjs`
12. `node scripts/upgrade/daily-heartbeat-summary.mjs --send-alert`
13. `node scripts/upgrade/validate-funnel-telemetry.mjs --hours 24`
14. `node scripts/upgrade/pilot-monitor.mjs --hours 72`
15. `node scripts/upgrade/platform-ops-diagnostic.mjs`
16. `node scripts/upgrade/validate-platform-ops-foundation.mjs`

## Program Artifacts

- `config/schemas/canonical-scope.schema.json` (U14)
- `config/schemas/canonical-space.schema.json` (U15)
- `config/governance/agent-scope-space-mapping.json` (U16)
- `config/governance/tool-allowlist-policy.json` (U17)
- `data/worker-environment-map.json` (U12)
- `data/tjb-offer-matrix.json` (U19 + U21)
- `data/ghl-funnel-paths.json` (U20)
- `data/recovery-automation-policies.json` (U22)
- `config/browser-profiles.json` (platform ops v1)
- `config/platform-lanes.json` (platform ops v1)
- `config/approval-policies.json` (platform ops v1)
- `config/governance/platform-routing-policy.json` (platform ops v1)
- `config/governance/platform-risk-tier-matrix.json` (platform ops v1)
- `docs/upgrade-program/PLATFORM-OPS-ARCHITECTURE-v1.md`
- `docs/upgrade-program/LANE-PLAYBOOKS.md`
- `docs/upgrade-program/APPROVAL-POLICY-TEMPLATES.md`
- `docs/upgrade-program/PLATFORM-OPS-RUNBOOK.md`
- `docs/upgrade-program/FUTURE-PLATFORM-ONBOARDING-TEMPLATE.md`
- `docs/upgrade-program/PLATFORM-OPS-GO-LIVE-CHECKLIST.md`

## Approval Gates (J VW required)

- U01-U05, U08, U12, U16-U17, U19-U22, U24
- Use `docs/upgrade-program/GO-NO-GO-CHECKLIST.md` before each gated milestone.

## Notes

- This repository implementation provides deterministic validation and governance controls.
- Live production actions (chmod in `/opt`, token rotations, service restarts, and GHL workflow publishing) must be executed during approved maintenance windows.
