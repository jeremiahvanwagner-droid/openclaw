---
name: deliverability-auditor
description: Analyzes email bounce rates and spam complaints, auto-suppresses risky contacts, and generates deliverability health reports
---

# Deliverability Auditor

## Purpose
Protect sender reputation by monitoring email bounce rates and spam complaints. Automatically tag and suppress risky addresses. Generate actionable deliverability health reports.

## Required Inputs
- `location_id` (string): GHL location to audit

## Optional Inputs
- `days` (number): Lookback window (default: 30)
- `auto_suppress` (boolean): Auto-suppress risky contacts (default: false)
- `bounce_threshold` (number): Hard bounce rate % for alarm (default: 2.0)
- `complaint_threshold` (number): Spam complaint rate % for alarm (default: 0.1)

## Audit Process
1. Fetch email campaign stats from GHL (sent, delivered, bounced, complained)
2. Calculate rates per campaign and aggregate
3. Classify contacts by risk:
   - **Hard bounce** → Immediate suppress + tag "email_invalid"
   - **Soft bounce 3x** → Suppress + tag "email_risky"
   - **Spam complaint** → Immediate suppress + tag "complaint"
   - **Never opened (90d)** → Tag "email_cold" for re-engagement or sunset
4. Generate health score (0-100)

## Health Score Calculation
| Metric | Weight | Scoring |
|--------|--------|---------|
| Delivery rate | 30% | 100 if >98%, linear to 0 at 90% |
| Open rate | 25% | 100 if >25%, linear to 0 at 5% |
| Bounce rate | 20% | 100 if <1%, linear to 0 at 5% |
| Complaint rate | 15% | 100 if <0.05%, linear to 0 at 0.5% |
| Unsubscribe rate | 10% | 100 if <0.2%, linear to 0 at 2% |

## Risk Levels
| Health Score | Level | Action |
|-------------|-------|--------|
| 80-100 | Healthy | Continue normal operations |
| 60-79 | Warning | Review list hygiene, reduce frequency |
| 40-59 | At Risk | Pause cold outreach, clean list, warm up |
| 0-39 | Critical | Stop all campaigns, complete list audit |

## Output Contract
```json
{
  "location_id": "string",
  "health_score": 0,
  "risk_level": "healthy|warning|at_risk|critical",
  "metrics": {
    "total_sent": 0,
    "delivery_rate": 0.0,
    "open_rate": 0.0,
    "bounce_rate": 0.0,
    "complaint_rate": 0.0,
    "unsubscribe_rate": 0.0
  },
  "suppressed_contacts": {
    "hard_bounces": 0,
    "soft_bounces_3x": 0,
    "complaints": 0,
    "cold_90d": 0
  },
  "campaigns_analyzed": 0,
  "worst_campaigns": [
    { "campaign_id": "string", "name": "string", "bounce_rate": 0.0, "complaint_rate": 0.0 }
  ],
  "recommendations": ["string"],
  "audited_at": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] Health score is 0-100, correctly weighted
- [ ] Hard bounces are flagged for immediate suppression
- [ ] Spam complaints trigger suppression
- [ ] Worst campaigns sorted by bounce+complaint rate
- [ ] Recommendations are specific and actionable
