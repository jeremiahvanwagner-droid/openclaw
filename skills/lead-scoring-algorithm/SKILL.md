---
name: lead-scoring-algorithm
description: Defines and applies lead scoring rules to CRM contacts based on behavior, demographics, and engagement signals
---

# Lead Scoring Algorithm

## Purpose
Calculate and assign lead scores to CRM contacts based on configurable rules. Enables automated prioritization for sales follow-up and marketing automation triggers.

## Required Inputs
- `location_id` (string): GHL location
- `contact_id` (string): Contact to score (or "all" for batch scoring)

## Optional Inputs
- `scoring_model` (string): Named model to use (default: "standard")
- `custom_rules` (object[]): Override default scoring rules

## Default Scoring Model — "Standard"

### Demographic Score (max 30 pts)
| Signal | Points | Condition |
|--------|--------|-----------|
| Has email | +5 | Email field not empty |
| Has phone | +5 | Phone field not empty |
| Location match | +10 | In target geography |
| Company size | +10 | Custom field matches ICP |

### Behavioral Score (max 50 pts)
| Signal | Points | Condition |
|--------|--------|-----------|
| Form submitted | +10 | Any form submission |
| Email opened (last 7d) | +5 | Email open event |
| Email clicked (last 7d) | +10 | Email click event |
| Page visit (last 7d) | +5 | Tracking pixel hit |
| Booked appointment | +15 | Calendar event created |
| Replied to SMS/email | +10 | Inbound message |
| Watched video (>50%) | +5 | Video engagement event |

### Engagement Recency (max 20 pts)
| Recency | Points |
|---------|--------|
| Active today | +20 |
| Active this week | +15 |
| Active this month | +10 |
| Active last 30-90d | +5 |
| Inactive 90d+ | 0 |

### Negative Signals
| Signal | Points | Condition |
|--------|--------|-----------|
| Unsubscribed | -20 | Opt-out flag |
| Bounced email | -10 | Hard bounce |
| No activity 60d | -10 | Ghost contact |
| Spam complaint | -30 | Spam flag |

## Score Tiers
| Tier | Score Range | Action |
|------|------------|--------|
| Hot | 80-100 | Immediate sales follow-up |
| Warm | 50-79 | Nurture sequence + sales alert |
| Cool | 25-49 | Long-term nurture |
| Cold | 0-24 | Re-engagement or archive |
| Negative | <0 | Do not contact |

## Output Contract
```json
{
  "contact_id": "string",
  "score": 0,
  "tier": "hot|warm|cool|cold|negative",
  "breakdown": {
    "demographic": 0,
    "behavioral": 0,
    "recency": 0,
    "negative": 0
  },
  "top_signals": ["string"],
  "recommended_action": "string",
  "scored_at": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] Score is 0-100 range (clamped)
- [ ] Tier correctly maps from score
- [ ] Negative signals deduct properly
- [ ] Breakdown sums match total score
- [ ] Recommended action matches tier
