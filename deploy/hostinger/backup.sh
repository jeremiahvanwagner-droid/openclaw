#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw — Backup Script
# Daily backup of runtime data with 7-day rotation
#
# Usage: Add to crontab:
#   0 3 * * * /opt/openclaw/deploy/hostinger/backup.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

OPENCLAW_HOME="/opt/openclaw"
BACKUP_DIR="${OPENCLAW_HOME}/backups"
DATE=$(date '+%Y-%m-%d')
BACKUP_PATH="${BACKUP_DIR}/${DATE}"
RETENTION_DAYS=7

echo "[backup] Starting backup — ${DATE}"

# Create today's backup directory
mkdir -p "$BACKUP_PATH"

# Backup runtime data
if [ -d "$OPENCLAW_HOME/data" ]; then
    tar czf "$BACKUP_PATH/data.tar.gz" -C "$OPENCLAW_HOME" data/ 2>/dev/null || true
fi

# Backup cron state
if [ -d "$OPENCLAW_HOME/cron" ]; then
    tar czf "$BACKUP_PATH/cron.tar.gz" -C "$OPENCLAW_HOME" cron/ 2>/dev/null || true
fi

# Backup agent memory (not sessions — too large)
if [ -d "$OPENCLAW_HOME/memory" ]; then
    tar czf "$BACKUP_PATH/memory.tar.gz" -C "$OPENCLAW_HOME" memory/ 2>/dev/null || true
fi

# Backup config snapshot
cp "$OPENCLAW_HOME/config/openclaw.json" "$BACKUP_PATH/openclaw.json" 2>/dev/null || true
cp "$OPENCLAW_HOME/config/agents_config.json" "$BACKUP_PATH/agents_config.json" 2>/dev/null || true

# Write backup manifest
cat > "$BACKUP_PATH/manifest.json" <<EOF
{
  "date": "${DATE}",
  "timestamp": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "files": $(ls -1 "$BACKUP_PATH" | jq -R -s -c 'split("\n") | map(select(. != ""))')
}
EOF

echo "[backup] Backup saved to ${BACKUP_PATH}"

# Prune old backups
echo "[backup] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

echo "[backup] Done."
