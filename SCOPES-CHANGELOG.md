# GHL Scopes Changelog

All changes to GHL Business Scopes, token groups, and agent scope assignments.

| Date | Agent / Skill | Old Business Scope | New Business Scope | Old GHL Scope Set | New GHL Scope Set | Reason |
|---|---|---|---|---|---|---|
| 2026-03-25 | (all 27 GHL agents) | — | See SCOPES-PLAN.md §5.1 | — | Per-group tokens (6 groups) | Initial scope system creation; least-privilege enforcement across TJB sub-account |
| 2026-03-25 | (system) | — | — | — | — | Implementation complete: ghl-scope-enforcer.mjs, ghl-client proxy wrapper, security-governance integration, 44 new tests (154 total passing) |
