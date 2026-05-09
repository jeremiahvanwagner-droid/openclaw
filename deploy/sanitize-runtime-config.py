#!/usr/bin/env python3
"""
Strip openclaw-CLI-unknown governance fields from openclaw.prod.json,
force gateway.mode=local + bind=auto for single-node VPS,
inject controlUi.allowedOrigins for Caddy-fronted hostnames,
extend trustedProxies with Docker bridge CIDR.
Idempotent. Re-run after any prod.json edit.
"""
import json, pathlib

SRC = pathlib.Path("/root/openclaw/config/openclaw.prod.json")
DST = pathlib.Path("/etc/openclaw/openclaw.runtime.json")

UNKNOWN_META_KEYS  = {"rollout_mode", "rollout_generated_by"}
UNKNOWN_AGENT_KEYS = {"business_scope", "ghl_token_group", "operational_boundaries"}

ALLOWED_ORIGINS = [
    "https://api.truthjblue.dev",
    "https://truthjblue.dev",
    "https://www.truthjblue.dev",
]
EXTRA_TRUSTED_PROXIES = [
    "172.16.0.0/12",   # covers Docker default bridge + deploy_default
]

data = json.loads(SRC.read_text())

# 1. Strip unknown governance keys
stripped_meta = []
if isinstance(data.get("meta"), dict):
    for k in list(UNKNOWN_META_KEYS):
        if k in data["meta"]:
            data["meta"].pop(k); stripped_meta.append(f"meta.{k}")

stripped_agent = 0
agents = data.get("agents") or {}
agent_list = agents.get("list") if isinstance(agents, dict) else None
if isinstance(agent_list, list):
    for agent in agent_list:
        if not isinstance(agent, dict): continue
        for k in list(UNKNOWN_AGENT_KEYS):
            if k in agent:
                agent.pop(k); stripped_agent += 1

# 2. Force single-node topology
gw = data.setdefault("gateway", {})
prev_mode = gw.get("mode")
gw["mode"] = "local"
gw["bind"] = "auto"

# 3. Inject controlUi.allowedOrigins
cui = gw.setdefault("controlUi", {})
existing_origins = cui.get("allowedOrigins") or []
cui["allowedOrigins"] = sorted(set(existing_origins) | set(ALLOWED_ORIGINS))

# 4. Extend trustedProxies (preserve existing loopback CIDRs)
tp_existing = gw.get("trustedProxies") or []
gw["trustedProxies"] = sorted(set(tp_existing) | set(EXTRA_TRUSTED_PROXIES))

DST.parent.mkdir(parents=True, exist_ok=True)
DST.write_text(json.dumps(data, indent=2) + "\n")

print(f"src={SRC} ({SRC.stat().st_size} bytes)")
print(f"dst={DST} ({DST.stat().st_size} bytes)")
print(f"stripped meta keys     : {stripped_meta}")
print(f"stripped agent keys    : {stripped_agent} occurrences")
print(f"gateway.mode           : {prev_mode!r} -> {gw['mode']!r}")
print(f"gateway.bind           : {gw['bind']!r}")
print(f"controlUi.allowedOrigins: {cui['allowedOrigins']}")
print(f"gateway.trustedProxies : {gw['trustedProxies']}")
