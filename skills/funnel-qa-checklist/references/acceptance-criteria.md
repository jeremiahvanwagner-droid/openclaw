# Acceptance Criteria Reference

## 1) Page Availability
- Pass: All critical URLs return 200 and visible primary CTA.
- Fail: Any critical URL non-200, redirect loop, or blank render.

## 2) Link Checks
- Pass: CTA/email links resolve to expected destination in `linkMap`.
- Fail: Wrong destination, 4xx/5xx, missing UTM where required.

## 3) Form -> Contact Mapping
- Pass: Test submit creates/updates contact and applies expected tags/custom fields.
- Fail: Missing contact write, missing required tags/fields, duplicate unintended records.

## 4) Workflow Trigger Execution
- Pass: Trigger fires once, expected branch path taken, expected actions executed.
- Fail: No fire, wrong branch, action skipped, duplicate trigger loops.

## 5) Checkout Path
- Pass: Checkout starts and completes in test mode; success route matches spec.
- Fail: Payment/test failure unrelated to test card rules, broken success routing.

## 6) Tracking/UTM Integrity
- Required keys: utm_source, utm_medium, utm_campaign (plus utm_content if specified).
- Pass: Keys present at entry and preserved to checkout/thank-you as specified.
- Fail: Missing keys, key mutation, or drop-off before conversion event.

## 7) Mobile Layout Sanity
- Viewports: 390x844 and 768x1024.
- Pass: No blocking overlap; key copy readable; primary CTA visible/clickable.
- Fail: Hidden CTA, clipped critical content, broken form/checkout controls.

## 8) Evidence Requirements
- Minimum evidence: 1 screenshot per critical step + log/workflow ref.
- Missing evidence on critical step => mark `needs QA` and NO_GO.
