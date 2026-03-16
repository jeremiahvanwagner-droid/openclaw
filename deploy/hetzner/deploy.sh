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

# Ensure git trusts this directory regardless of owner
git config --global --add safe.directory "$OPENCLAW_HOME" 2>/dev/null || true

echo "══════════════════════════════════════════════════════"
echo " OpenClaw Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════════"

# ── 1. Pull latest code ──────────────────────────────────────
echo "[1/6] Pulling latest code..."
git fetch origin main
git reset --hard origin/main
echo "  $(git log --oneline -1)"

# ── 2. Optional: upgrade OpenClaw CLI ────────────────────────
if [[ "${1:-}" == "--upgrade" ]]; then
    echo "[2/6] Upgrading OpenClaw CLI..."
    npm install -g openclaw@latest
    echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'updated')"
else
    echo "[2/6] Skipping CLI upgrade (use --upgrade to update)"
fi

# ── 3. Install dependencies ──────────────────────────────────
echo "[3/6] Installing dependencies..."
if command -v npm &>/dev/null; then
    # Prefer npm here because the repo includes a pnpm workspace for the dashboard,
    # while the bot deploy only needs the root production dependencies.
    npm install --omit=dev
elif command -v pnpm &>/dev/null; then
    pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod
else
    echo "  No supported package manager found (expected npm or pnpm)."
    exit 1
fi

# ── 4. Sync config files ────────────────────────────────────
echo "[4/6] Syncing configuration..."
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

# ── 5. Restart services ─────────────────────────────────────
echo "[5/6] Restarting services..."
systemctl restart openclaw
systemctl restart openclaw-webhook
systemctl reload caddy

# ── 6. Health check ──────────────────────────────────────────
echo "[6/6] Running health check..."
sleep 15

GATEWAY_OK=false
WEBHOOK_OK=false

for i in 1 2 3 4 5 6; do
    if curl -sf http://localhost:18789/health >/dev/null 2>&1; then
        GATEWAY_OK=true
        break
    fi
    sleep 5
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
