#!/usr/bin/env python3
"""
Phase 9 Patch Script — Ollama Cutover (Phase 9.1 of phased cutover)

What this script does, in order:
  1. For each of 15 per-agent models.json files:
       a. Ensure an `ollama` provider exists with qwen3.6:latest + qwen3:8b.
       b. Purge `kimi-k2.6:cloud` from any `ollama.models[]` array.
       c. Purge `moonshotai/kimi-k2.6` from any `openrouter.models[]` array.
       d. Leave anthropic / openrouter / arcee / codex / openai-codex providers otherwise intact.
  2. For each `agents_config.json` (root + /config/):
       a. Remap every agent whose `llm_model` is `claude-haiku-4-5` to `qwen3:8b`.
       b. Leave `claude-sonnet-4.5` and `claude-opus-4` bindings unchanged.

This script is IDEMPOTENT — running it twice is a no-op the second time.

CANONICAL NOTE (A5, 2026-07-04): config/agents_config.json is the canonical
copy; the root agents_config.json is a generated mirror. This script writes
both, which keeps them converged — but any future edit must treat config/ as
the source of truth. Drift gate: node scripts/sync-canonical-config.mjs --check
"""
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

OLLAMA_PROVIDER_BLOCK = {
    "api": "ollama",
    "apiKey": "ollama-local",
    "baseUrl": "http://127.0.0.1:11434/v1",
    "models": [
        {
            "id": "qwen3.6:latest",
            "name": "Qwen 3.6 36B MoE (workhorse)",
            "reasoning": True,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 131072,
            "maxTokens": 32768
        },
        {
            "id": "qwen3:8b",
            "name": "Qwen3 8B (fast)",
            "reasoning": False,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 32768,
            "maxTokens": 8192
        }
    ]
}

AGENT_DIRS = [
    "d1_ceo", "d8_compliance_auditor", "d8_content_ops", "d8_customer_success",
    "d8_integration_engineer", "d8_saas_director", "main", "marketing", "sales",
    "shared_data_control", "shared_exec_orchestrator", "shared_master_orchestrator",
    "shared_runtime_ops", "store", "support",
]

KIMI_IDS_TO_PURGE = {"kimi-k2.6:cloud", "kimi-k2.5:cloud", "moonshotai/kimi-k2.6"}


def _model_id(m):
    return m if isinstance(m, str) else m.get("id")


def _purge_kimi(models):
    if not isinstance(models, list):
        return models, 0
    before = len(models)
    cleaned = [m for m in models if _model_id(m) not in KIMI_IDS_TO_PURGE]
    return cleaned, before - len(cleaned)


def patch_agent_models_json(path: Path):
    data = json.loads(path.read_text())
    providers = data.setdefault("providers", {})

    changes = []

    # 1. Add/replace ollama provider
    existing = providers.get("ollama")
    if existing != OLLAMA_PROVIDER_BLOCK:
        providers["ollama"] = OLLAMA_PROVIDER_BLOCK
        changes.append("set ollama provider → qwen3.6 + qwen3:8b")

    # 2. Purge kimi from any provider's models list
    for pname, pinfo in providers.items():
        if pname == "ollama":
            # Already set to canonical block above — skip
            continue
        if isinstance(pinfo, dict) and "models" in pinfo:
            cleaned, removed = _purge_kimi(pinfo["models"])
            if removed:
                pinfo["models"] = cleaned
                changes.append(f"purged {removed} kimi entries from {pname}")

    path.write_text(json.dumps(data, indent=2) + "\n")
    return changes


def patch_agents_config(path: Path):
    data = json.loads(path.read_text())
    remapped = []
    for agent in data.get("agents", []):
        if agent.get("llm_model") == "claude-haiku-4-5":
            agent["llm_model"] = "qwen3:8b"
            remapped.append(agent["agent_id"])
    # Use sort_keys=False to preserve ordering already in file
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return remapped


def main():
    summary = {"agent_models_json": {}, "agents_config": {}}

    for ad in AGENT_DIRS:
        p = REPO / "agents" / ad / "agent" / "models.json"
        if not p.exists():
            print(f"WARN: missing {p}", file=sys.stderr)
            continue
        changes = patch_agent_models_json(p)
        summary["agent_models_json"][ad] = changes or ["no change needed"]

    for cf in ["agents_config.json", "config/agents_config.json"]:
        p = REPO / cf
        if not p.exists():
            print(f"WARN: missing {p}", file=sys.stderr)
            continue
        remapped = patch_agents_config(p)
        summary["agents_config"][cf] = {
            "haiku_remapped_count": len(remapped),
            "agents": remapped,
        }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
