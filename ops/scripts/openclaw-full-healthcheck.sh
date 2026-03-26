#!/usr/bin/env bash
# ============================================================================
# openclaw-full-healthcheck.sh
# Comprehensive OpenClaw platform health check
# Version: 1.0.0 — 2026-03-26
# Author: SRE Automation
# ============================================================================
set -euo pipefail

# --- Config ---
OPENCLAW_HOME="${OPENCLAW_HOME:-/opt/openclaw}"
OPENCLAW_STATE="${OPENCLAW_STATE:-${OPENCLAW_HOME}/.openclaw}"
OPENCLAW_CONFIG="${OPENCLAW_STATE}/openclaw.json"
REPORT_DIR="${OPENCLAW_HOME}/workspace/reports"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
REPORT_FILE="${REPORT_DIR}/openclaw-health-${TIMESTAMP}.md"
EXIT_CODE=0

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- Helpers ---
pass()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; EXIT_CODE=1; }
info()  { echo -e "  ${BLUE}ℹ${NC} $1"; }
header(){ echo -e "\n${BLUE}═══ $1 ═══${NC}"; }

log_report() {
    echo "$1" >> "${REPORT_FILE}"
}

# --- Init ---
mkdir -p "${REPORT_DIR}"
cat > "${REPORT_FILE}" << EOF
# OpenClaw Health Report
**Generated:** ${TIMESTAMP}
**Host:** $(hostname)
**User:** $(whoami)
**OpenClaw CLI:** $(openclaw --version 2>/dev/null || echo 'not found')

---

EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          OpenClaw Full Health Check v1.0.0                  ║"
echo "║          $(date -u '+%Y-%m-%d %H:%M:%S UTC')                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ============================================================
# 1. SYSTEM ENVIRONMENT
# ============================================================
header "1. System Environment"
log_report "## 1. System Environment"

echo "  Host:    $(hostname)"
echo "  User:    $(whoami)"
echo "  OS:      $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
echo "  Node:    $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo "  CLI:     $(openclaw --version 2>/dev/null || echo 'NOT FOUND')"

log_report "| Item | Value |"
log_report "|------|-------|"
log_report "| Host | $(hostname) |"
log_report "| User | $(whoami) |"
log_report "| Node | $(node --version 2>/dev/null || echo 'NOT FOUND') |"
log_report "| CLI  | $(openclaw --version 2>/dev/null || echo 'NOT FOUND') |"
log_report ""

# ============================================================
# 2. FILE PERMISSIONS
# ============================================================
header "2. File Permissions"
log_report "## 2. File Permissions"

# State directory
if [ -d "${OPENCLAW_STATE}" ]; then
    PERMS=$(stat -c '%a' "${OPENCLAW_STATE}" 2>/dev/null)
    if [ "${PERMS}" = "700" ]; then
        pass "State dir ${OPENCLAW_STATE}: mode ${PERMS} (secure)"
        log_report "- ✓ State dir: mode ${PERMS} (secure)"
    else
        fail "State dir ${OPENCLAW_STATE}: mode ${PERMS} (should be 700)"
        log_report "- ✗ CRITICAL: State dir: mode ${PERMS} (should be 700)"
    fi
else
    fail "State dir ${OPENCLAW_STATE} does not exist"
    log_report "- ✗ State dir does not exist"
fi

# Config file
if [ -f "${OPENCLAW_CONFIG}" ]; then
    PERMS=$(stat -c '%a' "${OPENCLAW_CONFIG}" 2>/dev/null)
    if [ "${PERMS}" = "600" ]; then
        pass "Config ${OPENCLAW_CONFIG}: mode ${PERMS} (secure)"
        log_report "- ✓ Config file: mode ${PERMS} (secure)"
    else
        fail "Config ${OPENCLAW_CONFIG}: mode ${PERMS} (should be 600)"
        log_report "- ✗ CRITICAL: Config file: mode ${PERMS} (should be 600)"
    fi

    # Validate JSON
    if python3 -c "import json; json.load(open('${OPENCLAW_CONFIG}'))" 2>/dev/null; then
        pass "Config is valid JSON"
        log_report "- ✓ Config is valid JSON"
    else
        fail "Config is NOT valid JSON"
        log_report "- ✗ CRITICAL: Config is NOT valid JSON"
    fi
