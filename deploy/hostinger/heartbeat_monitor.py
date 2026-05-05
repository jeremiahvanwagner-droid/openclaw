#!/usr/bin/env python3
"""
OpenClaw Script-Based Heartbeat Monitor

No LLM model turn required. Directly queries Supabase for agents where
heartbeat_policy = 'always_on', compares last_heartbeat_at against threshold,
and emits incidents to agent_events table. Sends Telegram alert only for
actual breaches of always-on supervisors.

Usage:
    python3 heartbeat_monitor.py
    python3 heartbeat_monitor.py --threshold-minutes 30
    python3 heartbeat_monitor.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "7737707872")

DEFAULT_THRESHOLD_MINUTES = 30


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


def fetch_always_on_agents() -> list[dict]:
    """Fetch all agents with heartbeat_policy = 'always_on'."""
    return supabase_request(
        "agents",
        params={
            "select": "agent_id,display_name,pod_id,status,last_heartbeat_at,agent_class",
            "heartbeat_policy": "eq.always_on",
        },
    )


def check_breaches(agents: list[dict], threshold_minutes: int) -> list[dict]:
    """Check which agents have breached the heartbeat threshold."""
    now = datetime.now(timezone.utc)
    breaches = []

    for agent in agents:
        last_hb = agent.get("last_heartbeat_at")
        if not last_hb:
            breaches.append({
                "agent_id": agent["agent_id"],
                "pod_id": agent.get("pod_id"),
                "status": agent.get("status", "unknown"),
                "reason": "no_heartbeat_recorded",
                "stale_minutes": None,
            })
            continue

        last_hb_dt = datetime.fromisoformat(last_hb.replace("Z", "+00:00"))
        stale_minutes = (now - last_hb_dt).total_seconds() / 60

        if stale_minutes > threshold_minutes:
            breaches.append({
                "agent_id": agent["agent_id"],
                "pod_id": agent.get("pod_id"),
                "status": agent.get("status", "unknown"),
                "reason": "threshold_exceeded",
                "stale_minutes": round(stale_minutes, 1),
                "last_heartbeat": last_hb,
            })

    return breaches


def emit_incident(breach: dict) -> None:
    """Write a heartbeat_breach incident to agent_events."""
    supabase_request(
        "agent_events",
        method="POST",
        body={
            "event_name": "heartbeat_breach",
            "source_agent": "heartbeat_monitor_script",
            "target_agent": breach["agent_id"],
            "target_division": breach.get("pod_id"),
            "payload": breach,
            "priority": "critical",
        },
    )


def send_telegram_alert(breaches: list[dict]) -> None:
    """Send a consolidated Telegram alert for all breaches."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("WARN: Telegram credentials not configured, skipping alert", file=sys.stderr)
        return

    lines = ["🚨 *HEARTBEAT BREACH DETECTED*\n"]
    for b in breaches:
        stale = f"{b['stale_minutes']}m stale" if b["stale_minutes"] else "never recorded"
        lines.append(f"🔴 `{b['agent_id']}` ({b.get('pod_id', 'unknown')}) — {stale}")

    lines.append(f"\nTotal breaches: {len(breaches)}")
    lines.append("Source: heartbeat\\_monitor.py (script-based, no LLM)")

    message = "\n".join(lines)
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
    }

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            if result.get("ok"):
                print(f"Telegram alert sent to {TELEGRAM_CHAT_ID}")
            else:
                print(f"WARN: Telegram API returned ok=false: {result}", file=sys.stderr)
    except urllib.error.URLError as e:
        print(f"WARN: Failed to send Telegram alert: {e}", file=sys.stderr)


def write_health_snapshot(breaches: list[dict], total_agents: int) -> None:
    """Write a health snapshot to the health_snapshots table."""
    status = "healthy" if not breaches else "critical"
    supabase_request(
        "health_snapshots",
        method="POST",
        body={
            "snapshot_type": "heartbeat",
            "status": status,
            "summary": {
                "total_monitored": total_agents,
                "breaches": len(breaches),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            },
            "breaches": breaches,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClaw heartbeat monitor (script-based)")
    parser.add_argument(
        "--threshold-minutes",
        type=int,
        default=DEFAULT_THRESHOLD_MINUTES,
        help=f"Staleness threshold in minutes (default: {DEFAULT_THRESHOLD_MINUTES})",
    )
    parser.add_argument("--dry-run", action="store_true", help="Check but don't emit incidents or alerts")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    # 1. Fetch only always-on supervisors
    agents = fetch_always_on_agents()
    print(f"Monitoring {len(agents)} always-on agents (threshold: {args.threshold_minutes}m)")

    if not agents:
        print("WARN: No agents with heartbeat_policy=always_on found")
        write_health_snapshot([], 0)
        return

    # 2. Check for breaches
    breaches = check_breaches(agents, args.threshold_minutes)

    if not breaches:
        print("OK: All supervisors within heartbeat threshold")
        write_health_snapshot([], len(agents))
        return

    print(f"ALERT: {len(breaches)} heartbeat breach(es) detected:")
    for b in breaches:
        stale = f"{b['stale_minutes']}m" if b["stale_minutes"] else "never"
        print(f"  - {b['agent_id']} ({b['reason']}, stale: {stale})")

    if args.dry_run:
        print("DRY RUN: Skipping incident emission and alerts")
        return

    # 3. Emit incidents to agent_events
    for breach in breaches:
        try:
            emit_incident(breach)
        except Exception as e:
            print(f"WARN: Failed to emit incident for {breach['agent_id']}: {e}", file=sys.stderr)

    # 4. Write health snapshot
    write_health_snapshot(breaches, len(agents))

    # 5. Send Telegram alert
    send_telegram_alert(breaches)


if __name__ == "__main__":
    main()
