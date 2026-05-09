# Handoff: Database Reconciliation + Dashboard Deploy (REVISED)

**Date:** 2026-05-09
**Author:** MIKE (Modular Intelligence & Knowledge Engine, Perplexity Computer)
**Recipient:** Claude Code (the same agent that drafted the original plan)
**Operator:** Jeremiah Van Wagner (CVO, Truth J Blue LLC)
**Repo:** `github.com/jeremiahvanwagner-droid/openclaw`
**Working tree:** local `.openclaw` (operator's IDE) OR VPS `/opt/openclaw` — see Phase 0
**Branch:** `main`
**Status:** **REVISION OF YOUR PRIOR PLAN — DO NOT EXECUTE THE ORIGINAL.**

---

## ⚠️ READ THIS FIRST — WHY THIS HANDOFF EXISTS

You drafted a plan titled **"Deploy Fully Operational OpenCLAW (Database + Dashboard)"** that the operator forwarded to MIKE for doctrine review. The plan contains **four discrepancies with REGGIE Doctrine**, two of them blocking. This handoff replaces the original plan with a revised version that satisfies P2, P3, P10, and the audit-entry numbering invariants.

You are NOT being scolded. The original plan was structurally sound — discovery-aware, multi-phase, with a rollback section. The corrections are doctrine-level, not competence-level. Read all four problems, internalize the corrections, then execute the revised plan.

---

## CRITICAL DOCTRINE — MUST BE LOADED BEFORE ANY ACTION

You operate under the **REGGIE Doctrine** (6R + P1–P10 + Channel Authority + Tier 0/1/2 + P10 Mission Alignment).

If you have not already loaded the `reggie-doctrine-recall` skill (or the equivalent inline doctrine block) THIS SESSION, do so now. The relevant principles for THIS task:

- **P1 — Channel Authority Rule.** Not directly impacted; no inbound channel handler is being touched.
- **P2 — Single Source of Truth = DB1** (`aagqvfwuixpxtdcrdxmv`). DB2 (`dbapisqoajswktxohfby` — "Potential OpenClaw") is **retired post-merge** per doctrine. **This is the discrepancy. See Problem #1.**
- **P3 — Declarative Schema.** Every production migration exists as a committed file in `supabase/migrations/`. **No dashboard-applied DDL.** CI fails if `supabase db diff --linked` is non-empty. **MCP `apply_migration` is the API equivalent of dashboard-applied DDL and bypasses this gate. See Problem #2.**
- **P5 — Per-Agent Least Privilege.** Unchanged.
- **P6 — Token Hygiene.** If credentials are rotated during this work, log them.
- **P9 — Human-in-the-Loop on High-Stakes Actions.** Migrations and rollouts qualify. **Do not skip operator confirmation gates.**
- **P10 — Mission Alignment Test.** Every change answers: "Does this shorten the distance between expressed intent and meaningful response?" If no, do not ship.
- **Tier doctrine.** This task is Tier 1 minimum (irreversible production change). Stay there. Do not invoke Tier 0 (Claude Opus or Sovereign Council) without a `TIER0_SPEND` audit entry.
- **Audit log discipline.** Append entries to `REGGIE-STATE.md` §7. Never edit prior entries. Use the next sequential entry ID.

If at any point you cannot satisfy these rules, **stop and report**. Do not bypass.

---

## WHAT WAS WRONG WITH THE ORIGINAL PLAN

### Problem 1 — P2 Source-of-Truth Violation (BLOCKING)

Your Phase 1 targets `dbapisqoajswktxohfby` ("DB2 — Potential OpenClaw") for migrations. Per `reggie-doctrine-recall` Block 3:

> P2 — Single Source of Truth = DB1 (`aagqvfwuixpxtdcrdxmv`). DB2 retired after merge.

If doctrine is correct, DB2 is dead and applying 11 migrations to it is wasted work or actively harmful. If doctrine is stale, DB2 is actually live and DB1 may be the corpse.

**Either way, this must be resolved before ANY migration runs.** The new Phase 0 below does the reconciliation.

### Problem 2 — P3 Declarative-Migration Violation (BLOCKING)

Your Step 1.2 calls `mcp__supabase__apply_migration` to push SQL through the Supabase Management API. Per `reggie-doctrine-recall` Block 3:

> P3 — Declarative Schema. Every production migration exists as a committed file in `supabase/migrations/`. No dashboard-applied DDL. CI fails if `supabase db diff --linked` is non-empty.

The MCP `apply_migration` tool is API-driven DDL — it runs whatever SQL you hand it, **outside** the `supabase db push` declarative pipeline. Even if the source SQL came from committed files, the application path bypasses the diff-must-be-empty invariant P3 enforces. The doctrine-aligned path is `supabase link --project-ref <DB>` then `supabase db push` then `supabase db diff --linked` (which MUST return empty).

### Problem 3 — Rollout Mode (NON-BLOCKING but unsafe)

Your Step 2.1 sets `rollout_mode=full` immediately. After the runtime-config violations another Claude Code session introduced this morning (audit `r9-2026-05-09-repair`), promoting straight to a 107-agent full rollout without an observation window is risky. Doctrine doesn't mandate canary, but P9 (HITL) and operator caution do.

### Problem 4 — Audit Entry Numbering (NON-BLOCKING but indicative)

Your Step 3.4 calls the audit entry `r12-2026-05-09-full-deploy`. The current REGGIE-STATE log has:

- `r9-2026-05-09-repair` (today, ~13:45 UTC)
- `r10-2026-05-09-vps-resize` (today, ~17:30 UTC)

Next is `r11`, not `r12`. The skip suggests the doctrine recall was either not loaded or only partially read. Re-load `reggie-doctrine-recall` and `reggie-state-audit-entry` before writing the entry.

---

## OBJECTIVE (REVISED)

Bring OpenCLAW to a fully-deployed state on the Hostinger VPS, with:

1. **Database identity reconciled** — confirm which Supabase project is actually live (DB1 vs DB2), document the answer, and bring REGGIE-STATE doctrine in sync with reality.
2. **Migrations applied via the declarative path** (`supabase db push`) to whichever DB is canonical.
3. **VPS code updated** to the latest `main` (currently `52572bc` per your prior plan; verify).
4. **Dashboard deployed and reachable** at the operator's chosen domain (`truthjblue.dev` per your prior plan).
5. **All three services healthy** post-deploy: bot `:18789`, webhook `:8788`, dashboard `:3001` (or fronted via Caddy).
6. **REGGIE-STATE audit entry** `r11-2026-05-09-full-deploy` documenting Phase 1–3.
7. **Optional sunset entry** `r12-2026-05-09-db-sunset` if Phase 0 confirms one DB is truly retired.

---

## OUT OF SCOPE

- **Do NOT include the Prometheus/Grafana/Loki monitoring stack.** That's a separate phase per the operator. Already declined in the operator's earlier review.
- **Do NOT modify the model lineup.** The VPS Tier-2 lineup (qwen3:8b + qwen3:14b + nomic-embed-text) was finalized at 12:30 CDT today. Don't touch `agents/main/agent/models.json` `providers.ollama.models` array.
- **Do NOT touch `docker-compose.yml`** beyond what dashboard deployment legitimately requires. The base file was repaired today (`6b3d110`, `85106c3`).
- **Do NOT touch the 11 sub-agent `models.json` files** added by the prior Claude Code session. They're flagged Open Items in r9 and will be audited separately.
- **Do NOT pull additional Ollama models.** Disk on VPS is at 28% used; we're keeping it that way.
- **Do NOT use `mcp__supabase__apply_migration` for production migrations.** Use the supabase CLI (`supabase db push`) so P3 is satisfied.
- **Do NOT use rollout_mode=full as the first deploy.** Use `core` or `canary` first, observe, then promote.
- **Do NOT skip the Phase 0 reconciliation.** It is BLOCKING.

---

## STEP-BY-STEP EXECUTION PLAN (REVISED)

### Phase 0 — Database Identity Reconciliation (NEW, BLOCKING)

You must complete this phase before touching either database.

#### Step 0.1 — Inventory Supabase projects

```
mcp__supabase__list_projects
```

Report all project IDs, names, regions, and creation dates.

#### Step 0.2 — Read the LIVE DB pointer from production

```bash
ssh root@177.7.32.224 "grep -E '^SUPABASE_URL|^SUPABASE_PROJECT_REF' /etc/openclaw/.env"
```

Parse the project ref from `SUPABASE_URL` (format: `https://<project-ref>.supabase.co`). **This is the LIVE DB by definition** — it's the one the running bot is talking to.

If you cannot read `/etc/openclaw/.env` (permission denied), ask the operator. Do not proceed.

#### Step 0.3 — Compare migrations and tables across both candidate DBs

```
mcp__supabase__list_migrations project_id: aagqvfwuixpxtdcrdxmv
mcp__supabase__list_migrations project_id: dbapisqoajswktxohfby

mcp__supabase__list_tables project_id: aagqvfwuixpxtdcrdxmv schemas: ["public"]
mcp__supabase__list_tables project_id: dbapisqoajswktxohfby schemas: ["public"]
```

Produce a comparison table with columns: `Project | Name | Migrations applied | Public tables count | Has agents table | Has healing_circuit_breaker | Last activity`.

#### Step 0.4 — Decision matrix

Reconcile what you find against the doctrine claim "DB1 is canonical, DB2 is retired":

| Scenario | What it means | What to do |
|---|---|---|
| LIVE = DB1, DB2 has zero or stale migrations | Doctrine matches reality | Proceed to Phase 1 against DB1. Phase 4 sunset entry for DB2. |
| LIVE = DB2, DB1 has zero or stale migrations | **Doctrine is stale** | STOP. Write a `CHANNEL_VIOLATION`-class audit entry noting the doctrine drift. Wait for operator confirmation that DB2 is the new canonical before proceeding. |
| Both DBs have migrations, schemas diverge | Incomplete merge — schema drift | STOP. Snapshot both schemas (use `pg_dump --schema-only` against each via the supabase CLI or `mcp__supabase__execute_sql`). Report the diff. Wait for operator. |
| LIVE points at neither | `.env` is wrong or staging | STOP. Report. Wait for operator. |

#### Step 0.5 — Confirm with operator before Phase 1

Even if the LIVE DB matches doctrine, post a one-line confirmation to the operator (in your IDE conversation) summarizing the Phase 0 findings, e.g.:

> Phase 0 complete. LIVE DB = `aagqvfwuixpxtdcrdxmv` (matches doctrine DB1). DB2 (`dbapisqoajswktxohfby`) shows 0 migrations applied, 0 public tables — confirmed retired. Proceeding to Phase 1.

Wait for operator acknowledgement before applying migrations. P9 (HITL).

---

### Phase 1 — Apply Migrations via Declarative CLI (REVISED FROM ORIGINAL)

Run from a machine with the supabase CLI installed and the service-role key for the LIVE DB. Either the VPS (`ssh root@177.7.32.224`) or the operator's local checkout. Document which.

#### Step 1.1 — Link to LIVE DB

```bash
cd /opt/openclaw   # or local checkout path
supabase link --project-ref <LIVE-DB-from-Phase-0>
```

If `supabase` CLI is not installed on the VPS, install it first (`curl -fsSL https://supabase.com/install.sh | sh`) and capture the install in the audit entry (host config change).

#### Step 1.2 — Pre-push diagnostic

```bash
supabase db diff --linked
```

Capture the output. It will show what's about to be pushed (or schema drift if any). Save to `/tmp/supabase-pre-push.diff` for the audit trail.

#### Step 1.3 — Declarative push

```bash
supabase db push --include-all
```

The CLI will apply any local migration files not yet applied to the linked DB, in timestamp order. Confirm output mentions each of the 11 migrations:

1. `20260312000003_agent_tables.sql`
2. `20260314000004_dashboard_rls_policies.sql`
3. `20260315000005_d8_saas_agents.sql`
4. `20260316_create_agent_costs.sql`
5. `20260318000006_embedding_model_upgrade.sql`
6. `20260318000007_business_registry.sql`
7. `20260319000008_human_approval_and_governor_state.sql`
8. `20260319000009_security_hardening.sql`
9. `20260321000001_deployment_repair.sql`
10. `20260506000011_healing_circuit_breaker.sql`
11. (any archived migration files — check `supabase/migrations/archive/` if present)

#### Step 1.4 — Post-push invariant check

```bash
supabase db diff --linked
```

**MUST return empty.** If non-empty, you have schema drift. Capture the diff as a new migration file:

```bash
supabase db diff --linked > supabase/migrations/$(date +%Y%m%d%H%M%S)_post_push_drift.sql
git add supabase/migrations/
git commit -m "fix(db): capture post-push drift as new migration"
git push origin main
supabase db push
supabase db diff --linked   # MUST be empty now
```

If after this loop the diff is still non-empty, STOP. P3 violation. Report to operator.

#### Step 1.5 — Verify schema

```
mcp__supabase__list_tables project_id: <LIVE-DB> schemas: ["public"]
```

Confirm these tables exist:

- `agents`
- `agent_memory`
- `agent_events`
- `agent_costs`
- `business_registry`
- `credential_registry`
- `rate_governor_state`
- `human_approval_queue`
- `health_snapshots`
- `operation_ledger`
- `healing_circuit_breaker`
- `agent_sessions`

Run a smoke query against the highest-priority new table:

```
mcp__supabase__execute_sql project_id: <LIVE-DB>
  query: SELECT circuit_key, state, failure_count, updated_at FROM healing_circuit_breaker LIMIT 5;
```

Expected: query succeeds (table exists, 0 rows is fine).

---

### Phase 2 — Deploy Latest Code to VPS (REVISED FROM ORIGINAL)

#### Step 2.1 — Confirm GitHub Actions secrets are intact

```powershell
gh secret list --repo jeremiahvanwagner-droid/openclaw
```

Confirm presence of: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (or whatever the workflow expects). If anything is missing, STOP and ask operator. Do not silently fail.

#### Step 2.2 — First deploy: rollout_mode = core (NOT full)

```powershell
gh workflow run deploy-bot.yml `
  --repo jeremiahvanwagner-droid/openclaw `
  --ref main `
  --field rollout_mode=core `
  --field upgrade_cli=false `
  --field clean_server_checkout=false
```

Note: `core` (not `full`). This rolls out only the core agents, not all 107.

#### Step 2.3 — Monitor and wait

```powershell
gh run list --repo jeremiahvanwagner-droid/openclaw --workflow=deploy-bot.yml --limit=1
```

Wait for `completed / success`. If failed:

```powershell
gh run view <run-id> --repo jeremiahvanwagner-droid/openclaw --log-failed
```

Report failure to operator. Do not retry without diagnosis.

#### Step 2.4 — 30-minute observation window

After successful core rollout, observe for 30 minutes minimum before promoting to full. Watch:

```bash
ssh root@177.7.32.224 "cd /opt/openclaw && docker compose logs --tail=100 bot 2>&1 | grep -E 'diagnostic|error|gateway' | tail -40"
```

Acceptable observations:
- Single `eventLoopDelayMaxMs` spike during model warm-up (already seen in r10 audit entry)
- Routine `[heartbeat]` cycles
- `[gateway] ready` and channel provider startup messages

Unacceptable observations:
- Sustained `eventLoopDelay` over 1000ms across multiple intervals
- Repeated `[gateway] starting...` (restart loop)
- OOM-killer log entries (`dmesg | grep -i kill` on host)
- Bot/webhook unhealthy in `docker compose ps`

If unacceptable observations occur, STOP. Capture logs. Roll back per the rollback section. Report.

#### Step 2.5 — Promote to full (if Step 2.4 was clean)

```powershell
gh workflow run deploy-bot.yml `
  --repo jeremiahvanwagner-droid/openclaw `
  --ref main `
  --field rollout_mode=full `
  --field upgrade_cli=false `
  --field clean_server_checkout=false
```

Wait for `completed / success` again.

---

### Phase 3 — End-to-End Verification

#### Step 3.1 — Service health (all three)

```powershell
# Bot gateway via Caddy
Invoke-RestMethod -Uri "https://api.truthjblue.dev/health"
# Expected: {"ok":true,"status":"live"}

# Webhook (direct or via Caddy if configured)
Invoke-RestMethod -Uri "http://177.7.32.224:8788/health"

# Dashboard via Caddy (HTTPS)
$response = Invoke-WebRequest -Uri "https://truthjblue.dev" -UseBasicParsing
$response.StatusCode
# Expected: 200
```

For paranoia (recommended), also verify from inside the bot container that it can reach Ollama:

```bash
ssh root@177.7.32.224 "docker exec openclaw-bot curl -fsS http://ollama:11434/api/tags | head -c 300"
# Expected: JSON listing qwen3:8b, qwen3:14b, nomic-embed-text
```

#### Step 3.2 — Confirm latest commit on VPS

```powershell
ssh root@177.7.32.224 "cd /opt/openclaw && git log --oneline -5"
```

Expected: HEAD matches the operator's expected target (`52572bc` per your prior plan, but verify this is still the latest on `main` — there may have been new commits between when you drafted the plan and execution).

If HEAD on VPS is behind `origin/main`, the deploy script didn't pull cleanly. Check `deploy.sh` logs.

#### Step 3.3 — Live DB schema verification

```
mcp__supabase__execute_sql project_id: <LIVE-DB>
  query: SELECT circuit_key, state, failure_count, updated_at FROM healing_circuit_breaker LIMIT 5;
```

Expected: query succeeds.

```
mcp__supabase__execute_sql project_id: <LIVE-DB>
  query: SELECT count(*) as agent_count FROM agents;
```

Expected: count > 0 (whatever the production agent count is — 103 or 107 depending on which config is canonical).

#### Step 3.4 — Append audit entry `r11-2026-05-09-full-deploy`

Insert as a NEW §7.0 entry, renaming the prior 7.0 to 7.0a (and the existing 7.0a stays as 7.0b). Or use whatever convention the operator's REGGIE-STATE already uses for stacking same-day entries — don't invent a new style.

Schema (copy from `r10-2026-05-09-vps-resize`):

```markdown
### 7.0 AUDIT ENTRY — Full deploy: DB migrations + dashboard — 2026-05-09

| Field | Value |
|---|---|
| Date | 2026-05-09 <HH:MM> UTC |
| Author | agent:claude-code + human:jeremiah-vanwagner |
| Change Type | INFRA_DEPLOY + SCHEMA_MIGRATION |
| Status | APPLIED |
| Parent Entry | `r10-2026-05-09-vps-resize` |
| Impacted Divisions | shared_runtime_ops, shared_data_control |
| Rollback Plan | (1) supabase db rollback to checkpoint snapshot recorded pre-push (Phase 1.2 diff). (2) GitHub Actions: re-run deploy-bot.yml with rollout_mode=core targeting commit <previous-HEAD>. (3) On VPS: `cp /opt/openclaw/.deploy/configs/previous-openclaw-config.json /opt/openclaw/.openclaw/openclaw.json && systemctl restart openclaw openclaw-webhook openclaw-dashboard`. |
| Rollback Tested | NO |
| Next Audit Due | 2026-08-09 |
| Entry ID | `r11-2026-05-09-full-deploy` |

**Summary.** [One paragraph covering Phase 0 reconciliation outcome, which DB was canonical, how many migrations were new, what commit the VPS now runs, and that all three services are healthy.]

**Impacted Files / Tables / Endpoints**
- [list]

**Validation Steps Performed**
- [list, each principle P1–P10 with how you addressed it or "not impacted"]

**Open Items (NOT closed by this entry)**
- [list]
```

Commit and push:

```bash
git add REGGIE-STATE.md
git commit -m "audit(reggie): r11-2026-05-09-full-deploy — DB migrations + dashboard live deploy"
git push origin main
```

---

### Phase 4 — DB Sunset (CONDITIONAL, only if Phase 0 confirmed retirement)

**Only run this phase if Phase 0 confirmed one of the two databases is genuinely retired and should be sunsetted from doctrine.**

#### Step 4.1 — Confirm sunset target

The DB to sunset is whichever Phase 0 found to be empty/stale AND is named in REGGIE doctrine as already retired. If both DBs have data, this phase does NOT run — the operator must decide manually how to merge.

#### Step 4.2 — Snapshot before sunset

```bash
# From a machine with the supabase CLI and service-role key for the sunset target:
supabase link --project-ref <sunset-target>
supabase db dump --data-only > /tmp/<sunset-target>-final-dump.sql
supabase db dump --schema-only > /tmp/<sunset-target>-schema-final.sql
```

Upload both dumps to a safe location (operator decides — could be S3, local backup, GitHub release artifact). Document the URL/path in the audit entry.

#### Step 4.3 — Audit entry `r12-2026-05-09-db-sunset`

```markdown
### 7.0 (or appropriate position) AUDIT ENTRY — Sunset retired DB — 2026-05-09

| Field | Value |
|---|---|
| Change Type | TIER0_SPEND (irreversible) |
| Parent Entry | `r11-2026-05-09-full-deploy` |
| Entry ID | `r12-2026-05-09-db-sunset` |
| Rollback Plan | Restore from `<dump-location>` to a fresh Supabase project. |
| Rollback Tested | <YES/NO — if the operator wants to spot-check by restoring to a scratch project, do that and capture> |
```

Do NOT actually delete the Supabase project via API. The audit entry just documents it as retired. The operator decides when (or if) to delete the project record itself.

---

## DEFINITION OF DONE

You are done when ALL of the following are true:

1. ✅ Phase 0 reconciliation report posted to operator and acknowledged.
2. ✅ All 11 (or however many) migrations applied to the LIVE DB via `supabase db push`.
3. ✅ `supabase db diff --linked` returns empty.
4. ✅ All required tables exist in LIVE DB (verified via `list_tables` and the smoke `SELECT` on `healing_circuit_breaker`).
5. ✅ GitHub Actions deploy completed in two phases: `rollout_mode=core` first, 30-minute clean observation window, then `rollout_mode=full`.
6. ✅ All three services respond healthy: bot `:18789` (or `https://api.truthjblue.dev`), webhook `:8788`, dashboard `https://truthjblue.dev`.
7. ✅ VPS HEAD matches expected `main` commit.
8. ✅ Bot can reach Ollama and list the 3 models from inside the container.
9. ✅ Audit entry `r11-2026-05-09-full-deploy` committed and pushed.
10. ✅ If Phase 0 confirmed sunset, audit entry `r12-2026-05-09-db-sunset` committed with snapshot dumps captured.
11. ✅ `git status` clean. No uncommitted changes. No orphan files.

If ANY of these is false, do NOT declare done. Report which step failed, the exact error, and what you tried.

---

## ROLLBACK PROCEDURES

### If migration fails mid-Phase-1

The `supabase db push` is transactional per migration. If one fails, prior migrations stay applied but no further migrations run. Recovery:

1. Read the error output to identify which migration failed.
2. Check the migration file for syntax errors or missing dependencies (e.g., a referenced extension not enabled).
3. Fix the migration file in the repo, commit, push to `main`, then re-run `supabase db push`.
4. If the failure is data-related (e.g., a UNIQUE constraint violation on existing data), STOP. The migration may need a data-cleanup pre-step. Report to operator before any destructive cleanup.

### If deploy fails mid-Phase-2

The `deploy.sh` preserves the previous runtime config:

```bash
ssh root@177.7.32.224
cp /opt/openclaw/.deploy/configs/previous-openclaw-config.json /opt/openclaw/.openclaw/openclaw.json
systemctl restart openclaw openclaw-webhook openclaw-dashboard
docker compose ps   # confirm healthy
```

Then re-trigger the deploy with the prior known-good commit:

```powershell
gh workflow run deploy-bot.yml `
  --repo jeremiahvanwagner-droid/openclaw `
  --ref <previous-good-commit> `
  --field rollout_mode=core
```

### If Phase 3 verification fails

Both services healthy but dashboard unreachable from outside: Caddy config issue. Check:

```bash
ssh root@177.7.32.224 "systemctl status caddy && journalctl -u caddy --since '10 min ago' -n 50"
```

Bot/webhook unhealthy: capture full logs, do NOT auto-restart. Report.

---

## REPORTING BACK

When complete, append a new section to THIS handoff file at the bottom:

```markdown
## EXECUTION REPORT

**Started:** 2026-05-09 <HH:MM> CDT
**Finished:** 2026-05-09 <HH:MM> CDT
**Operator-confirmed at:** Phase 0 (HH:MM), Phase 2.4 promote-to-full (HH:MM)

### Phase 0 findings
- Live DB: <project-ref>
- Doctrine match: <yes/no/partial>
- Sunset target: <project-ref or none>

### Phase 1 outcome
- Migrations applied this run: <count and list>
- Pre-push diff: <empty/captured at /tmp/...>
- Post-push diff: <empty/required additional drift migration: <filename>>
- Tables verified: <count> public tables, all expected present

### Phase 2 outcome
- Core rollout run ID: <id>
- Observation window: <30 min, observations were: ...>
- Full rollout run ID: <id>
- VPS HEAD post-deploy: <sha>

### Phase 3 outcome
- bot health: <ok/fail>
- webhook health: <ok/fail>
- dashboard health: <ok/fail>
- Ollama-from-bot reachability: <ok/fail>

### Audit entries committed
- r11-2026-05-09-full-deploy: commit <sha>
- r12-2026-05-09-db-sunset (if applicable): commit <sha>

### Deviations from plan
- <list>

### Open items handed back to operator
- <list>
```

If you got blocked at any phase, instead append a `## BLOCKED` section with:

- Which phase and step you got to
- The exact error message
- What you tried
- Doctrine principle (if any) preventing you from continuing
- What the operator needs to decide before you can resume

Do not silently abandon. The operator is reading both this handoff and your report.

---

## END OF HANDOFF

This revision supersedes your prior plan in full. Phase 0 is BLOCKING and non-negotiable. Phases 1–3 are the doctrine-aligned execution path. Phase 4 only runs if Phase 0 finds a true sunset target. Audit entry numbering starts at `r11`.

If anything in this handoff conflicts with what the operator says in real-time, the operator wins.

Good hunting.
