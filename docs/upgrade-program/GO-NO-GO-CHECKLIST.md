# Go / No-Go Checklist

## Mandatory Before Execution

- [ ] J VW approval logged for all gated tasks in current wave.
- [ ] Maintenance window start/end and rollback owner assigned.
- [ ] Baseline snapshots captured (version, config hash, active agent count, event rate).
- [ ] Backup material verified (config backup, token escrow, previous package version).
- [ ] `node scripts/upgrade/post-update-smoke.mjs` prepared with correct auth mode.
- [ ] Scope and space schema changes reviewed (`canonical-scope` and `canonical-space`).
- [ ] Offer matrix approved (`data/tjb-offer-matrix.json`).
- [ ] Pilot success thresholds documented (traffic, success rate, alert tolerance).

## No-Go Conditions

- [ ] Operator diagnostics still show missing `operator.read` scope.
- [ ] Filesystem hardening check unresolved (`validate-filesystem-hardening` fails).
- [ ] Unknown worker environment mappings (`validate-worker-env` fails).
- [ ] Governance drift unresolved (`check-governance-drift` fails).
- [ ] Smoke checks fail after upgrade.

If any No-Go item is true, stop and execute rollback notes from the relevant U-task.
