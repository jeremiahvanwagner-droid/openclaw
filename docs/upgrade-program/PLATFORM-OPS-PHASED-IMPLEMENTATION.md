# Platform Ops Phased Implementation

## Phase 0: Baseline Diagnostic

### What Changes
- Run baseline diagnostics and validation against lane/profile/policy configuration.

### Why
- Establish a measurable before-state and surface blockers before live changes.

### How to Verify
- `node scripts/upgrade/platform-ops-diagnostic.mjs`
- `node scripts/upgrade/validate-platform-ops-foundation.mjs`

### Rollback
- No runtime mutation required for this phase.

## Phase 1: Multi-Browser Foundation

### What Changes
- Apply browser profile definitions and lane mappings.
- Enable runtime preflight enforcement module (`lib/platform-ops-governance.mjs`).
- Add simulation and validation scripts.

### Why
- Ensure deterministic lane routing, profile isolation, and pre-execution safety checks.

### How to Verify
- `node scripts/upgrade/validate-platform-ops-foundation.mjs`
- `node scripts/upgrade/simulate-platform-operation.mjs --lane ghl --action contact_read --payload '{"contact_id":"abc"}' --no-persist`
- `node scripts/upgrade/simulate-platform-operation.mjs --lane social --action post_publish --payload '{"platform":"instagram","content":"x","media_urls":[],"approved_by":"operator","content_hash":"abc"}' --no-persist`

### Rollback
- Restore prior versions of:
  - `config/browser-profiles.json`
  - `config/platform-lanes.json`
  - `config/approval-policies.json`
  - `lib/platform-ops-governance.mjs`
  - `scripts/upgrade/platform-ops-*.mjs`

## Phase 2: Lane SOP Enforcement

### What Changes
- Wire lane-specific SOP execution wrappers to call preflight checks before browser actions.

### Why
- Prevent bypass of risk tier and approval controls.

### How to Verify
- Attempt unsupported action and confirm block.
- Attempt high-risk action and confirm approval requirement.

### Rollback
- Revert lane wrapper integration and keep simulation-only mode active.

## Phase 3: Monitoring and Heartbeat

### What Changes
- Enable cron jobs for diagnostics, validation, and audit summaries.

### Why
- Catch drift or policy failures before they impact operations.

### How to Verify
- Run jobs manually from `config/cron/platform-ops-jobs.json` and confirm output.

### Rollback
- Disable new cron jobs and keep manual checks.

## Phase 4: Production Go-Live

### What Changes
- Activate live lane execution windows one lane at a time.

### Why
- Reduce blast radius while proving reliability.

### How to Verify
- Monitor first 24-hour audit entries for each lane.
- Confirm no unapproved high/critical actions executed.

### Rollback
- Set `OPENCLAW_AUTONOMOUS_PAUSED=1` and revert to sandbox execution.

## Phase 5: New Platform Onboarding

### What Changes
- Use onboarding template to add future platforms.

### Why
- Standardize safe expansion without ad hoc controls.

### How to Verify
- New lane passes validator and simulation matrix in under one day.

### Rollback
- Disable new lane routing rule and route requests to sandbox fallback.
