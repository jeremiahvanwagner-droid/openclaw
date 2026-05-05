#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

APP_USER="${APP_USER:-openclaw}"
APP_HOME="/home/${APP_USER}"
SERVICE_NAME="openclaw-ghl-webhook.service"
SCRIPT_DIR="${APP_HOME}/openclaw-prod/scripts"
TEMPLATE_DIR="${APP_HOME}/openclaw-prod/templates/systemd"
SERVICE_TEMPLATE="${TEMPLATE_DIR}/openclaw-ghl-webhook.service.template"
ENV_EXAMPLE="${TEMPLATE_DIR}/openclaw-ghl-webhook.env.example"
ENV_FILE="/etc/openclaw-prod/openclaw-ghl-webhook.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
OPS_SCRIPT="${SCRIPT_DIR}/ops_control.py"
USER_CREDENTIALS_ENV="${APP_HOME}/.config/openclaw-prod/credentials.env"

if [[ ! -f "${SERVICE_TEMPLATE}" ]]; then
  echo "Missing service template: ${SERVICE_TEMPLATE}"
  exit 1
fi

if [[ ! -f "${OPS_SCRIPT}" ]]; then
  echo "Missing ops control script: ${OPS_SCRIPT}"
  exit 1
fi

install -d -m 755 /etc/openclaw-prod
if [[ ! -f "${ENV_FILE}" ]]; then
  install -m 600 "${ENV_EXAMPLE}" "${ENV_FILE}"
  sed -i "s|/home/openclaw|${APP_HOME}|g" "${ENV_FILE}"
  echo "Created env file: ${ENV_FILE}"
else
  chmod 600 "${ENV_FILE}"
fi

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "${ENV_FILE}"
  else
    echo "${key}=${value}" >> "${ENV_FILE}"
  fi
}

if [[ -f "${USER_CREDENTIALS_ENV}" ]]; then
  # shellcheck disable=SC1090
  source "${USER_CREDENTIALS_ENV}"
fi

WEBHOOK_SECRET_VALUE="${OPENCLAW_GHL_WEBHOOK_SECRET:-}"
if [[ -z "${WEBHOOK_SECRET_VALUE}" ]]; then
  echo "OPENCLAW_GHL_WEBHOOK_SECRET must be set before installing the webhook service."
  exit 1
fi

if [[ "${WEBHOOK_SECRET_VALUE}" == "replace-with-32byte-random-secret" || "${WEBHOOK_SECRET_VALUE}" == "your-32-byte-random-webhook-secret" ]]; then
  echo "OPENCLAW_GHL_WEBHOOK_SECRET must not use a placeholder value."
  exit 1
fi

if [[ "${#WEBHOOK_SECRET_VALUE}" -lt 32 ]]; then
  echo "OPENCLAW_GHL_WEBHOOK_SECRET must be at least 32 characters."
  exit 1
fi

upsert_env "OPENCLAW_OPS_DB_PATH" "${OPENCLAW_OPS_DB_PATH:-${APP_HOME}/.config/openclaw-prod/ops.db}"
upsert_env "OPENCLAW_GHL_WEBHOOK_HOST" "${OPENCLAW_GHL_WEBHOOK_HOST:-127.0.0.1}"
upsert_env "OPENCLAW_GHL_WEBHOOK_PORT" "${OPENCLAW_GHL_WEBHOOK_PORT:-8788}"
upsert_env "OPENCLAW_GHL_WEBHOOK_SECRET" "${WEBHOOK_SECRET_VALUE}"
upsert_env "OPENCLAW_GATEWAY_AUTH_TOKEN" "${OPENCLAW_GATEWAY_AUTH_TOKEN:-}"
upsert_env "OPENCLAW_PUBLIC_WEBHOOK_BASE_URL" "${OPENCLAW_PUBLIC_WEBHOOK_BASE_URL:-}"
upsert_env "OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY" "${OPENCLAW_GHL_WEBHOOK_PUBLIC_KEY:-}"
upsert_env "OPENCLAW_REPORT_TZ" "${OPENCLAW_REPORT_TZ:-America/Chicago}"
upsert_env "OPENCLAW_REPORT_DIR" "${OPENCLAW_REPORT_DIR:-${APP_HOME}/.config/openclaw-prod/reports}"
upsert_env "OPENCLAW_ALERT_TELEGRAM_CHAT_ID" "${OPENCLAW_ALERT_TELEGRAM_CHAT_ID:-}"
upsert_env "OPENCLAW_ALERT_MSTEAMS_WEBHOOK_URL" "${OPENCLAW_ALERT_MSTEAMS_WEBHOOK_URL:-}"
chmod 600 "${ENV_FILE}"

sed \
  -e "s|__APP_USER__|${APP_USER}|g" \
  -e "s|__APP_HOME__|${APP_HOME}|g" \
  "${SERVICE_TEMPLATE}" > "${SERVICE_FILE}"

chmod 644 "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

runuser -u "${APP_USER}" -- /usr/bin/python3 "${OPS_SCRIPT}" --db-path "${APP_HOME}/.config/openclaw-prod/ops.db" init-db >/dev/null

echo "Installed and started: ${SERVICE_NAME}"
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,14p'
