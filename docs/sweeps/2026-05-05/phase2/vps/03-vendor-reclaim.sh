#!/usr/bin/env bash
# VPS vendor reclaim — sweep 2026-05-05
set -euo pipefail
ROOT='/root/openclaw'
ARCH="$ROOT/archive/2026-05-05-sweep"
LOG="$ARCH/VENDOR-RECLAIM-LOG.txt"
mkdir -p "$ARCH"

DIR_COUNT=6
echo
echo "CONFIRM VENDOR RECLAIM: $DIR_COUNT directory trees will be permanently deleted (VPS)."
echo "These contain ~39738 regenerable files."
read -r -p "Reply BURN to proceed (anything else aborts): " reply
if [[ "$reply" != "BURN" ]]; then echo "ABORTED."; exit 1; fi

count=0

if [[ -d '/root/openclaw/dashboard/.next' ]]; then rm -rf -- '/root/openclaw/dashboard/.next'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" '/root/openclaw/dashboard/.next' >> "$LOG"; count=$((count+1)); fi
if [[ -d '/root/openclaw/dashboard/node_modules' ]]; then rm -rf -- '/root/openclaw/dashboard/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" '/root/openclaw/dashboard/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d '/root/openclaw/deploy/hetzner/__pycache__' ]]; then rm -rf -- '/root/openclaw/deploy/hetzner/__pycache__'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" '/root/openclaw/deploy/hetzner/__pycache__' >> "$LOG"; count=$((count+1)); fi
if [[ -d '/root/openclaw/node_modules' ]]; then rm -rf -- '/root/openclaw/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" '/root/openclaw/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d '/root/openclaw/skills/node_modules' ]]; then rm -rf -- '/root/openclaw/skills/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" '/root/openclaw/skills/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d '/root/openclaw/training/node_modules' ]]; then rm -rf -- '/root/openclaw/training/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" '/root/openclaw/training/node_modules' >> "$LOG"; count=$((count+1)); fi
echo "RECLAIMED: $count directory trees. Log: $LOG"
