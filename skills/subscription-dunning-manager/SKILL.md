---
name: subscription-dunning-manager
description: Detects failed payments and orchestrates a multi-step recovery sequence with empathetic, escalating messaging
---

# Subscription Dunning Manager

## Purpose
When a SaaS subscription payment fails (Stripe/GHL), orchestrate a time-sequenced recovery campaign to win back the customer before cancellation.

## Required Inputs
- `contact_id` (string): The GHL contact ID of the failed subscriber
- `location_id` (string): GHL sub-account
- `saas_instance_id` (string): SaaS instance
- `failure_reason` (string): Payment failure reason (card_declined, insufficient_funds, expired_card, etc.)
- `amount_due` (number): Outstanding amount

## Optional Inputs
- `customer_name` (string): For personalization
- `plan_name` (string): Subscription tier name
- `retry_count` (number): How many auto-retries have already failed
- `days_overdue` (number): Days since first failure

## Dunning Sequence

### Day 1 — Empathetic SMS
- **Tone**: Friendly, helpful — assume accidental failure
- **Template**: "Hi {{customer_name}}, heads up — your {{plan_name}} payment of ${{amount_due}} didn't go through. It's probably just an expired card. Update here: {{payment_link}} Reply if you need help!"
- **Tag**: `dunning_day_1`
- **Compliance**: Include opt-out language
- **Action**: Tag contact, send SMS, log to memory

### Day 3 — Firm Email
- **Tone**: Professional, clear consequences
- **Subject**: "Action needed: Update your payment for {{plan_name}}"
- **Body**: Details of failed payment, clear update link, what happens if not resolved
- **Tag**: `dunning_day_3`
- **Action**: Send email, update tag

### Day 7 — Final Notice Email + SMS
- **Tone**: Urgent but respectful
- **Subject**: "Final notice: Your {{plan_name}} access expires in 7 days"
- **Body**: Last chance to update payment, offer to speak with support
- **Tag**: `dunning_day_7`
- **Action**: Send both email and SMS

### Day 14 — Cancellation
- **Action**: Cancel subscription, remove access tags, archive contact data
- **Tag**: `dunning_cancelled`
- **Notification**: Alert d8_saas_director via Inngest event
- **Win-back**: Add to `win_back_30d` tag for future re-engagement campaign

## Decision Rules
- If `failure_reason` is `expired_card`: Prioritize card-update messaging
- If `failure_reason` is `insufficient_funds`: Offer downgrade option in Day 3 email
- If customer replies at any point: Pause sequence, route to d8_customer_success
- If payment succeeds at any point: Immediately cancel remaining sequence, send thank-you
- If contact has `vip` tag: Extend timeline to 21 days before cancellation
- Never send dunning SMS before 9am or after 8pm in contact's timezone

## Output Contract
```json
{
  "action": "dunning_step",
  "contact_id": "string",
  "day": 1,
  "channel": "sms|email|both",
  "message_preview": "string (first 100 chars)",
  "next_step_date": "ISO date",
  "tags_applied": ["string"],
  "compliance_check": "pass|fail",
  "notes": "string"
}
```

## Acceptance Criteria
- [ ] SMS messages include opt-out language
- [ ] No messages sent outside 9am-8pm contact timezone
- [ ] Sequence cancels immediately on successful payment
- [ ] VIP contacts get extended timeline
- [ ] All steps logged to agent memory for audit trail
- [ ] Cancellation triggers Inngest notification to director
