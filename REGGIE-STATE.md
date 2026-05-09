# REGGIE-STATE.md
# Runtime Engine Governing Global Integrations & Execution
# Truth J Blue LLC — OpenClaw Platform

> MANDATORY FIRST READ FOR EVERY AI SESSION, EVERY CODEX PROMPT,
> AND EVERY DEVELOPER TOUCHING THIS REPO.
>
> This file is a repo-verified audit artifact. Do not treat older reports,
> planning docs, or stale README text as runtime truth.
>
> If the repo contradicts this file, stop and update this file first.

---

## 1. IDENTITY

| Field | Value |
|---|---|
| Owner | Jeremiah Van Wagner (Truth J Blue LLC) |
| Governed by | MIKE (Modular Intelligence & Knowledge Engine) |
| Repo | `github.com/jeremiahvanwagner-droid/openclaw` |
| Production host | Hostinger VPS — 177.7.32.224 |
| OpenClaw release tag | `2026.4.29` (commit `a448042`) — running container |
| `package.json` version | `1.0.0` |
| Deployment shape | Docker Compose (LOCAL `C:\Users\JeremiahVanWagner\.openclaw\docker-compose.yml` + VPS `/root/openclaw/docker-compose.yml`) |
| Last state update | 2026-05-05 (Phase 2 execution) UTC |
| Sweep version | `2026-05-05-sweep` (Phase 1–5 complete) |

---

## 2. ACTIVE INFRASTRUCTURE

### 2.1 Containers — VPS (177.7.32.224)

Verified by `docker ps` runtime probe captured 2026-05-05 (file: `reggie-vps-runtime-phase1.txt`).

| Container | Image | Status | Ports |
|---|---|---|---|
| `openclaw-bot` | `openclaw-bot` | Up 2 hours (healthy) | `8788/tcp`, `0.0.0.0:18789→18789/tcp` (gateway) |
| `openclaw-webhook` | `openclaw-webhook` | Up 3 days (healthy) | `0.0.0.0:8788→8788/tcp`, `18789/tcp` |

### 2.2 Containers — LOCAL

Status not probed in this sweep. Local stack defined by `C:\Users\JeremiahVanWagner\.openclaw\docker-compose.yml` (3,537 B, modified 2026-05-05 10:10 — newer than VPS variant).

### 2.3 Compose files (active)

| Path | Size | Modified |
|---|---:|---|
| `C:\Users\JeremiahVanWagner\.openclaw\docker-compose.yml` (LOCAL dev) | 3,537 B | 2026-05-05 10:10 |
| `C:\Users\JeremiahVanWagner\.openclaw\deploy\docker-compose.prod.yml` (LOCAL prod build) | 2,323 B | 2026-05-05 08:13 |
| `C:\Users\JeremiahVanWagner\.openclaw\deploy\monitoring\docker-compose.monitoring.yml` (Prometheus/Grafana) | 2,061 B | 2026-05-05 08:13 |
| `/root/openclaw/docker-compose.yml` (VPS dev) | 1,841 B | 2026-05-05 14:56 |
| `/root/openclaw/deploy/docker-compose.prod.yml` (VPS prod) | 2,658 B | 2026-05-01 21:09 |
| `/root/openclaw/deploy/monitoring/docker-compose.monitoring.yml` (VPS monitoring) | 2,059 B | 2026-04-30 19:42 |

### 2.4 Network surface

- Gateway listens on `:18789` (Tailscale-only per P7 — no public surface)
- Webhook handler listens on `:8788` (signed webhooks only, P8 idempotency required)
- Prometheus scrapes both `:18789/metrics` and `:8788/metrics` (config in `deploy/monitoring/prometheus/prometheus.yml`)

### 2.5 `.env` variable names (key names only — no values, per P7)

Captured from VPS `/root/openclaw/.env`:

