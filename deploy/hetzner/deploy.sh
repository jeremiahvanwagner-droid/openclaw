#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-/opt/openclaw}"
ENV_FILE="${OPENCLAW_ENV_FILE:-/etc/openclaw/.env}"
OPENCLAW_SERVICE_NAME="${OPENCLAW_SERVICE_NAME:-openclaw}"
WEBHOOK_SERVICE_NAME="${OPENCLAW_WEBHOOK_SERVICE_NAME:-openclaw-webhook}"
DASHBOARD_SERVICE_NAME="${OPENCLAW_DASHBOARD_SERVICE_NAME:-openclaw-dashboard}"
BURN_IN_SECONDS="${OPENCLAW_BURN_IN_SECONDS:-90}"
MAX_RESTART_DELTA="${OPENCLAW_MAX_RESTART_DELTA:-0}"
STRICT_SECRETS_AUDIT="${OPENCLAW_STRICT_SECRETS_AUDIT:-true}"
export CI=true

cd "${OPENCLAW_HOME}"

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

load_env() {
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
  fi
}

canonicalize_gateway_token_env() {
  if [[ -z "${OPENCLAW_GATEWAY_AUTH_TOKEN:-}" && -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    export OPENCLAW_GATEWAY_AUTH_TOKEN="${OPENCLAW_GATEWAY_TOKEN}"
  fi
  if [[ -n "${OPENCLAW_GATEWAY_AUTH_TOKEN:-}" && -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_AUTH_TOKEN}"
  fi
}

assert_remote_first_topology() {
  python3 - <<'PY'
import json
from pathlib import Path

cfg_path = Path("config/openclaw.prod.json")
if not cfg_path.exists():
    raise SystemExit(f"Missing required config file: {cfg_path}")

data = json.loads(cfg_path.read_text(encoding="utf-8"))
gateway = data.get("gateway") or {}
mode = str(gateway.get("mode") or "").strip().lower()
if mode != "remote":
    raise SystemExit("Topology guard failed: config/openclaw.prod.json gateway.mode must be \"remote\".")

trusted = gateway.get("trustedProxies")
if not isinstance(trusted, list) or len(trusted) == 0:
    raise SystemExit("Topology guard failed: gateway.trustedProxies must be configured for reverse-proxy deployments.")

remote = gateway.get("remote") or {}
remote_url = str(remote.get("url") or "").strip()
if not remote_url:
    raise SystemExit("Topology guard failed: gateway.remote.url is required in config/openclaw.prod.json.")
PY
}

assert_clean_worktree_and_branch() {
  git config --global --add safe.directory "${OPENCLAW_HOME}" 2>/dev/null || true
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "${branch}" != "main" ]]; then
    fail "Refusing deploy from branch '${branch}'. Expected 'main'."
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Refusing deploy: working tree has local changes."
  fi
}

run_secrets_audit_gate() {
  if [[ "${STRICT_SECRETS_AUDIT}" != "true" ]]; then
    log "[gate] Secrets audit gate disabled (OPENCLAW_STRICT_SECRETS_AUDIT=${STRICT_SECRETS_AUDIT})."
    return
  fi

  local audit_json
  audit_json="$(openclaw secrets audit --json)"
  local audit_tmp
  audit_tmp="$(mktemp)"
  printf '%s' "${audit_json}" > "${audit_tmp}"

  python3 - "${audit_tmp}" <<'PY'
import json
import sys
from pathlib import Path

report = json.load(open(sys.argv[1], "r", encoding="utf-8"))
summary = report.get("summary") or {}
unresolved = int(summary.get("unresolvedRefCount", 0) or 0)
shadowed = int(summary.get("shadowedRefCount", 0) or 0)
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

    # Runtime .env values are expected to hold real secrets.
    if file_path.name == ".env":
        continue

    # Current audit marks ${ENV_VAR} templates as plaintext in openclaw config.
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
    raise SystemExit(
        "Secrets audit failed: "
        f"plaintext_actionable={actionable_plaintext}, unresolved={unresolved}, shadowed={shadowed}"
    )
print(
    "Secrets audit gate passed: "
    f"plaintext_actionable={actionable_plaintext}, unresolved={unresolved}, shadowed={shadowed}"
)
PY

  rm -f "${audit_tmp}"
}

build_dashboard() {
  if [[ ! -f "dashboard/package.json" ]]; then
    log "[dashboard] Skipped (dashboard/package.json not found)."
    return
  fi

  if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${SUPABASE_URL:-}" ]]; then
    export NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}"
  fi
  if [[ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" && -n "${SUPABASE_ANON_KEY:-}" ]]; then
    export NEXT_PUBLIC_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"
  fi

  : "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is required to build dashboard}"
  : "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY) is required to build dashboard}"

  pushd dashboard >/dev/null
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  else
    npm install
  fi
  NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  npx next build
  popd >/dev/null
}

wait_for_health() {
  local name="$1"
  local url="$2"
  local attempts="$3"
  local sleep_seconds="$4"
  local ok="false"
  local i

  for ((i = 1; i <= attempts; i += 1)); do
    if curl -sf "${url}" >/dev/null 2>&1; then
      ok="true"
      break
    fi
    sleep "${sleep_seconds}"
  done

  if [[ "${ok}" != "true" ]]; then
    fail "${name} health check failed at ${url}"
  fi
}

run_post_deploy_runtime_gate() {
  local baseline_restarts="$1"
  local active_state
  local restarts_now
  local restart_delta

  sleep "${BURN_IN_SECONDS}"

  active_state="$(systemctl show "${OPENCLAW_SERVICE_NAME}" --property ActiveState --value 2>/dev/null || echo unknown)"
  [[ "${active_state}" == "active" ]] || fail "Runtime gate failed: ${OPENCLAW_SERVICE_NAME} ActiveState=${active_state}"

  restarts_now="$(systemctl show "${OPENCLAW_SERVICE_NAME}" --property NRestarts --value 2>/dev/null || echo "${baseline_restarts}")"
  restart_delta=$((restarts_now - baseline_restarts))
  if (( restart_delta > MAX_RESTART_DELTA )); then
    fail "Runtime gate failed: ${OPENCLAW_SERVICE_NAME} restarted ${restart_delta} times during burn-in."
  fi

  wait_for_health "gateway" "http://127.0.0.1:18789/health" 5 2
}

log "========================================"
log "OpenClaw Deploy $(date '+%Y-%m-%d %H:%M:%S')"
log "========================================"

load_env
canonicalize_gateway_token_env

log "[1/10] Validating topology contract..."
assert_remote_first_topology

log "[2/10] Validating git state..."
assert_clean_worktree_and_branch

log "[3/10] Pulling latest code..."
git fetch origin main
git pull --ff-only origin main
log "Latest commit: $(git log --oneline -1)"

if [[ "${1:-}" == "--upgrade" ]]; then
  log "[4/10] Upgrading OpenClaw CLI..."
  npm install -g openclaw@latest
else
  log "[4/10] Skipping OpenClaw CLI upgrade (pass --upgrade to enable)."
fi

log "[5/10] Installing dependencies..."
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod
elif command -v npm >/dev/null 2>&1; then
  npm install --omit=dev
else
  fail "No supported package manager found (pnpm or npm)."
fi

log "[6/10] Syncing runtime configuration and service units..."
mkdir -p /opt/openclaw/.openclaw
cp config/openclaw.prod.json /opt/openclaw/.openclaw/openclaw.json
chown openclaw:openclaw /opt/openclaw/.openclaw/openclaw.json

mkdir -p handlers/workspace
ln -sfn /opt/openclaw/skills /opt/openclaw/handlers/workspace/skills
chown -h openclaw:openclaw /opt/openclaw/handlers/workspace/skills || true

cp deploy/hetzner/openclaw.service /etc/systemd/system/
cp deploy/hetzner/webhook.service /etc/systemd/system/openclaw-webhook.service
cp deploy/hetzner/dashboard.service /etc/systemd/system/openclaw-dashboard.service
cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload

log "[7/10] Enforcing secrets audit gate..."
run_secrets_audit_gate

log "[8/10] Building dashboard..."
build_dashboard

log "[9/10] Restarting services..."
baseline_restarts="$(systemctl show "${OPENCLAW_SERVICE_NAME}" --property NRestarts --value 2>/dev/null || echo 0)"
systemctl restart "${OPENCLAW_SERVICE_NAME}"
systemctl restart "${WEBHOOK_SERVICE_NAME}"
systemctl restart "${DASHBOARD_SERVICE_NAME}"
systemctl enable "${DASHBOARD_SERVICE_NAME}" >/dev/null 2>&1 || true
systemctl reload caddy

log "[10/10] Running health and runtime gates..."
wait_for_health "gateway" "http://127.0.0.1:18789/health" 12 5
wait_for_health "webhook" "http://127.0.0.1:8788/health" 8 3
wait_for_health "dashboard" "http://127.0.0.1:3001" 8 3
run_post_deploy_runtime_gate "${baseline_restarts}"

log ""
log "Deploy complete."
log "Gateway: healthy"
log "Webhook: healthy"
log "Dashboard: healthy"
