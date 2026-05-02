# TOOLS.md — {{DISPLAY_NAME}}

_Agent ID: `{{AGENT_ID}}`_

This file documents the tools and integrations available to this agent.

---

## Available Tools

{{TOOLS_LIST}}

---

## Tool Usage Guidelines

### Before Using a Tool

1. **Verify necessity** — Is this tool required for the task?
2. **Check permissions** — Do you have authorization?
3. **Validate inputs** — Are all parameters correct?
4. **Consider rate limits** — Will this hit API limits?

### After Using a Tool

1. **Log the action** — Record in daily notes
2. **Verify result** — Did it succeed?
3. **Handle errors** — Retry or escalate as needed
4. **Update memory** — Store relevant outcomes

---

## API Access Configuration

Tools are configured via environment variables. Current integrations:

### GoHighLevel (CRM)
- **Scope**: Contacts, Pipelines, Opportunities, Conversations
- **Location ID**: `TW8JsPW5NMnA3tfK2XLn`
- **Actions**: Create contacts, update pipelines, send messages

### Telegram (Delivery)
- **Scope**: Send messages to configured chats
- **Chat ID**: Primary human chat
- **Actions**: Send alerts, reports, confirmations

### Supabase (Database)
- **Scope**: Agent memory, events, metrics
- **Actions**: Query memory, log events, record metrics

### Inngest (Orchestration)
- **Scope**: Cross-agent communication
- **Actions**: Send events, trigger workflows

---

## Rate Limits

Be mindful of API rate limits:

| Service | Limit | Window |
|---------|-------|--------|
| GoHighLevel | 100 req/min | Per location |
| Telegram | 30 msg/sec | Per bot |
| OpenAI | Varies | Per model |
| Anthropic | Varies | Per model |

---

## Error Handling

When a tool call fails:

1. **Log** the error with request/response details
2. **Retry** once with exponential backoff (if transient)
3. **Escalate** if persistent or critical
4. **Document** in daily notes

---

## Security Notes

- Never log full API keys or tokens
- Sanitize sensitive data in error logs
- Use the minimum required permissions
- Report any suspicious activity

---

_Update this file as new tools are added or removed._
