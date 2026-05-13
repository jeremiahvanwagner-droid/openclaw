# Phase 9.1.2: Host-Native Architecture Reconciliation (Hotfix #2)

_Initiative slug: `host-native-reconcile`_
_Phase number: 9.1.2 (forced consequence of 9.1.1 partial smoke test)_
_Owner: MIKE (Executive Systems Architect)_
_CVO sign-off required: YES_
_Opened: 2026-05-13 16:25 CDT_

---

## 1. Entry Criteria

- [x] PR #12 (Phase 9.1.1) merged to `main` at commit `87b162a`
- [x] Post-merge smoke test attempted; surfaced second port conflict on `0.0.0.0:18789`
- [x] Root cause confirmed via `ss -tlnp`, `ps -fp 141406`, `systemctl status 141406`:
  - **Process:** `/usr/bin/node /usr/lib/node_modules/openclaw/dist/index.js gateway --port 18789 --allow-unconfigured`
  - **systemd unit:** `openclaw.service`
  - **User:** `openclaw` (non-root)
  - **Uptime:** 20h (running since 2026-05-13 01:13 UTC, pre-dating Phase 9.1 merge)
- [x] Container `openclaw-bot` confirmed never to have been the actual runtime
- [x] Container `openclaw-webhook` confirmed never to have been the actual runtime
- [x] Orphan `openclaw-ollama` container cleaned via `docker compose down --remove-orphans`
- [x] CVO direction (implicit via diagnostic acceptance): Path A — host-native reality wins, compose drops the dead service definitions

## 2. Scope

### In Scope
- Strip `bot` service from `docker-compose.yml` — host `openclaw.service` is the real runtime.
- Strip `webhook` service from `docker-compose.yml` — host openclaw process serves webhook endpoints via the same gateway.
- Keep `redis` as the only containerized service.
- Add operator runbook + architectural reality documentation in the compose file header.
- Change `redis` restart policy from `"no"` to `"unless-stopped"` (it should survive VPS reboots).
- Remove the orphaned `ollama-data` named volume from Phase 9.1.1 (no longer needed).
- Update `REGGIE-STATE.md` with audit entry `2026-05-13-003`.

### Out of Scope (deferred)
- **Enabling `openclaw.service` for auto-start** (currently `disabled; preset: enabled`). Recommendation for operator after this phase: `systemctl enable openclaw ollama`. Not gated by this PR.
- **Investigating the `[diagnostic] liveness warning: reasons=event_l...` log line** observed in `systemctl status` at 20:54:15. Truncated; full reason needs `journalctl -u openclaw --since "20:54" --no-pager` review. Tracked as a Phase 9.2 entry-criteria item.
- **Memory cap evaluation.** Current usage 960 MB of 2 GB. Acceptable for now; revisit if Phase 9.2 Sonnet-tier remap increases load.
- **Containerizing OpenClaw** (Path B). Path A locked in for this phase. Phase 10 may revisit.

## 3. Deliverables

| Deliverable | Owner | Due | Done? |
|---|---|---|---|
| Patched `docker-compose.yml` (redis-only) | MIKE | 2026-05-13 | [x] |
| This phase document | MIKE | 2026-05-13 | [x] |
| `REGGIE-STATE.md` audit entry `2026-05-13-003` | MIKE | 2026-05-13 | [x] |
| PR opened against `main` | MIKE | 2026-05-13 | [x] |
| CVO PR review + sign-off | Jeremiah | TBD | [ ] |
| Merge to `main` | Jeremiah | TBD | [ ] |
| Operator-side restart on VPS | Jeremiah | TBD | [ ] |
| Phase 9.1 close audit entry (finally unblocked) | MIKE | post-restart | [ ] |
| Phase 9.1.1 close audit entry | MIKE | post-restart | [ ] |

## 4. Validation Steps

1. **YAML validity** — compose file parses cleanly. ✅ Verified pre-commit.
2. **Service set** — only `redis` declared. ✅ Verified.
3. **Operator post-merge (BLOCKING — actual cutover happens here):**
   ```bash
   cd /root/openclaw && git pull
   docker compose down --remove-orphans
   docker compose up -d
   docker compose ps                          # only openclaw-redis, healthy
   systemctl restart openclaw                 # ← THIS is the Phase 9.1 cutover
   systemctl status openclaw --no-pager       # active (running)
   ```
4. **Connectivity verification:**
   ```bash
   # Host openclaw can reach host ollama
   curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'

   # Host openclaw is serving gateway
   curl -s http://127.0.0.1:18789/health
   ```
