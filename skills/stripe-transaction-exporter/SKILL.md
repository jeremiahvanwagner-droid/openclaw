---
name: stripe-transaction-exporter
description: Export Stripe transaction/payment data via OpenClaw Browser Control using deterministic snapshot->ref actions. Use when pulling payout, charge, refund, or payment-intent records for reporting/reconciliation without API scripts.
---

# Stripe Transaction Exporter

Export Stripe transaction data safely through browser automation.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Never infer selectors; always use the latest `snapshot` refs.
- Confirm account/workspace and date range before export.
- Do not issue refunds/disputes or alter billing settings unless explicitly requested.
- Validate export format and completion confirmation.

## Exact CLI Execution Flow
1. Navigate
   - `openclaw browser navigate https://dashboard.stripe.com/ --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
2. Open target dataset
   - `openclaw browser click <ref payments_or_transactions_menu> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref charges_refunds_or_payouts_tab> --browser-profile openclaw`
3. Set filters/date range
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref date_filter_control> --browser-profile openclaw`
   - `openclaw browser click <ref selected_date_range> --browser-profile openclaw`
   - `openclaw browser click <ref apply_filters_button> --browser-profile openclaw`
4. Export
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref export_button> --browser-profile openclaw`
   - `openclaw browser click <ref export_format_csv_or_xlsx> --browser-profile openclaw`
   - `openclaw browser click <ref confirm_export> --browser-profile openclaw`
5. Verify completion
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify export job success / download availability.

## Trigger Patterns
- “Export Stripe transactions for last month”
- “Download charges/refunds report from Stripe”
- “Pull Stripe payment data for reconciliation”

## Output Contract
Return:
- Dataset exported (charges/refunds/payouts/etc.)
- Date range + filters used
- Export format and completion status
- Any failed export attempts + reason