```
CANVA_BRAND_KIT_ID
CANVA_CLIENT_ID
CANVA_CLIENT_SECRET
GDRIVE_BASE_FOLDER_ID
GHL_EMAIL
GHL_LOCATION_ID
GHL_LOCATION_ID_TJB
GHL_PASSWORD
GHL_PRIVATE_INTEGRATION_TOKEN
GHL_PRIVATE_INTEGRATION_TOKEN_TJB
GHL_TOKEN
OPENAI_API_KEY
OPENCLAW_ALERT_TELEGRAM_CHAT_ID
OPENCLAW_DATA_DIR
OPENCLAW_GATEWAY_AUTH_TOKEN
OPENCLAW_GHL_WEBHOOK_HOST
OPENCLAW_GHL_WEBHOOK_PORT
OPENCLAW_GHL_WEBHOOK_SECRET
OPENCLAW_OPENAI_CODEX_MANUAL_TOKEN
OPENCLAW_REPORT_TZ
OPENCLAW_TELEGRAM_BOT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
TELEGRAM_ALERT_CHAT_ID
TELEGRAM_BOT_TOKEN
YOUTUBE_CHANNEL_ID
```

26 variables. Rotation policy: GHL PIT ≤90 days (P6), Supabase service keys ≤180 days, all rotations logged in `audit_events`.

### 2.6 Workforce

- Configured agents: **103** (`config/agents_config.json`)
- Runtime entries: **107** (`config/openclaw.prod.json`, `openclaw.json`)
- Runtime aliases: `main`, `marketing`, `sales`, `support`
- Divisions: **9** (D1–D9 per Block 8 of doctrine)
- Generated workforce snapshot: `AGENTS.md` (root, 2,213 B)

---

## 3. ACTIVE SKILLS REGISTRY

### 3.1 Repo skills (`skills/` in `github.com/jeremiahvanwagner-droid/openclaw`)

- 165 folder-style skills (each with `SKILL.md`)
- 125 `.mjs` skill modules
- 2 `.json` skill descriptors
- **Skill audit allowlist**: `skills/.audit-allowlist.json` — **MISSING** (P4 audit gate not yet initialized) → Open Item #1
- **Skill audit manifest**: `skills/.audit-manifest.json` — **MISSING** → Open Item #1

Top namespaces (folder-style):

| Prefix | Skills |
|---|---:|
| `community-` | 14 |
| `affiliate-` | 14 |
| `ghl-` | 13 |
| `finance-` | 12 |
| `education-` | 12 |
| `ecommerce-` | 12 |
| `digital-` | 12 |
| `coaching-` | 12 |
| `brand-` | 12 |
| `aisaas-` | 12 |
| `agency-` | 12 |
| `content-` | 8 |
| `webhook-` | 5 |
| `funnel-` | 5 |
| `browser-` | 5 |

### 3.2 User-scoped REGGIE doctrine skills (`C:\Users\JeremiahVanWagner\.openclaw\skills\`)

Verified present in LOCAL filesystem (Phase 1 manifest scan):

| Skill | Status |
|---|---|
| `reggie-doctrine-recall` | VERIFIED (canonical doctrine — Block 1–7) |
| `reggie-tier-router` | VERIFIED (Tier 0/1/2 fast routing test) |
| `reggie-state-audit-entry` | VERIFIED (8-rule append-only validation) |
| `reggie-supabase-ops` | VERIFIED (DB1/DB2, P3, P7 declarative migrations) |
| `reggie-ghl-operations` | VERIFIED (35-namespace / 413-op map, Channel Authority) |
| `reggie-skill-audit-gate` | VERIFIED (P4 manifest enforcement) |
| `reggie-phase-ritual` | VERIFIED (phase-gate enforcement) |

### 3.3 User-scoped TJB workflow skills

Verified present in LOCAL filesystem:

