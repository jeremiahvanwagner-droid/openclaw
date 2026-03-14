---
name: hubspot-contact-updater
description: Update existing HubSpot contacts via OpenClaw Browser Control using deterministic snapshot->ref interactions. Use when a user asks to edit contact fields, lifecycle stage, owner, tags, notes, or properties in HubSpot CRM without API keys.
---

# HubSpot Contact Updater

Use this skill to safely update HubSpot contacts through browser automation.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Never guess selectors. Always run `snapshot` and act on returned `<ref>`.
- Confirm target contact identity (email + name) before saving edits.
- For bulk updates: process in small batches (5-20), snapshot between batches.
- Do not create/delete records unless explicitly requested.

## Exact CLI Execution Flow
1. Navigate
   - `openclaw browser navigate https://app.hubspot.com/contacts --browser-profile openclaw`
2. Map UI
   - `openclaw browser snapshot --browser-profile openclaw`
3. Search contact
   - `openclaw browser click <ref search_box> --browser-profile openclaw`
   - `openclaw browser type <ref search_box> "{{email_or_name}}" --browser-profile openclaw`
   - `openclaw browser click <ref matching_contact_row> --browser-profile openclaw`
4. Open property editor
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref property_or_edit_button> --browser-profile openclaw`
5. Apply updates
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref field_input> --browser-profile openclaw`
   - `openclaw browser type <ref field_input> "{{new_value}}" --browser-profile openclaw`
   - Repeat per field with fresh snapshot refs.
6. Save + verify
   - `openclaw browser click <ref save_button> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify updated values are visible.

## Trigger Patterns
- “Update this HubSpot contact…”
- “Set lifecycle stage to… in HubSpot”
- “Fix owner/tag/property on HubSpot records”

## Output Contract
Return:
- Contacts updated count
- Fields changed
- Any records skipped + reason
