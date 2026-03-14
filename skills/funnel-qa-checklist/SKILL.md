---
name: funnel-qa-checklist
description: Run deterministic QA for funnel releases with fixed steps, pass/fail gates, and acceptance criteria. Use when validating landing/results/checkout flows, form-to-contact mapping, workflow trigger execution, tracking/UTM integrity, mobile sanity, and go/no-go decisions.
---

# Funnel QA Checklist

Execute this exact sequence. If any critical check fails, return `NO_GO`.

## Required Inputs
- `urls`: landing, results, checkout, thank-you
- `linkMap`: expected destinations for CTAs + email links
- `formSpec`: form IDs + expected field/tag mapping
- `workflowSpec`: workflow IDs/names + expected trigger path
- `trackingSpec`: required UTMs + persistence rules
- `testContact`: contact identifier for end-to-end testing

If inputs are missing, mark check `needs QA` and block release.

## Deterministic Steps
1. Validate page availability (HTTP 200 + render) for all critical URLs.
2. Validate CTA/link routes against `linkMap`.
3. Submit form with `testContact`; verify contact write + tags/custom fields.
4. Trigger workflow with `testContact`; verify expected branch/actions.
5. Validate checkout path and post-purchase/thank-you route.
6. Validate tracking UTMs on entry and persistence through critical transitions.
7. Validate mobile sanity at 390px and 768px widths.
8. Capture evidence for each step (screenshots + refs).

## Acceptance Criteria
- All critical URLs load and render.
- 0 broken critical links.
- Form submission writes expected fields/tags.
- Workflow fire test success = true.
- Checkout completes in test mode and routes correctly.
- Required UTM keys present and preserved.
- Mobile layout has no critical overlap/cutoff.

## Severity Rules
- `critical`: checkout broken, workflow not firing, tracking missing, policy violation.
- `high`: wrong CTA destination, missing required tags, mobile blocks primary CTA.
- `medium`: minor formatting defects, non-blocking copy issues.

## Output Contract
Return `QAReport` JSON with:
- `severity`
- `checks` (per step: pass|fail|needs QA)
- `reproduction_steps`
- `screenshots_or_links`
- `required_fixes`
- `go_no_go_decision`

## Go/No-Go Gate
- `GO` only if all critical checks pass.
- Otherwise `NO_GO` with explicit required fixes.

For detailed per-check expected outcomes, read `references/acceptance-criteria.md`.
