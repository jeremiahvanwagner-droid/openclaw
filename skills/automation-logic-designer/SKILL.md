---
name: automation-logic-designer
description: Translates plain-English automation requests into structured JSON workflow maps for GHL
---

# Automation Logic Designer

## Purpose
Takes a natural language description of a desired automation workflow and outputs a structured JSON workflow map that can be consumed by `ghl-workflow-builder.mjs`.

## Required Inputs
- `automation_description` (string): Plain-English description of the desired workflow
- `saas_instance_id` (string): Target SaaS instance
- `location_id` (string): Target GHL sub-account

## Optional Inputs
- `existing_tags` (string[]): Tags already defined in the sub-account
- `existing_pipelines` (object[]): Pipeline/stage structure for reference
- `niche_context` (string): Business niche for copy/timing optimization

## Process
1. Parse the natural language request for trigger events, conditions, actions, and timing
2. Map each element to GHL-compatible trigger/action types
3. Validate logical flow — no orphan branches, no missing wait-step exits
4. Check for potential infinite loops (tag-add triggers that re-add the same tag)
5. Output structured JSON

## GHL Trigger Types Reference
| Trigger | GHL Key | Notes |
|---------|---------|-------|
| Contact created | `contact.created` | New lead |
| Tag added | `contact.tag.added` | Specify tag name |
| Form submitted | `form.submitted` | Specify form ID |
| Appointment booked | `appointment.booked` | Calendar event |
| Pipeline stage changed | `opportunity.stage.changed` | Specify pipeline + stage |
| Invoice paid | `invoice.paid` | Payment confirmation |
| Email opened | `email.opened` | Engagement signal |
| SMS replied | `sms.replied` | Conversational trigger |

## GHL Action Types Reference
| Action | GHL Key | Parameters |
|--------|---------|------------|
| Send SMS | `send_sms` | `message`, `from_number` |
| Send Email | `send_email` | `template_id` or `subject`, `body` |
| Add Tag | `add_tag` | `tag_name` |
| Remove Tag | `remove_tag` | `tag_name` |
| Wait | `wait` | `duration`, `unit` (minutes/hours/days) |
| If/Else | `condition` | `field`, `operator`, `value` |
| Move Pipeline Stage | `move_stage` | `pipeline_id`, `stage_name` |
| Create Task | `create_task` | `title`, `assignee`, `due` |
| Webhook | `webhook` | `url`, `method`, `payload` |

## Output Contract
```json
{
  "workflow_name": "string",
  "description": "string",
  "triggers": [
    { "type": "string", "config": {} }
  ],
  "steps": [
    {
      "id": "step_1",
      "type": "action|condition|wait",
      "action_type": "string",
      "config": {},
      "next": "step_2",
      "on_true": "step_3",
      "on_false": "step_4"
    }
  ],
  "estimated_contacts_per_day": "number",
  "compliance_notes": ["string"]
}
```

## Decision Rules
- If automation involves SMS: add compliance note about opt-out language requirement
- If automation has more than 5 wait steps: flag for review — possible over-complexity
- If automation creates a tag that is also a trigger: flag as potential loop
- If wait duration exceeds 30 days: warn about contact engagement decay
- Maximum 20 steps per workflow — split into chained workflows if larger

## Acceptance Criteria
- [ ] Output JSON is valid and parseable
- [ ] Every step has a valid `next` reference (no orphans)
- [ ] No circular step references detected
- [ ] All trigger types map to valid GHL trigger keys
- [ ] All action types map to valid GHL action keys
- [ ] SMS actions include opt-out compliance note
- [ ] Workflow name follows convention: `[niche]-[purpose]-[version]`
