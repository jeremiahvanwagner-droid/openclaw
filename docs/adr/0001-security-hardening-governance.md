# ADR 0001: Security Hardening Governance

## Status

Accepted - 2026-03-19

## Context

OpenClaw has added HITL approvals, semantic guardrails, and Supabase-backed operational state, but the repo still needed stronger controls around dashboard data exposure, browser containment, configuration drift, and skill-side effect governance.

## Decision

- `config/agents_config.json` is the authoritative source for agent governance and capability policy.
- Root-level governance markdown (`AGENTS.md`, `SOUL.md`, `MEMORY.md`, `TOOLS.md`) is generated from config and registry data.
- Raw audit data is not exposed through anonymous Supabase reads. Dashboard access must flow through authenticated server routes.
- Risky skills must be declared in `config/skills-registry.json` with risk tier, side effects, idempotency strategy, approval policy, and replay policy.
- Browser automation defaults to sandboxed launches. Unsafe no-sandbox mode is allowed only behind the explicit local-only env flag `OPENCLAW_BROWSER_ALLOW_UNSAFE_NO_SANDBOX=true`.
- Replay and similar control-plane side effects must record intent in `operation_ledger`.

## Consequences

- CI can fail on governance drift instead of relying on README accuracy.
- Capability and registry enforcement can roll out in `warn` mode first, then move to `fail`.
- Dashboard UI no longer depends on anonymous table access.
- Browser and replay changes are explicit, reviewable, and auditable.
