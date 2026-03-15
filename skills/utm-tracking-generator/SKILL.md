---
name: utm-tracking-generator
description: Generates consistent UTM parameter sets for marketing campaigns and stores them in a tracking registry
---

# UTM Tracking Generator

## Purpose
Generate standardized UTM parameter links for all marketing campaigns, ensuring consistent tracking across channels. Maintains a registry to prevent parameter collisions and enable campaign attribution.

## Required Inputs
- `base_url` (string): Landing page URL
- `campaign_name` (string): Campaign identifier
- `source` (string): Traffic source (e.g., "facebook", "google", "email", "telegram")
- `medium` (string): Marketing medium (e.g., "cpc", "social", "email", "referral")

## Optional Inputs
- `content` (string): Ad/content variant identifier for A/B tests
- `term` (string): Paid keyword (for search ads)
- `saas_instance_id` (string): Target SaaS instance for registry scoping
- `short_url` (boolean): Whether to generate shortened URL

## Process
1. Validate base_url format (must be valid URL)
2. Sanitize campaign_name (lowercase, hyphens, no special chars)
3. Compose UTM parameters
4. Check registry for duplicate campaign names in same instance
5. Store in tracking registry for attribution reporting
6. Generate full URL

## UTM Parameter Standards
- `utm_source`: Always lowercase, short platform name
- `utm_medium`: Category of traffic channel
- `utm_campaign`: kebab-case, include date prefix (YYYY-MM)
- `utm_content`: Variant identifier (ad_v1, hero_a, sidebar)
- `utm_term`: Exact keyword, URL-encoded

## Output Contract
```json
{
  "full_url": "https://example.com/offer?utm_source=facebook&utm_medium=cpc&utm_campaign=2026-03-spring-launch&utm_content=ad_v1",
  "base_url": "string",
  "parameters": {
    "utm_source": "string",
    "utm_medium": "string",
    "utm_campaign": "string",
    "utm_content": "string",
    "utm_term": "string"
  },
  "registry_id": "string",
  "created_at": "ISO-8601"
}
```

## Acceptance Criteria
- [ ] UTM parameters follow naming convention
- [ ] No duplicate campaign names within same instance
- [ ] URL is properly encoded
- [ ] Registry entry created for attribution tracking
