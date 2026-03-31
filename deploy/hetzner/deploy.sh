#!/usr/bin/env bash
set -euo pipefail
export CI=true

OPENCLAW_HOME="/opt/openclaw"
DEPLOY_STATE_DIR="${OPENCLAW_HOME}/.deploy"
DEPLOY_CONFIG_ARCHIVE_DIR="${DEPLOY_STATE_DIR}/configs"
DEPLOYED_CONFIG_PATH="${OPENCLAW_HOME}/.openclaw/openclaw.json"

UPGRADE_CLI=false
ROLLOUT_MODE="canary"

usage() {
    cat <<'EOF'
Usage: deploy/hetzner/deploy.sh [--upgrade] [--rollout <canary|full>]

Options:
  --upgrade              Upgrade OpenClaw CLI before deploy.
  --rollout <mode>       Rollout mode for completion routing (default: canary).
  -h, --help             Show help.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --upgrade)
            UPGRADE_CLI=true
            shift
            ;;
        --rollout)
            if [[ -z "${2:-}" ]]; then
                echo "Missing value for --rollout"
                exit 1
            fi
            ROLLOUT_MODE="$2"
            shift 2
            ;;
        --rollout=*)
            ROLLOUT_MODE="${1#*=}"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            usage
            exit 1
            ;;
    esac
done

if [[ "$ROLLOUT_MODE" != "canary" && "$ROLLOUT_MODE" != "full" ]]; then
    echo "Invalid rollout mode: ${ROLLOUT_MODE}. Use canary or full."
    exit 1
fi

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

sha256_file() {
    local file_path="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file_path" | awk '{print $1}'
        return
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file_path" | awk '{print $1}'
        return
    fi

    echo "sha256 tool not available"
    return 1
}

run_health_checks() {
    local gateway_ok=false
    local webhook_ok=false
    local dashboard_ok=false

    sleep 10

    for i in 1 2 3 4 5 6; do
        if curl -sf http://localhost:18789/health >/dev/null 2>&1; then
            gateway_ok=true
            break
        fi
        sleep 5
    done

    for i in 1 2 3; do
        if curl -sf http://localhost:8788/health >/dev/null 2>&1; then
            webhook_ok=true
            break
        fi
        sleep 3
    done

    for i in 1 2 3 4 5 6; do
        if curl -sf http://localhost:3001 >/dev/null 2>&1; then
            dashboard_ok=true
            break
        fi
        sleep 5
    done

    echo ""
    if $gateway_ok && $webhook_ok && $dashboard_ok; then
        echo "  [OK] Gateway:   HEALTHY"
        echo "  [OK] Webhook:   HEALTHY"
        echo "  [OK] Dashboard: HEALTHY"
        return 0
    fi

    $gateway_ok   && echo "  [OK]   Gateway:   HEALTHY" || echo "  [FAIL] Gateway:   UNHEALTHY"
    $webhook_ok   && echo "  [OK]   Webhook:   HEALTHY" || echo "  [FAIL] Webhook:   UNHEALTHY"
    $dashboard_ok && echo "  [OK]   Dashboard: HEALTHY" || echo "  [FAIL] Dashboard: UNHEALTHY"

    if ! $gateway_ok; then
        print_service_diagnostics openclaw
    fi

    if ! $webhook_ok; then
        print_service_diagnostics openclaw-webhook
    fi

    if ! $dashboard_ok; then
        print_service_diagnostics openclaw-dashboard
    fi

    return 1
}

echo "========================================================"
echo " OpenClaw Deploy - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================================"
echo " Rollout mode: ${ROLLOUT_MODE}"

# 1. Pull latest code
echo "[1/8] Pulling latest code..."
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
if $UPGRADE_CLI; then
    echo "[2/8] Upgrading OpenClaw CLI..."
    npm install -g openclaw@latest
    echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'updated')"
else
    echo "[2/8] Skipping CLI upgrade (use --upgrade to update)"
fi

# 3. Install dependencies
echo "[3/8] Installing dependencies..."
node scripts/pnpm.mjs install --frozen-lockfile --prod 2>/dev/null || node scripts/pnpm.mjs install --prod
chown -R openclaw:openclaw "$OPENCLAW_HOME"

echo "  Ensuring Playwright Chromium runtime..."
if sudo -u openclaw bash -lc "cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs --dir skills exec playwright install chromium"; then
    echo "  Playwright Chromium runtime is ready."
else
    echo "  Warning: Playwright Chromium install failed. Browser automation tasks may fail until this succeeds."
fi

# 4. Preflight gates and rollout config generation
echo "[4/8] Running preflight gates..."
set -a
[ -f /etc/openclaw/.env ] && source /etc/openclaw/.env
set +a

node scripts/validate-env.mjs --bot
node scripts/upgrade/runtime-config-parity.mjs \
    --primary config/openclaw.prod.json \
    --secondary config/openclaw.json \
    --agents config/agents_config.json \
    --rollout full \
    --expected-agent-count 107 \
    --strict

