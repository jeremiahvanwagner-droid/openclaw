---
name: education-lms-data-synchronization
description: Synchronize LMS data streams for enrollments, assessments, progress, and completion records asynchronously. Use when maintaining reliable cross-system learner state and reporting integrity.
---

# LMS Data Synchronization

1. Define source and destination schemas for learner events.
2. Pull incremental updates using checkpointed cursors.
3. Normalize records and enforce idempotent write keys.
4. Apply async upserts for enrollments, grades, and progress artifacts.
5. Log mismatches, rejects, and schema drift exceptions.
6. Retry transient failures with bounded backoff.
7. Publish sync health metrics and reconciliation report.