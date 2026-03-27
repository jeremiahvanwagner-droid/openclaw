# Platform Ops Implementation Backlog

## Priority and Sequencing

### P0 (Must Complete Before Broad Live Enablement)

| ID | Task | Outcome | Dependencies | Estimate |
| --- | --- | --- | --- | --- |
| P0-1 | Validate lane/profile/policy coherence | All required lanes and profiles pass validator | None | 0.5 day |
| P0-2 | Enable runtime preflight enforcement module | Requests are blocked unless they pass risk and safety checks | P0-1 | 1 day |
| P0-3 | Wire approval flow for high/critical actions | Human approvals required before external/destructive actions | P0-2 | 1 day |
| P0-4 | Roll out profile directories and credential policy | Isolated sessions for each profile with least privilege | P0-2 | 0.5 day |
| P0-5 | Run sandbox rehearsals for each lane | End-to-end dry-run passes for all four lanes | P0-2, P0-3 | 0.5 day |

### P1 (Stability and Observability)

| ID | Task | Outcome | Dependencies | Estimate |
| --- | --- | --- | --- | --- |
| P1-1 | Add hourly validation and 15-minute diagnostics cron | Drift and control failures detected quickly | P0 complete | 0.5 day |
| P1-2 | Add lane-specific dashboard cards | Live health metrics per lane and profile | P0 complete | 1 day |
| P1-3 | Add approval SLA and timeout metrics | Visibility into pending/rejected approvals | P0-3 | 0.5 day |
| P1-4 | Add replay-safe recovery routines | Known rollback actions are operator runnable | P0 complete | 1 day |

### P2 (Scale and Future Platforms)

| ID | Task | Outcome | Dependencies | Estimate |
| --- | --- | --- | --- | --- |
| P2-1 | New platform onboarding template automation | New lanes can be created and validated in <1 day | P1 complete | 1 day |
| P2-2 | Tenant-specific profile partitioning | Cleaner isolation per business tenant | P1 complete | 1 day |
| P2-3 | Lane-level canary release controls | Incremental go-live for each new platform | P1 complete | 1 day |

## Dependency Graph (High-Level)

1. `P0-1` -> `P0-2`
2. `P0-2` -> `P0-3`, `P0-4`, `P0-5`
3. `P0` complete -> `P1`
4. `P1` complete -> `P2`

## Current Status Snapshot (This Execution)

- Implemented: `P0-1`, `P0-2` foundation artifacts and validation tooling
- Partially implemented: `P0-3` policy templates and decision outputs (final wire-up to live posting executors pending)
- Pending: Remaining P0 production run rehearsal and full P1/P2 tasks
