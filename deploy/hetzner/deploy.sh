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
echo "[1/7] Pulling latest code..."
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "  Refusing deploy from branch '$CURRENT_BRANCH'. Expected 'main'."
    exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "  Refusing deploy: working tree has tracked file changes."
    echo "  Commit, stash, or clean the server checkout before running deploy."
    exit 1
fi

git fetch origin main
git pull --ff-only origin main
echo "  $(git log --oneline -1)"

# ── 2. Optional: upgrade OpenClaw CLI ────────────────────────
if [[ "${1:-}" == "--upgrade" ]]; then
    echo "[2/7] Upgrading OpenClaw CLI..."
    npm install -g openclaw@latest
    echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'updated')"
else
    echo "[2/7] Skipping CLI upgrade (use --upgrade to update)"
fi

# ── 3. Install dependencies ──────────────────────────────────
echo "[3/7] Installing dependencies..."
if command -v pnpm &>/dev/null; then
    pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod
elif command -v npm &>/dev/null; then
    npm install --omit=dev
else
    echo "  No supported package manager found (expected pnpm or npm)."
    exit 1
fi

# ── 4. Sync config files ────────────────────────────────────
echo "[4/7] Syncing configuration..."

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
cp deploy/hetzner/dashboard.service /etc/systemd/system/openclaw-dashboard.service
cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

# ── 5. Build & deploy dashboard ──────────────────────────────
echo "[5/7] Building dashboard..."
if [ -f dashboard/package.json ]; then
    # Load Supabase secrets from secrets file (never hardcode in scripts)
    SECRETS_FILE="/etc/openclaw/secrets"
    if [ -f "$SECRETS_FILE" ]; then
        set -a
        # shellcheck source=/dev/null
        . "$SECRETS_FILE"
        set +a
    fi

    if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
        echo "  [WARN] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set."
        echo "  Set them in $SECRETS_FILE or as environment variables."
        echo "  Skipping dashboard build."
    else
        cd dashboard
        if command -v pnpm &>/dev/null; then
            pnpm install --frozen-lockfile 2>/dev/null || pnpm install
        else
            npm install
        fi
        NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
        NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
        npx next build
        cd "$OPENCLAW_HOME"
        echo "  Dashboard built successfully"
    fi
else
    echo "  Skipping dashboard build (no package.json)"
fi

# ── 6. Restart services ─────────────────────────────────────
echo "[6/7] Restarting services..."
systemctl restart openclaw
systemctl restart openclaw-webhook
systemctl restart openclaw-dashboard
systemctl enable openclaw-dashboard
systemctl reload caddy

# ── 7. Health check ──────────────────────────────────────────
echo "[7/7] Running health check..."
sleep 15

GATEWAY_OK=false
WEBHOOK_OK=false
DASHBOARD_OK=false

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

for i in 1 2 3 4 5; do
    if curl -sf http://localhost:3001 >/dev/null 2>&1; then
        DASHBOARD_OK=true
        break
    fi
    sleep 3
done

echo ""
if $GATEWAY_OK && $WEBHOOK_OK && $DASHBOARD_OK; then
    echo "  ✓ Gateway:   HEALTHY"
    echo "  ✓ Webhook:   HEALTHY"
    echo "  ✓ Dashboard: HEALTHY"
    echo ""
    echo "══════════════════════════════════════════════════════"
    echo " ✓ Deploy Complete!"
    echo "══════════════════════════════════════════════════════"
    exit 0
else
    $GATEWAY_OK && echo "  ✓ Gateway:   HEALTHY" || echo "  ✗ Gateway:   UNHEALTHY"
    $WEBHOOK_OK && echo "  ✓ Webhook:   HEALTHY" || echo "  ✗ Webhook:   UNHEALTHY"
    $DASHBOARD_OK && echo "  ✓ Dashboard: HEALTHY" || echo "  ✗ Dashboard: UNHEALTHY"
    echo ""
    echo "══════════════════════════════════════════════════════"
    echo " ⚠ Deploy completed with health check failures"
    echo "══════════════════════════════════════════════════════"
    echo " Check logs: journalctl -u openclaw -n 50 --no-pager"
    exit 1
fi