else
    fail "Config file ${OPENCLAW_CONFIG} not found"
    log_report "- ✗ Config file not found"
fi

log_report ""

# ============================================================
# 3. GATEWAY STATUS
# ============================================================
header "3. Gateway Status"
log_report "## 3. Gateway Status"

GW_PORT=$(python3 -c "import json; print(json.load(open('${OPENCLAW_CONFIG}')).get('gateway',{}).get('port',18789))" 2>/dev/null || echo "18789")

# Check if port is listening
if ss -ltnup 2>/dev/null | grep -q ":${GW_PORT} " ; then
    pass "Gateway port ${GW_PORT} is listening"
    log_report "- ✓ Gateway port ${GW_PORT} is listening"
else
    warn "Gateway port ${GW_PORT} is NOT listening"
    log_report "- ⚠ Gateway port ${GW_PORT} is NOT listening"
fi

# Check gateway process
GW_PID=$(pgrep -f "openclaw.*gateway" 2>/dev/null || true)
if [ -n "${GW_PID}" ]; then
    pass "Gateway process running (PID: ${GW_PID})"
    log_report "- ✓ Gateway process running (PID: ${GW_PID})"
else
    warn "No gateway process found"
    log_report "- ⚠ No gateway process found"
fi

# Gateway probe (if running)
if command -v openclaw &>/dev/null; then
    PROBE_OUT=$(timeout 10 openclaw gateway probe 2>&1 | grep -v "missing env var" || echo "probe_failed")
    if echo "${PROBE_OUT}" | grep -qi "reachable: yes"; then
        pass "Gateway probe: reachable"
        log_report "- ✓ Gateway probe: reachable"
    else
        warn "Gateway probe: unreachable or timed out"
        log_report "- ⚠ Gateway probe: unreachable"
    fi
fi

log_report ""

# ============================================================
# 4. SECURITY AUDIT
# ============================================================
header "4. Security Audit"
log_report "## 4. Security Audit"

if command -v openclaw &>/dev/null; then
    AUDIT_OUT=$(timeout 20 openclaw security audit --deep 2>&1 | grep -v "missing env var" || echo "audit_failed")
    
    CRITICAL_COUNT=$(echo "${AUDIT_OUT}" | grep -c "^CRITICAL" || true)
    WARN_COUNT=$(echo "${AUDIT_OUT}" | grep -c "^WARN" || true)
    
    if [ "${CRITICAL_COUNT}" -gt 0 ]; then
        fail "Security audit: ${CRITICAL_COUNT} CRITICAL findings"
    else
        pass "Security audit: 0 CRITICAL findings"
    fi
    
    if [ "${WARN_COUNT}" -gt 0 ]; then
        warn "Security audit: ${WARN_COUNT} WARN findings"
    else
        pass "Security audit: 0 WARN findings"
    fi

    log_report "- Critical: ${CRITICAL_COUNT}"
    log_report "- Warnings: ${WARN_COUNT}"
    log_report ""
    log_report "<details><summary>Full audit output</summary>"
    log_report ""
    log_report '```'
    log_report "${AUDIT_OUT}"
    log_report '```'
    log_report "</details>"
else
    warn "openclaw CLI not available — skipping security audit"
    log_report "- ⚠ CLI not available, audit skipped"
fi

log_report ""

# ============================================================
# 5. CHANNEL STATUS
# ============================================================
header "5. Channel Status"
log_report "## 5. Channel Status"

python3 << 'PYEOF' 2>/dev/null || warn "Could not parse channel config"
import json, os
config_path = os.environ.get('OPENCLAW_CONFIG', '/opt/openclaw/.openclaw/openclaw.json')
try:
    with open(config_path) as f:
        cfg = json.load(f)
    channels = cfg.get('channels', {})
    for name, ch in channels.items():
        enabled = ch.get('enabled', False)
        status = '✓ enabled' if enabled else '✗ disabled'
        print(f"  {name}: {status}")
        if name == 'telegram':
            ns = ch.get('commands', {}).get('nativeSkills', 'unset')
            dm = ch.get('dmPolicy', 'unset')
            print(f"    nativeSkills: {ns}")
            print(f"    dmPolicy: {dm}")
