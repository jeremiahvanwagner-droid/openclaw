# Upgrade Backlog Tracker (U01-U25)

| ID | Status | Implementation Artifact | Validation Command |
| --- | --- | --- | --- |
| U01-U02 | Implemented (repo automation) | `scripts/upgrade/validate-filesystem-hardening.mjs` | `node scripts/upgrade/validate-filesystem-hardening.mjs --root /opt/openclaw/.openclaw` |
| U03 | Implemented (diagnostics guard) | `scripts/upgrade/check-operator-scope.mjs` | `node scripts/upgrade/check-operator-scope.mjs` |
| U04 | Implemented (config check) | `scripts/upgrade/check-trusted-proxies.mjs` | `node scripts/upgrade/check-trusted-proxies.mjs --config config/openclaw.prod.json` |
| U05 | Implemented | `scripts/upgrade/revalidate-sensitive-tokens.mjs` + checklist | `node scripts/upgrade/revalidate-sensitive-tokens.mjs` |
| U06 | Implemented | `docs/upgrade-program/WEEKLY-SECURITY-AUDIT.md` | Weekly audit run |
| U07 | Implemented | `docs/upgrade-program/HARDENED-BASELINE.md` | Baseline review |
| U08-U09 | Implemented (smoke automation) | `scripts/upgrade/post-update-smoke.mjs` | `node scripts/upgrade/post-update-smoke.mjs` |
| U10-U11 | Implemented | `scripts/upgrade/active-agents-zero-events-alert.mjs` | `node scripts/upgrade/active-agents-zero-events-alert.mjs` |
| U12 | Implemented | `data/worker-environment-map.json`, `scripts/upgrade/validate-worker-env.mjs` | `node scripts/upgrade/validate-worker-env.mjs --expected production` |
| U13 | Implemented | `scripts/upgrade/daily-heartbeat-summary.mjs` | `node scripts/upgrade/daily-heartbeat-summary.mjs --send-alert` |
| U14-U16 | Implemented | `canonical-*` schemas + generated mapping | `pnpm upgrade:governance:generate` |
| U17-U18 | Implemented | `config/governance/tool-allowlist-policy.json` + drift check | `pnpm upgrade:governance:drift` |
| U19 | Implemented | `data/tjb-offer-matrix.json` | `node scripts/upgrade/validate-offer-matrix.mjs` |
| U20 | Implemented (source-of-truth path spec) | `data/ghl-funnel-paths.json` | Workflow wiring review against spec |
| U21 | Implemented | Payment links in `data/tjb-offer-matrix.json` | `node scripts/upgrade/validate-offer-matrix.mjs` |
| U22 | Implemented | `data/recovery-automation-policies.json` | Policy review + workflow QA |
| U23 | Implemented | `scripts/upgrade/validate-funnel-telemetry.mjs` | `node scripts/upgrade/validate-funnel-telemetry.mjs --hours 24` |
| U24 | Implemented | `scripts/upgrade/pilot-monitor.mjs` | `node scripts/upgrade/pilot-monitor.mjs --hours 72` |
| U25 | Implemented | `docs/upgrade-program/WEEKLY-EXECUTIVE-REVIEW-RITUAL.md` | Weekly ritual execution |
