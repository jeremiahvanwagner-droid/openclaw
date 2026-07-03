# Success Metrics — KPIs Proving Full Implementation

_Every metric is checkable by a command or SQL query, with the baseline as measured during the 2026-07-03 reconnaissance. "Target date" keys off Day 0 = the Phase 0 session in [08-master-timeline.md](08-master-timeline.md)._

## Per-advancement KPIs

| # | KPI | Baseline (2026-07-03) | Target | How to measure |
|---|-----|----------------------|--------|----------------|
| A1 | Rows in `rate_governor_state` for current day | 0 (table never written) | ≥ 1 per active provider per runtime, daily | `select provider, runtime_id, spent_cents from rate_governor_state where state_day = current_date;` |
| A1 | Budget continuity across restart | 0% (in-memory + local file only) | `spent_cents` identical pre/post restart | Restart drill during deploy window |
| A2 | Config regressions reaching the VPS that preflight would catch | 2 incidents in one week of May (audits 2026-05-14-001, 2026-05-16-001) | 0 recurrences; every deploy log shows `PREFLIGHT OK` | `grep "PREFLIGHT" deploy session logs`; REGGIE-STATE audit entries |
| A2 | Cron ticks fired by non-production runtimes | Unknown (was ≥10 cron IDs during the 05-16 incident) | 0 | `cron/runs/*.jsonl` mtimes on workstation vs VPS |
| A3 | Duplicate webhook deliveries producing duplicate agent actions | Unbounded (no dedupe exists) | 0 (second delivery returns `duplicate`, 200) | Extended smoke test; `select correlation_id, count(*) from agent_events group by 1 having count(*) > 1;` → empty |
| A3 | Webhook events persisted to the ledger | 0 rows ever | 100% of accepted deliveries | `select count(*) from agent_events where metadata->>'source' = 'ghl-webhook';` climbing daily |
| A3 | Deliveries verified by Ed25519 (platform events) | 0% (path not implemented) | > 95% of platform-origin events | Handler log field `verify=ed25519` ratio |
| A4 | Dangerous-flag warnings from `openclaw security audit` | ≥ 1 (`dangerouslyDisableDeviceAuth=true`, RED since pre-9.1) | 0 | Run the audit; diff against captured baseline |
| A4 | Services surviving reboot | 0 of 2 (`disabled`/`disabled`) | 2 of 2 | `systemctl is-enabled openclaw ollama` + scheduled reboot test |
| A4 | Enforcement mode | `warn`/`warn` | `enforce`/`enforce` with 0 false-positive blocks in week 1 | Process environment check + gateway log review |
| A5 | Byte-diff between the two agents_config files | DIFFERENT (diverged at ~line 287) | Empty diff at every commit (CI-gated) | `diff agents_config.json config/agents_config.json`; `pnpm validate` includes `config:check` |
| A5 | Skill-tree staleness (modules in `skills/` missing/different in the tree the webhook handler executes) | 55 modules absent from `workspace/skills` (124 vs 69) | 0 (handler reads `skills/` directly; mirror synced) | `node scripts/sync-canonical-config.mjs --check` exit 0 |
| A6 | Agents on paid Sonnet | 74 | (74 − approved-remap count); every remap on the CVO allowlist | `grep -c '"llm_model": "claude-sonnet-4.5"' config/agents_config.json` vs results table |
| A6 | Cron success rate for pre-existing 22 local agents during rollout | 100% (post-9.1-redo bar: zero fetch-failed) | ≥ 95% in both 48 h observation windows | `cron/runs/*.jsonl` error scan; gateway logs |
| A7 | OpenAI API requests/day | Governed cap $3/day, active dependency | 0 for 7 consecutive days post-cutover | Governor `getAllStatus()` → `openai.dailyRequestCount` |
| A7 | Memory round-trip on local embeddings | N/A (path doesn't exist) | Probe similarity > 0.9 via `match_agent_memories_768` | Probe script insert+query on VPS |

## Program-level KPIs (the "did this matter" layer)

1. **Data-plane liveness:** all five core tables (`rate_governor_state`, `agent_events`, `agent_costs`, `agent_memory`, `human_approval_queue`) — baseline **0 rows each** — end the program with the first three actively written daily. (`agent_costs` lights up as a side effect of A1's spend tracking if wired, else remains explicitly deferred — record which.)
2. **Doctrine debt:** open flagged items in `REGGIE-STATE.md` (abort-not-degrade, dev-runtime duplication, device-auth RED, systemd persistence, Kimi drift, duplicate-config P2, 74-Sonnet audit) — baseline **7 open** → target **0 open**, each closed by a numbered audit entry.
3. **External-dependency count for core loops:** baseline 3 (Anthropic for 81 agents, OpenAI for embeddings, GHL API) → target 2 by design (Anthropic scope shrunk to audited Sonnet/Opus cohort, OpenAI eliminated, GHL retained — it is the mission surface, not a dependency to remove).
4. **Incident-class recurrence:** zero repeats of the three documented incident classes (endpoint-regression cron storm, duplicate-runtime cron storm, credential retry-storm) for 30 days after program close. Measured the only honest way: absence of new RED audit entries of those classes in `REGGIE-STATE.md`.
5. **Phase ledger:** Phase 9.2 CLOSED entry exists; Phase 10 formally OPENED with A3 recorded as its first discharged item.

## Reporting cadence

- Each advancement's Definition of Done gets checked into its brief's checkbox list at completion, with the verifying command output pasted into the closing REGGIE-STATE audit entry (existing append-only convention).
- Day 30 after program close: one retrospective row per KPI above, filled in, appended to this file under a `## Results` heading. A KPI without a measured value is treated as **failed**, not "pending" — the measurement commands are all listed; there is no ambiguity to hide behind.
