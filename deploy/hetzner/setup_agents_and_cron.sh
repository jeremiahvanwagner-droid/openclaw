#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

TZ_NAME="${OPENCLAW_REPORT_TZ:-America/Chicago}"
OPS_DB_PATH="${OPENCLAW_OPS_DB_PATH:-$HOME/.config/openclaw-prod/ops.db}"
OPS_REPORT_DIR="${OPENCLAW_REPORT_DIR:-$HOME/.config/openclaw-prod/reports}"
OPS_SCRIPT="$HOME/openclaw-prod/scripts/ops_control.py"

if [[ ! -f "$OPS_SCRIPT" ]]; then
  echo "Missing ops control script: $OPS_SCRIPT"
  exit 1
fi

python3 "$OPS_SCRIPT" --db-path "$OPS_DB_PATH" init-db >/dev/null

ensure_agent() {
  local id="$1"
  local model="$2"
  local workspace="$HOME/.openclaw/workspace-${id}"

  if openclaw agents list --json | jq -e --arg id "$id" '.[] | select(.id == $id)' >/dev/null; then
    echo "Agent already exists: $id"
    return 0
  fi

  openclaw agents add "$id" \
    --model "$model" \
    --workspace "$workspace" \
    --non-interactive \
    --json >/dev/null
  echo "Agent created: $id"
}

job_id_by_name() {
  local name="$1"
  openclaw cron list --all --json | jq -r --arg n "$name" '.jobs[] | select(.name == $n) | .id' | head -n1
}

all_job_ids_by_name() {
  local name="$1"
  openclaw cron list --all --json | jq -r --arg n "$name" '.jobs[] | select(.name == $n) | .id'
}

dedupe_job_by_name() {
  local name="$1"
  local keep_id="$2"
  local id
  while IFS= read -r id; do
    [[ -z "$id" || "$id" == "$keep_id" ]] && continue
    openclaw cron rm "$id" >/dev/null || true
    echo "Cron removed duplicate: $name ($id)"
  done < <(all_job_ids_by_name "$name")
}

disable_job_if_exists() {
  local name="$1"
  local id found=false
  while IFS= read -r id; do
    [[ -z "${id}" || "${id}" == "null" ]] && continue
    found=true
    openclaw cron disable "$id" >/dev/null || openclaw cron edit "$id" --disable >/dev/null
    echo "Cron disabled: $name ($id)"
  done < <(all_job_ids_by_name "$name")
  if [[ "$found" == false ]]; then
    return 0
  fi
}

ensure_cron_expr() {
  local name="$1"
  local agent="$2"
  local expr="$3"
  local timeout_ms="$4"
  local announce_mode="$5"
  local message="$6"
  local description="$7"

  local id
  id="$(job_id_by_name "$name")"
  if [[ -n "${id}" && "${id}" != "null" ]]; then
    dedupe_job_by_name "$name" "$id"
    if [[ "$announce_mode" == "announce" ]]; then
      openclaw cron edit "$id" \
        --agent "$agent" \
        --cron "$expr" \
        --tz "$TZ_NAME" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --announce \
        --enable >/dev/null
    else
      openclaw cron edit "$id" \
        --agent "$agent" \
        --cron "$expr" \
        --tz "$TZ_NAME" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --no-deliver \
        --enable >/dev/null
    fi
    echo "Cron updated: $name"
  else
    if [[ "$announce_mode" == "announce" ]]; then
      openclaw cron add \
        --name "$name" \
        --agent "$agent" \
        --cron "$expr" \
        --tz "$TZ_NAME" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --announce >/dev/null
    else
      openclaw cron add \
        --name "$name" \
        --agent "$agent" \
        --cron "$expr" \
        --tz "$TZ_NAME" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --no-deliver >/dev/null
    fi
    echo "Cron created: $name"
  fi
}

