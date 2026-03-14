---
name: notion-workspace-synchronizer
description: Synchronize Notion workspace records/pages through OpenClaw Browser Control with strict snapshot-ref interactions. Use when applying structured updates across databases, status fields, owners, and due dates while preserving source-of-truth consistency.
---

# Notion Workspace Synchronizer

Apply consistent Notion workspace updates via deterministic browser steps.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Never click/type without a fresh `snapshot` ref.
- Confirm target database/view before editing records.
- For multi-row updates, run in small batches and verify each batch.
- Do not archive/delete pages unless explicitly requested.

## Exact CLI Execution Flow
1. Navigate
   - `openclaw browser navigate https://www.notion.so/ --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
2. Open workspace database
   - `openclaw browser click <ref search_or_sidebar_database_link> --browser-profile openclaw`
   - `openclaw browser type <ref search_input_optional> "{{database_or_page_name}}" --browser-profile openclaw`
   - `openclaw browser click <ref target_database> --browser-profile openclaw`
3. Open target row/page
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref target_row_or_page> --browser-profile openclaw`
4. Apply sync updates
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref status_property> --browser-profile openclaw`
   - `openclaw browser click <ref status_value> --browser-profile openclaw`
   - `openclaw browser click <ref owner_property_optional> --browser-profile openclaw`
   - `openclaw browser click <ref owner_value_optional> --browser-profile openclaw`
   - `openclaw browser click <ref due_date_property_optional> --browser-profile openclaw`
   - `openclaw browser type <ref due_date_input_optional> "{{due_date}}" --browser-profile openclaw`
5. Save + verify
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify updated properties render correctly in row/page and table view.

## Trigger Patterns
- “Sync these records in Notion”
- “Update Notion database statuses/owners/dates”
- “Apply workspace updates in Notion board/table”

## Output Contract
Return:
- Records/pages synchronized count
- Fields updated (status, owner, dates, tags, etc.)
- Any conflicts/skips + reason
