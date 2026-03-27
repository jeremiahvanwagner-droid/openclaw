# Future Platform Onboarding Template

Target: Add a new platform lane in under one day with safety parity.

## 1. Connector Checklist

- Platform API or browser endpoint documented
- Required actions categorized (read/write/publish/destructive)
- Sandbox/test account available
- Non-production credentials provisioned
- Rate limits documented

## 2. Auth Strategy

- Credential source: environment + secret store
- Token scope reviewed for least privilege
- Session profile mapped (`live` and `sandbox-test`)
- MFA policy documented
- Re-auth interval defined

## 3. Lane Schema

Create or update in `config/platform-lanes.json`:
- `lane_id`, `display_name`, `browser_profile`
- `trigger_conditions`
- `operations` with `risk`, `requires_approval`, `idempotent`
- `required_inputs`
- `output_format`
- `audit_log_fields`
- `rollback`
- `anti_loop_config`

## 4. Browser Profile Schema

Create or update in `config/browser-profiles.json`:
- `purpose`, `session_dir`, `allowed_platforms`
- `session_policy` and `login_policy`
- `rate_limits`, `timeout_ms`, `retry_policy`
- `allowed_actions`, `gated_actions`, `forbidden_actions`
- `failure_handling`

## 5. Test Matrix

- Positive safe action test
- Approval-required action test
- Forbidden action blocked test
- Idempotency duplicate blocked test
- Anti-loop threshold blocked test
- Rate-limit threshold blocked test
- Pause switch blocks action test

## 6. Security Checklist

- No plaintext secrets in config/docs/logs
- High/critical actions require human confirmation
- Destructive actions have rollback guidance
- Audit events include lane/action/correlation/risk/result
- Sandbox fallback defined for repeated failures

## 7. Go-Live Gate

- `node scripts/upgrade/validate-platform-ops-foundation.mjs` passes
- Lane simulation scenarios pass
- Operator approval templates updated
- Runbook entry added
- Rollback owner assigned
