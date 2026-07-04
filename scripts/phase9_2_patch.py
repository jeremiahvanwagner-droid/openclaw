#!/usr/bin/env python3
"""
Phase 9.2 Patch Script — qwen3.5:27b cutover (interim Haiku-tier replacement)

Context:
  Phase 9.1 (commit 8aa64c5) had remapped 22 former Haiku-bound cron-firing
  agents to `qwen3:8b`. Operator review identified qwen3:8b as undersized for
  SLA/sentinel/classification workloads (memory note feedback_ollama_model_tier).
  The doctrinal target is `qwen3.6:latest` (36B MoE), but qwen3.6 requires
  a 32GB VPS upgrade not yet planned. Interim target is `qwen3.5:27b` — the
  closest reasoning-capable local model that fits current VPS RAM.

  Phase 9.2 also closes a config-drift issue: pre-existing per-agent
  models.json files had `baseUrl: http://127.0.0.1:11435/v1` (wrong port).
  Standardize to `http://127.0.0.1:11434` matching openclaw.json + the
  deployed VPS canon.

What this script does, in order:
  1. For each of 15 per-agent models.json files, replace the `ollama` provider
     block with the canonical Phase-9.2 catalog: qwen3.6:latest (workhorse,
     dormant until 32GB upgrade), qwen3.5:27b (active Haiku-tier), qwen3:14b
     (catalog reserve), qwen3:8b (fast/light catalog reserve).
  2. For each `agents_config.json` (root + /config/), remap every agent whose
     `llm_model` is `qwen3:8b` to `qwen3.5:27b`. Sonnet and Opus bindings
     are untouched (Phase 9.3+ scope).

This script is IDEMPOTENT — running it twice is a no-op the second time.

CANONICAL NOTE (A5, 2026-07-04): config/agents_config.json is the canonical
copy; the root agents_config.json is a generated mirror. This script writes
both, which keeps them converged — but any future edit must treat config/ as
the source of truth. Drift gate: node scripts/sync-canonical-config.mjs --check
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

OLLAMA_PROVIDER_BLOCK = {
    "api": "ollama",
    "apiKey": "ollama-local",
    "baseUrl": "http://127.0.0.1:11434",
    "models": [
        {
            "id": "qwen3.6:latest",
            "name": "Qwen 3.6 36B MoE (workhorse — dormant until 32GB VPS upgrade)",
            "reasoning": True,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 131072,
            "maxTokens": 32768
        },
        {
            "id": "qwen3.5:27b",
            "name": "Qwen 3.5 27B (reserve — requires >15 GiB VPS RAM, dormant)",
            "reasoning": True,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 131072,
            "maxTokens": 32768
        },
        {
            "id": "qwen3:14b",
            "name": "Qwen3 14B (active Haiku-tier — fits 15 GiB VPS, 19s cold load)",
            "reasoning": True,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 32768,
            "maxTokens": 16384
        },
        {
            "id": "qwen3:8b",
            "name": "Qwen3 8B (fast — catalog reserve)",
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

# Note: Initial Phase 9.2 attempt targeted qwen3.5:27b, but VPS smoke test
# (2026-05-14, 15 GiB RAM) showed cold-load + reasoning at 1m56s — unusable
# for cron preflight. qwen3:14b at 10 GB loaded in 19s with 5 GiB headroom.
# Downshift recorded in REGGIE-STATE audit 2026-05-14-003.
OLD_TAG = "qwen3.5:27b"
NEW_TAG = "qwen3:14b"


def patch_agent_models_json(path: Path):
    data = json.loads(path.read_text())
    providers = data.setdefault("providers", {})

    changes = []

    existing = providers.get("ollama")
    if existing != OLLAMA_PROVIDER_BLOCK:
        providers["ollama"] = OLLAMA_PROVIDER_BLOCK
        changes.append("set ollama provider -> qwen3.6 + qwen3.5:27b + qwen3:14b + qwen3:8b @ 11434")

    path.write_text(json.dumps(data, indent=2) + "\n")
    return changes


def patch_agents_config(path: Path):
    data = json.loads(path.read_text())
    remapped = []
    for agent in data.get("agents", []):
        if agent.get("llm_model") == OLD_TAG:
            agent["llm_model"] = NEW_TAG
            remapped.append(agent.get("agent_id", "<no-id>"))
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return remapped


def run_allowlist_mode(allowlist_path: Path):
    """Advancement 6 (Phase 9.2): remap ONLY the CVO-approved agents.

    Allowlist shape (docs/phases/sonnet-audit-*-allowlist.json):
      {
        "approved_by": "<name — REQUIRED, patcher refuses if empty>",
        "approved_date": "<YYYY-MM-DD — REQUIRED>",
        "from": "claude-sonnet-4.5",
        "to": "qwen3:14b",
        "agents": ["agent_id", ...]
      }

    Writes ONLY config/agents_config.json (canonical, per A5); refresh the
    tracked root mirror with `node scripts/sync-canonical-config.mjs --write`
    afterwards. Idempotent: agents already on `to` are counted as no-ops.
    """
    spec = json.loads(allowlist_path.read_text(encoding="utf-8"))
    if not spec.get("approved_by") or not spec.get("approved_date"):
        sys.exit(
            f"REFUSED: {allowlist_path} has empty approved_by/approved_date — "
            "the CVO review gate (Advancement 6 brief step 2) has not been passed."
        )
    from_tag = spec.get("from", "claude-sonnet-4.5")
    to_tag = spec.get("to", NEW_TAG)
    wanted = list(dict.fromkeys(spec.get("agents", [])))
    if not wanted:
        sys.exit("REFUSED: allowlist has no agents.")

    canon = REPO / "config" / "agents_config.json"
    data = json.loads(canon.read_text(encoding="utf-8"))
    by_id = {a.get("agent_id"): a for a in data.get("agents", [])}

    missing = [aid for aid in wanted if aid not in by_id]
    if missing:
        sys.exit(f"REFUSED: allowlist agents not in config: {missing}")
    wrong_tag = [
        aid for aid in wanted
        if by_id[aid].get("llm_model") not in (from_tag, to_tag)
    ]
    if wrong_tag:
        sys.exit(
            f"REFUSED: agents not on '{from_tag}' (or already '{to_tag}'): "
            f"{ {aid: by_id[aid].get('llm_model') for aid in wrong_tag} }"
        )

    remapped, noop = [], []
    for aid in wanted:
        if by_id[aid]["llm_model"] == to_tag:
            noop.append(aid)
        else:
            by_id[aid]["llm_model"] = to_tag
            remapped.append(aid)

    canon.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": "allowlist",
        "allowlist": str(allowlist_path),
        "approved_by": spec["approved_by"],
        "remapped": remapped,
        "already_on_target": noop,
        "next": "node scripts/sync-canonical-config.mjs --write  (refresh mirrors)",
    }, indent=2))


def main():
    if "--agents" in sys.argv:
        idx = sys.argv.index("--agents")
        try:
            allowlist = Path(sys.argv[idx + 1])
        except IndexError:
            sys.exit("usage: phase9_2_patch.py --agents <allowlist.json>")
        run_allowlist_mode(allowlist)
        return

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
            f"{OLD_TAG}_to_{NEW_TAG}_count": len(remapped),
            "agents": remapped,
        }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
