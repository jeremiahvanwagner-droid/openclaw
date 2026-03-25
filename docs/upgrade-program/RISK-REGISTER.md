# Risk Register

| Risk | Trigger | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Auth/scope drift | Missing `operator.read` after change/upgrade | Diagnostics blind spots | `check-operator-scope` + schema/drift gates | Runtime Ops |
| Env mismatch | Worker mapped to wrong environment | Event loss or cross-env contamination | `validate-worker-env` before deploy windows | Runtime Ops |
| Dashboard false positives | Alert thresholds too aggressive | Alert fatigue and ignored incidents | Burn-in thresholds and weekly tuning in executive review | Data Ops |
| Service restart risk | Upgrade/restart during peak load | Revenue-impacting downtime | Smoke tests + rollback checklist + controlled windows | Platform Ops |
| Data/privacy exposure | Weak file perms or stale tokens | Credential/PII compromise | Hardening checks + token revalidation + weekly audits | Security Ops |
