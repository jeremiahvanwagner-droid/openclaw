---
name: curriculum-generator
description: Designs course curriculum structures with modules, lessons, assignments, and drip schedules for GHL membership areas
---

# Curriculum Generator

## Purpose
Generate structured course curricula from a topic, target audience, and learning objectives. Outputs module/lesson hierarchies ready for GHL membership area implementation.

## Required Inputs
- `course_topic` (string): Primary subject area
- `target_audience` (string): Who the course is for
- `course_length` (string): "mini" (3-5 lessons) | "standard" (6-12 modules) | "comprehensive" (13-30 modules)

## Optional Inputs
- `learning_objectives` (string[]): Specific outcomes
- `existing_content` (string[]): Assets to incorporate (videos, PDFs, templates)
- `drip_schedule` (string): "all_at_once" | "weekly" | "daily" | "milestone_based"
- `certification` (boolean): Include final exam / certificate
- `niche` (string): Business vertical context
- `difficulty` (string): "beginner" | "intermediate" | "advanced"

## Curriculum Design Rules
1. Each module has 3-6 lessons
2. Every lesson has one clear learning outcome
3. First module is always "Foundation / Getting Started"
4. Last module is always "Next Steps / Implementation"
5. Include at least one assignment per module
6. Video lessons should be 5-15 min each
7. Include downloadable resources where applicable
8. Progressive difficulty — each module builds on previous

## Module Structure Template
```
Module N: [Module Title]
├── Lesson N.1: [Intro/Context]
├── Lesson N.2: [Core teaching]
├── Lesson N.3: [Deep dive / Examples]
├── Lesson N.4: [Practical application]
├── Assignment: [Hands-on exercise]
└── Resources: [Downloads, templates, checklists]
```

## Output Contract
```json
{
  "course_name": "string",
  "tagline": "string",
  "target_audience": "string",
  "difficulty": "string",
  "estimated_duration": "6 weeks",
  "modules": [
    {
      "number": 1,
      "title": "string",
      "description": "string",
      "drip_day": 0,
      "lessons": [
        {
          "number": 1.1,
          "title": "string",
          "type": "video|text|quiz|assignment|download",
          "duration": "10 min",
          "learning_outcome": "string",
          "content_notes": "string"
        }
      ],
      "assignment": {
        "title": "string",
        "description": "string",
        "deliverable": "string"
      },
      "resources": ["string"]
    }
  ],
  "certification": {
    "enabled": true,
    "requirements": "Complete all modules + pass final quiz (80%)"
  },
  "total_lessons": 0,
  "total_assignments": 0
}
```

## Acceptance Criteria
- [ ] Module count matches course_length tier
- [ ] Every module has 3-6 lessons
- [ ] Every lesson has a clear learning outcome
- [ ] Difficulty progression is logical
- [ ] Drip schedule calculated if specified
- [ ] First and last modules follow template rules
