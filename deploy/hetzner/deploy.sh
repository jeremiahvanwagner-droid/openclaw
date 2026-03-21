#!/usr/bin/env bash
set -euo pipefail
export CI=true

OPENCLAW_HOME="/opt/openclaw"
cd "$OPENCLAW_HOME"

# Ensure git trusts this directory regardless of owner
git config --global --add safe.directory "$OPENCLAW_HOME" 2>/dev/null || true

print_service_diagnostics() {
    local service_name="$1"
    echo "===== ${service_name} status ====="
    systemctl status "${service_name}" --no-pager -l || true
    echo "===== ${service_name} journal (last 200 lines) ====="
    journalctl -u "${service_name}" -n 200 --no-pager || true
}

restart_service() {
    local service_name="$1"
    if ! systemctl restart "${service_name}"; then
        echo "  Failed to restart ${service_name}"
        print_service_diagnostics "${service_name}"
        exit 1
    fi

    if ! systemctl is-active --quiet "${service_name}"; then
        echo "  ${service_name} is not active after restart"
        print_service_diagnostics "${service_name}"
        exit 1
    fi
}

echo "========================================================"
echo " OpenClaw Deploy - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================================"

# 1. Pull latest code
echo "[1/6] Pulling latest code..."
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

# 2. Optional CLI upgrade
if [[ "${1:-}" == "--upgrade" ]]; then
    echo "[2/6] Upgrading OpenClaw CLI..."
    npm install -g openclaw@latest
    echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'updated')"
else
    echo "[2/6] Skipping CLI upgrade (use --upgrade to update)"
fi

# 3. Install dependencies
echo "[3/6] Installing dependencies..."
if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack pnpm install --frozen-lockfile --prod 2>/dev/null || corepack pnpm install --prod
elif command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod
else
    echo "  No supported package manager found (expected corepack/pnpm)."
    exit 1
fi
chown -R openclaw:openclaw "$OPENCLAW_HOME"

# 4. Sync config and service files
echo "[4/6] Syncing configuration..."
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

cp deploy/hetzner/openclaw.service /etc/systemd/system/
cp deploy/hetzner/webhook.service /etc/systemd/system/openclaw-webhook.service
cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

# 5. Restart canonical services
echo "[5/6] Restarting services..."
restart_service openclaw
restart_service openclaw-webhook
systemctl reload caddy || echo "  Warning: failed to reload caddy"

# 6. Health checks
echo "[6/6] Running health check..."
sleep 10

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
    sleep 3
done

echo ""
if $GATEWAY_OK && $WEBHOOK_OK; then
    echo "  [OK] Gateway: HEALTHY"
    echo "  [OK] Webhook: HEALTHY"
    echo ""
    echo "========================================================"
    echo " Deploy Complete"
    echo "========================================================"
    exit 0
fi

$GATEWAY_OK && echo "  [OK] Gateway: HEALTHY" || echo "  [FAIL] Gateway: UNHEALTHY"
$WEBHOOK_OK && echo "  [OK] Webhook: HEALTHY" || echo "  [FAIL] Webhook: UNHEALTHY"
echo ""
echo "========================================================"
echo " Deploy completed with health check failures"
echo "========================================================"

if ! $GATEWAY_OK; then
    print_service_diagnostics openclaw
fi

if ! $WEBHOOK_OK; then
    print_service_diagnostics openclaw-webhook
fi

exit 1