5. **End-to-end smoke (the original Phase 9.1 test that has been blocked twice):**
   - `journalctl -u openclaw --since "1 minute ago" -f` — tail logs for 3 minutes
   - Trigger one heartbeat per Haiku-remapped agent — confirm log shows `qwen3:8b` model selection
   - Trigger one Sonnet-bound agent — confirm log shows `claude-sonnet-4.5` model selection
   - Zero "model not found" errors
   - Zero "ECONNREFUSED" against `127.0.0.1:11434`

## 5. Rollback Procedure

- **Step 1:** `git revert <merge-sha>` on `main` and push.
- **Step 2:** On VPS:
  ```bash
  cd /root/openclaw && git pull
  docker compose down --remove-orphans
  docker compose up -d
  ```
  This restores the previous compose (with bot/webhook containers declared). They will fail to start (port conflict with host openclaw) — exactly as before this PR. Rollback returns to the broken-but-known prior state, NOT to a working state.
- **Step 3:** The host `openclaw.service` continues running regardless of rollback — that's the real runtime.
- **Rollback Tested:** NO. Forward-fix is overwhelmingly preferred. Rollback target state was broken.

## 6. Exit Criteria

- [x] All Phase 9.1.2 deliverables marked Done in Section 3 (pre-merge)
- [ ] PR merged
- [ ] `docker compose ps` shows ONLY `openclaw-redis` healthy after `docker compose up -d`
- [ ] `systemctl restart openclaw` succeeds
- [ ] `systemctl status openclaw` reports `active (running)` with no error counter increment
- [ ] `journalctl -u openclaw` shows zero "model not found" / zero `ECONNREFUSED` in the 3-minute tail post-restart
- [ ] At least one heartbeat per Haiku-remapped agent confirmed routing to `qwen3:8b` in logs
- [ ] At least one Sonnet-bound agent confirmed routing to `claude-sonnet-4.5` in logs (proves Anthropic provider preserved)
- [ ] REGGIE-STATE.md audit entry written (open + close)
- [x] Mission Alignment Test (P10): **Inherited from Phase 9.1.** No separate P10 answer required for a hotfix sub-phase per phase-ritual doctrine.
- [ ] CVO sign-off received

## 7. Doctrine Compliance

| Principle | Status | Notes |
|---|---|---|
| P1 (Declarative) | ✅ | Compose file declarative |
| P2 (Orphaned change) | ✅ | **Discharges pre-existing violation** — compose declared `bot`, `webhook`, `ollama` services that have never been the actual runtime |
| P5 (Tier 0 spend) | ✅ | None |
| P9 (Rollback tested) | ⚠️ | Rollback intentionally unattractive — prior state was broken |
| P10 (Mission Alignment) | ✅ | Inherited from Phase 9.1 |

## 8. P2 Violation Discharge Statement

**Pre-existing P2 violation:** The `docker-compose.yml` declared `bot`, `webhook`, and `ollama` services as the OpenClaw runtime. None of these have actually been the runtime on this VPS. The real runtime is host-installed:

- **OpenClaw gateway:** `/usr/bin/node /usr/lib/node_modules/openclaw/dist/index.js gateway --port 18789 --allow-unconfigured` under `openclaw.service`
- **Ollama:** `/usr/local/bin/ollama serve` under `ollama.service`

The compose-declared services have been failing on every restart cycle due to port conflicts with the host services. Duration of violation: at least 20 hours (host `openclaw.service` uptime), likely much longer.

This PR brings the compose file into alignment with the deployed reality.

## 9. Notes for Operator (CVO)

- **CRITICAL:** Phase 9.1's Haiku→qwen3:8b cutover does NOT take effect until you run `systemctl restart openclaw` AFTER merging this PR. The host process has been running with the pre-Phase-9.1 `agents_config.json` cached in memory for 20+ hours.
- **Make services persistent:** Run `systemctl enable openclaw ollama` after this phase closes, so they auto-start on VPS reboot. Currently `openclaw.service` is `disabled; preset: enabled` — it survives because it was started manually and nothing has stopped it, but it will NOT come back after a reboot.
- **Liveness warning to investigate:** `systemctl status openclaw` at 20:54:15 showed `[diagnostic] liveness warning: reasons=event_l...`. Truncated. Run `journalctl -u openclaw --since "20:54" --no-pager | grep liveness` to get the full reason. Could be event-loop saturation; could be benign. Track in Phase 9.2 entry criteria.
- **Memory headroom:** Host process is using 960 MB of 2 GB cap. Tight. If Phase 9.2 (Sonnet remap to qwen3.6:latest 36B MoE) drives up local-model load, this may need attention. Tracked for Phase 9.2.
- **Kimi:** Still installed on VPS host Ollama (`kimi-k2.5:cloud`). Repo references purged. Decision deferred.
