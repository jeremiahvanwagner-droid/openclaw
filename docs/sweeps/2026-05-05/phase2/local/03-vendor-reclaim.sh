#!/usr/bin/env bash
# LOCAL vendor reclaim (bash) — sweep 2026-05-05
set -euo pipefail
ROOT='C:/Users/JeremiahVanWagner/.openclaw'
ARCH="$ROOT/archive/2026-05-05-sweep"
LOG="$ARCH/VENDOR-RECLAIM-LOG.txt"
mkdir -p "$ARCH"

DIR_COUNT=9
echo
echo "CONFIRM VENDOR RECLAIM: $DIR_COUNT directory trees will be permanently deleted (LOCAL)."
echo "These contain ~109002 regenerable files."
read -r -p "Reply BURN to proceed (anything else aborts): " reply
if [[ "$reply" != "BURN" ]]; then echo "ABORTED."; exit 1; fi

count=0

if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/.venv' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/.venv'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/.venv' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/dashboard/.next' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/dashboard/.next'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/dashboard/.next' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/dashboard/node_modules' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/dashboard/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/dashboard/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/deploy/hostinger/__pycache__' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/deploy/hostinger/__pycache__'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/deploy/hostinger/__pycache__' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/node_modules' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/openclaw-prod/scripts/__pycache__' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/openclaw-prod/scripts/__pycache__'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/openclaw-prod/scripts/__pycache__' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/skills/node_modules' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/skills/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/skills/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/training/node_modules' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/training/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/training/node_modules' >> "$LOG"; count=$((count+1)); fi
if [[ -d 'C:/Users/JeremiahVanWagner/.openclaw/workspace/skills/node_modules' ]]; then rm -rf -- 'C:/Users/JeremiahVanWagner/.openclaw/workspace/skills/node_modules'; printf '%s\tRECLAIMED\t%s\n' "$(date -u +%FT%TZ)" 'C:/Users/JeremiahVanWagner/.openclaw/workspace/skills/node_modules' >> "$LOG"; count=$((count+1)); fi
echo "RECLAIMED: $count directory trees. Log: $LOG"
