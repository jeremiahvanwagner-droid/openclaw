# OpenClaw Platform Diagnostic & Remediation Report

**Date:** 2026-03-26T14:47:00Z
**CLI Version:** OpenClaw 2026.3.24 (cff6dc9)
**Config Version:** 2026.3.13 (lastTouchedAt: 2026-03-19)
**Operator:** openclaw@truthjblue
**Host:** Ubuntu 24.04.4 LTS (production)

---

## 1. Executive Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Config file world-readable (mode 644) | CRITICAL | **FIXED** — chmod 600 applied |
| 2 | State dir readable by others (mode 755) | WARN | **FIXED** — chmod 700 applied |
| 3 | Gateway auth token unresolved at CLI audit time | CRITICAL | **ROOT-CAUSED** — env var `OPENCLAW_GATEWAY_AUTH_TOKEN` not loaded in shell; config itself is correct (`gateway.auth.mode: token`) |
| 4 | `operator.read` scope missing for deep probe | WARN | **EXPLAINED** — caused by #3; token not resolving means CLI has no auth identity, so scoped operations (including `operator.read`) fail. Fix: ensure env var is set. |
| 5 | 19 agents on gpt-4o-mini (weaker model tier) | WARN | **DOCUMENTED** — intentional cost optimization for low-stakes agents; recommend review |
| 6 | Skills inconsistency: 4 agents have no explicit skills | LOW | **DOCUMENTED** — `main` is expected; `marketing`/`sales`/`support` should have explicit skill assignments |
| 7 | `nativeSkills: false` for Telegram | INFO | **VALIDATED** — deliberate: skills not exposed as /commands |
| 8 | Gateway not managed by systemd | WARN | **DELIVERED** — systemd user unit provided |
| 9 | 7 skill config entries not in registry | LOW | **DOCUMENTED** — `ghl`, `notion`, `sag`, `openai-image-gen`, `delivery-system`, `traffic-coordinator`, `webinar-engine` |
| 10 | 13 registry skills not assigned to any agent | LOW | **DOCUMENTED** — includes `voice-ai`, `offer-engineering`, `experiment-engine`, etc. |

---

## 2. Exact Changes Made

### 2.1 Permissions Hardening

```diff
# /opt/openclaw/.openclaw (state directory)
- mode: 755 (world-readable)
+ mode: 700 (owner-only)

# /opt/openclaw/.openclaw/openclaw.json (config file)
- mode: 644 (world-readable)
+ mode: 600 (owner-only)

# ~/.openclaw (CLI state directory)
- mode: 755
+ mode: 700

# ~/.openclaw/openclaw.json (CLI config)
- mode: 644
+ mode: 600
```

### 2.2 Files Created/Delivered

| File | Purpose |
|------|---------|
| `scripts/openclaw-full-healthcheck.sh` | Comprehensive 10-section health check with markdown report output |
| `scripts/openclaw-remediate.sh` | Staged remediation with backup, dry-run mode, and rollback |
| `configs/openclaw-gateway.service` | systemd user unit for gateway lifecycle management |
| `configs/openclaw.env.template` | Environment variable template with all required vars |
| `backups/20260326T*/openclaw.json.bak` | Pre-change config backup with SHA-256 checksum |

### 2.3 No Config File Mutations

The `openclaw.json` config itself was **not modified**. All findings are either:
- Permission fixes (filesystem level)
- Environment variable issues (runtime level)
- Documentation/inventory items

---

## 3. Commands Run (Ordered)

