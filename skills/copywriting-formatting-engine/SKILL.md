---
name: copywriting-formatting-engine
description: Generates direct-response copy formatted as HTML for GHL funnel text elements
---

# Copywriting & Formatting Engine

## Purpose
Generate conversion-optimized copy for GHL funnel pages, emails, and landing pages. Outputs HTML-formatted text ready for GHL editor paste.

## Required Inputs
- `section_type` (string): "headline" | "subheadline" | "body" | "bullets" | "cta" | "testimonial_block" | "guarantee" | "faq" | "full_page"
- `offer` (string): What's being sold/offered
- `niche` (string): Business vertical

## Optional Inputs
- `avatar` (object): Target customer profile
- `tone` (string): "professional" | "casual" | "urgent" | "luxury" | "empathetic"
- `pain_points` (string[]): Specific problems to address
- `desired_outcomes` (string[]): Results the customer wants
- `proof_points` (string[]): Stats, testimonials, credentials to weave in
- `word_limit` (number): Maximum word count
- `brand_colors` (object): `{ primary, secondary, accent }` hex codes for styling

## Copy Frameworks

### Headlines (pick highest-impact for niche)
1. **PAS** — Pain → Agitate → Solution
2. **AIDA** — Attention → Interest → Desire → Action
3. **Before/After/Bridge** — Current state → Dream state → How to get there
4. **How To** — "How to [desired outcome] without [main objection]"
5. **Social Proof Lead** — "Join 2,347 [niche professionals] who..."

### Body Copy Rules
- Short paragraphs (2-3 sentences max)
- Bold key phrases
- Use "you" and "your" — never "we" or "our" in body
- Bucket brigade transitions ("Here's the thing...", "But wait...", "And that's not all...")
- One idea per paragraph

### CTA Rules
- Action verbs: "Get", "Start", "Unlock", "Claim", "Reserve"
- Never generic: No "Submit", "Click Here", "Learn More"
- Include urgency when appropriate: "Limited spots", "Price increases tonight"
- High-ticket: "Apply Now" or "Schedule Your Call"

## Output Contract
```json
{
  "section_type": "string",
  "html": "<div>formatted HTML content</div>",
  "plain_text": "unformatted version",
  "word_count": 0,
  "framework_used": "string",
  "notes": "string"
}
```

## Acceptance Criteria
- [ ] HTML is valid and GHL-compatible (inline styles, no external CSS)
- [ ] Copy matches specified tone
- [ ] Headlines are under 12 words
- [ ] Body paragraphs are 2-3 sentences
- [ ] CTAs use action verbs, never generic text
- [ ] No placeholder text — all copy is niche-specific
