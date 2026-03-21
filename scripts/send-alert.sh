#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw — Send Alert on Service Failure
# Called by openclaw-alert@.service when a systemd unit fails.
#
# Usage: send-alert.sh <service-name>
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

SERVICE_NAME="${1:-unknown}"
HOSTNAME="$(hostname 2>/dev/null || echo 'openclaw-vps')"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S %Z')"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_ALERT_CHAT_ID:-}"

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "[WARN] TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID not set. Skipping alert."
  exit 0
fi

MESSAGE="🚨 *Service Failure*

Host: \`${HOSTNAME}\`
Service: \`${SERVICE_NAME}\`
Time: ${TIMESTAMP}

Check logs: \`journalctl -u ${SERVICE_NAME} -n 50 --no-pager\`"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d text="${MESSAGE}" \
  -d parse_mode=Markdown \
  -d disable_notification=false \
  > /dev/null 2>&1 || echo "[WARN] Failed to send Telegram alert"
