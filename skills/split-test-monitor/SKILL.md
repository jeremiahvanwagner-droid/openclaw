---
name: split-test-monitor
description: Monitors GHL funnel A/B tests, calculates statistical significance, and declares winners when thresholds are met
---

# Split Test Monitor

## Purpose
Read GHL funnel A/B test data, calculate statistical significance using chi-squared test, and determine when a variant is the clear winner. Auto-updates funnel routing when significance is reached.

## Required Inputs
- `location_id` (string): GHL location
- `funnel_id` (string): Funnel with active A/B test

## Optional Inputs
- `min_sample_size` (number): Minimum visitors per variant before analysis (default: 100)
- `confidence_level` (number): Required confidence 0.90-0.99 (default: 0.95)
- `auto_declare` (boolean): Automatically route to winner when significant (default: false)

## Statistical Method
1. Collect conversion data for each variant (visitors, conversions)
2. Calculate conversion rate per variant
3. Apply chi-squared test for independence:
   - $\chi^2 = \sum \frac{(O - E)^2}{E}$
   - df = (variants - 1)
4. Compare against critical values:
   - 0.90 confidence → χ² > 2.706
   - 0.95 confidence → χ² > 3.841
   - 0.99 confidence → χ² > 6.635
5. Declare winner if significant AND has higher conversion rate

## Decision Rules
- Do NOT analyze if any variant has < min_sample_size visitors
- If significant AND more than 20% relative improvement → strong recommendation
- If significant AND < 20% relative improvement → marginal recommendation
- If NOT significant → continue test, estimate days remaining
- If sample sizes asymmetric (>3x difference) → flag potential bias

## Output Contract
```json
{
  "funnel_id": "string",
  "test_status": "collecting|significant|not_significant|insufficient_data",
  "variants": [
    {
      "variant_id": "string",
      "name": "Control|Variant B|...",
      "visitors": 0,
      "conversions": 0,
      "conversion_rate": 0.0,
      "is_winner": false
    }
  ],
  "statistics": {
    "chi_squared": 0.0,
    "p_value": 0.0,
    "confidence": 0.0,
    "is_significant": false,
    "relative_improvement": "0%"
  },
  "recommendation": "continue|declare_winner|stop_test",
  "recommendation_strength": "strong|marginal|none",
  "estimated_days_remaining": 0,
  "auto_declared": false,
  "analyzed_at": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] Chi-squared calculation matches standard statistical tables
- [ ] Will not declare winner with insufficient sample size
- [ ] Relative improvement calculated correctly
- [ ] Days remaining estimate based on current traffic rate
- [ ] Bias flag triggered on asymmetric sample sizes
