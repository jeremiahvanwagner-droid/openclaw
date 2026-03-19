#!/usr/bin/env bash
set -euo pipefail

RUN_SMOKE="${RUN_SMOKE:-false}"
APP_USER="${APP_USER:-openclaw}"
OPS_DB_PATH="${OPENCLAW_OPS_DB_PATH:-$HOME/.config/openclaw-prod/ops.db}"
OPS_SCRIPT="$HOME/openclaw-prod/scripts/ops_control.py"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-/opt/openclaw/.openclaw/openclaw.json}"
RELAY_PRECHECK="${OPENCLAW_VALIDATE_BROWSER_RELAY:-false}"
RELAY_SINGLE_TAB="${OPENCLAW_RELAY_SINGLE_TAB:-true}"
MAX_CADDY_502_15M="${OPENCLAW_MAX_CADDY_502_15M:-10}"
RESTART_LIMIT="${OPENCLAW_MAX_RESTARTS:-5}"
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

canonicalize_gateway_token_env() {
  if [[ -z "${OPENCLAW_GATEWAY_AUTH_TOKEN:-}" && -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    export OPENCLAW_GATEWAY_AUTH_TOKEN="${OPENCLAW_GATEWAY_TOKEN}"
  fi
  if [[ -n "${OPENCLAW_GATEWAY_AUTH_TOKEN:-}" && -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_AUTH_TOKEN}"
  fi
}

check_topology_contract() {
  if [[ ! -f "${CONFIG_PATH}" ]]; then
    echo "Topology check skipped (config not found at ${CONFIG_PATH})."
    return
  fi

  "${PYTHON[@]}" - "${CONFIG_PATH}" <<'PY'
import json
import sys

cfg = json.load(open(sys.argv[1], "r", encoding="utf-8"))
gateway = cfg.get("gateway") or {}
mode = str(gateway.get("mode") or "").strip().lower()
if mode != "remote":
    raise SystemExit(f"Topology guard failed: gateway.mode={mode!r}; expected 'remote'.")

remote = gateway.get("remote") or {}
if not str(remote.get("url") or "").strip():
    raise SystemExit("Topology guard failed: gateway.remote.url is required in remote-first mode.")

trusted = gateway.get("trustedProxies")
if trusted is None:
    raise SystemExit("Topology guard failed: gateway.trustedProxies must be configured.")
if not isinstance(trusted, list) or len(trusted) == 0:
    raise SystemExit("Topology guard failed: gateway.trustedProxies must be a non-empty array.")
PY
}

check_systemd_runtime() {
  if ! command -v systemctl >/dev/null 2>&1; then
    return
  fi
  if ! systemctl list-unit-files | grep -q '^openclaw.service'; then
    return
  fi

  local active_state
  local restart_count
  active_state="$(systemctl show openclaw --property ActiveState --value)"
  restart_count="$(systemctl show openclaw --property NRestarts --value)"
  [[ "${active_state}" == "active" ]] || {
    echo "openclaw.service ActiveState=${active_state}"
    exit 1
  }
  if [[ "${restart_count}" =~ ^[0-9]+$ ]] && (( restart_count > RESTART_LIMIT )); then
    echo "openclaw.service has restarted ${restart_count} times (limit=${RESTART_LIMIT})"
    exit 1
  fi
}

check_control_plane_noise() {
  if ! command -v journalctl >/dev/null 2>&1; then
    return
  fi
  local poller_conflicts
  poller_conflicts="$(journalctl -u openclaw --since '30 minutes ago' --no-pager | grep -ci 'terminated by other getUpdates request' || true)"
  if [[ "${poller_conflicts}" =~ ^[0-9]+$ ]] && (( poller_conflicts > 0 )); then
    echo "Detected Telegram poller conflict events in the last 30 minutes (${poller_conflicts})."
    exit 1
  fi
}

check_caddy_502_burst() {
  if ! command -v journalctl >/dev/null 2>&1; then
    return
  fi
  local bursts
  bursts="$(journalctl -u caddy --since '15 minutes ago' --no-pager | grep -c 'status=502' || true)"
  if [[ "${bursts}" =~ ^[0-9]+$ ]] && (( bursts > MAX_CADDY_502_15M )); then
    echo "Caddy 502 burst detected (${bursts} events in 15m, limit=${MAX_CADDY_502_15M})."
    exit 1
  fi
}

check_node_status_semantics() {
  if ! openclaw node status --help >/dev/null 2>&1; then
    return
  fi
  local node_json
  node_json="$(openclaw node status --json)"
  local node_tmp
  node_tmp="$(mktemp)"
  printf '%s' "${node_json}" > "${node_tmp}"
  "${PYTHON[@]}" - "${node_tmp}" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
runtime = ((data.get("service") or {}).get("runtime") or {})
detail = str(runtime.get("detail") or "")
if "no listener detected on port 443" in detail:
    raise SystemExit("Node status semantics regression: runtime inferred from remote port listener check.")
print(f"Node runtime status={runtime.get('status', 'unknown')} detail={detail[:120]}")
PY
  rm -f "${node_tmp}"
}

check_browser_relay() {
  if [[ "${RELAY_PRECHECK}" != "true" ]]; then
    return
  fi
  local tabs_json
  tabs_json="$(openclaw browser tabs --browser-profile chrome-relay --json)"
  local tabs_tmp
  tabs_tmp="$(mktemp)"
  printf '%s' "${tabs_json}" > "${tabs_tmp}"
  "${PYTHON[@]}" - "${tabs_tmp}" "${RELAY_SINGLE_TAB}" <<'PY'
import json
import sys

tabs = (json.load(open(sys.argv[1], "r", encoding="utf-8")).get("tabs") or [])
if len(tabs) == 0:
    raise SystemExit("Relay preflight failed: no attached chrome-relay tabs.")
if sys.argv[2].lower() == "true" and len(tabs) != 1:
    raise SystemExit(f"Relay preflight failed: expected exactly 1 attached tab, found {len(tabs)}.")
print(f"Relay preflight passed: attached tabs={len(tabs)}")
PY
  rm -f "${tabs_tmp}"
}

canonicalize_gateway_token_env
check_topology_contract
check_systemd_runtime
check_control_plane_noise
check_caddy_502_burst
check_node_status_semantics
check_browser_relay

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
from pathlib import Path

with open(sys.argv[1], "r", encoding="utf-8") as f:
    report = json.load(f)
summary = report.get("summary") or {}
unresolved = int(summary.get("unresolvedRefCount", 0) or 0)
shadowed = int(summary.get("shadowedRefCount", 0) or 0)
legacy = int(summary.get("legacyResidueCount", 0) or 0)
findings = report.get("findings") or []

def lookup_json_path(obj, path):
    cur = obj
    for part in path.split("."):
        if not part:
            continue
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur.get(part)
    return cur

actionable_plaintext = 0
for finding in findings:
    if finding.get("code") != "PLAINTEXT_FOUND":
        continue
    file_path = Path(str(finding.get("file") or ""))
    json_path = str(finding.get("jsonPath") or "")

    if file_path.name == ".env":
        continue

    if file_path.name in {"openclaw.json", "openclaw.prod.json"}:
        try:
            cfg = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception:
            cfg = {}
        raw = lookup_json_path(cfg, json_path)
        if isinstance(raw, str) and raw.startswith("${") and raw.endswith("}"):
            continue

    actionable_plaintext += 1

if actionable_plaintext or unresolved or shadowed:
    print(
        "Secrets audit failed: "
        f"plaintext_actionable={actionable_plaintext}, unresolved={unresolved}, shadowed={shadowed}, legacy={legacy}"
    )
    sys.exit(1)

print(
    "Secrets audit actionable checks passed: "
    f"plaintext_actionable={actionable_plaintext}, unresolved={unresolved}, shadowed={shadowed}, legacy={legacy}"
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
