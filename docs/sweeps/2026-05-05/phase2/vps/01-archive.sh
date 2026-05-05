#!/usr/bin/env bash
# VPS archive script — sweep 2026-05-05
# Run as root on 177.7.32.224
set -euo pipefail
ROOT='/root/openclaw'
ARCH="$ROOT/archive/2026-05-05-sweep"
mkdir -p "$ARCH"

move() {
  local rel="$1"
  local src="$ROOT/$rel"
  local dst="$ARCH/$rel"
  if [[ ! -e "$src" ]]; then echo "SKIP (missing): $rel"; return; fi
  mkdir -p "$(dirname "$dst")"
  mv -f -- "$src" "$dst"
  echo "MOVED: $rel"
}

count=0

move 'lib/ghl-client-v2.mjs'; count=$((count+1))
move 'lib/ghl-webhook.mjs.phase8-bak'; count=$((count+1))
move 'supabase/migrations/20260325000010_phase1_foundation_skills.sql'; count=$((count+1))
move 'supabase/migrations/20260326000020_phase2_intelligence_skills.sql'; count=$((count+1))
move 'supabase/migrations/20260326000030_phase3_execution_skills.sql'; count=$((count+1))
move 'agents_config.json.pre-migration-20260329-091759.bak'; count=$((count+1))
move 'handlers/ghl-webhook-handler.mjs.phase8-bak'; count=$((count+1))
move 'reports/ghl-api-v2-strategy-report.md'; count=$((count+1))
move 'SCOPES-PLAN.md'; count=$((count+1))
move 'config/agents_config.json.pre-migration-20260329-091759.bak'; count=$((count+1))
move 'assets/designs/social/1773424447502-linkedin-openclaw-testing-phase-3-10.png'; count=$((count+1))
move 'assets/designs/social/1773424481074-tiktok-openclaw-test-post-phase-4-12-automated-social.png'; count=$((count+1))
move 'assets/designs/social/1773424481411-linkedin-openclaw-test-post-phase-4-12-automated-social.png'; count=$((count+1))
move 'assets/designs/social/1773424424283-instagram-openclaw-testing-phase-3-10.png'; count=$((count+1))
move 'assets/designs/social/1773424453361-tiktok-openclaw-testing-phase-3-10.png'; count=$((count+1))
move 'assets/designs/social/1773424481332-twitter-openclaw-test-post-phase-4-12-automated-social.png'; count=$((count+1))
move 'assets/designs/social/1773424481283-facebook-openclaw-test-post-phase-4-12-automated-social.png'; count=$((count+1))
move 'assets/designs/social/1773424439986-twitter-openclaw-testing-phase-3-10.png'; count=$((count+1))
move 'assets/designs/social/1773424430346-facebook-openclaw-testing-phase-3-10.png'; count=$((count+1))
move 'assets/designs/social/1773424481154-instagram-openclaw-test-post-phase-4-12-automated-social.png'; count=$((count+1))
move 'inngest/functions/phase1-foundation.ts'; count=$((count+1))
move 'inngest/functions/phase3-execution.ts'; count=$((count+1))
move 'inngest/functions/phase2-intelligence.ts'; count=$((count+1))
move 'IMPLEMENTATION-PLAN.md'; count=$((count+1))
move 'docker-compose.yml.bak.20260505145621'; count=$((count+1))
move 'STRATEGIC-UPGRADE-PLAN.md'; count=$((count+1))
move 'docker-compose.yml.bak.20260505143017'; count=$((count+1))
move 'docs/upgrade-program/PLATFORM-OPS-ARCHITECTURE-v1.md'; count=$((count+1))
move 'deploy/hetzner/backup.sh'; count=$((count+1))
move 'reggie-vps-phase1-manifest.csv'; count=$((count+1))
move 'training/OPENCLAW-AGENT-TRAINING-PLAN.md'; count=$((count+1))
move 'skills/coaching-adaptive-action-plan-generation/index.mjs'; count=$((count+1))
move 'skills/backup-manager.mjs'; count=$((count+1))
move 'scripts/restart-local.ps1.deprecated'; count=$((count+1))
echo "ARCHIVED FILES: $count"
