#!/usr/bin/env bash
# VPS shred script — sweep 2026-05-05
# Run as root on 177.7.32.224
set -euo pipefail
ROOT='/root/openclaw'
ARCH="$ROOT/archive/2026-05-05-sweep"
LOG="$ARCH/SHRED-LOG.txt"
mkdir -p "$ARCH"

INDIVIDUAL_COUNT=6
echo
echo "CONFIRM SHRED: $INDIVIDUAL_COUNT files will be permanently deleted (VPS)."
read -r -p "Reply BURN to proceed (anything else aborts): " reply
if [[ "$reply" != "BURN" ]]; then echo "ABORTED. No files deleted."; exit 1; fi

count=0
shred_one() {
  local p="$1"
  if [[ -e "$p" ]]; then rm -f -- "$p"; printf '%s\tDELETED\t%s\n' "$(date -u +%FT%TZ)" "$p" >> "$LOG"; count=$((count+1));
  else printf '%s\tMISSING\t%s\n' "$(date -u +%FT%TZ)" "$p" >> "$LOG"; fi
}

shred_one '/root/openclaw/tmp_memory_stats.py'
shred_one '/root/openclaw/tmp_inspect_schema.py'
shred_one '/root/openclaw/tmp_orphan_check.py'
shred_one '/root/openclaw/tmp_agent_memory_cleanup.py'
shred_one '/root/openclaw/deploy/docker-compose.prod.yml.orig'
shred_one '/root/openclaw/tmp_inspect_memory_dbs.py'
echo "SHREDDED: $count files. Log: $LOG"
