# Phase 9.1.1: Compose Reconciliation (Hotfix)

_Initiative slug: `compose-reconcile`_
_Phase number: 9.1.1 (sub-phase, forced consequence of 9.1 merge)_
_Owner: MIKE (Executive Systems Architect)_
_CVO sign-off required: YES_
_Opened: 2026-05-13 16:00 CDT_

---

## 1. Entry Criteria

- [x] PR #11 (Phase 9.1) merged to `main`
- [x] Post-merge smoke test attempted on VPS
- [x] Smoke test surfaced docker-compose / host-Ollama port conflict at `0.0.0.0:11434`
- [x] Root cause confirmed: host systemd Ollama (PID 130666) owns the port; container `openclaw-ollama` cannot bind
- [x] Confirmed: `openclaw-bot` and `openclaw-webhook` were failing to start due to `depends_on: ollama` healthcheck dependency
- [x] Confirmed: only `openclaw-redis` is currently healthy in the docker stack
- [x] CVO direction: Path A (host Ollama wins, remove container service)

## 2. Scope

### In Scope
- Remove the `ollama` service from `docker-compose.yml`.
- Repoint `bot` and `webhook` services' `OLLAMA_HOST` to `http://host.docker.internal:11434`.
- Add `extra_hosts: ["host.docker.internal:host-gateway"]` to `bot` and `webhook` so the docker bridge resolves the host gateway.
- Remove `depends_on: ollama` from `bot` and `webhook`.
- Retain the orphaned `ollama-data` named volume (safe rollback path; cleanup deferred to Phase 10).

### Out of Scope (deferred)
- **Removing the `ollama-data` volume** — Phase 10 cleanup. Keeping it preserves a clean rollback path.
- **Removing the Kimi cloud model from VPS host Ollama (`ollama rm kimi-k2.5:cloud`)** — CVO has not yet decided handling. Tracked separately.
- **Migrating to a fully containerized Ollama** (Path B). Path A chosen for this phase.
- **Inngest event backlog audit** — operator-side post-restart task; will surface in Phase 9.2 entry.

## 3. Deliverables

| Deliverable | Owner | Due | Done? |
|---|---|---|---|
| Patched `docker-compose.yml` | MIKE | 2026-05-13 | [x] |
| This phase document | MIKE | 2026-05-13 | [x] |
| REGGIE-STATE.md audit entry 2026-05-13-002 | MIKE | 2026-05-13 | [x] |
| PR opened against `main` | MIKE | 2026-05-13 | [x] |
| CVO PR review + sign-off | Jeremiah | TBD | [ ] |
| Merge to `main` | Jeremiah | TBD | [ ] |
| Operator-side `docker compose up -d` on VPS | Jeremiah | TBD | [ ] |
| Phase 9.1 close audit entry (now unblocked) | MIKE | post-restart | [ ] |

## 4. Validation Steps

1. **YAML validity** — `python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"` succeeds. ✅ Verified pre-commit.
2. **Service set** — only `bot`, `redis`, `webhook` declared. ✅ Verified.
3. **Operator post-merge (BLOCKING):**
   ```bash
   cd /root/openclaw && git pull
   docker compose down
   docker compose up -d
   docker compose ps                # expect: bot + redis + webhook all "Up (healthy)"
   docker compose logs bot --tail 100   # expect: zero "model not found" / zero ECONNREFUSED on Ollama
   docker compose logs webhook --tail 50
   ```
4. **Connectivity from container to host Ollama:**
   ```bash
   docker exec openclaw-bot curl -s http://host.docker.internal:11434/api/tags | jq '.models[].name'
   # expect: ["qwen3.6:latest", "qwen3:8b", "kimi-k2.5:cloud"]
   ```
5. **End-to-end smoke (the Phase 9.1 test that was blocked):**
   - Trigger one heartbeat per Haiku-remapped agent → confirm qwen3:8b response.
   - Trigger one Sonnet-bound agent → confirm Claude still routes (proves Anthropic provider preserved).

## 5. Rollback Procedure

- **Step 1:** `git revert <merge-sha>` on `main` and push.
- **Step 2:** On VPS:
  ```bash
  cd /root/openclaw && git pull && docker compose down && docker compose up -d
  ```
- **Step 3:** The previous compose tries to start the `ollama` container, which will fail (port conflict). Therefore: if rolling back, **also stop the host Ollama first** (`systemctl stop ollama`) so the container can bind.
- **Rollback Tested:** NO — rollback is not graceful. Forward fix is strongly preferred over revert. If broken, attempt forward fix first.
- **Rollback Test Date:** Pending — but rollback is intentionally unattractive given the previous state was broken (container Ollama failing silently).

## 6. Exit Criteria

- [x] All Phase 9.1.1 deliverables marked Done (pre-merge)
- [ ] PR merged
- [ ] All three containers (`bot`, `redis`, `webhook`) report Up (healthy) after `docker compose up -d`
- [ ] `docker exec openclaw-bot curl host.docker.internal:11434/api/tags` returns the qwen models
- [ ] Phase 9.1 end-to-end smoke test passes
- [ ] REGGIE-STATE.md audit entry written (open + close)
- [x] Mission Alignment Test (P10): **Inherited from Phase 9.1.** This phase is a forced reconciliation to unblock the same mission alignment (cost sovereignty + operational independence). No separate P10 answer required for a hotfix sub-phase per phase-ritual doctrine.
- [ ] CVO sign-off received

## 7. Doctrine Compliance

| Principle | Status | Notes |
|---|---|---|
| P1 (Declarative) | ✅ | Compose file is declarative config |
| P2 (No orphaned changes) | ✅ | **This PR explicitly resolves a pre-existing P2 violation** (container Ollama dead, no one updated compose) |
| P3 (Declarative migration) | N/A | No data migration |
| P5 (Tier 0 spend) | ✅ | No Tier 0 spend |
| P9 (Rollback tested) | ⚠️ | Rollback documented but intentionally unattractive |
| P10 (Mission Alignment) | ✅ | Inherited from Phase 9.1 parent |

## 8. P2 Violation Discharge Statement

The pre-existing P2 violation discharged by this phase: **the `openclaw-ollama` docker service in `docker-compose.yml` had been failing every restart cycle due to a port conflict with the host-installed systemd Ollama, but the compose file was never updated to reflect the actual deployed reality.** This left the `bot` and `webhook` containers in a broken dependency state — they could not start because they waited on an ollama healthcheck that would never pass.

Duration of violation: unknown. Likely from the date the host Ollama was first installed (must pre-date 2026-05-12 11:27 UTC per `systemctl status` showing 1 day 9h uptime, but the install may be older).

Logged in REGGIE-STATE.md as Entry 2026-05-13-002.

## 9. Notes for Operator (CVO)

- After merging and running `docker compose up -d`, **check the Inngest event queue for backlog**. While `bot` and `webhook` containers were failing, any GHL webhook events that fired likely queued (or dropped) — depending on Inngest config. Surface any anomalies in Phase 9.2 entry.
- The orphaned `ollama-data` named volume on the docker host is retained for now. It contains zero downloaded models (the container Ollama never successfully started long enough to pull anything). Safe to delete in Phase 10.
- The `OLLAMA_HOST` env var format `http://host.docker.internal:11434` (without `/v1`) is correct for the Ollama-native client. The `/v1` suffix is added by the OpenAI-compatible client adapter automatically per the per-agent `models.json` `baseUrl` field.
