---
name: zendesk-ticket-router
description: Route Zendesk tickets to the correct assignee, group, priority, and status using OpenClaw Browser Control with strict snapshot refs. Use when triaging support queues and applying deterministic routing updates without API keys.
---

# Zendesk Ticket Router

Route existing Zendesk tickets through reliable browser-control steps.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Never act on stale refs; run `snapshot` before each click/type sequence.
- Confirm ticket ID/requester/context before reassigning.
- Avoid bulk misroutes: process in controlled batches and re-snapshot between tickets.
- Do not delete tickets or send customer replies unless explicitly requested.

## Exact CLI Execution Flow
1. Navigate
   - `openclaw browser navigate https://support.zendesk.com/ --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
2. Open ticket queue
   - `openclaw browser click <ref views_or_tickets_menu> --browser-profile openclaw`
   - `openclaw browser click <ref target_queue_view> --browser-profile openclaw`
3. Open target ticket
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref ticket_row> --browser-profile openclaw`
4. Apply routing fields
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref assignee_dropdown> --browser-profile openclaw`
   - `openclaw browser click <ref target_assignee> --browser-profile openclaw`
   - `openclaw browser click <ref group_dropdown> --browser-profile openclaw`
   - `openclaw browser click <ref target_group> --browser-profile openclaw`
   - `openclaw browser click <ref priority_dropdown> --browser-profile openclaw`
   - `openclaw browser click <ref target_priority> --browser-profile openclaw`
   - `openclaw browser click <ref status_dropdown> --browser-profile openclaw`
   - `openclaw browser click <ref target_status> --browser-profile openclaw`
5. Save + verify
   - `openclaw browser click <ref submit_or_update_button> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify assignee/group/priority/status display correctly.

## Trigger Patterns
- “Route these Zendesk tickets to the right team”
- “Set assignee/priority on Zendesk ticket #...”
- “Triage support queue in Zendesk”

## Output Contract
Return:
- Tickets routed count
- Routing decisions applied (assignee, group, priority, status)
- Any skipped tickets + reason
