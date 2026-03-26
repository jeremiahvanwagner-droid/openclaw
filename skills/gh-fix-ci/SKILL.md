---
name: gh-fix-ci
description: >
  Fetches failing GitHub Actions CI logs for a repository, clusters failures
  by root cause, prompts an LLM for minimal targeted fixes, and commits or
  opens a pull request with the proposed patch. Safe by default — requires
  human approval for production-branch commits.
owner: d1_devops
risk_tier: write_safe
divisions:
  - division_1_core_operations
  - division_7_shared_services
agents:
  - d1_devops
  - d1_fullstack_dev
external_systems:
  - github
side_effects:
  - commit_files
  - open_pull_request
triggers:
  - ci/run.failed
  - ci/fix.requested
---

# GitHub CI Fix

## Purpose
Autonomous CI failure remediation. Ingests GitHub Actions failure logs,
identifies root-cause patterns, generates targeted fix patches, and
surfaces them as commits or pull requests for human merge.

## Key Functions
- `fetchFailingRuns(owner, repo)` — List failed workflow runs via GitHub API
- `extractFailureLogs(owner, repo, runId)` — Download and parse job logs
- `classifyCiFailure(logText)` — Map log content to a root-cause category
- `generateCiFix(failureContext)` — LLM-powered patch suggestion
- `commitFix(owner, repo, branch, files, message)` — Push fix to a feature branch
- `openFixPullRequest(owner, repo, branch, body)` — Open PR with fix details

## Failure Categories
| Category | Trigger Signal | Auto-Fix Safe? |
|---|---|---|
| `missing_dep` | module not found, import error | Yes — add to package.json |
| `lint_error` | eslint/tsc error with rule name | Yes — apply auto-fix or suppress |
| `test_timeout` | test suite timeout | No — flag for dev |
| `build_config` | missing env var / tsconfig error | Conditional |
| `flaky_test` | same test passes on retry | Yes — add retry annotation |
| `auth_expired` | 401 during CI step | No — rotate secret via HITL |

## Safety Constraints
- Never force-push to `main` or `production` branches
- Production-branch fixes require human approval before merge
- No changes to secret/credential files
- Patch size limit: 50 lines changed per automated fix
