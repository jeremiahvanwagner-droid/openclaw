# Platform Ops Runbook

## Daily Cadence

1. Run diagnostic heartbeat:
   - `node scripts/upgrade/platform-ops-diagnostic.mjs --compact`
2. Validate controls:
   - `node scripts/upgrade/validate-platform-ops-foundation.mjs`
3. Review audit status buckets for last 24 hours:
   - `node scripts/upgrade/platform-ops-diagnostic.mjs --from-audit --hours 24`
4. Confirm no high/critical action is pending without owner.

## Weekly Cadence

1. Run full validation and archive output to `reports/`.
2. Review approval reject rates and circuit-breaker events.
3. Execute at least one sandbox rehearsal per lane.
4. Verify rollback procedures by tabletop simulation.

## Incident Response Workflow

### Severity Definition
- SEV-1: Unsafe action executed or platform-wide outage
- SEV-2: Approval or routing controls degraded
- SEV-3: Lane-specific failures with containment

### Incident Steps
1. Activate pause switch:
   - `OPENCLAW_AUTONOMOUS_PAUSED=1`
2. Confirm no further high/critical execution decisions are approved.
3. Gather evidence:
   - Recent entries from `logs/platform-ops-audit.jsonl`
   - Validation output
4. Execute lane rollback path from lane playbook.
5. Escalate to lane owner and executive operator.
6. After remediation, clear pause switch and run validator.

## Recovery and Self-Healing Workflow

1. Classify failure type:
   - transient (timeout/network)
   - policy violation (loop/idempotency/rate-limit)
   - platform auth/session issue
2. Apply automated recovery:
   - timeout/network: retry policy
   - loop/idempotency: hold and require human review
   - auth/session: re-login or fallback profile
3. If repeated failures exceed profile threshold:
   - route to `sandbox-test`
   - open incident and notify operator
4. Record post-execution outcome in audit log.

## Recommended Cron Strategy

Use `config/cron/platform-ops-jobs.json` as source of truth.

- Hourly: `validate-platform-ops-foundation`
- Every 15 minutes: compact diagnostic heartbeat
- Daily: audit window summary

## Operator Commands

```bash
# Baseline diagnostic
node scripts/upgrade/platform-ops-diagnostic.mjs

# Validation gate
node scripts/upgrade/validate-platform-ops-foundation.mjs

# Safe simulation (no persistence)
node scripts/upgrade/simulate-platform-operation.mjs --lane social --action post_publish --payload '{"platform":"instagram","content":"Test","media_urls":[],"approved_by":"operator","content_hash":"abc"}' --no-persist

# Reset guard ledgers (maintenance only)
node scripts/upgrade/simulate-platform-operation.mjs --lane ghl --action contact_read --reset-ledgers --no-persist
```
