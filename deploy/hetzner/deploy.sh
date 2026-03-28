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
    # Clear systemd start-rate limiter so restart works after crash-loops
    systemctl reset-failed "${service_name}" 2>/dev/null || true
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
node scripts/pnpm.mjs install --frozen-lockfile --prod 2>/dev/null || node scripts/pnpm.mjs install --prod
chown -R openclaw:openclaw "$OPENCLAW_HOME"

echo "  Ensuring Playwright Chromium runtime..."
if sudo -u openclaw bash -lc "cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs --dir skills exec playwright install chromium"; then
    echo "  Playwright Chromium runtime is ready."
else
    echo "  Warning: Playwright Chromium install failed. Browser automation tasks may fail until this succeeds."
fi

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
cp deploy/hetzner/openclaw-dashboard.service /etc/systemd/system/
cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

# 4b. Build the Next.js dashboard
# NEXT_PUBLIC_* vars must be available at build time so Next.js can embed them.
echo "[4b] Building Next.js dashboard..."
DASH_DIR="$OPENCLAW_HOME/dashboard"
# Install only dashboard workspace package deps — non-interactive, no lockfile enforcement
# (--filter scopes to the dashboard package only; CI=true suppresses interactive prompts)
sudo -u openclaw bash -lc "
    export CI=true
    cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs install --filter openclaw-dashboard --no-frozen-lockfile
"
# Build — source shared env so NEXT_PUBLIC_ vars are embedded in the bundle
sudo -u openclaw bash -lc "
    export CI=true
    set -a
    [ -f /etc/openclaw/.env ] && source /etc/openclaw/.env
    set +a
    cd \"$DASH_DIR\" && ../node_modules/.bin/next build
"
chown -R openclaw:openclaw "$DASH_DIR"
echo "  Dashboard build complete."

# 5. Restart canonical services
echo "[5/6] Restarting services..."
restart_service openclaw
restart_service openclaw-webhook
systemctl enable openclaw-dashboard 2>/dev/null || true
restart_service openclaw-dashboard
systemctl reload caddy || echo "  Warning: failed to reload caddy"

# 6. Health checks
echo "[6/6] Running health check..."
sleep 10

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
    sleep 3
done

for i in 1 2 3 4 5 6; do
    if curl -sf http://localhost:3001 >/dev/null 2>&1; then
        DASHBOARD_OK=true
        break
    fi
    sleep 5
done

echo ""
if $GATEWAY_OK && $WEBHOOK_OK && $DASHBOARD_OK; then
    echo "  [OK] Gateway:   HEALTHY"
    echo "  [OK] Webhook:   HEALTHY"
    echo "  [OK] Dashboard: HEALTHY"
    echo ""
    echo "========================================================"
    echo " Deploy Complete"
    echo "========================================================"
    exit 0
fi

$GATEWAY_OK   && echo "  [OK]   Gateway:   HEALTHY" || echo "  [FAIL] Gateway:   UNHEALTHY"
$WEBHOOK_OK   && echo "  [OK]   Webhook:   HEALTHY" || echo "  [FAIL] Webhook:   UNHEALTHY"
$DASHBOARD_OK && echo "  [OK]   Dashboard: HEALTHY" || echo "  [FAIL] Dashboard: UNHEALTHY"
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

if ! $DASHBOARD_OK; then
    print_service_diagnostics openclaw-dashboard
fi

exit 1
