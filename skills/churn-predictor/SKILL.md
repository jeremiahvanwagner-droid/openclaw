---
name: churn-predictor
description: Analyzes customer behavior signals to predict churn risk and recommend retention interventions
---

# Churn Predictor

## Purpose
Score customers on churn risk based on behavioral signals, payment history, engagement patterns, and support interactions. Triggers proactive retention workflows.

## Required Inputs
- `location_id` (string): GHL location
- `contact_id` (string): Contact to score (or "all" for batch)

## Optional Inputs
- `lookback_days` (number): Analysis window (default: 90)
- `custom_weights` (object): Override default signal weights

## Churn Risk Signals

### High-Risk Signals (weight: 3x)
| Signal | Indicator |
|--------|-----------|
| Payment failure | 2+ failed payments in 30 days |
| Support complaint | Negative CSAT (1-2) in last 14 days |
| Cancellation page visit | Visited cancel/downgrade URL |
| Zero logins | No login in 30+ days |
| Downgrade request | Contacted about downgrading |

### Medium-Risk Signals (weight: 2x)
| Signal | Indicator |
|--------|-----------|
| Declining usage | 50%+ drop in activity vs prior period |
| Ignored emails | 0 opens in last 5 emails |
| No community engagement | Left community group or 0 posts in 60d |
| Support ticket unresolved | Open ticket for 7+ days |

### Low-Risk Signals (weight: 1x)
| Signal | Indicator |
|--------|-----------|
| Slow feature adoption | Using <30% of available features |
| No referrals | Never used referral/affiliate link |
| Single user | Only 1 team member on multi-seat plan |

### Retention Signals (negative weight — reduce risk)
| Signal | Weight |
|--------|--------|
| Recent upgrade | -3 |
| High NPS/CSAT (4-5) | -2 |
| Active community member | -2 |
| Completed onboarding | -1 |
| Referred others | -3 |

## Risk Tiers & Actions
| Tier | Score | Action |
|------|-------|--------|
| Critical | 80-100 | Immediate personal outreach + discount offer |
| High | 60-79 | Automated re-engagement + success check-in |
| Moderate | 40-59 | Nurture email sequence + usage tips |
| Low | 20-39 | Standard engagement — no action |
| Healthy | 0-19 | Upsell opportunity |

## Output Contract
```json
{
  "contact_id": "string",
  "churn_risk_score": 0,
  "risk_tier": "critical|high|moderate|low|healthy",
  "signals_detected": [
    { "signal": "string", "weight": 3, "details": "string" }
  ],
  "retention_signals": [
    { "signal": "string", "weight": -2 }
  ],
  "recommended_action": "string",
  "intervention": {
    "type": "personal_outreach|automated_email|discount|check_in|none",
    "priority": "immediate|this_week|this_month|none",
    "message_template": "string"
  },
  "scored_at": "ISO-8601",
  "next_review": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] Score is 0-100 (clamped)
- [ ] All detected signals listed with weights
- [ ] Retention signals properly reduce score
- [ ] Risk tier maps correctly from score
- [ ] Intervention matches risk tier
- [ ] Next review date calculated (7d for critical, 14d for high, 30d for moderate)
