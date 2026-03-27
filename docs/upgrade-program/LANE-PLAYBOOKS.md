# Lane Playbooks

## Common SOP Contract

Every lane run must include:
- Trigger condition
- Requested action
- Required inputs present
- Risk tier and approval decision
- Output payload in lane-defined schema
- Audit entry in `logs/platform-ops-audit.jsonl`
- Rollback/recovery path link or operator instruction

## GHL Lane Playbook

### Trigger Conditions
- GHL webhook events (`contact.*`, `opportunity.*`, `payment.*`, `appointment.*`, `form.*`)
- Scheduled pipeline health checks
- Manual operator command

### Required Inputs
- Example `contact_write`: `contact_id`, `field_updates`
- Example `workflow_delete`: `workflow_id`, `confirmed_by`, `backup_ref`

### Output Format
- Success: `{ status, action, entity_id, timestamp, correlation_id }`
- Failure: `{ status, action, error_code, message, retry_eligible }`

### Audit Entries
- `lane`, `action`, `entity_id`, `agent_id`, `correlation_id`, `risk_tier`, `approval_by`, `timestamp`, `result`

### Rollback and Recovery
- Restore fields from audit snapshot
- Restore workflow from pre-edit snapshot
- If repeated failures, route to `sandbox-test` and escalate to `d8_automation_architect`

## Social Lane Playbook

### Trigger Conditions
- Scheduled content calendar jobs
- Manual publish queue release
- Moderation event triage

### Required Inputs
- `post_publish`: `platform`, `content`, `media_urls`, `approved_by`
- `dm_send`: `platform`, `recipient_id`, `message_text`, `approved_by`

### Output Format
- Success: `{ status, platform, post_id, url, timestamp }`
- Failure: `{ status, platform, error_code, message }`

### Audit Entries
- `lane`, `platform`, `action`, `content_hash`, `agent_id`, `approved_by`, `post_id`, `timestamp`, `result`

### Rollback and Recovery
- Delete published post/reply where supported
- If repeated lane errors, force draft-only mode and alert operator

## Skool Lane Playbook

### Trigger Conditions
- Daily community health scans
- Manual moderation operations
- Agent-initiated community engagement workflow

### Required Inputs
- `community_post_publish`: `content`, `approved_by`, `scheduled_at`
- `member_ban`: `member_id`, `reason`, `approved_by`

### Output Format
- Success: `{ status, action, entity_id, timestamp }`
- Failure: `{ status, action, message }`

### Audit Entries
- `lane`, `action`, `entity_id`, `agent_id`, `approved_by`, `timestamp`, `result`

### Rollback and Recovery
- Remove community posts and restore draft copy
- Reverse moderation where valid
- Escalate to `d8_community_manager` for member state recovery

## Substack Lane Playbook

### Trigger Conditions
- Weekly editorial job
- Manual publish request
- QA gate invocation

### Required Inputs
- `issue_publish`: `draft_id`, `qa_passed`, `approved_by`, `publish_at`
- `issue_schedule`: `draft_id`, `scheduled_at`

### Output Format
- Success: `{ status, action, draft_id, url, timestamp }`
- Failure: `{ status, action, qa_failures[], message }`

### QA Gates Before Publish
- Minimum word count
- No placeholder text
- Subject line present
- Optional preview text and link checks

### Audit Entries
- `lane`, `action`, `draft_id`, `agent_id`, `approved_by`, `qa_passed`, `timestamp`, `result`

### Rollback and Recovery
- Archive/unpublish issue and post correction
- Remove schedule and return draft state
- Restore snapshot for draft update regressions
