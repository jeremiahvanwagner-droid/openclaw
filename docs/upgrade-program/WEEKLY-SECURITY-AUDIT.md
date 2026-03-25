# Weekly Deep Security Audit (U06)

## Schedule

- Every Monday, 09:00 America/Chicago
- Owner: Security Ops
- Escalation: shared_exec_orchestrator -> J VW

## Audit Steps

1. Filesystem posture
   - `node scripts/upgrade/validate-filesystem-hardening.mjs --root /opt/openclaw/.openclaw`
2. Operator scope posture
   - `node scripts/upgrade/check-operator-scope.mjs`
3. Trusted proxy posture
   - `node scripts/upgrade/check-trusted-proxies.mjs --config config/openclaw.prod.json`
4. Governance drift
   - `node scripts/upgrade/check-governance-drift.mjs`
5. Runtime anomaly signal
   - `node scripts/upgrade/active-agents-zero-events-alert.mjs`

## Pass/Fail Criteria

- PASS: all checks exit 0 and no unresolved critical findings.
- FAIL: any check exits non-zero or critical drift detected.

## Required Outputs

- Audit timestamp
- Command outputs attached
- Findings grouped by severity (`critical`, `high`, `medium`, `low`)
- Remediation owner + SLA per finding
