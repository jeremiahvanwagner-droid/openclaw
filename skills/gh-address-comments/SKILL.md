---
name: gh-address-comments
description: >
  Reads open review comments on GitHub pull requests, groups them by type
  (style, logic, security, documentation), generates targeted code fixes
  using an LLM, and commits the changes back to the PR branch. All
  security-sensitive changes require human review before commit.
owner: d1_fullstack_dev
risk_tier: write_safe
divisions:
  - division_1_core_operations
  - division_7_shared_services
agents:
  - d1_fullstack_dev
  - d1_devops
external_systems:
  - github
side_effects:
  - commit_files
  - post_review_comment
triggers:
  - github/pr.review_requested
  - github/review_comment.created
---

# GitHub PR Review Comment Handler

## Purpose
Autonomous PR review comment resolution. Reads unresolved inline and
top-level review comments, clusters them by category, generates minimal
code patches, and commits changes to the PR branch with a summary comment.

## Key Functions
- `fetchOpenReviewComments(owner, repo, pullNumber)` — List unresolved PR review threads
- `categorizeComment(comment)` — Classify as style / logic / security / docs / other
- `generateCommentFix(comment, fileContext)` — LLM-based fix for a single review point
- `applyCommentFixes(owner, repo, branch, fixBatch)` — Commit grouped fixes to the branch
- `postResolutionSummary(owner, repo, pullNumber, summary)` — Reply to PR with change log

## Comment Categories
| Category | Auto-Fix Safe? | Example |
|---|---|---|
| `style` | Yes | "Use const instead of let" |
| `docs` | Yes | "Add JSDoc for this function" |
| `logic` | Conditional (confidence ≥ 0.7) | "This condition is inverted" |
| `security` | No — HITL required | "SQL injection risk here" |
| `test` | Conditional | "Add a test for the null case" |
| `other` | No | General questions / discussions |

## Safety Constraints
- Security-category fixes always require human approval
- Logic fixes only auto-applied when LLM confidence ≥ 0.7
- Only modifies files explicitly referenced in the review comment
- Commits are atomic per comment thread (easy to revert individually)
- Never modifies `.env`, secrets, or migration files autonomously
