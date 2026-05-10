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

# Strip governance/rollout metadata keys not in openclaw CLI's zod schema.
# Source-of-truth lives in scripts/upgrade/build-runtime-rollout-config.mjs;
# these are runtime-only annotations the CLI does not need to validate.
jq '
  del(.meta.rollout_mode)
  | del(.meta.rollout_generated_by)
  | (.agents.list // []) as $list
  | .agents.list = ($list | map(
      del(.business_scope)
      | del(.ghl_token_group)
      | del(.operational_boundaries)
    ))
' "$CFG" > /tmp/oc_pre_patch.json && mv /tmp/oc_pre_patch.json "$CFG"
echo "openclaw-pre-start: stripped governance metadata keys from $CFG"