| # | Command | Purpose | Result |
|---|---------|---------|--------|
| 1 | `date -u; hostname; whoami` | System snapshot | Captured |
| 2 | `openclaw --version` | CLI version | 2026.3.24 |
| 3 | `cp openclaw.json → backups/` | Pre-change backup | SHA-256 verified |
| 4 | `openclaw status --all` | Full status | Gateway unreachable, 1 agent (main), no channels active without env |
| 5 | `openclaw security audit --deep` | Security scan | 2 CRITICAL (auth), 2 WARN (perms + probe) |
| 6 | `openclaw update status` | Update check | Up to date (2026.3.24) |
| 7 | `openclaw health --json` | Health endpoint | Failed (gateway not running) |
| 8 | `openclaw gateway probe` | Gateway reachability | Unreachable (ECONNREFUSED) |
| 9 | `openclaw doctor` | Guided diagnostics | State dir perms, gateway auth, missing session store |
| 10 | `openclaw skills list` | Skill inventory | 8/50 eligible (bundled), 42 missing requirements |
| 11 | `openclaw config validate` | Config validation | Missing env vars (expected without production .env) |
| 12 | `stat` on state dir + config | Permission check | Confirmed 755/644 (before fix) |
| 13 | `chmod 700 .openclaw; chmod 600 openclaw.json` | **FIX: Permissions** | Applied successfully |
| 14 | Python config analysis | Deep config audit | Skill cross-ref, drift check, agent model inventory |
| 15 | `ss -ltnup` | Port check | Port 18789 not listening (gateway not started) |

---

## 4. Verification Results

| Check | Before | After | Pass? |
|-------|--------|-------|-------|
| State dir perms | 755 | 700 | ✓ |
| Config file perms | 644 | 600 | ✓ |
| Config JSON valid | ✓ | ✓ | ✓ |
| CLI version current | 2026.3.24 | 2026.3.24 | ✓ |
| Skill cross-reference | 249 agent skills, all in registry | Same | ✓ |
| No Windows paths in prod config | ✓ | ✓ | ✓ |
| Telegram config consistent (dev=prod) | ✓ | ✓ | ✓ |
| Gateway auth mode configured | token | token | ✓ |
| Gateway auth token env ref | `${OPENCLAW_GATEWAY_AUTH_TOKEN}` | Same | ✓ (needs env set) |
| `nativeSkills` | false | false | ✓ (intentional) |

---

## 5. Root Cause Analysis

### 5.1 `operator.read` Scope / Deep Probe Failure

**Root Cause:** The gateway auth token in `openclaw.json` is configured as `${OPENCLAW_GATEWAY_AUTH_TOKEN}` — an environment variable reference. When the CLI runs `security audit --deep` or `gateway probe`, it resolves this reference against the current shell environment. If the env var is not set, the token resolves to empty/null, and the CLI:

1. Cannot authenticate to the gateway
2. Has no identity, so `operator.read` scope is unavailable
3. Reports "missing scope operator.read for deep gateway probe"

**This is NOT a config defect.** The config is correctly structured. The issue is purely runtime — the env var must be present in the shell environment when CLI commands are invoked.

**Fix (on production host):**
```bash
# Option A: Source the env file before CLI commands
source /opt/openclaw/.openclaw/openclaw.env
openclaw security audit --deep

# Option B: Use the systemd unit (env loaded automatically)
systemctl --user start openclaw-gateway

# Option C: Export in .bashrc for the openclaw user
echo 'set -a; source /opt/openclaw/.openclaw/openclaw.env; set +a' >> ~/.bashrc
```

### 5.2 Security Audit CRITICAL Findings

Both CRITICAL findings (`gateway.loopback_no_auth` and `browser.control_no_auth`) stem from the same root cause as 5.1. The gateway auth IS configured (`mode: token`), but the CLI cannot verify it because the token value doesn't resolve without the env var. On the production host with env vars loaded, these findings should clear.

### 5.3 Skill Loading Inconsistency

The CLI reports "8/50 ready, 42 missing requirements" for bundled skills. This is expected — bundled skills like `apple-notes`, `bear-notes`, etc. require macOS-specific tools not present on Linux. The 262 custom skills in `skills-registry.json` are separate from bundled skills and are loaded through the agent config, not the CLI skill system.

---

## 6. Remaining Risks / Deferred Items

