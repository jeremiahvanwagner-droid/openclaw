# Cohesion Bus — REGGIE Integration Protocol
**Status:** PROPOSED (adopt via REGGIE doctrine — record in `REGGIE-STATE.md` with CVO sign-off)
**Date:** 2026-07-14
**DB:** Truth J Blue-Umbrella Supabase project · schema `cohesion`

## What this is
A shared coordination channel between the three Empire principals — **CLAUDE** (operator), **REGGIE** (24/7 ops), **MIKE** (strategist) — implemented as a new `cohesion` schema in the **same Umbrella DB REGGIE's God Mode agents already use**. Additive only: it touches none of the `public.*` God Mode tables.

## Current state (already live)
The `cohesion` schema is **already applied** to the Truth J Blue-Umbrella DB via three Supabase migrations — so this PR is the doctrine record + REGGIE's read/write contract, **not** a request to build anything new:
- `create_cohesion_bus` — schema + `principals` / `objectives` / `messages` + `updated_at` triggers + RLS.
- `seed_cohesion_principals` + `load_mike_strategy_objectives` — the 3 principals, MIKE's 5 ranked objectives, and the project KPI (Bus Round-Trip Completion Rate).
- `enforce_cohesion_message_rules` — a DB trigger enforcing MIKE's role-bleed guardrail (MIKE may only emit brief/question/signal) and secret-gate (`to_principal='MIKE'` requires `secret_free=true`).

This is the cross-**principal** coordination layer that sits above the existing `agent_communication_map.md` (intra-agent) at repo root.

## Why this is low-risk for REGGIE
- REGGIE already connects to the Umbrella DB with a service key — **no new credentials**.
- **No gateway device-pairing, no CLI self-approval bypass** — that security stays fully intact.
- New tables in a new schema; **zero changes** to existing `agents` / `agent_events` / GHL tables.

## The tables
- `cohesion.principals` — identity registry (CLAUDE / REGGIE / MIKE; `can_execute`, `endpoint`).
- `cohesion.objectives` — shared goals (`status` = proposed|active|paused|done|dropped, `priority`, `owner`, `metric`).
- `cohesion.messages` — the bus. Key columns: `from_principal`, `to_principal` (null = broadcast), `kind`, `subject`, `body`, `payload` jsonb, `refs` jsonb, `status`, `secret_free`.

## REGGIE's read loop (inbox) — poll on the existing heartbeat cadence
```sql
select * from cohesion.messages
where (to_principal = 'REGGIE' or to_principal is null)
  and status = 'open'
order by created_at;

select * from cohesion.objectives where status = 'active' order by priority;
```

## REGGIE's write patterns
```sql
-- acknowledge / progress
update cohesion.messages set status = 'ack'   where id = :id;   -- or in_progress | done | blocked

-- return a result to the operator
insert into cohesion.messages (objective_id, from_principal, to_principal, kind, subject, body, payload, refs)
values (:objective, 'REGGIE', 'CLAUDE', 'result', :subject, :body, :payload, :refs);

-- raise a signal (metric moved, incident, opportunity) — broadcast
insert into cohesion.messages (objective_id, from_principal, to_principal, kind, subject, body)
values (:objective, 'REGGIE', null, 'signal', :subject, :body);
```
For anything needing a human gate, also mirror into REGGIE's existing `public.human_approval_queue`.

## Hard rules
1. **MIKE is analyst-only** (`can_execute = false`). Never dispatch execution to MIKE.
2. **Secret gate:** never write a message with `to_principal = 'MIKE'` unless `secret_free = true` AND every token/key/SSH detail/password is stripped. Location IDs and row refs are fine; credentials never.
3. **Doctrine:** adopting this poll+write loop is a capability change — log it in `REGGIE-STATE.md` via the normal audit entry + CVO sign-off. The connector itself is just poll+insert on tables in a DB REGGIE already reads.

## Shared handoff vocabulary (`kind`)
`brief` (strategy → context) · `dispatch` (assign execution) · `result` (work done) · `signal` (FYI / metric / alert) · `question` · `approval_request`

## Suggested first move for REGGIE
On next heartbeat, `update` the inaugural broadcast (`subject = 'Cohesion bus online'`) to `status = 'ack'` and post a `signal` back confirming REGGIE can read/write the bus. That single round-trip proves the wire end-to-end.
