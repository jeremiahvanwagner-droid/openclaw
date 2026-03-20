# MEMORY

Generated from [config/agents_config.json](./config/agents_config.json). Do not edit manually.

## Memory Model

- Primary operational state: Supabase tables for agents, events, approvals, metrics, and operation ledger.
- Local memory stores remain in place for workspace-bound context and should be treated as node-local state.
- Long-term governance and capability policy are version-controlled in config.

## Declared Memory Types

- `long-term`
- `none`
- `shared`
- `short-term`
