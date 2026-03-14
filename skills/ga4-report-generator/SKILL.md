---
name: ga4-report-generator
description: Generate GA4 performance reports via OpenClaw Browser Control using snapshot-driven refs. Use when pulling traffic, conversion, channel, campaign, or landing-page metrics and exporting/share-ready summaries.
---

# GA4 Report Generator

Pull GA4 insights through deterministic browser automation.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Use `snapshot` before every click/type action; never infer DOM selectors.
- Confirm property + date range before reading/exporting metrics.
- Do not change account/property admin settings.
- For exports, verify file name/date range in confirmation view.

## Exact CLI Execution Flow
1. Navigate to GA4
   - `openclaw browser navigate https://analytics.google.com/ --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
2. Select property/report
   - `openclaw browser click <ref property_picker> --browser-profile openclaw`
   - `openclaw browser click <ref target_property> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref reports_menu> --browser-profile openclaw`
   - `openclaw browser click <ref target_report> --browser-profile openclaw`
3. Set date range + filters
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref date_range_control> --browser-profile openclaw`
   - `openclaw browser click <ref date_preset_or_custom> --browser-profile openclaw`
   - `openclaw browser click <ref apply_button> --browser-profile openclaw`
4. Capture metrics
   - `openclaw browser snapshot --browser-profile openclaw`
   - Read KPI cards/tables by refs and extract values.
5. Export (if requested)
   - `openclaw browser click <ref share_or_export> --browser-profile openclaw`
   - `openclaw browser click <ref export_csv_pdf> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify export confirmation.

## Trigger Patterns
- “Pull GA4 report for last 7/30 days”
- “Get channel and conversion metrics from GA4”
- “Export GA4 landing page performance”

## Output Contract
Return:
- Property + date range
- Top KPIs (users, sessions, conversions, revenue where available)
- Top channels/pages summary
- Export status and file type (if performed)
