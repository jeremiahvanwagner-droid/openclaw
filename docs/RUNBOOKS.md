# OpenClaw Operational Runbooks
## Truth J Blue LLC Multi-Agent Network

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Daily Operations](#daily-operations)
3. [Incident Response](#incident-response)
4. [Agent Management](#agent-management)
5. [Database Operations](#database-operations)
6. [Performance Tuning](#performance-tuning)
7. [Disaster Recovery](#disaster-recovery)
8. [Monitoring & Alerting](#monitoring--alerting)

---

## System Overview

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Agent Network                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │   D1    │  │   D2    │  │   D3    │  │   D4    │        │
│  │  Core   │  │ eCom    │  │ Consult │  │ Coach   │        │
│  │ (10)    │  │ (10)    │  │ (10)    │  │ (10)    │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
│  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐        │
│  │   D5    │  │   D6    │  │   D7 Shared Services  │        │
│  │ Publish │  │Nonprofit│  │  API | Analytics |    │        │
│  │ (10)    │  │ (10)    │  │  Legal | Orchestr │   │        │
│  └────┬────┘  └────┬────┘  └──────────┬─────────┘  │        │
│       │            │                  │            │        │
│       └────────────┴──────────────────┘            │        │
│                         ▼                          │        │
│              ┌──────────────────────┐              │        │
│              │    Master Orchestrator │            │        │
│              │   (shared_master_orchestrator)     │        │
│              └──────────────────────┘              │        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure                           │
├─────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL + pgvector)  │  Inngest (Events)     │
│  Telegram (Alerts)                  │  Dashboard (Next.js)  │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | URL/Location | Purpose |
|-----------|--------------|---------|
| Supabase DB | `your-project.supabase.co` | Agent state, memory, events |
| Inngest Cloud | `app.inngest.com` | Event orchestration |
| Dashboard | `localhost:3001` (dev) | Monitoring UI |
| Telegram Bot | `@OpenClawAlertBot` | Critical alerts |

### Remote-First Gateway Contract

- Hetzner (`api.truthjblue.dev`) is the only authoritative production gateway.
- Operator workstations must run `gateway.mode=remote` and should not run a local gateway listener on port `18789`.
- Local status lines that reference `127.0.0.1` are non-authoritative in remote-first mode.
- Browser relay operations are single-tab by policy: one attached tab per active build session.
- Use `scripts/relay-preflight.ps1` before browser actions; use `scripts/relay-single-tab-lock.ps1 -Apply` to enforce one attached tab.

### Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
SUPABASE_ANON_KEY=<public>
INNGEST_EVENT_KEY=<secret>
INNGEST_SIGNING_KEY=<secret>

# Telegram Alerts
TELEGRAM_BOT_TOKEN=<secret>
TELEGRAM_ALERT_CHAT_ID=<chat_id>
TELEGRAM_CRITICAL_CHAT_ID=<chat_id>

# OpenAI (for embeddings)
OPENAI_API_KEY=<secret>
```

---

## Daily Operations

### Morning Checklist (8:00 AM)

1. **Check Dashboard Health**
   - Open dashboard: `http://localhost:3001`
   - Verify all 103 agents show "active" status
   - Check for overnight errors in Events tab

2. **Review Telegram Alerts**
   - Check for any overnight critical alerts
   - Review daily summary (sent at 9 AM automatically)

3. **Verify Event Processing**
   ```bash
   # Check event backlog
   node scripts/check-agent-health.mjs
   
   # Verify no stuck events
   SELECT COUNT(*) FROM agent_events 
   WHERE status = 'pending' 
   AND created_at < NOW() - INTERVAL '1 hour';
   ```

4. **Check Inngest Dashboard**
   - Visit `app.inngest.com/env/production`
   - Verify function success rates > 99%
   - Clear any paused functions

### Weekly Tasks (Monday)

1. **Database Maintenance**
   ```sql
   -- Update statistics
   ANALYZE agents;
   ANALYZE agent_memory;
   ANALYZE agent_events;
   
   -- Check index health
   SELECT * FROM recommend_ivfflat_lists();
   ```

2. **Load Test**
   ```bash
   node scripts/load-test.mjs --events 500 --concurrent 20
   ```

3. **Escalation Path Verification**
   ```bash
   node scripts/test-escalations.mjs --verbose
   ```

4. **Memory Cleanup**
   ```sql
   -- Archive old memories (>90 days, low importance)
   DELETE FROM agent_memory 
   WHERE created_at < NOW() - INTERVAL '90 days'
   AND importance < 0.3;
   ```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| SEV-1 | Critical outage | < 15 min | All agents down, DB unreachable |
| SEV-2 | Major degradation | < 1 hour | Multiple divisions affected |
| SEV-3 | Minor issue | < 4 hours | Single agent errors |
| SEV-4 | Low impact | < 24 hours | Performance degradation |

### SEV-1: Complete Agent Network Outage

**Symptoms:**
- Dashboard shows all agents offline
- Telegram critical alert: "System Health: CRITICAL"
- No events processing

**Immediate Actions:**

1. **Verify Infrastructure**
   ```bash
   # Check Supabase connectivity
   curl -I https://your-project.supabase.co/rest/v1/
   
   # Check Inngest status
   curl -I https://api.inngest.com/health
   ```

2. **Restart Inngest Dev Server** (if local)
   ```bash
   cd tjb-umbrella
   npm run dev:inngest
   ```

3. **Check Database Connections**
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```

4. **Notify Stakeholders**
   - Send Telegram message to critical channel
   - Update status page

**Resolution Verification:**
- All agents return to "active" status
- Events resume processing
- Test escalation chain

### SEV-2: Division Offline

**Symptoms:**
- One division shows all agents in "error" or "idle" state
- Cross-division events failing to that division

**Investigation:**

1. **Check Division Status**
   ```sql
   SELECT agent_id, status, last_heartbeat 
   FROM agents 
   WHERE division = 'd2' -- affected division
   ORDER BY status;
   ```

2. **Check Recent Errors**
   ```sql
   SELECT * FROM agent_events 
   WHERE target_agent LIKE 'd2_%'
   AND status = 'failed'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

3. **Restart Division Agents**
   ```bash
   node scripts/restart-division.mjs --division d2
   ```

### SEV-3: Single Agent Error

**Symptoms:**
- One agent in "error" status
- Escalations not reaching that agent

**Resolution:**

1. **Check Agent State**
   ```sql
   SELECT * FROM agents WHERE agent_id = 'd1_devops';
   ```

2. **Review Recent Events**
   ```sql
   SELECT * FROM agent_events 
   WHERE source_agent = 'd1_devops' OR target_agent = 'd1_devops'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **Reset Agent**
   ```sql
   UPDATE agents 
   SET status = 'active', 
       last_heartbeat = NOW()
   WHERE agent_id = 'd1_devops';
   ```

---

## Agent Management

### Adding a New Agent

1. **Create Workspace**
   ```bash
   cd .openclaw/workspaces
   mkdir new_agent_name
   
   # Create required files
   touch SOUL.md TOOLS.md MEMORY_SCHEMA.md EVENTS.md
   ```

2. **Register in Database**
   ```sql
   INSERT INTO agents (agent_id, division, status, config)
   VALUES (
     'new_agent_name',
     'd1',
     'active',
     '{
       "role": "New Agent Role",
       "escalation_path": "d1_cto",
       "capabilities": ["capability1", "capability2"],
       "tools": ["tool1", "tool2"]
     }'
   );
   ```

3. **Update Event Routing**
   - Edit `cross-division-events.ts` if cross-division communication needed
   - Update `test-escalations.mjs` with new paths

4. **Test Integration**
   ```bash
   node scripts/test-escalations.mjs --division d1 --verbose
   ```

### Removing an Agent

1. **Set to Inactive**
   ```sql
   UPDATE agents SET status = 'inactive' WHERE agent_id = 'agent_to_remove';
   ```

2. **Update Escalation Paths**
   - Find agents that escalate to this agent
   - Update their `escalation_path` in config

3. **Archive Memory**
   ```sql
   -- Export memories before deletion
   COPY (SELECT * FROM agent_memory WHERE agent_id = 'agent_to_remove')
   TO '/tmp/agent_memory_backup.csv' WITH CSV HEADER;
   
   -- Then delete
   DELETE FROM agent_memory WHERE agent_id = 'agent_to_remove';
   ```

### Modifying Agent Capabilities

```sql
UPDATE agents 
SET config = jsonb_set(
  config, 
  '{capabilities}',
  '["new_cap1", "new_cap2", "existing_cap"]'::jsonb
)
WHERE agent_id = 'd1_devops';
```

---

## Database Operations

### Backup Procedures

**Automated Backups** (Supabase handles daily)
- Point-in-time recovery: 7 days
- Location: Supabase dashboard → Database → Backups

**Manual Backup**
```bash
# Full database dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Agents only
pg_dump $DATABASE_URL -t agents -t agent_memory -t agent_events > agents_backup.sql
```

### Restore Procedures

**Restore from Supabase Backup**
1. Go to Supabase Dashboard → Database → Backups
2. Select point-in-time
3. Click "Restore"

**Restore from SQL Dump**
```bash
psql $DATABASE_URL < backup_20250101.sql
```

### Memory Cleanup

**Routine Cleanup (Weekly)**
```sql
-- Remove old low-importance memories
DELETE FROM agent_memory 
WHERE created_at < NOW() - INTERVAL '60 days'
AND importance < 0.5
AND memory_type NOT IN ('knowledge', 'procedure');

-- Archive processed events older than 30 days
DELETE FROM agent_events 
WHERE status = 'completed'
AND processed_at < NOW() - INTERVAL '30 days';
```

**Emergency Cleanup (Disk Full)**
```sql
-- Aggressive memory cleanup
DELETE FROM agent_memory 
WHERE created_at < NOW() - INTERVAL '7 days'
AND importance < 0.3;

-- Clear all completed events
DELETE FROM agent_events WHERE status = 'completed';

-- Vacuum to reclaim space
VACUUM FULL agent_memory;
VACUUM FULL agent_events;
```

---

## Performance Tuning

### Vector Search Optimization

1. **Check Current Performance**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM search_agent_memory_optimized(
     'd1_devops', 
     '[0.1, 0.2, ...]'::vector, -- test embedding
     10,
     0.7
   );
   ```

2. **Adjust IVFFlat Probes**
   ```sql
   -- More probes = more accurate, slower
   SET ivfflat.probes = 20;
   ```

3. **Rebuild Indexes After Bulk Inserts**
   ```sql
   SELECT reindex_memory_vectors();
   ```

### Event Processing Optimization

1. **Check Queue Depth**
   ```sql
   SELECT 
     target_agent,
     COUNT(*) as pending_count,
     MIN(created_at) as oldest_event
   FROM agent_events 
   WHERE status = 'pending'
   GROUP BY target_agent
   ORDER BY pending_count DESC;
   ```

2. **Increase Inngest Concurrency**
   ```typescript
   // In inngest function definition
   { concurrency: { limit: 10 } }
   ```

### Dashboard Performance

1. **Reduce Query Frequency**
   - Default refresh: 30 seconds
   - Under load: increase to 60 seconds

2. **Add API Caching**
   ```typescript
   // In Next.js API routes
   export const revalidate = 30; // Cache for 30 seconds
   ```

---

## Disaster Recovery

### Complete Database Loss

1. **Contact Supabase Support**
   - support@supabase.io
   - Include your Supabase project ID

2. **Restore from Backup**
   - Use most recent point-in-time recovery
   - Verify agent count: should be 103

3. **Re-register Agents** (if backup unavailable)
   ```bash
   cd .openclaw
   node scripts/register-agents.mjs --all
   ```

### Inngest Outage

1. **Check Status**
   - `status.inngest.com`

2. **Queue Events Locally**
   - Events are persisted in Supabase
   - They will process when Inngest recovers

3. **Manual Processing** (if extended outage)
   ```bash
   node scripts/manual-event-processor.mjs
   ```

### Telegram Bot Failure

1. **Check Bot Status**
   ```bash
   curl https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe
   ```

2. **Create New Bot** (if compromised)
   - Message @BotFather on Telegram
   - Create new bot
   - Update environment variables

---

## Monitoring & Alerting

### Key Metrics

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Active Agents | < 96/103 | < 88/103 |
| Event Success Rate | < 99% | < 95% |
| Avg Latency | > 500ms | > 1000ms |
| Memory Usage | > 70% | > 90% |
| Pending Events | > 100 | > 500 |

### Telegram Alert Types

| Alert | Trigger | Action |
|-------|---------|--------|
| `agent/error` | Agent fails task | Investigate agent logs |
| `agent/escalate` (CEO) | Escalation to CEO | Review urgency |
| `system/health-check` | Degraded health | Check dashboard |
| Daily Summary | 9 AM daily | Review metrics |

### Setting Up New Alerts

1. **Add Inngest Function**
   ```typescript
   // In telegram-alerts.ts
   export const newAlert = inngest.createFunction(
     { id: "telegram-new-alert" },
     { event: "your/event-name" },
     async ({ event, step }) => {
       // Alert logic
     }
   );
   ```

2. **Update Function Exports**
   ```typescript
   export const telegramAlertFunctions = [
     // ... existing
     newAlert,
   ];
   ```

3. **Test Alert**
   ```bash
   # Trigger test event
   inngest send your/event-name --data '{"test": true}'
   ```

---

## Quick Reference Commands

```bash
# Health check
node scripts/check-agent-health.mjs

# Test escalations
node scripts/test-escalations.mjs --verbose

# Load test
node scripts/load-test.mjs --events 100

# Register new agents
node scripts/register-agents.mjs --division d1

# Start dashboard (dev)
cd .openclaw/dashboard && npm run dev
```

---

## Contact & Escalation

| Role | Contact | When to Escalate |
|------|---------|------------------|
| On-Call Engineer | Telegram @OnCall | SEV-1, SEV-2 |
| Platform Lead | Email: platform@tjblue.com | SEV-1, extended outages |
| Supabase Support | support@supabase.io | DB issues |
| Inngest Support | support@inngest.com | Event issues |

---

*Last Updated: Phase 3 Implementation*
*Document Owner: OpenClaw Platform Team*
