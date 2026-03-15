---
name: community-moderator
description: AI-powered community moderation rules engine for GHL community groups — content filtering, engagement triggers, and escalation policies
---

# Community Moderator

## Purpose
Define and enforce moderation policies for GHL community groups. Identifies flagged content, manages engagement triggers (welcome messages, milestone celebrations), and routes escalations.

## Required Inputs
- `group_id` (string): Target community group
- `location_id` (string): GHL location
- `action` (string): "review_post" | "configure_rules" | "generate_welcome" | "escalate"

## Optional Inputs
- `post_content` (string): Content to review (for review_post)
- `author_id` (string): Post author contact ID
- `custom_rules` (object[]): Override default moderation rules
- `brand_voice` (string): Tone for auto-generated messages

## Default Moderation Rules

### Auto-Approve
- Posts from verified members
- Posts under 2000 characters with no links
- Image-only posts from members with 5+ prior posts

### Auto-Flag (Held for Review)
- Posts with 3+ external links
- Posts from members with prior flags
- Posts containing competitor brand names
- Posts with ALL CAPS (>50% uppercase)

### Auto-Remove
- Exact duplicate content (spam detection)
- Known blocked phrases
- Posts from banned members

### Engagement Triggers
| Trigger | Action |
|---------|--------|
| New member joins | Send welcome message |
| Member's first post | Reply with encouragement |
| 10th post milestone | Celebrate + badge |
| 7-day inactive member | Re-engagement nudge |
| Post gets 10+ likes | Feature in weekly digest |

## Process
1. Receive post content + author metadata
2. Run against moderation rule chain (auto-approve → flag → remove)
3. If flagged: hold and alert d8_community_manager via Inngest event
4. If engagement trigger: generate response using brand voice
5. Log moderation decision for audit trail

## Output Contract
```json
{
  "action_taken": "approved|flagged|removed|engagement",
  "post_content_hash": "string",
  "author_id": "string",
  "rules_matched": ["string"],
  "confidence": 0.95,
  "generated_response": "string or null",
  "escalation": {
    "required": false,
    "reason": "string",
    "target_agent": "d8_community_manager"
  },
  "audit_entry": {
    "timestamp": "ISO-8601",
    "group_id": "string",
    "decision": "string"
  }
}
```

## Acceptance Criteria
- [ ] All posts pass through rule chain in correct order
- [ ] Auto-removed content is logged but not displayed
- [ ] Flagged content is held pending human/agent review
- [ ] Welcome messages match brand voice
- [ ] Engagement milestones tracked per member
- [ ] Audit log entry created for every decision
