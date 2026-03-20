#!/usr/bin/env bash
set -euo pipefail

RUN_SMOKE="${RUN_SMOKE:-false}"
APP_USER="${APP_USER:-openclaw}"
OPS_DB_PATH="${OPENCLAW_OPS_DB_PATH:-$HOME/.config/openclaw-prod/ops.db}"
OPS_SCRIPT="$HOME/openclaw-prod/scripts/ops_control.py"
PYTHON=()

if command -v python3 >/dev/null 2>&1 && python3 -V >/dev/null 2>&1; then
  PYTHON=(python3)
elif command -v python >/dev/null 2>&1 && python -V >/dev/null 2>&1; then
  PYTHON=(python)
elif command -v py >/dev/null 2>&1 && py -3 -V >/dev/null 2>&1; then
  PYTHON=(py -3)
else
  echo "Missing working Python interpreter (python3/python/py)."
  exit 1
fi

openclaw --version
openclaw status
openclaw channels status --probe
openclaw cron list --all
CRON_JSON="$(openclaw cron list --all --json)"
CRON_JSON_TMP="$(mktemp)"
printf '%s' "${CRON_JSON}" > "${CRON_JSON_TMP}"
if openclaw cron runs --help 2>&1 | grep -q -- '--id'; then
  while IFS= read -r id; do
    [[ -z "${id}" ]] && continue
    openclaw cron runs --id "${id}" --limit 10 || true
  done < <(printf '%s' "${CRON_JSON}" | "${PYTHON[@]}" -c 'import json,sys; data=json.load(sys.stdin); [print(j.get("id","")) for j in data.get("jobs", [])]')
else
  openclaw cron runs --limit 20
fi
SECRETS_AUDIT_JSON="$(openclaw secrets audit --json)"
SECRETS_AUDIT_TMP="$(mktemp)"
printf '%s' "${SECRETS_AUDIT_JSON}" > "${SECRETS_AUDIT_TMP}"
"${PYTHON[@]}" - "${SECRETS_AUDIT_TMP}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    report = json.load(f)
summary = report.get("summary") or {}
plaintext = int(summary.get("plaintextCount", 0) or 0)
unresolved = int(summary.get("unresolvedRefCount", 0) or 0)
shadowed = int(summary.get("shadowedRefCount", 0) or 0)
legacy = int(summary.get("legacyResidueCount", 0) or 0)

if plaintext or unresolved or shadowed:
    print(
        f"Secrets audit failed: plaintext={plaintext}, unresolved={unresolved}, shadowed={shadowed}, legacy={legacy}"
    )
    sys.exit(1)

print(
    f"Secrets audit actionable checks passed: plaintext={plaintext}, unresolved={unresolved}, shadowed={shadowed}, legacy={legacy}"
)
PY
rm -f "${SECRETS_AUDIT_TMP}"
openclaw security audit

if [[ ! -f "$OPS_SCRIPT" ]]; then
  echo "Missing ops control script: $OPS_SCRIPT"
  exit 1
fi

"${PYTHON[@]}" "$OPS_SCRIPT" --db-path "$OPS_DB_PATH" snapshot
"${PYTHON[@]}" "$OPS_SCRIPT" --db-path "$OPS_DB_PATH" governance-snapshot

for expected in social-sales-morning-report social-sales-evening-report critical-incident-sentinel; do
  if ! "${PYTHON[@]}" - "${CRON_JSON_TMP}" "$expected" <<'PY' >/dev/null
import json
import sys
data_path = sys.argv[1]
name = sys.argv[2]
with open(data_path, "r", encoding="utf-8") as f:
    data = json.load(f)
sys.exit(0 if any(job.get("name") == name for job in data.get("jobs", [])) else 1)
PY
  then
    echo "Missing required cron: $expected"
    rm -f "${SECRETS_AUDIT_TMP}" "${CRON_JSON_TMP}"
    exit 1
  fi
