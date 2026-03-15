---
name: funnel-blueprint-architect
description: Takes a business idea and niche and outputs an optimal funnel architecture plan with page flows, conversion goals, and copy angles
---

# Funnel Blueprint Architect

## Purpose
Design complete funnel architectures from scratch based on business niche, offer type, and target audience. Outputs structured plans consumable by `ghl-funnel-cloner.mjs` for implementation.

## Required Inputs
- `niche` (string): Business vertical (e.g., "dental practice", "fitness coaching", "real estate")
- `offer_type` (string): What's being sold — "service", "course", "membership", "high_ticket", "saas", "ecommerce"
- `saas_instance_id` (string): Target SaaS instance

## Optional Inputs
- `avatar` (object): Customer avatar details (demographics, pain points, desires)
- `price_point` (number): Target price in USD
- `existing_content` (string[]): Available assets (videos, PDFs, testimonials)
- `brand_voice` (string): Tone guidelines ("professional", "casual", "luxury", "motivational")
- `competitor_urls` (string[]): Reference funnels to analyze

## Funnel Archetypes
| Type | Pages | Best For | Avg Conv |
|------|-------|----------|----------|
| Lead Magnet | Opt-in → Thank You | List building | 30-50% |
| VSL | Landing → VSL → Order → Upsell → Thank You | High-ticket | 3-8% |
| Webinar | Registration → Confirmation → Replay → Offer | Courses/coaching | 5-15% |
| Challenge | Registration → Daily Pages (5-7) → Offer | Community launch | 10-20% |
| Application | Landing → Application → Calendar → Thank You | Premium services | 15-25% |
| Tripwire | Opt-in → Low-ticket Offer → Upsell → Thank You | Buyer qualification | 5-10% |
| SaaS Trial | Landing → Sign-up → Onboarding → Trial Dashboard | SaaS products | 8-15% |

## Process
1. Match niche + offer_type to optimal funnel archetype
2. Generate page-by-page plan with:
   - Page type and purpose
   - Primary CTA and fallback CTA
   - Key copy angles (hooks, bullets, headlines)
   - Social proof placement
   - Form fields needed
3. Map funnel steps to pipeline stages
4. Define conversion tracking points
5. Suggest A/B test variants for top-of-funnel pages

## Output Contract
```json
{
  "funnel_name": "string",
  "archetype": "string",
  "niche": "string",
  "pages": [
    {
      "step": 1,
      "name": "string",
      "type": "opt_in|sales|order|upsell|downsell|thank_you|webinar|application",
      "headline": "string",
      "subheadline": "string",
      "copy_angles": ["string"],
      "cta_primary": "string",
      "cta_fallback": "string",
      "form_fields": ["string"],
      "social_proof": ["testimonial|stat|badge|logo_strip"],
      "media": ["video|image|countdown_timer"]
    }
  ],
  "pipeline_mapping": {
    "pipeline_name": "string",
    "stages": ["string"]
  },
  "tracking": {
    "conversion_events": ["string"],
    "utm_parameters": {}
  },
  "ab_test_suggestions": [
    { "page": "string", "variant": "string", "hypothesis": "string" }
  ]
}
```

## Decision Rules
- High-ticket (>$2000): Use Application or VSL archetype, never direct checkout
- Courses (<$500): Webinar or Challenge archetype preferred
- SaaS: Always include trial/freemium option in funnel
- If no testimonials available: Use "as seen in" logos or statistics instead
- Always include exit-intent popup on sales pages
- Mobile-first: All pages must specify mobile-responsive requirements

## Acceptance Criteria
- [ ] Funnel has min 3, max 8 pages
- [ ] Every page has a clear CTA
- [ ] Pipeline stages map 1:1 to funnel progression
- [ ] A/B test suggestions included for at least 2 pages
- [ ] Copy angles reference specific pain points for the niche
