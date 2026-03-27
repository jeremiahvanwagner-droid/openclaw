# Approval Policy Templates

## High Risk Action Template

Use for external posting, workflow edits, direct outbound messaging.

```text
APPROVAL REQUIRED
Agent: {agent_id}
Action: {action}
Lane: {lane}
Entity: {entity_id}
Risk Tier: high
Summary: {summary}

Reply YES to approve or NO to reject within 120 seconds.
```

## Critical Risk Action Template

Use for delete/ban/bulk actions and irreversible operations.

```text
CRITICAL ACTION REQUIRED
Agent: {agent_id}
Action: {action}
Lane: {lane}
Entity: {entity_id}
Risk Tier: critical
Details: {details}

Type CONFIRM_{ACTION_UPPER} to proceed.
This request expires in 300 seconds.
```

## Rejection Template

```text
ACTION REJECTED
Action: {action}
Lane: {lane}
Correlation: {correlation_id}
Reason: {reason}

No side effects executed.
```

## Approval Timeout Template

```text
ACTION EXPIRED
Action: {action}
Lane: {lane}
Correlation: {correlation_id}
Reason: Approval timeout reached.

Request was safely rejected.
```

## Mandatory Fields

- `agent_id`
- `action`
- `lane`
- `entity_id` (or `n/a`)
- `risk_tier`
- `correlation_id`
- `expires_at`

## Policy Rules

- High and critical risk actions require human confirmation.
- Critical actions require explicit confirmation phrase.
- Timeout defaults:
  - High: 120 seconds
  - Critical: 300 seconds
- Any action containing delete/ban/bulk/publish/send must not bypass policy templates.
