#!/usr/bin/env bash
# openclaw-pre-start.sh
# Strips invalid agents.defaults.skills key before gateway launch.
# Run as ExecStartPre in openclaw.service to prevent crash-loops from
# agent sessions writing this key back to the live config.

CFG=/opt/openclaw/.openclaw/openclaw.json

if [ ! -f "$CFG" ]; then
  exit 0
fi

if jq -e '.agents.defaults.skills' "$CFG" >/dev/null 2>&1; then
  jq 'del(.agents.defaults.skills)' "$CFG" > /tmp/oc_pre_patch.json
  mv /tmp/oc_pre_patch.json "$CFG"
  echo "openclaw-pre-start: stripped agents.defaults.skills from $CFG"
fi