mkdir -p "$DEPLOY_STATE_DIR"
GENERATED_CONFIG_PATH="${DEPLOY_STATE_DIR}/openclaw.runtime.${ROLLOUT_MODE}.json"
node scripts/upgrade/build-runtime-rollout-config.mjs \
    --input config/openclaw.prod.json \
    --agents config/agents_config.json \
    --rollout "$ROLLOUT_MODE" \
    --output "$GENERATED_CONFIG_PATH"
node scripts/upgrade/validate-completion-model-policy.mjs \
    --config "$GENERATED_CONFIG_PATH" \
    --agents config/agents_config.json \
    --rollout "$ROLLOUT_MODE" \
    --expected-agent-count 107
node scripts/upgrade/probe-anthropic-key.mjs
node scripts/upgrade/runtime-config-parity.mjs \
    --primary "$GENERATED_CONFIG_PATH" \
    --agents config/agents_config.json \
    --rollout "$ROLLOUT_MODE" \
    --expected-agent-count 107 \
    --strict

GENERATED_CONFIG_HASH="$(sha256_file "$GENERATED_CONFIG_PATH")"
RUNTIME_APP_VERSION="$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); process.stdout.write(p.version || 'unknown');")"
echo "  Runtime app version: ${RUNTIME_APP_VERSION}"
echo "  Generated config hash (sha256): ${GENERATED_CONFIG_HASH}"

# 5. Sync config and service files
echo "[5/8] Syncing configuration and service units..."
mkdir -p "${OPENCLAW_HOME}/.openclaw" "$DEPLOY_CONFIG_ARCHIVE_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -f "$DEPLOYED_CONFIG_PATH" ]; then
    PREVIOUS_CONFIG_ARCHIVE="${DEPLOY_CONFIG_ARCHIVE_DIR}/openclaw.previous.${TIMESTAMP}.json"
    cp "$DEPLOYED_CONFIG_PATH" "$PREVIOUS_CONFIG_ARCHIVE"
    ln -sfn "$PREVIOUS_CONFIG_ARCHIVE" "${DEPLOY_CONFIG_ARCHIVE_DIR}/previous-openclaw-config.json"
    echo "  Previous config archived: $PREVIOUS_CONFIG_ARCHIVE"
else
    echo "  No previous deployed runtime config found."
fi

cp "$GENERATED_CONFIG_PATH" "$DEPLOYED_CONFIG_PATH"
DEPLOYED_CONFIG_ARCHIVE="${DEPLOY_CONFIG_ARCHIVE_DIR}/openclaw.deployed.${TIMESTAMP}.${ROLLOUT_MODE}.json"
cp "$GENERATED_CONFIG_PATH" "$DEPLOYED_CONFIG_ARCHIVE"
ln -sfn "$DEPLOYED_CONFIG_ARCHIVE" "${DEPLOY_CONFIG_ARCHIVE_DIR}/current-openclaw-config.json"
chown openclaw:openclaw "$DEPLOYED_CONFIG_PATH"
chown -R openclaw:openclaw "$DEPLOY_STATE_DIR"

echo "  Deployed config archive: $DEPLOYED_CONFIG_ARCHIVE"
echo "  Rollback pointer: ${DEPLOY_CONFIG_ARCHIVE_DIR}/previous-openclaw-config.json"

# Compatibility path for legacy webhook skill imports
mkdir -p handlers/workspace
ln -sfn /opt/openclaw/skills /opt/openclaw/handlers/workspace/skills
chown -h openclaw:openclaw /opt/openclaw/handlers/workspace/skills || true

cp deploy/hetzner/openclaw.service /etc/systemd/system/
cp deploy/hetzner/webhook.service /etc/systemd/system/openclaw-webhook.service
cp deploy/hetzner/openclaw-dashboard.service /etc/systemd/system/
cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

# 6. Build dashboard
echo "[6/8] Building Next.js dashboard..."
DASH_DIR="${OPENCLAW_HOME}/dashboard"
sudo -u openclaw bash -lc "
    export CI=true
    cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs --dir dashboard install --no-frozen-lockfile
"
sudo -u openclaw bash -lc "
    export CI=true
    set -a
    [ -f /etc/openclaw/.env ] && source /etc/openclaw/.env
    set +a
    cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs --dir dashboard run build
"
chown -R openclaw:openclaw "$DASH_DIR"
echo "  Dashboard build complete."

# 7. Restart services
echo "[7/8] Restarting services..."
restart_service openclaw
restart_service openclaw-webhook
systemctl enable openclaw-dashboard 2>/dev/null || true
restart_service openclaw-dashboard
systemctl reload caddy || echo "  Warning: failed to reload caddy"

# 8. Health checks
echo "[8/8] Running health checks..."
if run_health_checks; then
    echo ""
    echo "========================================================"
    echo " Deploy Complete"
    echo "========================================================"
    exit 0
fi

echo ""
echo "========================================================"
echo " Deploy completed with health check failures"
echo "========================================================"
exit 1
