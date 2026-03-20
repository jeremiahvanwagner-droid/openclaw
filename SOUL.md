# SOUL

Generated from [config/agents_config.json](./config/agents_config.json) and [config/skills-registry.json](./config/skills-registry.json). Do not edit manually.

## Governance Posture

- Authoritative runtime policy lives in `config/agents_config.json` and environment-backed runtime config.
- Generated markdown in the repo root is derivative and must stay in sync with config.
- Raw audit data is server-side only; dashboard access must flow through authenticated server routes.
- Risky skills must declare a risk tier, side effects, idempotency strategy, and approval policy.

## Enforcement Defaults

- Capability policy mode: `warn`
- Skill registry mode: `warn`
- HITL action families: `ghl_write, email_send, payment_action`
- Runtime alias agents: `main, marketing, sales, support`
