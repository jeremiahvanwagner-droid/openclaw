# Runtime Health Dashboard Spec (U10-U11)

## Core Panels

1. Gateway health status (`/health` latency + status code)
2. Event throughput (events/minute, 1h and 24h)
3. Dispatch failures by type (`agent_events.status='failed'`)
4. Active agents count by org unit
5. Stale heartbeat count
6. Circuit-breaker/auth error trend

## Alert Rules

- **Critical:** active agents > 0 and events_last_hour = 0
- **Warning:** stale heartbeats > 0 for >10 minutes
- **Critical:** dispatch failures > 20 in 15 minutes
- **Warning:** failed event ratio > 1% over rolling 1 hour

## Data Sources

- Supabase `agents`
- Supabase `agent_events`
- Gateway `/health` endpoint
- Upgrade scripts:
  - `active-agents-zero-events-alert`
  - `daily-heartbeat-summary`
