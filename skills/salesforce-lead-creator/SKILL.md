---
name: salesforce-lead-creator
description: Create new Salesforce leads via OpenClaw Browser Control with deterministic snapshot->ref interactions. Use when capturing inbound prospects, manually adding lead records, assigning owner/source/status, and saving clean CRM-ready lead entries without API access.
---

# Salesforce Lead Creator

Create Salesforce lead records safely through browser automation.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Never guess selectors. Always run `snapshot` and act on returned `<ref>`.
- Confirm duplicate risk (email/company) before creating a new lead.
- Do not convert/delete leads unless explicitly requested.
- Capture required fields before save (at minimum: last name + company, or org-required equivalents).

## Exact CLI Execution Flow
1. Navigate
   - `openclaw browser navigate https://login.salesforce.com/ --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
2. Open Leads
   - `openclaw browser click <ref app_launcher_or_leads_tab> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref leads_object> --browser-profile openclaw`
3. Start new lead
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref new_lead_button> --browser-profile openclaw`
4. Fill lead fields
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser type <ref first_name_input> "{{first_name}}" --browser-profile openclaw`
   - `openclaw browser type <ref last_name_input> "{{last_name}}" --browser-profile openclaw`
   - `openclaw browser type <ref company_input> "{{company}}" --browser-profile openclaw`
   - `openclaw browser type <ref email_input> "{{email}}" --browser-profile openclaw`
   - `openclaw browser click <ref lead_source_dropdown> --browser-profile openclaw`
   - `openclaw browser click <ref selected_lead_source> --browser-profile openclaw`
   - `openclaw browser click <ref owner_dropdown_optional> --browser-profile openclaw`
   - `openclaw browser click <ref selected_owner_optional> --browser-profile openclaw`
5. Save + verify
   - `openclaw browser click <ref save_button> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify lead name, status, and owner render on the record page.

## Trigger Patterns
- “Create a lead in Salesforce for…”
- “Add this prospect into Salesforce CRM”
- “Log inbound lead with source/owner in Salesforce”

## Output Contract
Return:
- Lead record created count
- Key fields captured (name, company, email, source, owner)
- Duplicate checks or skips + reason
