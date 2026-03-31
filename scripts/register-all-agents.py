#!/usr/bin/env python3
"""
Register runtime agents from config/agents_config.json into:
  - config/openclaw.json (Windows template)
  - config/openclaw.prod.json (Linux template)

Model mapping is derived from llm_model values and rollout mode.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENTS_CONFIG = ROOT / "config" / "agents_config.json"
OPENCLAW_DEV = ROOT / "config" / "openclaw.json"
OPENCLAW_PROD = ROOT / "config" / "openclaw.prod.json"

ANTHROPIC_MODEL_MAP = {
    "claude-opus-4": "anthropic/claude-opus-4-5",
    "claude-sonnet-4.5": "anthropic/claude-sonnet-4-5",
    "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
}

LEGACY_STABLE_MODEL_MAP = {
    "claude-opus-4": "openai/gpt-5.3-codex",
    "claude-sonnet-4.5": "openai/gpt-5.3-codex",
    "claude-haiku-4-5": "openai/gpt-4o-mini",
}

CANARY_AGENT_IDS = {
    "main",
    "marketing",
    "sales",
    "support",
    "d1_ceo",
    "d1_cto",
    "shared_runtime_ops",
    "d8_saas_director",
    "d9_store_director",
    "biz_01_pod_lead",
}

RUNTIME_FOUNDATION_LLM = {
    "main": "claude-sonnet-4.5",
    "marketing": "claude-sonnet-4.5",
    "sales": "claude-sonnet-4.5",
    "support": "claude-sonnet-4.5",
}

DEV_WORKSPACE_TMPL = "C:\\Users\\JeremiahVanWagner\\.openclaw\\workspaces\\{agent_id}"
PROD_WORKSPACE_TMPL = "/opt/openclaw/workspaces/{agent_id}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register runtime agents into OpenClaw templates")
    parser.add_argument(
        "--rollout",
        choices=["full", "canary"],
        default="full",
        help="Model routing policy to apply while writing configs",
    )
    return parser.parse_args()


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def resolve_llm_model(agent: dict) -> str:
    agent_id = agent.get("agent_id")
    llm_model = agent.get("llm_model")
    if llm_model:
        return llm_model
    if agent_id in RUNTIME_FOUNDATION_LLM:
        return RUNTIME_FOUNDATION_LLM[agent_id]
    raise ValueError(f"Missing llm_model for agent '{agent_id}'")


def resolve_runtime_model(agent_id: str, llm_model: str, rollout: str) -> str:
    if llm_model not in ANTHROPIC_MODEL_MAP:
        allowed = ", ".join(sorted(ANTHROPIC_MODEL_MAP.keys()))
        raise ValueError(
            f"Unsupported llm_model '{llm_model}' for agent '{agent_id}'. Allowed: {allowed}"
        )

    if rollout == "full":
        return ANTHROPIC_MODEL_MAP[llm_model]

    if rollout == "canary":
        if agent_id in CANARY_AGENT_IDS:
            return ANTHROPIC_MODEL_MAP[llm_model]
        return LEGACY_STABLE_MODEL_MAP[llm_model]

    raise ValueError(f"Unsupported rollout mode: {rollout}")


def build_models_catalog(rollout: str) -> dict:
    models = set(ANTHROPIC_MODEL_MAP.values())
    if rollout == "canary":
        models.update(LEGACY_STABLE_MODEL_MAP.values())
    return {model: {} for model in sorted(models)}


def build_agent_entry(agent: dict, workspace_tmpl: str, rollout: str) -> dict:
    agent_id = agent["agent_id"]
    display_name = agent.get("display_name", agent_id)
    llm_model = resolve_llm_model(agent)
    model = resolve_runtime_model(agent_id, llm_model, rollout)

    entry = {
        "id": agent_id,
        "name": display_name,
        "workspace": workspace_tmpl.format(agent_id=agent_id),
        "model": model,
    }

    if agent.get("business_scope"):
        entry["business_scope"] = agent["business_scope"]
    if agent.get("ghl_token_group"):
        entry["ghl_token_group"] = agent["ghl_token_group"]
    if agent.get("operational_boundaries"):
        entry["operational_boundaries"] = agent["operational_boundaries"]

    return entry


def merge_agents(openclaw_path: Path, agents_config: dict, workspace_tmpl: str, rollout: str):
    config = load_json(openclaw_path)
    existing_list = config.get("agents", {}).get("list", [])
    existing_by_id = {entry.get("id"): entry for entry in existing_list if entry.get("id")}
    config_agents = {agent["agent_id"]: agent for agent in agents_config.get("agents", [])}

    runtime_foundation = {
        "main": {
            "agent_id": "main",
            "display_name": "main",
            "llm_model": RUNTIME_FOUNDATION_LLM["main"],
        },
        "marketing": {
            "agent_id": "marketing",
            "display_name": "marketing",
            "llm_model": RUNTIME_FOUNDATION_LLM["marketing"],
        },
        "sales": {
            "agent_id": "sales",
            "display_name": "sales",
            "llm_model": RUNTIME_FOUNDATION_LLM["sales"],
        },
        "support": {
            "agent_id": "support",
            "display_name": "support",
            "llm_model": RUNTIME_FOUNDATION_LLM["support"],
        },
    }

    source_agents = {**runtime_foundation, **config_agents}
    next_list = []

    for agent_id, source in source_agents.items():
        generated = build_agent_entry(source, workspace_tmpl, rollout)
        existing = existing_by_id.get(agent_id, {})
        next_list.append({**existing, **generated})

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

    def sort_key(entry: dict):
        aid = entry["id"]
        if aid in config_agents:
            org = config_agents[aid].get("org_unit", "zzz")
            return (div_rank.get(org, 99), aid)
        if aid in ("main", "marketing", "sales", "support"):
            return (-1, aid)
        return (100, aid)

    next_list.sort(key=sort_key)

    defaults = config.setdefault("agents", {}).setdefault("defaults", {})
    defaults_model = defaults.setdefault("model", {})
    defaults_model["primary"] = next(
        (a["model"] for a in next_list if a["id"] == "main"),
        "anthropic/claude-sonnet-4-5",
    )
    defaults["models"] = build_models_catalog(rollout)

    config.setdefault("meta", {})
    config["meta"]["lastTouchedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    config["meta"]["rollout_mode"] = rollout
    config["meta"]["rollout_generated_by"] = "scripts/register-all-agents.py"
    config["agents"]["list"] = next_list

    save_json(openclaw_path, config)
    return len(next_list)


def validate(openclaw_path: Path, agents_config: dict):
    config = load_json(openclaw_path)
    agent_list = config.get("agents", {}).get("list", [])
    agent_ids = [a.get("id") for a in agent_list if a.get("id")]
    config_ids = {a["agent_id"] for a in agents_config.get("agents", [])}

    required_runtime_ids = {"main", "marketing", "sales", "support", *config_ids}
    missing = required_runtime_ids - set(agent_ids)
    if missing:
        print(f"  WARNING: Missing runtime agents: {sorted(missing)}")
        return False

    if len(agent_ids) != len(set(agent_ids)):
        print("  WARNING: Duplicate agent IDs found")
        return False

    for agent in agent_list:
        if not agent.get("id"):
            print(f"  WARNING: Invalid agent entry without id: {agent}")
            return False
        if not agent.get("model"):
            print(f"  WARNING: Agent '{agent['id']}' missing model")
            return False

    print(f"  OK: {len(agent_ids)} agents, no duplicates, all have model")
    return True


def main():
    args = parse_args()
    print("Loading config/agents_config.json...")
    agents_config = load_json(AGENTS_CONFIG)
    print(f"  Source agents: {len(agents_config.get('agents', []))}")
    print(f"  Rollout mode: {args.rollout}")

    print(f"\nProcessing {OPENCLAW_DEV.name}...")
    count_dev = merge_agents(OPENCLAW_DEV, agents_config, DEV_WORKSPACE_TMPL, args.rollout)
    print(f"  Wrote {count_dev} runtime agents")
    ok_dev = validate(OPENCLAW_DEV, agents_config)

    print(f"\nProcessing {OPENCLAW_PROD.name}...")
    count_prod = merge_agents(OPENCLAW_PROD, agents_config, PROD_WORKSPACE_TMPL, args.rollout)
    print(f"  Wrote {count_prod} runtime agents")
    ok_prod = validate(OPENCLAW_PROD, agents_config)

    if ok_dev and ok_prod:
        print("\nOK Runtime registration completed.")
        return

    print("\nERROR Validation failed. Check warnings above.")
    sys.exit(1)


if __name__ == "__main__":
    main()
