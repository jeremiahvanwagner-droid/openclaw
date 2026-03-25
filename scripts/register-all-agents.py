#!/usr/bin/env python3
"""
Register all 103 agents from agents_config.json into openclaw.json and openclaw.prod.json.

Current state: 41 agents in runtime configs, 103 in agents_config.json.
This script adds the 62 missing agents with proper fields and scope data.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENTS_CONFIG = ROOT / "config" / "agents_config.json"
OPENCLAW_DEV = ROOT / "config" / "openclaw.json"
OPENCLAW_PROD = ROOT / "config" / "openclaw.prod.json"

# Model mapping: agents_config llm_model -> openclaw model string
MODEL_MAP = {
    "claude-opus-4": "openai/gpt-5.3-codex",       # strategic tier -> top model
    "claude-sonnet-4.5": "openai/gpt-5.3-codex",   # content tier -> top model
    "gpt-4o": "openai/gpt-5.3-codex",              # general tier
    "gpt-4o-mini": "openai/gpt-4o-mini",           # routine tier
}

# Dev workspace path template (Windows)
DEV_WORKSPACE_TMPL = "C:\\Users\\JeremiahVanWagner\\.openclaw\\workspaces\\{agent_id}"
# Prod workspace path template (Linux)
PROD_WORKSPACE_TMPL = "/opt/openclaw/workspaces/{agent_id}"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def build_agent_entry(agent, workspace_tmpl):
    """Build an openclaw.json agent entry from an agents_config.json record."""
    agent_id = agent["agent_id"]
    display_name = agent["display_name"]
    llm_model = agent.get("llm_model", "gpt-4o")
    model = MODEL_MAP.get(llm_model, "openai/gpt-5.3-codex")

    entry = {
        "id": agent_id,
        "name": display_name,
        "workspace": workspace_tmpl.format(agent_id=agent_id),
        "model": model,
    }

    # Add scope fields if present
    if agent.get("business_scope"):
        entry["business_scope"] = agent["business_scope"]
    if agent.get("ghl_token_group"):
        entry["ghl_token_group"] = agent["ghl_token_group"]
    if agent.get("operational_boundaries"):
        entry["operational_boundaries"] = agent["operational_boundaries"]

    return entry


def merge_agents(openclaw_path, agents_config, workspace_tmpl):
    """Merge missing agents into an openclaw config file."""
    config = load_json(openclaw_path)
    agent_list = config["agents"]["list"]

    # Build set of existing IDs
    existing_ids = {a["id"] for a in agent_list}

    # Build lookup from agents_config
    config_agents = {a["agent_id"]: a for a in agents_config["agents"]}

    # Also update existing agents that are missing scope fields
    updated_count = 0
    for existing_entry in agent_list:
        aid = existing_entry["id"]
        if aid in config_agents:
            src = config_agents[aid]
            # Add scope fields if missing from existing entry but present in source
            changed = False
            if src.get("business_scope") and "business_scope" not in existing_entry:
                existing_entry["business_scope"] = src["business_scope"]
                changed = True
            if src.get("ghl_token_group") and "ghl_token_group" not in existing_entry:
                existing_entry["ghl_token_group"] = src["ghl_token_group"]
                changed = True
            if src.get("operational_boundaries") and "operational_boundaries" not in existing_entry:
                existing_entry["operational_boundaries"] = src["operational_boundaries"]
                changed = True
            if changed:
                updated_count += 1

    # Determine division ordering for sorted insertion
    division_order = [
        "division_1_core_operations",
        "division_2_ecommerce",
        "division_3_consulting",
        "division_4_coaching",
        "division_5_publishing",
        "division_6_nonprofit",
        "division_7_shared_services",
        "division_8_saas_operations",
        "division_9_online_store",
    ]
    div_rank = {d: i for i, d in enumerate(division_order)}

    # Collect missing agents
    missing = []
    for agent_id, agent in config_agents.items():
        if agent_id not in existing_ids:
            entry = build_agent_entry(agent, workspace_tmpl)
            org_unit = agent.get("org_unit", "division_9_online_store")
            missing.append((div_rank.get(org_unit, 99), agent_id, entry))

    # Sort missing by division, then by agent_id
    missing.sort(key=lambda x: (x[0], x[1]))

    # Add missing agents to the list
    for _, _, entry in missing:
        agent_list.append(entry)

    # Re-sort the entire list by division grouping
    # Build a lookup for division rank from agents_config
    def agent_sort_key(entry):
        aid = entry["id"]
        if aid in config_agents:
            org = config_agents[aid].get("org_unit", "zzz")
            return (div_rank.get(org, 99), aid)
        # Original agents without config entry keep existing position
        return (-1, aid)

    agent_list.sort(key=agent_sort_key)

    config["agents"]["list"] = agent_list

    save_json(openclaw_path, config)
    return len(missing), updated_count


def validate(openclaw_path, agents_config):
    """Validate the merged config has all 103 agents_config agents + any legacy agents."""
    config = load_json(openclaw_path)
    agent_list = config["agents"]["list"]
    agent_ids = [a["id"] for a in agent_list]
    config_ids = {a["agent_id"] for a in agents_config["agents"]}
    legacy_ids = {aid for aid in agent_ids if aid not in config_ids}

    # Check all 103 config agents are present
    missing = config_ids - set(agent_ids)
    if missing:
        print(f"  WARNING: Missing agents from agents_config: {missing}")
        return False

    actual = len(agent_ids)
    expected = len(config_ids) + len(legacy_ids)
    if actual != expected:
        print(f"  WARNING: Expected {expected} agents (103 + {len(legacy_ids)} legacy), got {actual}")
        return False

    if legacy_ids:
        print(f"  Legacy agents retained: {sorted(legacy_ids)}")

    # Check duplicates
    dupes = [aid for aid in agent_ids if agent_ids.count(aid) > 1]
    if dupes:
        print(f"  WARNING: Duplicate IDs: {set(dupes)}")
        return False

    # Check required fields
    for agent in agent_list:
        if "id" not in agent:
            print(f"  WARNING: Agent missing 'id': {agent}")
            return False
        if agent["id"] != "main" and "model" not in agent:
            print(f"  WARNING: Agent '{agent['id']}' missing 'model'")
            return False

    print(f"  OK: {actual} agents, no duplicates, all have required fields")
    return True


def main():
    print("Loading agents_config.json...")
    agents_config = load_json(AGENTS_CONFIG)
    total = len(agents_config["agents"])
    print(f"  Source: {total} agents")

    # Process dev config
    print(f"\nProcessing {OPENCLAW_DEV.name}...")
    added_dev, updated_dev = merge_agents(OPENCLAW_DEV, agents_config, DEV_WORKSPACE_TMPL)
    print(f"  Added {added_dev} agents, updated {updated_dev} existing")
    ok_dev = validate(OPENCLAW_DEV, agents_config)

    # Process prod config
    print(f"\nProcessing {OPENCLAW_PROD.name}...")
    added_prod, updated_prod = merge_agents(OPENCLAW_PROD, agents_config, PROD_WORKSPACE_TMPL)
    print(f"  Added {added_prod} agents, updated {updated_prod} existing")
    ok_prod = validate(OPENCLAW_PROD, agents_config)

    if ok_dev and ok_prod:
        print("\n✅ All 103 agents registered in both configs.")
    else:
        print("\n❌ Validation failed. Check warnings above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
