#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# fix-deploy-secrets.sh
# OpenClaw Multi-Agent Network — Hardened Dashboard Build Step
#
# Fixes audit finding SEC-01: "Hardcoded Supabase Anon Key in deploy.sh"
#
# Problem (lines 91-93 of deploy/hetzner/deploy.sh):
#   NEXT_PUBLIC_SUPABASE_URL="https://aagqvfwuixpxtdcrdxmv.supabase.co" \
#   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGci...KouvQ" \
#   npx next build
#
#   The actual project URL and anon JWT are committed to the git repository.
#   Anyone with read access to the repo has the anon key. Combined with the
#   overly permissive USING (true) RLS policies (fixed in fix-rls-policies.sql),
#   this is directly exploitable.
#
# Fix:
#   1. Remove hardcoded values from deploy.sh entirely.
#   2. Read NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from
#      the server's environment (set once in /etc/openclaw-secrets or as
#      systemd EnvironmentFile entries — never in source code).
#   3. Fail loudly if the vars are unset at deploy time.
#
# HOW TO USE THIS FILE:
#   This script is the replacement for the "Build & deploy dashboard" section
#   of deploy/hetzner/deploy.sh (steps 5/8).
#
#   Option A — Drop-in replacement:
#     Source or call this script from deploy.sh instead of the current block.
#
#   Option B — Inline the changes:
#     Replace lines 82-98 of deploy/hetzner/deploy.sh with the function below.
#
# SERVER SETUP (one-time, before first deploy):
#   Create /etc/openclaw/secrets with restricted permissions:
#
#     sudo mkdir -p /etc/openclaw
#     sudo touch /etc/openclaw/secrets
#     sudo chmod 600 /etc/openclaw/secrets
#     sudo chown root:root /etc/openclaw/secrets
#
#   Add secrets to the file (never commit this file):
#     echo 'NEXT_PUBLIC_SUPABASE_URL=https://<new-ref>.supabase.co' >> /etc/openclaw/secrets
#     echo 'NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-anon-key>' >> /etc/openclaw/secrets
#     echo 'SUPABASE_SERVICE_ROLE_KEY=<service-role-key>' >> /etc/openclaw/secrets
#
#   Source the secrets file from your systemd service or from this script.
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

OPENCLAW_HOME="${OPENCLAW_HOME:-/opt/openclaw}"
SECRETS_FILE="${OPENCLAW_SECRETS_FILE:-/etc/openclaw/secrets}"

# ── Load secrets from file if env vars aren't already set ──────────────────────
# This allows the script to work both:
#   (a) When called from a systemd context that already injected vars, and
#   (b) Standalone when invoked manually with vars in a secrets file.
if [[ -f "$SECRETS_FILE" ]]; then
  echo "  Loading secrets from $SECRETS_FILE"
  # Use 'set -a' to export all variables defined in the file
  set -a
  # shellcheck source=/dev/null
  source "$SECRETS_FILE"
  set +a
else
  echo "  Secrets file not found at $SECRETS_FILE"
  echo "  Falling back to environment variables only."
fi

# ── Validate required environment variables ─────────────────────────────────────
build_dashboard() {
  local errors=0

  # Check NEXT_PUBLIC_SUPABASE_URL
  if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
    echo "  [ERROR] NEXT_PUBLIC_SUPABASE_URL is not set."
    echo "          Set it in $SECRETS_FILE or as an environment variable."
    errors=$((errors + 1))
  fi

  # Check NEXT_PUBLIC_SUPABASE_ANON_KEY
  if [[ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
    echo "  [ERROR] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set."
    echo "          Set it in $SECRETS_FILE or as an environment variable."
    echo "          After rotating the leaked key, update the secrets file."
    errors=$((errors + 1))
  fi

  # Refuse to deploy with a known-compromised key
  # Replace this value after rotating via Supabase Dashboard
  local KNOWN_COMPROMISED_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhZ3F2Znd1aXhweHRkY3JkeG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDc1NDQsImV4cCI6MjA4ODkyMzU0NH0.9FvkyIqKYnaUcJQt0sXammf35O1NSpC2Rwx3c6KouvQ"
  if [[ "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" == "$KNOWN_COMPROMISED_KEY" ]]; then
    echo "  [FATAL] NEXT_PUBLIC_SUPABASE_ANON_KEY matches the key that was"
    echo "          hardcoded in deploy.sh and committed to git (SEC-01)."
    echo "          This key is compromised. Rotate it immediately:"
    echo "            1. Supabase Dashboard → Settings → API → Regenerate anon key"
    echo "            2. Update $SECRETS_FILE with the new key"
    echo "            3. Re-run this deploy"
    errors=$((errors + 1))
  fi

  # Abort if any validation failed
  if [[ $errors -gt 0 ]]; then
    echo ""
    echo "  Deploy aborted: $errors secret(s) missing or invalid."
    echo "  See above for details."
    exit 1
  fi

  # ── Verify the URL looks reasonable (basic sanity check) ────────────────────
  if [[ ! "$NEXT_PUBLIC_SUPABASE_URL" =~ ^https://[a-z0-9]+\.supabase\.co$ ]]; then
    echo "  [WARN] NEXT_PUBLIC_SUPABASE_URL does not match expected pattern"
    echo "         (https://<ref>.supabase.co). Value: $NEXT_PUBLIC_SUPABASE_URL"
    echo "         Continuing, but verify this is correct."
  fi

  # ── Run the dashboard build ──────────────────────────────────────────────────
  echo "  [5/8] Building dashboard..."
  echo "         SUPABASE_URL: $NEXT_PUBLIC_SUPABASE_URL"
  echo "         ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY:0:20}... (truncated for log safety)"

  cd "$OPENCLAW_HOME/dashboard"

  if command -v pnpm &>/dev/null; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  else
    npm install
  fi

  # Pass secrets as env vars — they are NOT written to the filesystem or log
  NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  npx next build

  cd "$OPENCLAW_HOME"
  echo "  Dashboard built successfully"
}

# ── Entry point ─────────────────────────────────────────────────────────────────
# This guard allows the script to be sourced by deploy.sh (for the function)
# or run directly for a standalone dashboard build.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ ! -d "$OPENCLAW_HOME/dashboard" ]]; then
    echo "  Skipping dashboard build (no dashboard directory at $OPENCLAW_HOME/dashboard)"
    exit 0
  fi
  build_dashboard
fi

# ── INSTRUCTIONS FOR deploy.sh INTEGRATION ─────────────────────────────────────
# Replace lines 82-98 in deploy/hetzner/deploy.sh with:
#
#   # ── 5. Build & deploy dashboard ──────────────────────────────────────────────
#   if [ -f dashboard/package.json ]; then
#     source "$OPENCLAW_HOME/enhanced-artifacts/fix-deploy-secrets.sh"
#     build_dashboard
#   else
#     echo "  Skipping dashboard build (no package.json)"
#   fi
#
# Or simply call it directly:
#   bash /opt/openclaw/enhanced-artifacts/fix-deploy-secrets.sh
#
# ── ALSO FIX: DEPLOY-03 STEP NUMBERING ─────────────────────────────────────────
# The current deploy.sh labels steps [1/6], [2/6], [3/6], [4/6], [5/8], [6/8]
# which is inconsistent (jumps from /6 to /8). Fix by updating all step labels
# to use /7 (there are 7 logical steps):
#   [1/7] Pull latest code
#   [2/7] Upgrade CLI (optional)
#   [3/7] Install dependencies
#   [4/7] Sync configuration
#   [5/7] Build dashboard
#   [6/7] Restart services
#   [7/7] Health check
