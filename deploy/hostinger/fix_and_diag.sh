#!/usr/bin/env bash
set -euo pipefail
CFG=/opt/openclaw/.openclaw/openclaw.json

# Fix config
jq 'del(.agents.defaults.skills)' "$CFG" > /tmp/oc_fixed.json
mv /tmp/oc_fixed.json "$CFG"
chown openclaw:openclaw "$CFG"
echo "Config fixed"

# Restart service
systemctl reset-failed openclaw 2>/dev/null || true
systemctl start openclaw
sleep 4
systemctl is-active openclaw && echo "Service is running"

# Show journal to confirm what caused the re-introduction
echo "=== Last 30 journal lines before crash ==="
journalctl -u openclaw --no-pager -n 30 | grep -v "connection refused" | tail -20
