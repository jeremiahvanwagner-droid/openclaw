#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run this script as the openclaw user, not root."
  exit 1
fi

: "${OPENAI_API_KEY:?OPENAI_API_KEY must be set}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN must be set}"

export PATH="$HOME/.npm-global/bin:$PATH"
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
mkdir -p "$NPM_CONFIG_PREFIX"

if ! grep -q '.npm-global/bin' "$HOME/.profile" 2>/dev/null; then
  echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.profile"
fi

npm i -g openclaw@latest
openclaw --version

openclaw onboard \
  --mode local \
  --flow quickstart \
  --accept-risk \
  --non-interactive \
  --auth-choice openai-api-key \
  --openai-api-key "$OPENAI_API_KEY" \
  --secret-input-mode ref \
  --install-daemon \
  --skip-channels \
  --skip-skills \
  --skip-ui

openclaw config set 'gateway.mode' '"local"'
openclaw config set 'gateway.bind' '"loopback"'
openclaw config set 'gateway.tailscale.mode' '"route"'
openclaw config set 'agents.defaults.model.primary' '"openai/gpt-5"'
openclaw config set 'agents.defaults.maxConcurrent' '1'
openclaw config set 'agents.defaults.subagents.maxConcurrent' '1'

openclaw gateway install --runtime node --force
openclaw gateway start

openclaw channels add --channel telegram --token "$TELEGRAM_BOT_TOKEN"
openclaw channels status --probe

mkdir -p "$HOME/.config/openclaw-prod"
mkdir -p "$HOME/.config/openclaw-prod/reports"
mkdir -p "$HOME/.config/openclaw-prod/locks"

if [[ -z "${OPENCLAW_GHL_WEBHOOK_SECRET:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCLAW_GHL_WEBHOOK_SECRET="$(openssl rand -hex 32)"
  else
    OPENCLAW_GHL_WEBHOOK_SECRET="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
  fi
fi
export OPENCLAW_GHL_WEBHOOK_SECRET

cat > "$HOME/.config/openclaw-prod/credentials.env" <<EOF
OPENCLAW_OPS_DB_PATH=${OPENCLAW_OPS_DB_PATH:-$HOME/.config/openclaw-prod/ops.db}
OPENCLAW_GHL_WEBHOOK_HOST=${OPENCLAW_GHL_WEBHOOK_HOST:-127.0.0.1}
OPENCLAW_GHL_WEBHOOK_PORT=${OPENCLAW_GHL_WEBHOOK_PORT:-8788}
OPENCLAW_GHL_WEBHOOK_SECRET=${OPENCLAW_GHL_WEBHOOK_SECRET}
OPENCLAW_REPORT_TZ=${OPENCLAW_REPORT_TZ:-America/Chicago}
OPENCLAW_REPORT_DIR=${OPENCLAW_REPORT_DIR:-$HOME/.config/openclaw-prod/reports}
OPENCLAW_ALERT_TELEGRAM_CHAT_ID=${OPENCLAW_ALERT_TELEGRAM_CHAT_ID:-}
OPENCLAW_ALERT_MSTEAMS_WEBHOOK_URL=${OPENCLAW_ALERT_MSTEAMS_WEBHOOK_URL:-}
EOF
chmod 600 "$HOME/.config/openclaw-prod/credentials.env"

if [[ -n "${GHL_PRIVATE_INTEGRATION_TOKEN:-}" ]]; then
  cat >> "$HOME/.config/openclaw-prod/credentials.env" <<EOF
GHL_PRIVATE_INTEGRATION_TOKEN=${GHL_PRIVATE_INTEGRATION_TOKEN}
EOF
fi

# ── Multi-tenant GHL tokens (TJB + MSL sub-accounts) ────────
if [[ -n "${GHL_PRIVATE_INTEGRATION_TOKEN_TJB:-}" ]]; then
  cat >> "$HOME/.config/openclaw-prod/credentials.env" <<EOF
GHL_PRIVATE_INTEGRATION_TOKEN_TJB=${GHL_PRIVATE_INTEGRATION_TOKEN_TJB}
GHL_LOCATION_ID_TJB=${GHL_LOCATION_ID_TJB}
EOF
fi

if [[ -n "${GHL_PRIVATE_INTEGRATION_TOKEN_MSL:-}" ]]; then
  cat >> "$HOME/.config/openclaw-prod/credentials.env" <<EOF
GHL_PRIVATE_INTEGRATION_TOKEN_MSL=${GHL_PRIVATE_INTEGRATION_TOKEN_MSL}
GHL_LOCATION_ID_MSL=${GHL_LOCATION_ID_MSL}
EOF
fi

mkdir -p "$HOME/.openclaw/workspace"
cat > "$HOME/.openclaw/workspace/SAFETY_POLICY.md" <<'EOF'
# Outbound Safety Policy

Auto-send allowed:
- Routine welcome messages
- Reminder follow-ups
- Basic support macros (access issues, password reset instructions, neutral scheduling)

Review required before sending:
- Financial terms, pricing, refunds, billing changes
- Theological or spiritual counsel
- Funnel or product structure changes
- Escalations or high-impact relationship messages
EOF

if [[ -f "$HOME/openclaw-prod/templates/SOUL.production.md" ]]; then
  cp "$HOME/openclaw-prod/templates/SOUL.production.md" "$HOME/.openclaw/workspace/SOUL.md"
fi

python3 "$HOME/openclaw-prod/scripts/ops_control.py" \
  --db-path "${OPENCLAW_OPS_DB_PATH:-$HOME/.config/openclaw-prod/ops.db}" \
  init-db >/dev/null

python3 "$HOME/openclaw-prod/scripts/ops_control.py" \
  --db-path "${OPENCLAW_OPS_DB_PATH:-$HOME/.config/openclaw-prod/ops.db}" \
  init-governance >/dev/null

openclaw status

cat <<'EOF'
OpenClaw production base configured.
Next steps:
1) run setup_agents_and_cron.sh
2) install webhook service as root:
   sudo APP_USER=openclaw bash ~/openclaw-prod/scripts/install_webhook_service.sh
3) configure GHL workflows from templates/GHL-WORKFLOW-BLUEPRINT.md
4) align strategy cadence from templates/STRATEGY-OPERATING-SYSTEM.md
5) initialize governance checklists:
   - templates/DAY1-14-EXECUTION-CHECKLIST.md
   - templates/WEEKLY-TRACKING-DAY90.md
6) pair Telegram chat with openclaw pairing approve telegram <code>
EOF