| Skill | Status |
|---|---|
| `tjb-context-frontloader` | VERIFIED |
| `tjb-precision-prompt` | VERIFIED |
| `tjb-prophetic-voice` | VERIFIED |
| `tjb-refinement-loop` | VERIFIED |
| `tjb-session-memory` | VERIFIED |
| `tjb-tool-orchestrator` | VERIFIED |
| `tjb-trend-sensor` | VERIFIED |
| `tjb-workflow-decomposer` | VERIFIED |
| `tjb-multimodal-reel-pipeline` | VERIFIED |
| `tjb-autonomous-deploy` | VERIFIED |

---

## 4. ACTIVE AGENT PROFILE

| Field | Value |
|---|---|
| Agent auth profile | Not located in repo or VPS scan — see Open Item #2 |
| Sanitizer script (canonical) | `/root/openclaw/deploy/sanitize-runtime-config.py` (2,514 B, 2026-05-01 17:57) |
| Repo equivalent | **MISSING** — `deploy/sanitize-runtime-config.py` not in repo (GHOST REFERENCE → Open Item #3) |
| Runtime config parity check | `scripts/upgrade/runtime-config-parity.mjs` (8,440 B) — present in repo and VPS |
| Runtime rollout config builder | `scripts/upgrade/build-runtime-rollout-config.mjs` (4,095 B) — present in repo and VPS |
| GHL OAuth manager | `skills/ghl-oauth-manager.mjs` — initialized at webhook startup |
| Webhook handler | `handlers/ghl-webhook-handler.mjs` (sole handler) |
| Inngest event surface | `inngest/client.ts` — 60 typed GHL event definitions |

### 4.1 Models wired (per `openclaw.prod.json` / `openclaw.json`)

- **78** Anthropic Sonnet (Tier 1 cloud workhorse)
- **22** Anthropic Haiku (Tier 1 fast loops)
- **7** Anthropic Opus (Tier 0 — TIER0_SPEND audit required per Block 6)
- OpenAI present for `memorySearch` embeddings only

### 4.2 Gateway

- Mode: gateway-only on `:18789` (no public surface — P7)
- Bind: Tailscale-only, Caddy fronts only signed webhook endpoints
- Auth: `OPENCLAW_GATEWAY_AUTH_TOKEN`

---

## 5. OPEN ITEMS (BLOCKERS ONLY — MAX 10)

| # | Blocker | Impact | First seen |
|---|---|---|---|
| 1 | `skills/.audit-allowlist.json` and `skills/.audit-manifest.json` missing | P4 skill audit gate cannot run — every skill is technically "unaudited" until first manifest is generated | 2026-05-05 sweep |
| 2 | Agent auth profile location not identified in repo or VPS scan | Cannot verify per-agent least-privilege (P5) without seeing the profile file | 2026-05-05 sweep |
| 3 | GHOST REFERENCE — `deploy/sanitize-runtime-config.py` exists on VPS but not in repo | Drift risk: sanitizer changes on VPS won't propagate; sweep changes on VPS could be reverted on next deploy | 2026-05-05 sweep |
| 4 | Live gateway metrics not verified (`:18789/metrics` reachability) | Inherited from prior REGGIE-STATE — Prometheus scrape config is correct, runtime not probed in this audit | 2026-04-06 audit |
| 5 | Live Prometheus/Grafana target health not verified | Inherited — no proof both targets are `UP` in this audit | 2026-04-06 audit |
| 6 | `/health/deep` endpoint absent | Inherited — only `/health` exists; no "running but broken" detection | 2026-04-06 audit |
| 7 | No staging environment | Inherited — repo deploys without verified staging layer | 2026-04-06 audit |
| 8 | LOCAL and VPS `REGGIE-STATE.md` were divergent before this sweep | LOCAL 9,160 B (2026-05-05 08:13) was newer; VPS 9,141 B (2026-04-30) was stale | 2026-05-05 sweep |

---

## 6. NEXT ACTIONS (MAX 5)

1. **Initialize the P4 skill audit gate.** Run `audit-skills.mjs` to generate `skills/.audit-allowlist.json` (review-and-sign the 290-skill catalog) and `skills/.audit-manifest.json` (sha256 hashes). Required before any new skill ships. Closes Open Item #1.
2. **Locate or create the agent auth profile.** Identify where per-agent least-privilege scope is declared. If undocumented, create `config/agent-auth-profiles.json` with one entry per agent. Closes Open Item #2.
3. **Bring `deploy/sanitize-runtime-config.py` into the repo.** Copy from VPS, commit to `deploy/`, then update VPS pull workflow so the canonical version lives in git. Closes Open Item #3.
4. **Live-probe the runtime stack.** Run `curl -fsS http://127.0.0.1:18789/metrics` and `curl -fsS http://127.0.0.1:8788/healthz` on VPS, plus a Prometheus target check. Promote Open Items #4 and #5 to either RESOLVED or CONFIRMED with evidence.
5. **Sync canonical REGGIE-STATE.md to VPS.** Push this file to `/root/openclaw/REGGIE-STATE.md` so both hosts share the same audit record. Resolves Open Item #8 permanently.

---

## 7. CHANGE LOG (LAST 5 ENTRIES)

> Append-only — never edit prior entries. Corrections are new entries with `Status=ROLLED_BACK` referencing the prior Entry ID.

### 7.0 AUDIT ENTRY — REGGIE repair sweep — 2026-05-09

| Field | Value |
|---|---|
| Date | 2026-05-09 13:45 UTC |
| Author | agent:MIKE + human:jeremiah-vanwagner |
| Change Type | CONFIG_INTEGRITY (rollback of unauthorized runtime change) |
| Status | APPLIED |
| Parent Entry | `b2ef6472a474` |
| Impacted Divisions | shared_runtime_ops, shared_data_control |
| Rollback Plan | `git revert <repair-commit-sha>` returns repo to commit `6208ede` state. Local Ollama service restart: `docker compose up -d ollama`. |
| Rollback Tested | NO |
| Next Audit Due | 2026-08-09 |
| Entry ID | `r9-2026-05-09-repair` |

**Summary.** Repaired four runtime-config violations introduced by an external IDE coding agent (Claude Code) in commits `26aba32` ("database updates and finaliaztions") and `010fc01` ("finalization and production") between 2026-05-09 07:58 and 08:10 CDT. The Hostinger pnpm/corepack fix in commits `c9579ef` and `6208ede` is correct and was preserved. (1) `docker-compose.yml` — restored the `ollama` service, `ollama-data` volume, `bot.depends_on.ollama: service_healthy`, and `webhook.depends_on: [ollama]`. Without this, the `bot` container's `OLLAMA_HOST=http://ollama:11434` env points at a non-existent service and every Tier-2 (default) call fails connection — direct violation of the Local-First Compute Doctrine. (2) `db.js` at repo root — removed; this file ran a top-level `await supabase.from('agents').select('*')` with the service-role key on import, a P5 + P3 + P7 surface risk. Reference snippet preserved at `docs/snippets/supabase-list-agents.example.mjs` with `main()` wrapper and env validation. (3) `agents/main/agent/auth-state.json` — restored the `openai-codex` provider order + lastGood fallback that was deleted. (4) `agents/main/agent/models.json` — reverted to the pre-`010fc01` form so Tier-2 (`ollama`) routes to the local provider with `gemma4`, `kimi-k2.5:cloud`, `minimax-m2.7:cloud`, `glm-5.1:cloud` instead of the cloud-only `kimi-k2.6:cloud` rewrite (which would have been a silent Tier-2 → Tier-1 promotion with no `tier_promotion` audit, violating the Local-First sovereignty clause). The 11 new sub-agent `models.json` files added by the same agent (`d8_compliance_auditor`, `d8_content_ops`, `d8_customer_success`, `d8_integration_engineer`, `d8_saas_director`, `marketing`, `sales`, `shared_data_control`, `shared_exec_orchestrator`, `shared_runtime_ops`, `support`) are LEFT IN PLACE pending CVO review — flagged for follow-up audit before they enter the routing path.

**Impacted Files**
- `docker-compose.yml` — `ollama` service + volume + depends_on restored
- `db.js` — REMOVED from repo root
- `docs/snippets/supabase-list-agents.example.mjs` — ADDED (governed reference snippet)
- `agents/main/agent/auth-state.json` — RESTORED
- `agents/main/agent/models.json` — REVERTED to commit `a4422ae` form
- `REGGIE-STATE.md` — this entry

**Validation Steps Performed**
- Doctrine load: REGGIE Doctrine loaded; 6R + P1–P10 + Channel Authority + Tiers + P10 active
- Diff review against last known-good commit `a4422ae` ("CHANGES NEEDED", 2026-05-05)
- Channel Authority (P1) — not impacted (no inbound channel handler touched)
- DB1 source-of-truth (P2) — not impacted (no Supabase migration applied)
- Declarative schema (P3) — `db.js` removal closes a non-declarative DB read path
- Skill audit gate (P4) — no `SKILL.md` touched
- Per-agent least privilege (P5) — `db.js` removal closes a service-role-key read at module top-level
- Token hygiene (P6) — no rotations performed in this entry
- No public surface (P7) — `db.js` removal closes a potential bundle leak
- Idempotency (P8) — no webhook handler touched
- HITL (P9) — no payment / deletion / mass-broadcast path touched
- Mission Alignment Test (P10) — repair restores Receive (gateway can route routine traffic to local Tier-2), Recognize (main agent regains its provider fallback memory), and Restore (system can self-heal without cloud egress for routine work). Mission alignment confirmed.
- Hostinger build path verified: `package.json` declares `packageManager: pnpm@10.32.1`; `pnpm-workspace.yaml` lists `dashboard / skills / training`; `pnpm-lock.yaml` present (~292 KB); `provision.sh` runs `corepack enable && corepack prepare pnpm@10.32.1 --activate` BEFORE any workspace install; stale `package-lock.json` files are git-ignored.

**Open Items (NOT closed by this entry)**
- Audit the 11 new sub-agent `models.json` files for Tier-2 compliance before they enter routing
- Capture a Tier-2 smoke test (`POST /v1/chat/completions` against the restored `ollama` service inside `openclaw-bot`) on next deploy
- Confirm VPS `/root/openclaw/docker-compose.yml` is re-pulled and `docker compose up -d ollama` is run on host `177.7.32.224`

### 7.1 AUDIT ENTRY — Phase 2 execution — 2026-05-05

| Field              | Value                                                    |
|--------------------|----------------------------------------------------------|
| Date               | 2026-05-05 (execution) UTC                               |
| Author             | agent:copilot + human:jeremiah-vanwagner                 |
| Change Type        | OTHER                                                    |
| Status             | APPLIED                                                  |
| Parent Entry       | `9c4f33c6c7f7`                                           |
| Impacted Divisions | Cross-Cutting                                            |
| Rollback Plan      | Restore from `archive/2026-05-05-sweep/` on each host: `mv archive/2026-05-05-sweep/* ../`. Vendor trees regenerate via `pnpm install`. |
| Rollback Tested    | NO                                                       |
| Next Audit Due     | 2026-08-05                                               |
| Entry ID           | `b2ef6472a474`                                           |

Phase 2 host-level deletes executed on both hosts under typed-BURN confirmation gates. LOCAL (`C:\Users\JeremiahVanWagner\.openclaw`): ARCHIVED 287 files → `archive/2026-05-05-sweep/`; SHREDDED 240 files (0 errors); RECLAIMED 9 vendor directories (~109,002 regenerable files). VPS (`root@177.7.32.224:/root/openclaw`): ARCHIVED 34 files; SHREDDED 6 files; RECLAIMED 6 vendor directories (~39,738 regenerable files). Vendor regen: LOCAL `pnpm install` → 780 packages (13.3 s); VPS `pnpm install` → done (3.6 s). `uv sync` skipped — `uv` not installed on LOCAL and no `pyproject.toml` exists. Both VPS containers (`openclaw-bot`, `openclaw-webhook`) confirmed `(healthy)` post-execution. SOUL.md (107 instances), `.env*`, `.git/`, browser session caches, and auth profiles untouched throughout. Transcripts saved to `archive/2026-05-05-sweep/transcripts/` on each host.

### 7.2 AUDIT ENTRY — 2026-05-05T17:55:00Z

| Field | Value |
|---|---|
| Date | 2026-05-05 17:55:00 UTC |
| Author | human:jeremiah-vanwagner |
| Change Type | OTHER |
| Status | APPLIED |
| Impacted Divisions | Cross-Cutting |
| Rollback Plan | Restore from `archive/2026-05-05-sweep/` on each host: `mv archive/2026-05-05-sweep/* ../`. Vendor trees regenerate via `pnpm install` and `uv sync`. |
| Rollback Tested | NO — sweep is read-only at this entry write; rollback will be tested in a scratch worktree before any host-level shred. |
| Next Audit Due | 2026-08-05 |
| Entry ID | `9c4f33c6c7f7` |

**Summary.** REGGIE full memory sweep, archive, and state rebuild executed. 208,846 files classified across LOCAL (`C:\Users\JeremiahVanWagner\.openclaw`) and VPS (`/root/openclaw`) into ACTIVE (3,423) / ARCHIVE (321) / SHRED (148,986 — 148,740 vendor-tree regenerable + 246 individual) / UNKNOWN (96) / PROTECTED (56,020). Phase 2 deliverables (archive scripts, INDEX.md, SHRED-MANIFEST.txt, vendor-reclaim scripts, audit-entry-draft.md) generated under `phase2/`. Phase 3 SHRED execution gated on typed `BURN` confirmation per script — no host-level deletes performed by this session. SOUL.md (8 instances), `.env*`, `.git/`, `.ssh/`, `.gnupg/`, browser session caches (logged-in IG/TikTok/FB/GHL profiles), and auth profiles classified PROTECTED and untouched. CSV-parse bug caught during Phase 2 build (one VPS row with commas in filename — `GoHighLevel Private Integration, Webhooks…`) and corrected; loader hardened with regex anchoring on ISO-8601 mtime field.

**Impacted Files / Tables / Endpoints**
- `REGGIE-STATE.md` (this file — full rebuild)
- `phase2/local/` — 8 deliverables for LOCAL host (PowerShell + bash variants)
- `phase2/vps/` — 5 deliverables for VPS host (bash only)
- `phase2/audit-entry-draft.md` — original PENDING draft, now superseded by this APPLIED entry
- `phase1/` — 8 manifest files (classified, archive, shred, unknown, protected, zero-bytes, duplicates, summary)
- 321 files queued for archive move (287 LOCAL + 34 VPS) — execution pending
- 246 files queued for individual SHRED (240 LOCAL + 6 VPS) — execution pending
- 15 vendor directory trees queued for bulk reclaim (9 LOCAL + 6 VPS) — execution pending

**Validation Steps Performed**
- Recursive scan of both LOCAL (168,166 rows) and VPS (40,680 rows) manifests using deterministic ruleset (`classify.py`)
- SOUL.md, `.env*`, `.ssh/`, `.gnupg/`, `browser/openclaw/user-data/`, `browser/sessions/`, `data/browser-sessions/`, `.git/` forced into PROTECTED bucket — 56,020 files protected
- Zero-byte files: 18,269 total — 18,264 inside vendor/git internals (handled by vendor rule); 5 standalone auto-shredded by spec
- Spec flag "zero-byte AGENTS.md" RESOLVED — VPS template is 3.1 KB per runtime probe (`/root/openclaw/docs/reference/templates/AGENTS.md` = 3,080 B)
- Spec flag "multiple REGGIE-STATE" RESOLVED — LOCAL (9,160 B, 2026-05-05 08:13) confirmed canonical; VPS (9,141 B, 2026-04-30) confirmed stale and overwritten by this rebuild
- Spec flag "old sanitizer scripts" RESOLVED — only TJB sanitizer is `/root/openclaw/deploy/sanitize-runtime-config.py`; remaining "sanitizer" matches are vendor noise (PyTorch CUDA, import-in-the-middle test fixtures)
- Channel Authority (P1), DB1 source-of-truth (P2), declarative migrations (P3), no public surface (P7) — none impacted by this sweep
- Mission Alignment Test (P10) — sweep advances Recognize (clean state) and Restore (smaller failure surface) without altering customer-facing behavior; mission alignment confirmed

### 7.3 PRIOR — 2026-04-06 (inherited from prior REGGIE-STATE)

GHL API v2 full-surface integration completed across 5 phases: schema ingestion → code generation (413 ops) → client v2 facade → webhook expansion (60 events) → 5 new skills wired to 13 agents → Inngest event types expanded → token groups added. Repo evidence: `runtime-config-parity.mjs` `ok: true`, `validate-security-hardening.mjs` exit 0, `coverage-report.mjs` 413/413, all 5 new skill files pass `node --check`.

### 7.4 PRIOR — workforce alignment

`config/agents_config.json` and the repo-level `agents_config.json` no longer claim "all 75 agents" in the active master-orchestrator responsibility text. Stale doc references corrected. Configured agents = 103, runtime entries = 107.

### 7.5 PRIOR — observability hardening

`deploy/monitoring/prometheus/prometheus.yml` includes `host.docker.internal:18789`. Rate governor state persists to `data/rate-governor-state.json` and rate-governor tests pass.

---

## 8. UNVERIFIED RUNTIME CLAIMS

Do not state any of the following as fact without a fresh live-system check:

| Claim | Current status |
|---|---|
| Hostinger gateway and webhook services are healthy | **PARTIALLY VERIFIED** — `docker ps` runtime probe captured 2026-05-05 shows both containers `(healthy)`. `curl /metrics` not run in this audit. |
| Grafana is receiving gateway metrics in live operation | Unverified |
| Prometheus shows both gateway and webhook scrape targets as `UP` | Unverified |
| Live TJB and MSL auth health is `200 OK` today | Not re-run in this audit |
| Current Supabase row counts, ghost IDs, and business-schema presence | Not re-verified in this audit |
| Deployed webhook secret value on the live host is rotated and current | Not re-verified in this audit |

---

## 9. OPERATOR RULE

Before making runtime claims, prefer this order of trust:

1. Current repo evidence
2. Current validator/test output
3. Fresh live-system checks
4. Older reports and planning documents

If an older doc conflicts with this file, this file wins until a new audit proves otherwise.

---

## 10. DOCTRINE QUICK-REFERENCE

- **6R Doctrine** — Receive · Recognize · Respond · Record · Re-engage · Restore
- **P1** Channel Authority — REGGIE stands down 30 min after GHL AI Employee replies on a native channel
- **P2** Single source of truth = DB1 (`aagqvfwuixpxtdcrdxmv`); DB2 retired
- **P3** Declarative schema only; CI fails if `supabase db diff --linked` is non-empty
- **P4** Skill audit gate — `skills/.audit-manifest.json` required (Open Item #1)
- **P5** Per-agent least privilege (Open Item #2)
- **P6** Token hygiene — GHL PIT ≤90d, Supabase service key ≤180d, log all rotations
- **P7** No public internet surface for the gateway — Tailscale-only
- **P8** Idempotent webhooks — `(provider, event_id)` UNIQUE INDEX
- **P9** Human-in-the-loop on payments / deletions / mass-broadcasts / account closure
- **P10** Mission Alignment — every initiative must shorten the distance between expressed intent and meaningful response

**Tier routing default:** Tier 2 (Ollama local). Promotion requires irreversible, leaves-TJB-surface, or 8K+ context. Tier 0 (Opus) requires written `TIER0_SPEND` audit entry.
