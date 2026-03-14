---
name: mailchimp-campaign-drafter
description: Draft Mailchimp email campaigns with OpenClaw Browser Control using strict snapshot refs. Use when preparing campaign subject/preheader/body/CTA, audience selection, and send-time setup (without final send unless approved).
---

# Mailchimp Campaign Drafter

Create or edit Mailchimp campaigns safely via Browser Control.

## Guardrails
- Enforce isolated browser: `--browser-profile openclaw`.
- Never click by guessed selector; always use latest `snapshot` refs.
- Draft-only by default; do not press final send unless explicitly approved.
- Validate audience/list before scheduling.
- Preserve compliance fields (from-name, unsubscribe/footer).

## Exact CLI Execution Flow
1. Navigate to campaigns
   - `openclaw browser navigate https://mailchimp.com/ --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref campaigns_menu> --browser-profile openclaw`
2. Start draft
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref create_campaign> --browser-profile openclaw`
   - `openclaw browser click <ref email_campaign_type> --browser-profile openclaw`
3. Populate campaign metadata
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser type <ref campaign_name_input> "{{campaign_name}}" --browser-profile openclaw`
   - `openclaw browser type <ref subject_input> "{{subject}}" --browser-profile openclaw`
   - `openclaw browser type <ref preheader_input> "{{preheader}}" --browser-profile openclaw`
4. Select audience
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref audience_dropdown> --browser-profile openclaw`
   - `openclaw browser click <ref selected_audience> --browser-profile openclaw`
5. Draft content
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref edit_content> --browser-profile openclaw`
   - `openclaw browser type <ref body_block> "{{email_body_or_sections}}" --browser-profile openclaw`
   - `openclaw browser type <ref cta_block> "{{cta_text}}" --browser-profile openclaw`
6. Save + optional schedule
   - `openclaw browser click <ref save_or_continue> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - If approved: set schedule fields via refs; otherwise stop at draft complete.

## Trigger Patterns
- “Draft a Mailchimp campaign for…”
- “Prepare newsletter in Mailchimp”
- “Set subject/preheader and audience in Mailchimp”

## Output Contract
Return:
- Campaign title + audience
- Subject/preheader/CTA used
- Draft status (saved/scheduled)
- Explicit note if send was not executed
