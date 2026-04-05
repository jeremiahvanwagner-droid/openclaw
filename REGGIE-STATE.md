# REGGIE-STATE.md
# Runtime Engine Governing Global Integrations & Execution
# Truth J Blue LLC - OpenClaw Platform

> MANDATORY FIRST READ FOR EVERY AI SESSION, EVERY CODEX PROMPT,
> AND EVERY DEVELOPER TOUCHING THIS REPO.
>
> This file is a repo-verified audit artifact.
> Do not treat older reports, planning docs, or stale README text as runtime truth.
>
> If the repo contradicts this file, stop and update this file first.

---

## WHAT IS REGGIE

REGGIE is the operational name for the full OpenClaw runtime used by Truth J Blue LLC.

REGGIE is not a single agent.
REGGIE is the entire governed system: workforce, routing, skills, integrations, monitoring, and deployment surfaces.

| Field | Value |
|---|---|
| Owner | Jeremiah Van Wagner (Truth J Blue) |
| Governed by | MIKE (Modular Intelligence & Knowledge Engine) |
| Repo | `github.com/jeremiahvanwagner-droid/openclaw` |
| Production host | Hetzner VPS |

---

## LAST REPO-VERIFIED AUDIT

| Field | Value |
|---|---|
| Audit date | April 5, 2026 |
| Audit method | Repo inspection + validator runs + targeted regression tests |
| Runtime parity | `runtime-config-parity.mjs` -> `ok: true` |
| Security hardening validator | `validate-security-hardening.mjs` exit `0` |
| Worker environment validator | `validate-worker-env.mjs --expected production` -> `ok: true` |
| Offer matrix validator | `validate-offer-matrix.mjs` -> `ok: true` |
| Targeted regression tests | `27/27` pass (`data-files` + `api-rate-governor`) |
| Secret negative test | webhook handler refuses startup when `OPENCLAW_GHL_WEBHOOK_SECRET` is missing |
| Live host verification | Not performed in this session |

---

## ARCHITECTURE TRUTH

### Workforce

- Configured agents: `103` (`config/agents_config.json`)
- Runtime entries: `107` (`config/openclaw.prod.json`, `openclaw.json`)
- Runtime aliases: `main`, `marketing`, `sales`, `support`
- Divisions: `9`
- Generated workforce snapshot: `AGENTS.md`

### Divisions

| ID | Name | Agents |
|---|---|---|
| D1 | Core Company Operations (Truth J Blue LLC HQ) | 10 |
| D2 | eCommerce Operations | 10 |
| D3 | Consulting Practice | 10 |
| D4 | Coaching & Community (Beyond the Veil / Divine Path Walkers) | 10 |
| D5 | Publishing (Books & Media) | 10 |
| D6 | Nonprofit Operations (Inspire Build Motivate, Inc.) | 10 |
| D7 | Cross-Division Shared Services & Runtime Supervisors | 20 |
| D8 | SaaS Operations (Shared GHL Enablement) | 13 |
| D9 | Online Store Operations (store.truthjblue.com - Books & Merch) | 10 |

### Runtime And Models

- `config/openclaw.prod.json` and `openclaw.json` are aligned for runtime agent/model assignment.
- Repo-verified production rollout distribution:
  - `78` Anthropic Sonnet
  - `22` Anthropic Haiku
  - `7` Anthropic Opus
- OpenAI is still present for `memorySearch` embeddings only.

### Integrations And Data

- GHL OAuth auto-refresh is implemented in `skills/ghl-oauth-manager.mjs` and initialized at webhook startup.
- Rate governor state persists to `data/rate-governor-state.json`.
- Required data files are present:
  - `data/worker-environment-map.json`
  - `data/tjb-offer-matrix.json`
  - `data/ghl-funnel-paths.json`
  - `data/recovery-automation-policies.json`

### Infrastructure

- Runtime stack is split:
  - gateway on `18789`
  - webhook handler on `8788`
  - monitoring stack under `deploy/monitoring/`
- Prometheus repo config now contains scrape targets for both gateway and webhook handler.
- Current CI workflows in the repo:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy-bot.yml`

### Documentation Truth

- Current operator docs: `REGGIE-STATE.md`, `README.md`, `AGENTS.md`, `SOUL.md`, `MEMORY.md`, `TOOLS.md`
- Historical/planning docs are marked stale where still retained.

---

## VERIFIED GREEN

### Supplied Failure Reclassification

| Failure point | Status | Repo-verified result |
|---|---|---|
| GHL OAuth token auto-refresh missing | `resolved-in-repo` | `initAutoRefresh()` exists and is called from `handlers/ghl-webhook-handler.mjs` |
| Missing critical data files | `resolved-in-repo` | All four files exist; worker env and offer matrix validators pass; data-file tests pass |
| Webhook secret placeholder in active runtime path | `resolved-in-repo` | handler fails closed without secret; install/register tooling now rejects missing or placeholder secrets |
| Prometheus not scraping gateway | `resolved-in-repo` for repo config | `deploy/monitoring/prometheus/prometheus.yml` includes `host.docker.internal:18789` |
| Rate governor state lost on restart | `resolved-in-repo` | state file persistence exists and rate-governor tests pass |
| Docs stale at `75` agents / `7` divisions | `resolved-in-repo` for current docs | `README.md` and active config copy corrected; historical docs explicitly marked stale |

### Additional Verified Improvements

- `validate-security-hardening.mjs` runs clean again.
- `openclaw.json` now matches production agent/model rollout expectations.
- `config/agents_config.json` and the repo-level `agents_config.json` no longer claim "all 75 agents" in the active master-orchestrator responsibility text.

---

## ACTIVE BLOCKERS

| Blocker | Why it is still active |
|---|---|
| Live gateway metrics not verified | Repo scrape config is fixed, but this audit did not observe a running stack with `:18789/metrics` reachable |
| Live Prometheus/Grafana target health not verified | No repo-local proof in this session that both targets are `UP` in Grafana/Prometheus |
| `/health/deep` endpoint absent | The repo still exposes `/health` but not a deeper "running but broken" check |
| No staging environment | Repo still deploys without a verified staging layer |

---

## UNVERIFIED RUNTIME CLAIMS

Do not state any of the following as fact without a fresh live-system check:

| Claim | Current status |
|---|---|
| Hetzner gateway and webhook services are healthy | Unverified in this audit |
| Grafana is receiving gateway metrics in live operation | Unverified in this audit |
| Prometheus shows both gateway and webhook scrape targets as `UP` | Unverified in this audit |
| Live TJB and MSL auth health is `200 OK` today | Not re-run in this audit |
| Current Supabase row counts, ghost IDs, and business-schema presence | Not re-verified in this audit |
| Deployed webhook secret value on the live host is rotated and current | Not re-verified in this audit |

---

## OPERATOR RULE

Before making runtime claims, prefer this order of trust:

1. Current repo evidence
2. Current validator/test output
3. Fresh live-system checks
4. Older reports and planning documents

If an older doc conflicts with this file, this file wins until a new audit proves otherwise.
