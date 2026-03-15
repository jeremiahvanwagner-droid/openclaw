#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw — Deploy / Update Script
# Pulls latest code from GitHub and restarts services
#
# Usage: ./deploy/hetzner/deploy.sh [--upgrade]
#   --upgrade   Also update the openclaw npm package to latest
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

OPENCLAW_HOME="/opt/openclaw"
cd "$OPENCLAW_HOME"

echo "══════════════════════════════════════════════════════"
echo " OpenClaw Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════════"

# ── 1. Pull latest code ──────────────────────────────────────
echo "[1/5] Pulling latest code..."
sudo -u openclaw git fetch origin main
sudo -u openclaw git reset --hard origin/main
echo "  $(git log --oneline -1)"

# ── 2. Optional: upgrade OpenClaw CLI ────────────────────────
if [[ "${1:-}" == "--upgrade" ]]; then
    echo "[2/5] Upgrading OpenClaw CLI..."
    npm install -g openclaw@latest
    echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'updated')"
else
    echo "[2/5] Skipping CLI upgrade (use --upgrade to update)"
fi

# ── 3. Sync config files ────────────────────────────────────
echo "[3/5] Syncing configuration..."
cp config/cron/jobs.json cron/jobs.json 2>/dev/null || true
cp config/cron/training-jobs.json cron/training-jobs.json 2>/dev/null || true

# Install production openclaw.json (Linux paths, env-based secrets)
if [ -f config/openclaw.prod.json ]; then
    echo "  Installing production config..."
    mkdir -p /opt/openclaw/.openclaw
    cp config/openclaw.prod.json /opt/openclaw/.openclaw/openclaw.json
    chown openclaw:openclaw /opt/openclaw/.openclaw/openclaw.json
fi

# Compatibility path for legacy webhook skill imports
mkdir -p handlers/workspace
ln -sfn /opt/openclaw/skills /opt/openclaw/handlers/workspace/skills
chown -h openclaw:openclaw /opt/openclaw/handlers/workspace/skills || true

# Update systemd services if changed
cp deploy/hetzner/openclaw.service /etc/systemd/system/
cp deploy/hetzner/webhook.service /etc/systemd/system/openclaw-webhook.service
cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

# ── 4. Restart services ─────────────────────────────────────
echo "[4/5] Restarting services..."
systemctl restart openclaw
systemctl restart openclaw-webhook
systemctl reload caddy

# ── 5. Health check ──────────────────────────────────────────
echo "[5/5] Running health check..."
sleep 5

GATEWAY_OK=false
WEBHOOK_OK=false

for i in 1 2 3; do
    if curl -sf http://localhost:18789/health >/dev/null 2>&1; then
        GATEWAY_OK=true
        break
    fi
    sleep 3
done

for i in 1 2 3; do
    if curl -sf http://localhost:8788/health >/dev/null 2>&1; then
        WEBHOOK_OK=true
        break
    fi
    sleep 2
done

echo ""
if $GATEWAY_OK && $WEBHOOK_OK; then
    echo "  ✓ Gateway:  HEALTHY"
    echo "  ✓ Webhook:  HEALTHY"
    echo ""
    echo "══════════════════════════════════════════════════════"
    echo " ✓ Deploy Complete!"
    echo "══════════════════════════════════════════════════════"
    exit 0
else
    $GATEWAY_OK && echo "  ✓ Gateway:  HEALTHY" || echo "  ✗ Gateway:  UNHEALTHY"
    $WEBHOOK_OK && echo "  ✓ Webhook:  HEALTHY" || echo "  ✗ Webhook:  UNHEALTHY"
    echo ""
    echo "══════════════════════════════════════════════════════"
    echo " ⚠ Deploy completed with health check failures"
    echo "══════════════════════════════════════════════════════"
    echo " Check logs: journalctl -u openclaw -n 50 --no-pager"
    exit 1
fi
