#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw — Health Check Script
# Checks gateway + webhook + sends Telegram alert on failure
#
# Usage: Add to crontab:
#   */5 * * * * /opt/openclaw/deploy/hostinger/health-check.sh
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

# Load env for Telegram credentials
if [ -f /etc/openclaw/.env ]; then
    set -a
    source /etc/openclaw/.env
    set +a
fi

GATEWAY_URL="http://localhost:18789/health"
WEBHOOK_URL="http://localhost:8788/health"
ALERT_CHAT_ID="${TELEGRAM_ALERT_CHAT_ID:-}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"

send_alert() {
    local message="$1"
    if [ -n "$BOT_TOKEN" ] && [ -n "$ALERT_CHAT_ID" ]; then
        curl -sf -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -d "chat_id=${ALERT_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=HTML" >/dev/null 2>&1
    fi
}

FAILURES=""

# Check gateway
if ! curl -sf --max-time 10 "$GATEWAY_URL" >/dev/null 2>&1; then
    FAILURES="${FAILURES}Gateway DOWN\n"
    # Attempt auto-restart — reset-failed first so StartLimitBurst doesn't block us
    systemctl reset-failed openclaw 2>/dev/null || true
    systemctl restart openclaw 2>/dev/null || true
fi

# Check webhook handler
if ! curl -sf --max-time 10 "$WEBHOOK_URL" >/dev/null 2>&1; then
    FAILURES="${FAILURES}Webhook Handler DOWN\n"
    systemctl restart openclaw-webhook 2>/dev/null || true
fi

# Send alert if any failures
if [ -n "$FAILURES" ]; then
    HOSTNAME=$(hostname)
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S UTC')
    send_alert "🚨 <b>OpenClaw Health Alert</b>
<code>${HOSTNAME}</code> — ${TIMESTAMP}

$(echo -e "$FAILURES")
Auto-restart attempted. Check: journalctl -u openclaw -n 20"
fi
