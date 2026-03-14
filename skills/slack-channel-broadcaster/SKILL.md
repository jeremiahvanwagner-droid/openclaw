---
name: slack-channel-broadcaster
description: Post structured announcements to Slack channels via OpenClaw Browser Control using deterministic snapshot->ref actions. Use when broadcasting updates, reminders, or rollout notices across one or more Slack channels without API tokens.
---

# Slack Channel Broadcaster

Broadcast Slack channel messages safely with browser automation.

## Guardrails
- Use isolated browser only: `--browser-profile openclaw`.
- Never use guessed selectors; always act on current `snapshot` refs.
- Confirm workspace + channel before posting.
- Default to draft/preview text review before send in high-impact channels.
- Do not message external/shared channels unless explicitly requested.

## Exact CLI Execution Flow
1. Navigate
   - `openclaw browser navigate https://slack.com/signin --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
2. Open target workspace/channel
   - `openclaw browser click <ref workspace_selector_or_continue> --browser-profile openclaw`
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref channel_search_or_sidebar> --browser-profile openclaw`
   - `openclaw browser type <ref channel_search_input> "{{channel_name}}" --browser-profile openclaw`
   - `openclaw browser click <ref target_channel> --browser-profile openclaw`
3. Draft message
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref message_input> --browser-profile openclaw`
   - `openclaw browser type <ref message_input> "{{announcement_text}}" --browser-profile openclaw`
4. Send
   - `openclaw browser snapshot --browser-profile openclaw`
   - `openclaw browser click <ref send_button_or_press_enter_control> --browser-profile openclaw`
5. Verify post
   - `openclaw browser snapshot --browser-profile openclaw`
   - Verify sent message appears in the target channel thread/timeline.

## Trigger Patterns
- “Post this update to Slack channel …”
- “Broadcast reminder in Slack”
- “Send rollout announcement to #channel”

## Output Contract
Return:
- Channels posted count
- Message variant used (if multiple)
- Delivery confirmation per channel
- Any channels skipped + reason
