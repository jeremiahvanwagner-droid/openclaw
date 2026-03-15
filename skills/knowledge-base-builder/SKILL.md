---
name: knowledge-base-builder
description: Generates structured knowledge base articles from FAQs, support tickets, and product documentation for customer self-service
---

# Knowledge Base Builder

## Purpose
Create and organize knowledge base articles from various sources (FAQs, resolved tickets, product docs). Outputs structured content ready for GHL's built-in help center or external KB platforms.

## Required Inputs
- `source_type` (string): "faq" | "ticket_resolution" | "product_doc" | "process_doc"
- `topic` (string): Article topic
- `content` (string): Raw content or transcript to structure

## Optional Inputs
- `category` (string): KB category for organization
- `audience` (string): "end_user" | "admin" | "developer"
- `related_articles` (string[]): IDs of related articles for cross-linking
- `tags` (string[]): Search tags
- `difficulty` (string): "beginner" | "intermediate" | "advanced"

## Article Structure Template
```
Title: [Clear, searchable title]
Category: [Category name]
Difficulty: [beginner|intermediate|advanced]
Last Updated: [date]

## Summary
[1-2 sentence overview]

## Step-by-Step Instructions
1. [First step with screenshot placeholder]
2. [Second step]
...

## Common Issues
- Issue: [description]
  Solution: [fix]

## Related Articles
- [Article title](link)

## Still Need Help?
Contact support at [support channel]
```

## Content Rules
1. Titles are questions when possible ("How do I...?")
2. Steps are numbered, never bulleted
3. Each step has exactly one action
4. Include screenshot placeholders where applicable
5. Use second person ("you") throughout
6. Include "Common Issues" section in every article
7. Max reading level: 8th grade
8. Articles should be 300-800 words

## Output Contract
```json
{
  "article_id": "string",
  "title": "string",
  "category": "string",
  "difficulty": "string",
  "summary": "string",
  "html_content": "<article>structured HTML</article>",
  "plain_text": "string",
  "word_count": 0,
  "search_tags": ["string"],
  "related_articles": ["string"],
  "metadata": {
    "source_type": "string",
    "created_at": "ISO-8601",
    "reading_time": "2 min"
  }
}
```

## Acceptance Criteria
- [ ] Title is searchable and clear
- [ ] Steps are numbered with one action each
- [ ] Word count is 300-800
- [ ] Common Issues section included
- [ ] Reading level ≤ 8th grade
- [ ] Search tags relevant to content
