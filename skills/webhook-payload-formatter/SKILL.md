---
name: webhook-payload-formatter
description: Formats and sends structured JSON payloads to external integrations (Zapier, Make.com, custom endpoints) with retry logic
---

# Webhook Payload Formatter

## Purpose
Translate natural language integration requests into properly structured webhook payloads. Handle formatting, sending, and retry logic for outbound webhooks to external services.

## Required Inputs
- `destination` (string): Target URL for the webhook
- `payload_type` (string): "zapier" | "make" | "custom" | "slack" | "discord"
- `data` (object): Source data to format and send

## Optional Inputs
- `method` (string): HTTP method (default: "POST")
- `headers` (object): Custom headers to include
- `auth_type` (string): "none" | "bearer" | "basic" | "api_key"
- `auth_value` (string): Token/key for authentication
- `retry_count` (number): Max retries on failure (default: 3)
- `retry_delay_ms` (number): Delay between retries (default: 1000)
- `transform_template` (string): Handlebars-style template for payload shaping

## Payload Templates by Destination

### Zapier
```json
{
  "event": "{{event_type}}",
  "timestamp": "{{iso_timestamp}}",
  "data": { /* flattened key-value pairs — Zapier prefers flat */ }
}
```

### Make.com (Integromat)
```json
{
  "trigger": "{{event_type}}",
  "payload": { /* nested structure supported */ },
  "metadata": { "source": "openclaw", "location_id": "{{location_id}}" }
}
```

### Slack
```json
{
  "text": "{{summary}}",
  "blocks": [{ "type": "section", "text": { "type": "mrkdwn", "text": "{{formatted_message}}" }}]
}
```

### Custom
```json
{ /* User-defined structure via transform_template */ }
```

## Retry Policy
1. First attempt: immediate
2. Retry 1: wait retry_delay_ms
3. Retry 2: wait retry_delay_ms × 2 (exponential)
4. Retry 3: wait retry_delay_ms × 4
5. After max retries: log failure, return error with last HTTP status

## Security Rules
- NEVER send OAuth tokens or secrets in webhook payloads
- Validate destination URL is HTTPS (block HTTP except localhost)
- Log all outbound payloads (redact sensitive fields) to audit trail

## Output Contract
```json
{
  "status": "sent|failed|retrying",
  "destination": "string",
  "http_status": 200,
  "attempts": 1,
  "payload_size_bytes": 0,
  "response_body": "string (truncated to 500 chars)",
  "sent_at": "ISO-8601",
  "duration_ms": 0
}
```

## Acceptance Criteria
- [ ] Payload matches destination template
- [ ] HTTPS enforced for non-localhost destinations
- [ ] Retry with exponential backoff works correctly
- [ ] Sensitive fields redacted in logs
- [ ] Response body truncated to prevent memory issues