done

"${PYTHON[@]}" - "${CRON_JSON_TMP}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)

jobs = {job.get("name"): job for job in data.get("jobs", [])}
checks = {
    "critical-incident-sentinel": {
        "message_parts": [
            "NO_ALERT or CRITICAL_ALERT_ALREADY_SENT",
            "CRITICAL_ALERT_SENT",
            "CRITICAL_ALERT_QUEUED_NO_CHANNEL",
        ],
    },
    "agent-network-health-check": {
        "message_parts": [
            "network_health.py",
            "Return blank when the script output is healthy or only reports OK:",
            "ALERT: or observability_degraded",
        ],
    },
    "agent-heartbeat-monitor": {
        "message_parts": [
            "heartbeat_monitor.py",
            "Return blank when the output is healthy or starts with OK:",
            "ALERT: or WARN:",
        ],
    },
    "ghl-l25-urgent-rollback-sentinel-30m": {
        "message_parts": [
            "Return blank when all thresholds are within bounds.",
            "return only URGENT",
            "disable outbound-enabled jobs",
        ],
    },
}

errors = []
for name, spec in checks.items():
    job = jobs.get(name)
    if not job:
        errors.append(f"Missing required cron: {name}")
        continue

    payload = job.get("payload") or {}
    message = payload.get("message") or ""
    for part in spec["message_parts"]:
        if part not in message:
            errors.append(f"{name} payload missing expected text: {part}")

    if payload.get("thinking") != "low":
        errors.append(f"{name} payload thinking must remain low")
    if payload.get("lightContext") is not True:
        errors.append(f"{name} payload lightContext must remain true")
    if "failureAlert" not in job:
        errors.append(f"{name} must retain failureAlert configuration")

if errors:
    for error in errors:
        print(error)
    sys.exit(1)
PY

if ! "${PYTHON[@]}" - "${CRON_JSON_TMP}" <<'PY' >/dev/null
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
for job in data.get("jobs", []):
    if job.get("name") == "social-sales-morning-report":
        sys.exit(0 if job.get("schedule", {}).get("tz") == "America/Chicago" else 1)
sys.exit(1)
PY
then
  echo "social-sales-morning-report timezone is not America/Chicago"
  rm -f "${SECRETS_AUDIT_TMP}" "${CRON_JSON_TMP}"
  exit 1
fi

if ! "${PYTHON[@]}" - "${CRON_JSON_TMP}" <<'PY' >/dev/null
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
for job in data.get("jobs", []):
    if job.get("name") == "social-sales-evening-report":
        sys.exit(0 if job.get("schedule", {}).get("tz") == "America/Chicago" else 1)
sys.exit(1)
PY
then
  echo "social-sales-evening-report timezone is not America/Chicago"
  rm -f "${SECRETS_AUDIT_TMP}" "${CRON_JSON_TMP}"
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl list-unit-files | grep -q '^openclaw-webhook.service'; then
    systemctl is-enabled openclaw-webhook.service >/dev/null
    systemctl is-active openclaw-webhook.service >/dev/null
  else
    echo "Webhook service not installed yet (openclaw-webhook.service)."
    echo "Install with: sudo APP_USER=${APP_USER} bash ~/openclaw-prod/scripts/install_webhook_service.sh"
  fi
fi

if [[ "${RUN_SMOKE}" == "true" ]]; then
  while IFS= read -r id; do
    [[ -z "${id}" ]] && continue
    echo "Running smoke test for cron id: ${id}"
    openclaw cron run "${id}" --timeout 120000 || true
  done < <(printf '%s' "${CRON_JSON}" | "${PYTHON[@]}" -c 'import json,sys; data=json.load(sys.stdin); [print(j.get("id","")) for j in data.get("jobs", [])]')
fi

rm -f "${SECRETS_AUDIT_TMP}" "${CRON_JSON_TMP}"
echo "Validation complete."
