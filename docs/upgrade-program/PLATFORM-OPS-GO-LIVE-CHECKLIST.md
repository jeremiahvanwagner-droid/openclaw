# Platform Ops Go-Live Checklist

## Preconditions

- [ ] Backup of config files captured.
- [ ] Approval policy templates reviewed with operator.
- [ ] Non-production simulation run completed for each lane.
- [ ] Rollback owner assigned.

## Validation Gates

- [ ] `node scripts/upgrade/platform-ops-diagnostic.mjs`
- [ ] `node scripts/upgrade/validate-platform-ops-foundation.mjs`
- [ ] `node scripts/upgrade/simulate-platform-operation.mjs --lane ghl --action workflow_edit --payload '{"workflow_id":"wf-001","change_set":{},"change_reason":"test"}' --no-persist` returns `approval_required`.
- [ ] `node scripts/upgrade/simulate-platform-operation.mjs --lane substack --action issue_publish --payload '{"draft_id":"draft-001","qa_passed":true,"approved_by":"operator","publish_at":"2026-03-30T12:00:00.000Z"}' --no-persist` returns `approval_required`.

## Safety Controls

- [ ] Pause switch tested (`OPENCLAW_AUTONOMOUS_PAUSED=1`).
- [ ] Anti-loop protection verified with repeated simulation.
- [ ] Idempotency duplicate block verified.
- [ ] Rate-limit block verified.

## Observability

- [ ] Audit log file writable (`logs/platform-ops-audit.jsonl`).
- [ ] Cron strategy applied from `config/cron/platform-ops-jobs.json`.
- [ ] Alerts route to Telegram for high/critical failures.

## Activation

- [ ] Enable lane-specific live operations window.
- [ ] Monitor first high/critical approval requests in real time.
- [ ] Keep rollback owner on-call during first 24 hours.

## Success Criteria

- [ ] No unapproved high/critical operation executed.
- [ ] No profile cross-platform violation.
- [ ] No unresolved critical incident after 24 hours.