except Exception as e:
    print(f"  Error reading config: {e}")
PYEOF

log_report ""

# ============================================================
# 6. AGENT INVENTORY
# ============================================================
header "6. Agent Inventory"
log_report "## 6. Agent Inventory"

python3 << 'PYEOF' 2>/dev/null || warn "Could not parse agent config"
import json, os
config_path = os.environ.get('OPENCLAW_CONFIG', '/opt/openclaw/.openclaw/openclaw.json')
try:
    with open(config_path) as f:
        cfg = json.load(f)
    agents = cfg.get('agents', {}).get('list', [])
    default_model = cfg.get('agents', {}).get('defaults', {}).get('model', {}).get('primary', 'unknown')
    
    total = len(agents)
    mini_count = sum(1 for a in agents if 'gpt-4o-mini' in str(a.get('model', '')))
    no_skills = sum(1 for a in agents if not a.get('skills'))
    
    print(f"  Total agents:     {total}")
    print(f"  Default model:    {default_model}")
    print(f"  gpt-4o-mini:      {mini_count}")
    print(f"  No explicit skills: {no_skills}")
except Exception as e:
    print(f"  Error: {e}")
PYEOF

log_report ""

# ============================================================
# 7. SKILL CONSISTENCY
# ============================================================
header "7. Skill Consistency"
log_report "## 7. Skill Consistency"

if command -v openclaw &>/dev/null; then
    SKILLS_OUT=$(timeout 10 openclaw skills list 2>&1 | grep -v "missing env var" | head -5 || echo "skills_failed")
    echo "${SKILLS_OUT}" | head -3
    log_report "$(echo "${SKILLS_OUT}" | head -3)"
fi

log_report ""

# ============================================================
# 8. UPDATE STATUS
# ============================================================
header "8. Update Status"
log_report "## 8. Update Status"

if command -v openclaw &>/dev/null; then
    UPDATE_OUT=$(timeout 10 openclaw update status 2>&1 | grep -v "missing env var" || echo "update_check_failed")
    if echo "${UPDATE_OUT}" | grep -qi "up to date"; then
        pass "OpenClaw is up to date"
        log_report "- ✓ Up to date"
    else
        warn "Update status unknown or update available"
        log_report "- ⚠ Check update status manually"
    fi
fi

log_report ""

# ============================================================
# 9. PROCESS & PORT CHECK
# ============================================================
header "9. Process & Port Check"
log_report "## 9. Process & Port Check"

echo "  Listening ports:"
ss -ltnup 2>/dev/null | grep -E "LISTEN" | while read -r line; do
    echo "    ${line}"
done

echo "  OpenClaw-related processes:"
ps aux 2>/dev/null | grep -E 'openclaw|gateway' | grep -v grep | while read -r line; do
    echo "    ${line}"
done || info "No openclaw processes running"

log_report ""

# ============================================================
# 10. SYSTEMD SERVICE CHECK
# ============================================================
header "10. Service Management"
log_report "## 10. Service Management"

if systemctl --user is-active openclaw-gateway.service &>/dev/null; then
    pass "openclaw-gateway.service is active (user unit)"
    log_report "- ✓ systemd user service active"
elif systemctl is-active openclaw-gateway.service &>/dev/null; then
    pass "openclaw-gateway.service is active (system unit)"
    log_report "- ✓ systemd system service active"
else
    warn "No systemd service for openclaw-gateway detected"
    log_report "- ⚠ No systemd service detected"
fi

log_report ""

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
if [ ${EXIT_CODE} -eq 0 ]; then
    echo -e "║  ${GREEN}HEALTH CHECK PASSED${NC}                                        ║"
else
    echo -e "║  ${RED}HEALTH CHECK: ISSUES FOUND${NC}                                 ║"
fi
echo "║  Report: ${REPORT_FILE}"
echo "╚══════════════════════════════════════════════════════════════╝"

log_report "---"
log_report "## Summary"
log_report "Exit code: ${EXIT_CODE}"
log_report "Report generated: ${TIMESTAMP}"

exit ${EXIT_CODE}
