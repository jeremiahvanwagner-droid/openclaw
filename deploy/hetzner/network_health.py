#!/usr/bin/env python3
"""
OpenClaw Script-Based Network Health Check

No LLM model turn required. Queries Supabase for:
  - Supervisor heartbeat staleness
  - agent_metrics table for error rates/response times
  - Pod-level health aggregation

Reports 'observability_degraded' (not universal failure) when metrics
data is unavailable.

Usage:
    python3 network_health.py
    python3 network_health.py --pod biz_01
    python3 network_health.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Any


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "7737707872")

HEARTBEAT_STALE_MINUTES = 30
ERROR_RATE_THRESHOLD = 0.05  # 5%


def supabase_request(
    path: str,
    method: str = "GET",
    body: dict | list | None = None,
    params: dict[str, str] | None = None,
) -> Any:
    """Make an authenticated request to Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def supabase_rpc(fn_name: str, params: dict | None = None) -> Any:
    """Call a Supabase RPC function."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps(params or {}).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def fetch_all_agents() -> list[dict]:
    """Fetch all agents with their classification."""
    return supabase_request(
        "agents",
        params={
            "select": "agent_id,display_name,pod_id,status,agent_class,heartbeat_policy,criticality,last_heartbeat_at,last_run_at,last_run_status",
            "order": "pod_id,agent_class",
        },
    )


def fetch_recent_metrics(since_minutes: int = 60) -> list[dict]:
    """Fetch agent_metrics from the last N minutes."""
    since = (datetime.now(timezone.utc) - timedelta(minutes=since_minutes)).isoformat()
    return supabase_request(
        "agent_metrics",
        params={
            "select": "agent_id,metric_type,metric_value,recorded_at",
            "recorded_at": f"gte.{since}",
            "order": "recorded_at.desc",
        },
    )


def assess_supervisor_health(agents: list[dict]) -> dict:
    """Assess heartbeat health for supervisors only."""
    now = datetime.now(timezone.utc)
    supervisors = [a for a in agents if a.get("agent_class") == "supervisor"]
    healthy = []
    stale = []

    for s in supervisors:
        last_hb = s.get("last_heartbeat_at")
        if not last_hb:
            stale.append({**s, "stale_minutes": None, "reason": "no_heartbeat"})
            continue

        last_hb_dt = datetime.fromisoformat(last_hb.replace("Z", "+00:00"))
        minutes = (now - last_hb_dt).total_seconds() / 60

        if minutes > HEARTBEAT_STALE_MINUTES:
            stale.append({**s, "stale_minutes": round(minutes, 1), "reason": "threshold_exceeded"})
        else:
            healthy.append(s)

    return {"healthy": healthy, "stale": stale}


def assess_metrics_health(metrics: list[dict]) -> dict:
    """Assess metrics availability and error rates."""
    if not metrics:
        return {
            "status": "observability_degraded",
            "reason": "agent_metrics returned 0 rows — telemetry ingestion may be down",
            "error_agents": [],
            "metrics_count": 0,
        }

    # Group by agent and compute error rates
    by_agent: dict[str, list] = {}
    for m in metrics:
        agent = m["agent_id"]
        by_agent.setdefault(agent, []).append(m)

    error_agents = []
    for agent_id, agent_metrics in by_agent.items():
        errors = [m for m in agent_metrics if m["metric_type"] == "error"]
        total = [m for m in agent_metrics if m["metric_type"] in ("success", "error")]
        if total:
            error_rate = len(errors) / len(total)
            if error_rate > ERROR_RATE_THRESHOLD:
                error_agents.append({"agent_id": agent_id, "error_rate": round(error_rate, 3)})

    return {
        "status": "healthy" if not error_agents else "degraded",
        "reason": None if not error_agents else f"{len(error_agents)} agent(s) above {ERROR_RATE_THRESHOLD*100}% error rate",
        "error_agents": error_agents,
        "metrics_count": len(metrics),
    }


def assess_pod_health(agents: list[dict]) -> dict[str, dict]:
    """Aggregate health by pod."""
    pods: dict[str, dict] = {}

    for agent in agents:
        pod = agent.get("pod_id") or "unassigned"
        if pod not in pods:
            pods[pod] = {"total": 0, "active": 0, "degraded": 0, "error": 0, "quarantined": 0, "pod_lead_status": None}

        pods[pod]["total"] += 1
        status = agent.get("status", "inactive")
        if status == "active":
            pods[pod]["active"] += 1
        elif status == "degraded":
            pods[pod]["degraded"] += 1
        elif status == "error":
            pods[pod]["error"] += 1
        elif status == "quarantined":
            pods[pod]["quarantined"] += 1

        if agent.get("agent_class") == "supervisor":
            pods[pod]["pod_lead_status"] = status

    return pods


def write_health_snapshot(overall_status: str, summary: dict) -> None:
    """Write a network health snapshot."""
    supabase_request(
        "health_snapshots",
        method="POST",
        body={
            "snapshot_type": "network",
            "status": overall_status,
            "summary": summary,
            "breaches": summary.get("stale_supervisors", []),
        },
    )


def send_telegram_alert(summary: dict) -> None:
    """Send Telegram alert for critical health issues."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return

    lines = ["⚠️ *NETWORK HEALTH ALERT*\n"]

    if summary.get("supervisor_health", {}).get("stale"):
        lines.append("*Stale Supervisors:*")
        for s in summary["supervisor_health"]["stale"]:
            stale = f"{s['stale_minutes']}m" if s.get("stale_minutes") else "never"
            lines.append(f"  🔴 `{s['agent_id']}` — {stale}")

    if summary.get("metrics_health", {}).get("status") == "observability_degraded":
        lines.append(f"\n⚠️ *Observability Degraded*: {summary['metrics_health']['reason']}")

    if summary.get("metrics_health", {}).get("error_agents"):
        lines.append("\n*High Error Rate Agents:*")
        for ea in summary["metrics_health"]["error_agents"]:
            lines.append(f"  🟡 `{ea['agent_id']}` — {ea['error_rate']*100:.1f}% errors")

    lines.append(f"\nOverall: {summary.get('overall_status', 'unknown')}")
    lines.append("Source: network\\_health.py (script-based, no LLM)")

    message = "\n".join(lines)
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"}
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=10):
            print(f"Telegram alert sent")
    except urllib.error.URLError as e:
        print(f"WARN: Telegram alert failed: {e}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClaw network health check (script-based)")
    parser.add_argument("--pod", type=str, help="Check a specific pod only")
    parser.add_argument("--dry-run", action="store_true", help="Check but don't write snapshots or alert")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    # 1. Fetch agents
    agents = fetch_all_agents()
    print(f"Fetched {len(agents)} agents from registry")

    if args.pod:
        agents = [a for a in agents if a.get("pod_id") == args.pod]
        print(f"  Filtered to {len(agents)} agents in pod {args.pod}")

    # 2. Supervisor heartbeat health
    supervisor_health = assess_supervisor_health(agents)
    print(f"Supervisors: {len(supervisor_health['healthy'])} healthy, {len(supervisor_health['stale'])} stale")

    # 3. Metrics health (observability check)
    metrics = fetch_recent_metrics()
    metrics_health = assess_metrics_health(metrics)
    print(f"Metrics: {metrics_health['status']} ({metrics_health['metrics_count']} rows)")

    # 4. Pod health
    pod_health = assess_pod_health(agents)
    for pod_id, ph in pod_health.items():
        print(f"  Pod {pod_id}: {ph['active']}/{ph['total']} active, lead={ph['pod_lead_status']}")

    # 5. Determine overall status
    has_stale_supervisors = bool(supervisor_health["stale"])
    is_observability_degraded = metrics_health["status"] == "observability_degraded"
    has_error_agents = bool(metrics_health.get("error_agents"))

    if has_stale_supervisors:
        overall_status = "critical"
    elif is_observability_degraded:
        overall_status = "observability_degraded"
    elif has_error_agents:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    summary = {
        "overall_status": overall_status,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "total_agents": len(agents),
        "supervisor_health": {
            "healthy_count": len(supervisor_health["healthy"]),
            "stale": [
                {"agent_id": s["agent_id"], "pod_id": s.get("pod_id"), "stale_minutes": s.get("stale_minutes"), "reason": s.get("reason")}
                for s in supervisor_health["stale"]
            ],
        },
        "metrics_health": metrics_health,
        "pod_health": pod_health,
    }

    print(f"\nOverall status: {overall_status}")

    if args.dry_run:
        print("DRY RUN: Skipping snapshot write and alerts")
        print(json.dumps(summary, indent=2))
        return

    # 6. Write health snapshot
    write_health_snapshot(overall_status, summary)

    # 7. Alert if not healthy
    if overall_status != "healthy":
        send_telegram_alert(summary)


if __name__ == "__main__":
    main()
