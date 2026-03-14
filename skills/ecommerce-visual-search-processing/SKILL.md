---
name: ecommerce-visual-search-processing
description: Match uploaded customer images to relevant products using visual similarity and catalog metadata. Use when enabling photo-based product discovery in ecommerce experiences.
---

# Visual Search Processing

1. Ingest customer-uploaded image and validate quality requirements.
2. Extract visual features (shape, color, texture, style cues).
3. Query catalog embeddings for nearest product matches.
4. Re-rank candidates using metadata filters (category, price, size availability).
5. Exclude low-confidence or out-of-stock results.
6. Return top matches with confidence and alternates.
7. Log search outcomes to improve future ranking quality.