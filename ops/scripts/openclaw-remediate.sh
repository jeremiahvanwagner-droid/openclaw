#!/usr/bin/env bash
# ============================================================================
# openclaw-remediate.sh
# Safe, staged remediation for OpenClaw production issues
# Version: 1.0.0 — 2026-03-26
# Run as: openclaw user on production host
# ============================================================================
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-/opt/openclaw}"
OPENCLAW_STATE="${OPENCLAW_STATE:-${OPENCLAW_HOME}/.openclaw}"
OPENCLAW_CONFIG="${OPENCLAW_STATE}/openclaw.json"
BACKUP_DIR="${OPENCLAW_HOME}/workspace/backups/$(date -u '+%Y%m%dT%H%M%SZ')"
DRY_RUN="${DRY_RUN:-false}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "[$(date -u '+%H:%M:%S')] $1"; }
pass() { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
step() { echo -e "\n${BLUE}▸ STAGE: $1${NC}"; }

if [ "${DRY_RUN}" = "true" ]; then
    log "${YELLOW}DRY RUN MODE — no changes will be applied${NC}"
fi

# ============================================================
# STAGE 0: BACKUP
# ============================================================
step "0 — Backup"
mkdir -p "${BACKUP_DIR}"

cp "${OPENCLAW_CONFIG}" "${BACKUP_DIR}/openclaw.json.bak"
sha256sum "${BACKUP_DIR}/openclaw.json.bak" > "${BACKUP_DIR}/checksums.sha256"
stat -c '%a %U:%G %n' "${OPENCLAW_STATE}" "${OPENCLAW_CONFIG}" > "${BACKUP_DIR}/permissions-snapshot.txt"

pass "Backup created: ${BACKUP_DIR}"
log "  Config checksum: $(sha256sum "${OPENCLAW_CONFIG}" | cut -d' ' -f1)"

# ============================================================
# STAGE 1: PERMISSIONS HARDENING
# ============================================================
step "1 — Permissions Hardening"

fix_perms() {
    local target="$1" expected="$2" label="$3"
    current=$(stat -c '%a' "${target}" 2>/dev/null)
    if [ "${current}" = "${expected}" ]; then
        pass "${label}: already ${expected}"
    elif [ "${DRY_RUN}" = "true" ]; then
        warn "${label}: would change ${current} → ${expected}"
    else
        chmod "${expected}" "${target}"
        pass "${label}: ${current} → ${expected}"
    fi
}

fix_perms "${OPENCLAW_STATE}" "700" "State dir"
fix_perms "${OPENCLAW_CONFIG}" "600" "Config file"

# Also harden ~/.openclaw if CLI uses it
CLI_STATE="${HOME}/.openclaw"
if [ -d "${CLI_STATE}" ]; then
    fix_perms "${CLI_STATE}" "700" "CLI state dir (~/.openclaw)"
fi
if [ -f "${CLI_STATE}/openclaw.json" ]; then
    fix_perms "${CLI_STATE}/openclaw.json" "600" "CLI config (~/.openclaw/openclaw.json)"
fi

# Harden credentials directory if present
if [ -d "${OPENCLAW_STATE}/credentials" ]; then
    fix_perms "${OPENCLAW_STATE}/credentials" "700" "Credentials dir"
fi

# Harden identity directory
if [ -d "${CLI_STATE}/identity" ]; then
    fix_perms "${CLI_STATE}/identity" "700" "Identity dir"
    for f in "${CLI_STATE}/identity/"*; do
        [ -f "$f" ] && fix_perms "$f" "600" "Identity file: $(basename "$f")"
    done
fi

# ============================================================
# STAGE 2: GATEWAY AUTH VALIDATION
# ============================================================
step "2 — Gateway Auth Validation"

python3 << 'PYEOF'
import json, os, sys

config_path = os.environ.get('OPENCLAW_CONFIG', '/opt/openclaw/.openclaw/openclaw.json')
with open(config_path) as f:
    cfg = json.load(f)

gw = cfg.get('gateway', {})
auth = gw.get('auth', {})
mode = auth.get('mode', 'none')
token = auth.get('token', '')

print(f"  Gateway auth mode: {mode}")

if mode == 'token':
    if token.startswith('${') and token.endswith('}'):
        env_name = token[2:-1]
        env_val = os.environ.get(env_name, '')
        if env_val:
            print(f"  ✓ Token env var {env_name} is set (length={len(env_val)})")
        else:
            print(f"  ⚠ Token env var {env_name} is NOT set in current shell")
            print(f"    → On production, ensure this is set in the openclaw user's environment")
            print(f"    → Check: /etc/environment, ~/.bashrc, systemd EnvironmentFile, or .env")
    elif len(token) >= 32:
        print(f"  ✓ Token is a literal value (length={len(token)})")
    else:
        print(f"  ✗ Token appears too short or missing")
elif mode == 'none' or not mode:
    print(f"  ✗ CRITICAL: No gateway auth configured")
    print(f"    → Fix: openclaw config set gateway.auth.mode token")
    print(f"    → Then: openclaw gateway (will auto-generate token on first start)")
else:
    print(f"  ℹ Auth mode: {mode}")
PYEOF

# ============================================================
# STAGE 3: TELEGRAM CHANNEL VALIDATION
# ============================================================
step "3 — Telegram Channel Validation"

python3 << 'PYEOF'
import json, os

config_path = os.environ.get('OPENCLAW_CONFIG', '/opt/openclaw/.openclaw/openclaw.json')
with open(config_path) as f:
    cfg = json.load(f)

tg = cfg.get('channels', {}).get('telegram', {})

checks = [
    ('enabled', tg.get('enabled'), True, 'Telegram should be enabled'),
    ('dmPolicy', tg.get('dmPolicy'), 'allowlist', 'DM policy should be allowlist for security'),
    ('groupPolicy', tg.get('groupPolicy'), 'allowlist', 'Group policy should be allowlist'),
    ('streaming', tg.get('streaming'), 'off', 'Streaming off is expected'),
]

for label, actual, expected, desc in checks:
    if actual == expected:
        print(f"  ✓ {label}: {actual}")
    else:
        print(f"  ⚠ {label}: {actual} (expected: {expected}) — {desc}")

# nativeSkills check
ns = tg.get('commands', {}).get('nativeSkills', None)
print(f"\n  nativeSkills: {ns}")
if ns is False:
    print(f"    → Skill commands are NOT exposed via Telegram /commands menu")
    print(f"    → Operators interact via natural language only")
    print(f"    → This is a deliberate security/UX choice — confirm if intentional")
elif ns is True:
    print(f"    → Skill commands ARE exposed via Telegram /commands menu")

# allowFrom validation
allow = tg.get('allowFrom', [])
print(f"\n  allowFrom: {allow}")
for item in allow:
    if item.startswith('${'):
        env_name = item[2:-1]
        val = os.environ.get(env_name, '')
        if val:
            print(f"    ✓ {env_name} = [REDACTED] (set)")
        else:
            print(f"    ⚠ {env_name} not set in current shell — verify on production host")

# Bot token
bt = tg.get('botToken', '')
if bt.startswith('${'):
    env_name = bt[2:-1]
    val = os.environ.get(env_name, '')
    if val:
        print(f"  ✓ Bot token env var {env_name} is set")
    else:
        print(f"  ⚠ Bot token env var {env_name} not set in current shell")
PYEOF

# ============================================================
# STAGE 4: SKILL CONSISTENCY CHECK
# ============================================================
step "4 — Skill Consistency Check"

python3 << 'PYEOF'
import json, os

config_path = os.environ.get('OPENCLAW_CONFIG', '/opt/openclaw/.openclaw/openclaw.json')
with open(config_path) as f:
    cfg = json.load(f)

agents = cfg.get('agents', {}).get('list', [])
default_model = cfg.get('agents', {}).get('defaults', {}).get('model', {}).get('primary', 'unknown')

# Collect all referenced skills
all_skills = set()
agent_info = []
for a in agents:
    skills = a.get('skills', [])
    model = a.get('model', default_model)
    all_skills.update(skills)
    agent_info.append({
        'id': a['id'],
        'model': model,
        'skill_count': len(skills),
        'has_skills': bool(skills)
    })

print(f"  Total agents: {len(agents)}")
print(f"  Total unique skills referenced: {len(all_skills)}")

# Agents without explicit skills
no_skill = [a for a in agent_info if not a['has_skills']]
if no_skill:
    print(f"\n  Agents with NO explicit skills ({len(no_skill)}):")
    for a in no_skill:
        print(f"    - {a['id']} (model: {a['model']})")
    print(f"    → These agents inherit only bundled/default skills")
    print(f"    → 'main' agent without skills is typical (uses all bundled)")
    print(f"    → marketing/sales/support may need explicit skill assignments")

# gpt-4o-mini agents
mini = [a for a in agent_info if 'gpt-4o-mini' in str(a['model'])]
if mini:
    print(f"\n  Agents on gpt-4o-mini ({len(mini)}):")
    for a in mini:
        print(f"    - {a['id']} ({a['skill_count']} skills)")
    print(f"\n  Note: gpt-4o-mini is weaker. Review if these agents need")
    print(f"  higher capability for their skill assignments.")

# Config entries vs agent references
entries = set(cfg.get('skills', {}).get('entries', {}).keys())
orphan_entries = entries - all_skills
if orphan_entries:
    print(f"\n  Skill config entries not assigned to any agent ({len(orphan_entries)}):")
    for s in sorted(orphan_entries):
        print(f"    - {s}")
PYEOF

# ============================================================
# STAGE 5: STALE PROCESS CHECK
# ============================================================
step "5 — Process Cleanup Check"

GW_PIDS=$(pgrep -f "openclaw.*gateway" 2>/dev/null || true)
GW_COUNT=$(echo "${GW_PIDS}" | grep -c '[0-9]' || true)

if [ "${GW_COUNT}" -gt 1 ]; then
    warn "Multiple gateway processes detected (${GW_COUNT})"
    echo "  PIDs: ${GW_PIDS}"
    echo "  → Recommend killing duplicates and using a single launch method"
elif [ "${GW_COUNT}" -eq 1 ]; then
    pass "Single gateway process (PID: ${GW_PIDS})"
else
    warn "No gateway process running"
fi

# Check for orphan node processes
NODE_COUNT=$(pgrep -c -f "node.*openclaw" 2>/dev/null || true)
if [ "${NODE_COUNT}" -gt 2 ]; then
    warn "Unusually high OpenClaw node processes: ${NODE_COUNT}"
else
    pass "Node process count nominal: ${NODE_COUNT}"
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Remediation complete                                       ║"
echo "║  Backup: ${BACKUP_DIR}"
echo "║  To rollback: cp ${BACKUP_DIR}/openclaw.json.bak ${OPENCLAW_CONFIG}"
echo "╚══════════════════════════════════════════════════════════════╝"