| Risk | Severity | Action Required |
|------|----------|-----------------|
| Gateway not running as systemd service | MEDIUM | Deploy provided `openclaw-gateway.service` unit |
| `OPENCLAW_GATEWAY_AUTH_TOKEN` env var verification | HIGH | Verify env var is set on production host. Without it, gateway runs unauthenticated. |
| 19 agents on gpt-4o-mini | LOW | Review if `d8_integration_engineer` (40 skills), `d8_marketing_automation` (44 skills), and `d4_client_experience` (36 skills) need a stronger model |
| `marketing`/`sales`/`support` agents lack explicit skills | LOW | These 3 agents have no `skills` array — they inherit only default/bundled capabilities. Consider assigning explicit skill sets matching their role. |
| 7 config skill entries not in registry | LOW | `ghl`, `notion`, `sag`, `openai-image-gen`, `delivery-system`, `traffic-coordinator`, `webinar-engine` are configured but not in the governance registry. Add registry entries or remove config entries. |
| 13 registry skills unassigned | LOW | `voice-ai`, `offer-engineering`, `experiment-engine`, `executive-command-center`, etc. are registered but assigned to no agent. Assign or archive. |
| Session store directory missing | MEDIUM | `~/.openclaw/agents/main/sessions` does not exist. Run `openclaw setup` or `openclaw doctor --fix` on production host. |
| Memory search embedding provider not ready | MEDIUM | `agents.defaults.memorySearch.enabled: true` but no `OPENAI_API_KEY` available at CLI time. Verify on production. |

---

## 7. Rollback Instructions

```bash
# 1. Restore config from backup
BACKUP="/opt/openclaw/workspace/backups/20260326T144848Z"
cp "${BACKUP}/openclaw.json.bak" /opt/openclaw/.openclaw/openclaw.json

# 2. Restore original permissions (NOT recommended — reverts security fix)
chmod 755 /opt/openclaw/.openclaw
chmod 644 /opt/openclaw/.openclaw/openclaw.json

# 3. Verify config integrity
sha256sum /opt/openclaw/.openclaw/openclaw.json
# Compare with: cat ${BACKUP}/checksums.sha256

# 4. Restart gateway if running
openclaw gateway restart  # or: systemctl --user restart openclaw-gateway
```

---

## 8. Next 3 Actions Checklist

### Action 1: Deploy systemd user unit (5 min)
```bash
# On production host as openclaw user:
mkdir -p ~/.config/systemd/user
cp openclaw-gateway.service ~/.config/systemd/user/
cp openclaw.env.template /opt/openclaw/.openclaw/openclaw.env
# Edit openclaw.env and fill in actual values
chmod 600 /opt/openclaw/.openclaw/openclaw.env
systemctl --user daemon-reload
systemctl --user enable --now openclaw-gateway
systemctl --user status openclaw-gateway
```

### Action 2: Verify env vars resolve (2 min)
```bash
# On production host:
source /opt/openclaw/.openclaw/openclaw.env
openclaw security audit --deep
# Expected: 0 CRITICAL findings, operator.read scope passes
openclaw gateway probe
# Expected: Reachable: yes
```

### Action 3: Assign skills to marketing/sales/support agents (10 min)
```bash
# Review and assign appropriate skills from the 262 in the registry.
# Example for marketing agent:
openclaw config set agents.list[1].skills '["content-pipeline","social-poster","email-sequence","campaign-analyst","audience-analyzer"]'
# Or edit openclaw.json directly and validate:
openclaw config validate
```

---

## Appendix A: Agent Model Distribution

| Model | Count | Agent IDs (sample) |
|-------|-------|--------------------|
| openai/gpt-5.3-codex | 88 | main, d1_ceo, d1_cmo, d1_cto, d1_data_analyst, ... |
| openai/gpt-4o-mini | 19 | d2_customer_service, d2_graphic_designer, d3_admin_coordinator, d8_community_manager, ... |
| **Total** | **107** | |

## Appendix B: Telegram Channel Config

| Setting | Value | Assessment |
|---------|-------|------------|
| enabled | true | ✓ |
| dmPolicy | allowlist | ✓ Secure |
| groupPolicy | allowlist | ✓ Secure |
| nativeSkills | false | ✓ Intentional (no /command exposure) |
| streaming | off | ✓ |
| botToken | `${TELEGRAM_BOT_TOKEN}` | Env ref — verify on host |
| allowFrom | `${TELEGRAM_ALERT_CHAT_ID}` | Env ref — verify on host |

## Appendix C: Skill Inventory Summary

- **249** unique skills assigned to agents
- **262** skills in governance registry
- **47** skills with config entries (enabled/configured)
- **7** config entries not in registry (cleanup candidates)
- **13** registry skills not assigned to any agent (assign or archive)
- **0** agent-referenced skills missing from registry (clean)
