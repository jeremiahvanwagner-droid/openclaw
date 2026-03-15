---
name: campaign-analyst
description: Analyzes marketing campaign performance across GHL channels with KPI dashboards, cohort analysis, and optimization recommendations
---

# Campaign Analyst

## Purpose
Pull campaign performance data from GHL, compute KPIs, identify trends, and generate actionable optimization recommendations. Supports email, SMS, funnel, and ad campaign analysis.

## Required Inputs
- `location_id` (string): GHL location
- `analysis_type` (string): "campaign_report" | "funnel_analysis" | "email_metrics" | "cohort_analysis" | "roi_calculation"

## Optional Inputs
- `campaign_id` (string): Specific campaign to analyze
- `date_range` (object): `{ start: "ISO-8601", end: "ISO-8601" }`
- `compare_to` (string): "previous_period" | "same_period_last_month" | campaign_id for A/B
- `breakdown` (string): "daily" | "weekly" | "monthly"

## KPI Definitions

### Email Campaign KPIs
| KPI | Formula | Good | Great |
|-----|---------|------|-------|
| Open Rate | opens / delivered | >20% | >35% |
| Click Rate | clicks / delivered | >2.5% | >5% |
| Click-to-Open | clicks / opens | >10% | >20% |
| Unsubscribe Rate | unsubs / delivered | <0.5% | <0.2% |
| Bounce Rate | bounces / sent | <2% | <0.5% |

### Funnel KPIs
| KPI | Formula | Good | Great |
|-----|---------|------|-------|
| Opt-in Rate | optins / visitors | >25% | >40% |
| Sales Conv Rate | purchases / visitors | >2% | >5% |
| Cart Abandon Rate | abandons / add-to-cart | <70% | <50% |
| Avg Order Value | revenue / orders | varies | varies |
| Revenue per Visitor | revenue / visitors | varies | varies |

### Overall Marketing KPIs
| KPI | Formula |
|-----|---------|
| CAC | total_spend / new_customers |
| LTV | avg_revenue_per_customer × avg_lifetime_months |
| LTV:CAC Ratio | LTV / CAC (target >3:1) |
| ROAS | revenue / ad_spend |
| MQL→SQL Rate | qualified / marketing_leads |

## Analysis Process
1. Pull raw data from GHL API (contacts, campaigns, funnels, payments)
2. Compute KPIs for requested period
3. If compare_to set: compute delta and trend direction
4. Identify top 3 strengths and top 3 weaknesses
5. Generate specific, actionable recommendations
6. Score overall campaign health (1-10)

## Output Contract
```json
{
  "analysis_type": "string",
  "location_id": "string",
  "date_range": { "start": "string", "end": "string" },
  "kpis": {
    "metric_name": {
      "value": 0,
      "benchmark": "good|great|below",
      "trend": "up|down|flat",
      "delta_vs_previous": "+5.2%"
    }
  },
  "strengths": ["string"],
  "weaknesses": ["string"],
  "recommendations": [
    {
      "priority": 1,
      "action": "string",
      "expected_impact": "string",
      "effort": "low|medium|high"
    }
  ],
  "health_score": 7,
  "comparison": {
    "period": "string",
    "improvements": ["string"],
    "declines": ["string"]
  }
}
```

## Acceptance Criteria
- [ ] All KPIs computed with correct formulas
- [ ] Benchmarks accurately categorized
- [ ] At least 3 actionable recommendations
- [ ] Recommendations prioritized by impact/effort ratio
- [ ] Trend direction accurate vs comparison period
- [ ] Health score reflects overall campaign performance