ensure_cron_every() {
  local name="$1"
  local agent="$2"
  local every="$3"
  local timeout_ms="$4"
  local announce_mode="$5"
  local message="$6"
  local description="$7"

  local id
  id="$(job_id_by_name "$name")"
  if [[ -n "${id}" && "${id}" != "null" ]]; then
    dedupe_job_by_name "$name" "$id"
    if [[ "$announce_mode" == "announce" ]]; then
      openclaw cron edit "$id" \
        --agent "$agent" \
        --every "$every" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --announce \
        --enable >/dev/null
    else
      openclaw cron edit "$id" \
        --agent "$agent" \
        --every "$every" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --no-deliver \
        --enable >/dev/null
    fi
    echo "Cron updated: $name"
  else
    if [[ "$announce_mode" == "announce" ]]; then
      openclaw cron add \
        --name "$name" \
        --agent "$agent" \
        --every "$every" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --announce >/dev/null
    else
      openclaw cron add \
        --name "$name" \
        --agent "$agent" \
        --every "$every" \
        --session isolated \
        --timeout "$timeout_ms" \
        --description "$description" \
        --message "$message" \
        --no-deliver >/dev/null
    fi
    echo "Cron created: $name"
  fi
}

# Agents with explicit ownership boundaries.
ensure_agent "marketing" "openai/gpt-5-mini"
ensure_agent "sales" "openai/gpt-5-mini"
ensure_agent "support" "openai/gpt-5-mini"

# Disable week-1 high-frequency jobs that caused API/token overuse.
disable_job_if_exists "lead-response-monitor"
disable_job_if_exists "lead-scoring-refresh"
disable_job_if_exists "precall-briefing-scan"
disable_job_if_exists "support-inbox-drafting"
disable_job_if_exists "pipeline-health-briefing"
disable_job_if_exists "no-show-recovery"

MORNING_MESSAGE="$(cat <<MSG
Run the consolidated MORNING social-sales operations window in low-API mode.
1) Execute local queue processing and report generation:
python3 ~/openclaw-prod/scripts/ops_control.py --db-path \"$OPS_DB_PATH\" report-window --window morning --timezone \"$TZ_NAME\" --report-dir \"$OPS_REPORT_DIR\" --print-report
2) Return the generated report exactly as plain text.
3) Do not run external API scans or speculative checks outside data already queued through webhook ingestion.
MSG
)"

EVENING_MESSAGE="$(cat <<MSG
Run the consolidated EVENING social-sales operations window in low-API mode.
1) Execute local queue processing and report generation:
python3 ~/openclaw-prod/scripts/ops_control.py --db-path \"$OPS_DB_PATH\" report-window --window evening --timezone \"$TZ_NAME\" --report-dir \"$OPS_REPORT_DIR\" --print-report
2) Return the generated report exactly as plain text.
3) Do not run external API scans or speculative checks outside data already queued through webhook ingestion.
MSG
)"

SENTINEL_MESSAGE="$(cat <<MSG
Phase 1: run the local critical incident sentinel only:
python3 ~/openclaw-prod/scripts/ops_control.py --db-path \"$OPS_DB_PATH\" sentinel --timezone \"$TZ_NAME\"
Return blank when the command prints NO_ALERT or CRITICAL_ALERT_ALREADY_SENT.
Return only: [ACTION REQUIRED] Critical incident notification dispatched when it prints CRITICAL_ALERT_SENT.
Return only: [ACTION REQUIRED] Critical incident queued but no alert channel is configured when it prints CRITICAL_ALERT_QUEUED_NO_CHANNEL.
Do not add analysis or initiate external API calls; sentinel logic is local-first and alert-exception only.
MSG
)"

ensure_cron_expr \
  "social-sales-morning-report" \
  "marketing" \
  "0 7 * * *" \
  "300000" \
  "announce" \
  "$MORNING_MESSAGE" \
  "Morning consolidated IG+FB social marketing and sales report window."

ensure_cron_expr \
  "social-sales-evening-report" \
  "sales" \
  "0 21 * * *" \
  "300000" \
  "announce" \
  "$EVENING_MESSAGE" \
  "Evening consolidated IG+FB social marketing and sales report window."

ensure_cron_every \
  "critical-incident-sentinel" \
  "support" \
  "15m" \
  "120000" \
  "none" \
  "$SENTINEL_MESSAGE" \
  "Local-only critical sentinel. Immediate alert exception path only."

openclaw cron list --all
