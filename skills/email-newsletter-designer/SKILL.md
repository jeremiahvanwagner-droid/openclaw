---
name: email-newsletter-designer
description: Designs email newsletter templates and campaigns with responsive HTML for GHL email marketing
---

# Email Newsletter Designer

## Purpose
Design and structure email newsletters with responsive HTML layouts for GHL email campaigns. Generates both template designs and individual issue content.

## Required Inputs
- `campaign_type` (string): "newsletter" | "drip" | "broadcast" | "nurture" | "announcement"
- `brand` (object): `{ name, primary_color, logo_url, website }`
- `content_blocks` (array): At least one content block

## Optional Inputs
- `subject_line_count` (number): Number of A/B subject line variants (default: 3)
- `preview_text` (string): Email preview text
- `tone` (string): "professional" | "casual" | "urgent" | "warm"
- `audience_segment` (string): "new_leads" | "customers" | "inactive" | "vip"

## Content Block Types
| Block | Fields | Purpose |
|-------|--------|---------|
| hero | headline, subheadline, cta_text, cta_url, image_url | Above-the-fold attention grabber |
| article | title, body, image_url, read_more_url | Blog/news summary |
| testimonial | quote, author, company, photo_url | Social proof |
| cta_button | text, url, color | Standalone call to action |
| divider | style (line, space, dots) | Visual separator |
| social | platforms[] | Social media links |
| footer | company, address, unsubscribe_url | Required CAN-SPAM footer |

## Email Design Rules
- Max width: 600px (Gmail-safe)
- Inline CSS only (no `<style>` blocks for max compatibility)
- Table-based layout for Outlook compatibility
- Images must have alt text
- Min font size: 14px body, 20px headlines
- Single-column preferred for mobile
- Always include plain-text fallback
- CAN-SPAM compliant: physical address + unsubscribe link required

## Output Contract
```json
{
  "campaign_type": "string",
  "subject_lines": ["string"],
  "preview_text": "string",
  "html": "<table>responsive email HTML</table>",
  "plain_text": "plain text version",
  "content_blocks_used": 0,
  "estimated_read_time": "2 min",
  "compliance": { "has_unsubscribe": true, "has_address": true }
}
```

## Acceptance Criteria
- [ ] HTML renders in Gmail, Outlook, and Apple Mail
- [ ] Responsive (stacks on mobile)
- [ ] All images have alt text
- [ ] Subject lines are under 50 characters
- [ ] Preview text is under 90 characters
- [ ] Unsubscribe link present
- [ ] Physical address present
