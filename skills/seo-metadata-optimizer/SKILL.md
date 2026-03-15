---
name: seo-metadata-optimizer
description: Generates and optimizes meta titles, descriptions, Open Graph tags, and schema markup for GHL funnel pages
---

# SEO Metadata Optimizer

## Purpose
Generate search-engine-optimized metadata for GHL funnel pages, blog posts, and websites. Outputs ready-to-paste meta tags and structured data.

## Required Inputs
- `page_url` (string): Target page URL
- `page_type` (string): "landing_page" | "blog_post" | "service_page" | "course_page" | "homepage" | "about"
- `primary_keyword` (string): Main SEO target keyword
- `page_content_summary` (string): Brief description of page content

## Optional Inputs
- `secondary_keywords` (string[]): Supporting keywords
- `brand_name` (string): Business name for title suffix
- `geo_target` (string): Location for local SEO
- `image_url` (string): Featured image for OG tags
- `competitor_titles` (string[]): Competitor meta titles for differentiation

## SEO Rules
### Meta Title
- 50-60 characters max
- Primary keyword near front
- Brand name at end with pipe separator
- Action-oriented when possible
- Never duplicates across pages

### Meta Description
- 150-160 characters
- Include primary keyword naturally
- Include a CTA or value proposition
- Never keyword stuff

### Open Graph Tags
- og:title — Can be different from meta title (more engaging)
- og:description — More casual, social-friendly
- og:image — 1200x630px recommended
- og:type — "website" | "article" | "product"

### Schema Markup (JSON-LD)
- LocalBusiness for service pages
- Article for blog posts
- Course for course pages
- Product for offer pages
- FAQPage for FAQ sections

## Output Contract
```json
{
  "meta_title": "string (50-60 chars)",
  "meta_description": "string (150-160 chars)",
  "open_graph": {
    "og:title": "string",
    "og:description": "string",
    "og:image": "string",
    "og:type": "string",
    "og:url": "string"
  },
  "twitter_card": {
    "card": "summary_large_image",
    "title": "string",
    "description": "string"
  },
  "schema_json_ld": {},
  "html_head_block": "<meta>...</meta><script type='application/ld+json'>...</script>",
  "keyword_analysis": {
    "primary": "string",
    "density_recommendation": "1-2%",
    "secondary_placements": ["string"]
  }
}
```

## Acceptance Criteria
- [ ] Meta title is 50-60 characters
- [ ] Meta description is 150-160 characters
- [ ] Primary keyword appears in title and description
- [ ] Open Graph tags are complete
- [ ] Schema JSON-LD is valid and matches page_type
- [ ] HTML head block is ready to paste
