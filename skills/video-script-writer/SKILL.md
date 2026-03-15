---
name: video-script-writer
description: Writes structured video scripts for sales pages, courses, and social content with timing and visual direction cues
---

# Video Script Writer

## Purpose
Generate structured video scripts optimized for different formats: VSL (video sales letters), course lessons, social media clips, testimonial prompts, and webinar content.

## Required Inputs
- `format` (string): "vsl" | "course_lesson" | "social_clip" | "testimonial_prompt" | "webinar_segment" | "explainer"
- `topic` (string): Primary subject
- `target_duration` (string): "30s" | "60s" | "90s" | "3min" | "5min" | "10min" | "20min" | "45min" | "60min"

## Optional Inputs
- `niche` (string): Business vertical for context
- `offer` (string): Product/service being promoted
- `tone` (string): "authoritative" | "casual" | "energetic" | "empathetic" | "luxurious"
- `key_points` (string[]): Must-include talking points
- `cta` (string): Desired action after watching
- `speaker` (string): Name/role of presenter
- `b_roll_available` (boolean): Whether B-roll footage cuts are possible

## Format Templates

### VSL (Video Sales Letter)
1. **Hook** (0:00-0:15) — Pattern interrupt, bold claim or question
2. **Problem** (0:15-2:00) — Agitate pain, "If you're like most..."  
3. **Story** (2:00-5:00) — Origin/credibility narrative
4. **Solution** (5:00-8:00) — Introduce offer, features → benefits
5. **Proof** (8:00-10:00) — Testimonials, case studies, stats
6. **Stack** (10:00-12:00) — Value stack with prices
7. **Offer** (12:00-14:00) — Price reveal, guarantee, bonuses
8. **Close** (14:00-15:00) — Final CTA, urgency, last testimonial

### Social Clip
1. **Hook** (0:00-0:03) — Stop-scroll statement
2. **Value** (0:03-0:25) — One key insight
3. **CTA** (0:25-0:30) — Follow/link direction

### Course Lesson
1. **Context** (0:00-1:00) — What we'll cover and why
2. **Core Teaching** (1:00-8:00) — Structured instruction
3. **Example** (8:00-12:00) — Demonstration or case
4. **Summary** (12:00-13:00) — Key takeaways
5. **Assignment** (13:00-14:00) — What to do next

## Output Contract
```json
{
  "format": "string",
  "target_duration": "string",
  "estimated_word_count": 0,
  "sections": [
    {
      "name": "string",
      "timestamp": "0:00-0:15",
      "script": "Speaker dialogue text here...",
      "visual_direction": "[TEXT ON SCREEN: bold claim] | [B-ROLL: product demo] | [FACE TO CAMERA]",
      "notes": "Emphasis, pacing, or delivery notes"
    }
  ],
  "teleprompter_text": "Full concatenated script for prompter"
}
```

## Acceptance Criteria
- [ ] Word count matches target duration (~150 words/min spoken)
- [ ] Every section has visual direction cues
- [ ] Hook is under 15 seconds
- [ ] CTA is clear and specific
- [ ] Teleprompter text version included
