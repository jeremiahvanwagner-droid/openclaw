#!/usr/bin/env python3
"""
OpenClaw low-API operations control plane.

Features:
- Webhook ingestion endpoint for GoHighLevel events (POST /webhooks/ghl)
- SQLite-backed event/task queue with idempotency by event_id
- FIFO task processing with write-before-execute logging and retry backoff
- API usage ledger with quota and call-frequency guardrails
- Scheduled report composition (morning/evening windows)
- Critical incident sentinel with optional Telegram/MS Teams alert delivery
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo


DEFAULT_DB_PATH = str(Path.home() / ".config" / "openclaw-prod" / "ops.db")
DEFAULT_REPORT_DIR = str(Path.home() / ".config" / "openclaw-prod" / "reports")
DEFAULT_LOCK_PATH = str(Path.home() / ".config" / "openclaw-prod" / "locks" / "report-window.lock")
DEFAULT_GOV_DIR = str(Path.home() / ".config" / "openclaw-prod" / "governance")
DEFAULT_MEMORY_DIR = str(Path.home() / ".openclaw" / "workspace" / "memory")

RETRY_BACKOFF_SECONDS = [1, 2, 4]
MIN_ENDPOINT_INTERVAL_SECONDS = 15 * 60
CACHE_TTL_SECONDS = 10 * 60

WARNING_QUOTA_PCT = 70.0
PAUSE_QUOTA_PCT = 80.0
STOP_QUOTA_PCT = 95.0

REVIEW_REQUIRED_KEYWORDS = {
    "price",
    "pricing",
    "cost",
    "payment",
    "refund",
    "theology",
    "spiritual counsel",
    "mentor",
    "coaching",
}

SECURITY_EVENT_TYPES = {
    "security.breach",
    "security.unauthorized_access",
    "security.data_integrity",
}
REVENUE_EVENT_TYPES = {
    "revenue.webhook_down",
    "revenue.funnel_broken",
    "revenue.checkout_failure",
    "revenue.auth_failure",
}

REQUIRED_WEBHOOK_FIELDS = ("event_id", "event_type", "occurred_at", "channel", "payload")


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_utc(ts: Optional[dt.datetime] = None) -> str:
    ts = ts or now_utc()
    return ts.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> dt.datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return dt.datetime.fromisoformat(value).astimezone(dt.timezone.utc)


def ensure_parent(path: str) -> None:
    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def safe_json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True)


def connect_db(db_path: str) -> sqlite3.Connection:
    real = str(Path(db_path).expanduser())
    ensure_parent(real)
    conn = sqlite3.connect(real, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS ops_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          contact_id TEXT,
          conversation_id TEXT,
          opportunity_id TEXT,
          channel TEXT,
          payload_json TEXT NOT NULL,
          intent_flags_json TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'ghl_webhook',
          status TEXT NOT NULL DEFAULT 'queued',
          received_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ops_events_occurred_at ON ops_events(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_ops_events_event_type ON ops_events(event_type);

        CREATE TABLE IF NOT EXISTS task_queue (
          task_id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL,
          task_type TEXT NOT NULL,
          priority INTEGER NOT NULL DEFAULT 100,
          status TEXT NOT NULL DEFAULT 'pending',
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_retry_at TEXT,
          is_critical INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(event_id) REFERENCES ops_events(event_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_task_queue_status_priority ON task_queue(status, priority, created_at);
        CREATE INDEX IF NOT EXISTS idx_task_queue_next_retry ON task_queue(next_retry_at);

        CREATE TABLE IF NOT EXISTS api_usage (
          api_name TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          window_start TEXT NOT NULL,
          calls_made INTEGER NOT NULL DEFAULT 0,
          quota_limit INTEGER NOT NULL DEFAULT 0,
          quota_pct REAL NOT NULL DEFAULT 0,
          last_call_at TEXT,
          paused_non_critical INTEGER NOT NULL DEFAULT 0,
          hard_stopped INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(api_name, endpoint, window_start)
        );

        CREATE TABLE IF NOT EXISTS api_call_log (
          call_id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_name TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          call_kind TEXT NOT NULL DEFAULT 'read',
          critical INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          http_status INTEGER,
          error_text TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_api_call_log_created_at ON api_call_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_api_call_log_endpoint ON api_call_log(api_name, endpoint, created_at);

        CREATE TABLE IF NOT EXISTS cache_entries (
          cache_key TEXT PRIMARY KEY,
          endpoint TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS action_log (
          log_id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          component TEXT NOT NULL,
          action TEXT NOT NULL,
          details_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_action_log_created_at ON action_log(created_at);

        CREATE TABLE IF NOT EXISTS report_runs (
          run_id TEXT PRIMARY KEY,
          window_name TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL,
          report_path TEXT,
          summary_json TEXT,
          error_text TEXT
        );

        CREATE TABLE IF NOT EXISTS alerts (
          alert_id TEXT PRIMARY KEY,
          fingerprint TEXT UNIQUE NOT NULL,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          details_json TEXT NOT NULL,
          first_seen_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          notified_at TEXT,
          resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS decisions (
          decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
          decided_at TEXT NOT NULL,
          decision_text TEXT NOT NULL,
          rationale TEXT NOT NULL,
          expected_kpi TEXT NOT NULL,
          owner TEXT NOT NULL,
          review_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open'
        );

        CREATE INDEX IF NOT EXISTS idx_decisions_review_date ON decisions(review_date);

        CREATE TABLE IF NOT EXISTS kpi_snapshots (
          snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
          captured_at TEXT NOT NULL,
          tier TEXT NOT NULL,
          kpi_name TEXT NOT NULL,
          kpi_value REAL NOT NULL,
          unit TEXT NOT NULL DEFAULT 'count',
          period TEXT NOT NULL DEFAULT 'daily',
          notes TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_captured_at ON kpi_snapshots(captured_at);

        CREATE TABLE IF NOT EXISTS skill_cards (
          skill_id TEXT PRIMARY KEY,
          skill_name TEXT NOT NULL,
          track TEXT NOT NULL CHECK(track IN ('human', 'agent')),
          level_current INTEGER NOT NULL,
          level_target INTEGER NOT NULL,
          evidence_required TEXT NOT NULL,
          owner TEXT NOT NULL,
          review_cycle_days INTEGER NOT NULL DEFAULT 7,
          status TEXT NOT NULL DEFAULT 'active',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS capability_sprints (
          sprint_id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_start TEXT NOT NULL,
          skill_id TEXT NOT NULL,
          objective TEXT NOT NULL,
          evidence_notes TEXT,
          outcome TEXT NOT NULL CHECK(outcome IN ('planned', 'pass', 'fail')),
          remediation_notes TEXT,
          owner TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(skill_id) REFERENCES skill_cards(skill_id)
        );

        CREATE INDEX IF NOT EXISTS idx_capability_sprints_week ON capability_sprints(week_start);

        CREATE TABLE IF NOT EXISTS repeatable_tasks (
          repeatable_task_id TEXT PRIMARY KEY,
          task_name TEXT NOT NULL,
          classification TEXT NOT NULL CHECK(classification IN ('A', 'B', 'C')),
          risk_tier TEXT NOT NULL CHECK(risk_tier IN ('low', 'medium', 'high')),
          owner TEXT NOT NULL,
          notes TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_repeatable_tasks_classification ON repeatable_tasks(classification);
        """
    )
    conn.commit()


def log_action(conn: sqlite3.Connection, component: str, action: str, details: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO action_log(created_at, component, action, details_json)
        VALUES(?, ?, ?, ?)
        """,
        (iso_utc(), component, action, safe_json(details)),
    )
    conn.commit()


def normalize_intent_flags(payload: Dict[str, Any]) -> List[str]:
    flags = payload.get("intent_flags", [])
    if isinstance(flags, str):
        flags = [part.strip() for part in flags.split(",") if part.strip()]
    if not isinstance(flags, list):
        return []
    return [str(flag).strip().lower() for flag in flags if str(flag).strip()]


def normalize_event(raw: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(raw)
    payload.setdefault("payload", {})
    if not isinstance(payload["payload"], dict):
        payload["payload"] = {"raw": payload["payload"]}

    if "event_id" not in payload or not str(payload["event_id"]).strip():
        seed = safe_json(payload)
        payload["event_id"] = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    payload["event_id"] = str(payload["event_id"]).strip()
    payload["event_type"] = str(payload.get("event_type", "unknown")).strip().lower()
    payload["occurred_at"] = str(payload.get("occurred_at") or iso_utc())
    payload["contact_id"] = str(payload.get("contact_id") or "")
    payload["conversation_id"] = str(payload.get("conversation_id") or "")
    payload["opportunity_id"] = str(payload.get("opportunity_id") or "")
    payload["channel"] = str(payload.get("channel") or "unknown").strip().lower()
    payload["intent_flags"] = normalize_intent_flags(payload)
    return payload


def missing_required_fields(raw: Dict[str, Any]) -> List[str]:
    missing: List[str] = []
    for field in REQUIRED_WEBHOOK_FIELDS:
        if field not in raw:
            missing.append(field)
            continue
        value = raw[field]
        if value is None:
            missing.append(field)
            continue
        if isinstance(value, str) and not value.strip():
            missing.append(field)
            continue
        if field == "payload" and not isinstance(value, dict):
            missing.append(field)
    return missing


def looks_review_required(payload: Dict[str, Any], intent_flags: Iterable[str]) -> bool:
    flag_set = {flag.lower() for flag in intent_flags}
    if {"pricing", "theology", "spiritual_counsel", "refund", "billing"} & flag_set:
        return True
    message = safe_json(payload).lower()
    return any(keyword in message for keyword in REVIEW_REQUIRED_KEYWORDS)


def is_critical_event(event: Dict[str, Any]) -> bool:
    event_type = event["event_type"]
    flags = set(event["intent_flags"])
    payload = event.get("payload", {})
    http_status = payload.get("http_status")
    blocked = bool(payload.get("critical_workflow_blocked", False))
    return (
        event_type in SECURITY_EVENT_TYPES
        or event_type in REVENUE_EVENT_TYPES
        or "security_breach" in flags
        or "data_integrity" in flags
        or "revenue_impact" in flags
        or (http_status == 429 and blocked)
    )


def create_alert(
    conn: sqlite3.Connection,
    *,
    alert_type: str,
    severity: str,
    message: str,
    details: Dict[str, Any],
    fingerprint: Optional[str] = None,
) -> str:
    now = iso_utc()
    if not fingerprint:
        fingerprint_seed = safe_json({"alert_type": alert_type, "severity": severity, "message": message})
        fingerprint = hashlib.sha256(fingerprint_seed.encode("utf-8")).hexdigest()

    row = conn.execute("SELECT alert_id FROM alerts WHERE fingerprint = ?", (fingerprint,)).fetchone()
    if row:
        conn.execute(
            """
            UPDATE alerts
            SET last_seen_at = ?, message = ?, details_json = ?, resolved_at = NULL
            WHERE fingerprint = ?
            """,
            (now, message, safe_json(details), fingerprint),
        )
        conn.commit()
        return str(row["alert_id"])

    alert_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO alerts(alert_id, fingerprint, alert_type, severity, message, details_json, first_seen_at, last_seen_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (alert_id, fingerprint, alert_type, severity, message, safe_json(details), now, now),
    )
    conn.commit()
    return alert_id


def enqueue_task(
    conn: sqlite3.Connection,
    *,
    event_id: str,
    task_type: str,
    priority: int,
    is_critical: bool = False,
) -> None:
    now = iso_utc()
    conn.execute(
        """
        INSERT INTO task_queue(event_id, task_type, priority, status, is_critical, created_at, updated_at)
        VALUES(?, ?, ?, 'pending', ?, ?, ?)
        """,
        (event_id, task_type, priority, 1 if is_critical else 0, now, now),
    )

def ingest_event(conn: sqlite3.Connection, raw: Dict[str, Any], source: str = "ghl_webhook") -> Dict[str, Any]:
    required_missing = missing_required_fields(raw)
    if required_missing:
        raise ValueError(f"missing_required_fields:{','.join(required_missing)}")
    event = normalize_event(raw)
    now = iso_utc()

    log_action(
        conn,
        "ingest",
        "write_before_execute",
        {"event_id": event["event_id"], "event_type": event["event_type"], "source": source},
    )

    exists = conn.execute("SELECT event_id FROM ops_events WHERE event_id = ?", (event["event_id"],)).fetchone()
    if exists:
        return {"accepted": True, "duplicate": True, "event_id": event["event_id"]}

    conn.execute(
        """
        INSERT INTO ops_events(
          event_id, event_type, occurred_at, contact_id, conversation_id, opportunity_id,
          channel, payload_json, intent_flags_json, source, status, received_at, updated_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
        """,
        (
            event["event_id"],
            event["event_type"],
            event["occurred_at"],
            event["contact_id"] or None,
            event["conversation_id"] or None,
            event["opportunity_id"] or None,
            event["channel"],
            safe_json(event.get("payload", {})),
            safe_json(event["intent_flags"]),
            source,
            now,
            now,
        ),
    )

    critical = is_critical_event(event)
    event_type = event["event_type"]
    flags = set(event["intent_flags"])

    if event_type.startswith("social."):
        enqueue_task(conn, event_id=event["event_id"], task_type="social_engagement", priority=100, is_critical=False)
    else:
        enqueue_task(conn, event_id=event["event_id"], task_type="generic_event", priority=120, is_critical=False)

    if "route_call" in flags:
        enqueue_task(conn, event_id=event["event_id"], task_type="sales_route_call", priority=40, is_critical=False)
    if "route_offer" in flags:
        enqueue_task(conn, event_id=event["event_id"], task_type="sales_route_offer", priority=50, is_critical=False)
    if "channel_lockout" in flags or event_type == "social.dm_window_closed":
        enqueue_task(conn, event_id=event["event_id"], task_type="channel_fallback", priority=30, is_critical=False)
    if looks_review_required(event.get("payload", {}), event["intent_flags"]):
        enqueue_task(conn, event_id=event["event_id"], task_type="review_required", priority=20, is_critical=False)
    if critical:
        enqueue_task(conn, event_id=event["event_id"], task_type="critical_incident", priority=5, is_critical=True)
        create_alert(
            conn,
            alert_type="critical_event",
            severity="RED",
            message=f"Critical event queued: {event_type}",
            details={"event_id": event["event_id"], "event_type": event_type},
            fingerprint=f"critical_event:{event['event_id']}",
        )

    conn.commit()
    return {"accepted": True, "duplicate": False, "event_id": event["event_id"]}


def today_window_start() -> str:
    current = now_utc().date()
    return dt.datetime.combine(current, dt.time(0, 0, tzinfo=dt.timezone.utc)).isoformat().replace("+00:00", "Z")


def get_api_usage_row(
    conn: sqlite3.Connection,
    api_name: str,
    endpoint: str,
    quota_limit: int,
) -> sqlite3.Row:
    window_start = today_window_start()
    row = conn.execute(
        """
        SELECT api_name, endpoint, window_start, calls_made, quota_limit, quota_pct, last_call_at,
               paused_non_critical, hard_stopped
        FROM api_usage
        WHERE api_name = ? AND endpoint = ? AND window_start = ?
        """,
        (api_name, endpoint, window_start),
    ).fetchone()
    if row:
        return row

    conn.execute(
        """
        INSERT INTO api_usage(api_name, endpoint, window_start, calls_made, quota_limit, quota_pct, paused_non_critical, hard_stopped)
        VALUES(?, ?, ?, 0, ?, 0, 0, 0)
        """,
        (api_name, endpoint, window_start, quota_limit),
    )
    conn.commit()
    return conn.execute(
        """
        SELECT api_name, endpoint, window_start, calls_made, quota_limit, quota_pct, last_call_at,
               paused_non_critical, hard_stopped
        FROM api_usage
        WHERE api_name = ? AND endpoint = ? AND window_start = ?
        """,
        (api_name, endpoint, window_start),
    ).fetchone()


@dataclass
class ApiGuardDecision:
    allowed: bool
    reason: str


def evaluate_api_guard(
    conn: sqlite3.Connection,
    *,
    api_name: str,
    endpoint: str,
    critical: bool,
    quota_limit: int,
) -> ApiGuardDecision:
    now = now_utc()
    usage = get_api_usage_row(conn, api_name, endpoint, quota_limit)
    calls_made = int(usage["calls_made"])
    quota_limit = int(usage["quota_limit"] or quota_limit or 1)
    quota_pct = (calls_made / quota_limit) * 100 if quota_limit > 0 else 100.0

    last = conn.execute(
        """
        SELECT created_at
        FROM api_call_log
        WHERE api_name = ? AND endpoint = ? AND status IN ('ok', 'cached')
        ORDER BY call_id DESC
        LIMIT 1
        """,
        (api_name, endpoint),
    ).fetchone()
    if last:
        elapsed = (now - parse_iso(str(last["created_at"]))).total_seconds()
        if elapsed < MIN_ENDPOINT_INTERVAL_SECONDS:
            return ApiGuardDecision(False, f"blocked_min_interval_{int(elapsed)}s")

    if quota_pct >= STOP_QUOTA_PCT:
        create_alert(
            conn,
            alert_type="quota_hard_stop",
            severity="RED",
            message=f"{api_name} {endpoint} reached {quota_pct:.1f}% quota; calls stopped",
            details={"api_name": api_name, "endpoint": endpoint, "quota_pct": quota_pct},
            fingerprint=f"quota_hard_stop:{api_name}:{endpoint}:{today_window_start()}",
        )
        return ApiGuardDecision(False, "blocked_hard_stop")

    if quota_pct >= PAUSE_QUOTA_PCT and not critical:
        return ApiGuardDecision(False, "paused_non_critical")

    return ApiGuardDecision(True, "allowed")


def update_api_usage(
    conn: sqlite3.Connection,
    *,
    api_name: str,
    endpoint: str,
    quota_limit: int,
    status: str,
    http_status: Optional[int] = None,
    critical: bool = False,
    error_text: Optional[str] = None,
) -> None:
    now = iso_utc()
    conn.execute(
        """
        INSERT INTO api_call_log(api_name, endpoint, call_kind, critical, status, http_status, error_text, created_at)
        VALUES(?, ?, 'read', ?, ?, ?, ?, ?)
        """,
        (api_name, endpoint, 1 if critical else 0, status, http_status, error_text, now),
    )

    usage = get_api_usage_row(conn, api_name, endpoint, quota_limit)
    calls_made = int(usage["calls_made"]) + (1 if status in {"ok", "error", "rate_limited"} else 0)
    quota_limit = int(usage["quota_limit"] or quota_limit or 1)
    quota_pct = (calls_made / quota_limit) * 100 if quota_limit > 0 else 100.0
    conn.execute(
        """
        UPDATE api_usage
        SET calls_made = ?, quota_limit = ?, quota_pct = ?, last_call_at = ?,
            paused_non_critical = ?, hard_stopped = ?
        WHERE api_name = ? AND endpoint = ? AND window_start = ?
        """,
        (
            calls_made,
            quota_limit,
            quota_pct,
            now,
            1 if quota_pct >= PAUSE_QUOTA_PCT else 0,
            1 if quota_pct >= STOP_QUOTA_PCT else 0,
            api_name,
            endpoint,
            usage["window_start"],
        ),
    )
    conn.commit()

    if status == "rate_limited" and critical:
        create_alert(
            conn,
            alert_type="critical_rate_limited",
            severity="RED",
            message=f"{api_name} rate-limited (429) and critical workflow blocked",
            details={"api_name": api_name, "endpoint": endpoint, "http_status": http_status},
            fingerprint=f"critical_429:{api_name}:{endpoint}:{today_window_start()}",
        )


def cache_key_for(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


def get_cached_entry(conn: sqlite3.Connection, endpoint: str) -> Optional[Dict[str, Any]]:
    key = cache_key_for(endpoint)
    row = conn.execute(
        """
        SELECT response_json, expires_at
        FROM cache_entries
        WHERE cache_key = ?
        """,
        (key,),
    ).fetchone()
    if not row:
        return None
    if parse_iso(str(row["expires_at"])) <= now_utc():
        return None
    return json.loads(str(row["response_json"]))


def set_cached_entry(conn: sqlite3.Connection, endpoint: str, payload: Dict[str, Any], ttl_seconds: int = CACHE_TTL_SECONDS) -> None:
    key = cache_key_for(endpoint)
    created = now_utc()
    expires = created + dt.timedelta(seconds=ttl_seconds)
    conn.execute(
        """
        INSERT INTO cache_entries(cache_key, endpoint, response_json, created_at, expires_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          endpoint = excluded.endpoint,
          response_json = excluded.response_json,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at
        """,
        (key, endpoint, safe_json(payload), iso_utc(created), iso_utc(expires)),
    )
    conn.commit()


def guarded_api_get_json(
    conn: sqlite3.Connection,
    *,
    api_name: str,
    endpoint: str,
    headers: Dict[str, str],
    quota_limit: int,
    critical: bool = False,
    timeout_seconds: int = 15,
) -> Dict[str, Any]:
    cached = get_cached_entry(conn, endpoint)
    if cached is not None:
        update_api_usage(
            conn,
            api_name=api_name,
            endpoint=endpoint,
            quota_limit=quota_limit,
            status="cached",
            critical=critical,
        )
        return cached

    guard = evaluate_api_guard(
        conn,
        api_name=api_name,
        endpoint=endpoint,
        critical=critical,
        quota_limit=quota_limit,
    )
    if not guard.allowed:
        raise RuntimeError(guard.reason)

    req = urllib.request.Request(endpoint, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            update_api_usage(
                conn,
                api_name=api_name,
                endpoint=endpoint,
                quota_limit=quota_limit,
                status="ok",
                http_status=resp.status,
                critical=critical,
            )
            set_cached_entry(conn, endpoint, parsed, CACHE_TTL_SECONDS)
            return parsed
    except urllib.error.HTTPError as exc:
        status = "rate_limited" if exc.code == 429 else "error"
        update_api_usage(
            conn,
            api_name=api_name,
            endpoint=endpoint,
            quota_limit=quota_limit,
            status=status,
            http_status=exc.code,
            critical=critical,
            error_text=str(exc),
        )
        raise
    except Exception as exc:
        update_api_usage(
            conn,
            api_name=api_name,
            endpoint=endpoint,
            quota_limit=quota_limit,
            status="error",
            critical=critical,
            error_text=str(exc),
        )
        raise

def fetch_event(conn: sqlite3.Connection, event_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM ops_events WHERE event_id = ?", (event_id,)).fetchone()
    if not row:
        raise RuntimeError(f"event not found: {event_id}")
    return row


def mark_task_complete(conn: sqlite3.Connection, task_id: int, event_id: str) -> None:
    now = iso_utc()
    conn.execute(
        """
        UPDATE task_queue
        SET status = 'completed', updated_at = ?, next_retry_at = NULL, last_error = NULL
        WHERE task_id = ?
        """,
        (now, task_id),
    )
    conn.execute(
        """
        UPDATE ops_events
        SET status = 'processed', updated_at = ?
        WHERE event_id = ? AND status != 'processed'
        """,
        (now, event_id),
    )
    conn.commit()


def mark_task_retry(conn: sqlite3.Connection, task_id: int, attempt_count: int, error_text: str) -> None:
    now = now_utc()
    idx = min(attempt_count - 1, len(RETRY_BACKOFF_SECONDS) - 1)
    backoff = RETRY_BACKOFF_SECONDS[idx]
    next_retry = now + dt.timedelta(seconds=backoff)
    conn.execute(
        """
        UPDATE task_queue
        SET status = 'retry_wait',
            attempt_count = ?,
            next_retry_at = ?,
            last_error = ?,
            updated_at = ?
        WHERE task_id = ?
        """,
        (attempt_count, iso_utc(next_retry), error_text, iso_utc(now), task_id),
    )
    conn.commit()


def mark_task_failed(conn: sqlite3.Connection, task_id: int, attempt_count: int, error_text: str, is_critical: bool) -> None:
    now = iso_utc()
    conn.execute(
        """
        UPDATE task_queue
        SET status = 'failed',
            attempt_count = ?,
            next_retry_at = NULL,
            last_error = ?,
            updated_at = ?
        WHERE task_id = ?
        """,
        (attempt_count, error_text, now, task_id),
    )
    conn.commit()
    if is_critical:
        create_alert(
            conn,
            alert_type="critical_task_failed",
            severity="RED",
            message=f"Critical task failed after retries (task_id={task_id})",
            details={"task_id": task_id, "error": error_text},
            fingerprint=f"critical_task_failed:{task_id}",
        )


def execute_task(conn: sqlite3.Connection, task: sqlite3.Row, event: sqlite3.Row, window_name: str) -> Dict[str, Any]:
    task_type = str(task["task_type"])
    payload = json.loads(str(event["payload_json"]))
    flags = json.loads(str(event["intent_flags_json"]))

    log_action(
        conn,
        "processor",
        "execute_task",
        {
            "task_id": task["task_id"],
            "task_type": task_type,
            "event_id": task["event_id"],
            "window_name": window_name,
        },
    )

    if task_type == "critical_incident":
        create_alert(
            conn,
            alert_type="critical_incident",
            severity="RED",
            message=f"Critical incident detected from event {event['event_id']}",
            details={"event_type": event["event_type"], "payload": payload},
            fingerprint=f"critical_incident:{event['event_id']}",
        )
        return {"result": "critical_alert_logged"}

    if task_type == "review_required":
        create_alert(
            conn,
            alert_type="review_required",
            severity="YELLOW",
            message=f"Review-required content queued for owner decision (event {event['event_id']})",
            details={"event_type": event["event_type"], "intent_flags": flags},
            fingerprint=f"review_required:{event['event_id']}",
        )
        return {"result": "review_required_logged"}

    if task_type in {"sales_route_call", "sales_route_offer"}:
        route = "route_call" if task_type == "sales_route_call" else "route_offer"
        log_action(
            conn,
            "sales",
            "route_task_prepared",
            {"event_id": event["event_id"], "route": route, "channel": event["channel"]},
        )
        return {"result": route}

    if task_type == "channel_fallback":
        log_action(
            conn,
            "marketing",
            "channel_fallback_requested",
            {"event_id": event["event_id"], "channel": event["channel"]},
        )
        return {"result": "fallback_prepared"}

    if task_type in {"social_engagement", "generic_event"}:
        log_action(
            conn,
            "marketing",
            "social_event_processed",
            {
                "event_id": event["event_id"],
                "event_type": event["event_type"],
                "channel": event["channel"],
            },
        )
        return {"result": "processed"}

    raise RuntimeError(f"unsupported task_type={task_type}")


def process_task_queue(conn: sqlite3.Connection, *, max_tasks: int, window_name: str) -> Dict[str, int]:
    now = iso_utc()
    rows = conn.execute(
        """
        SELECT *
        FROM task_queue
        WHERE status IN ('pending', 'retry_wait')
          AND (next_retry_at IS NULL OR next_retry_at <= ?)
        ORDER BY priority ASC, created_at ASC
        LIMIT ?
        """,
        (now, max_tasks),
    ).fetchall()

    counters = {"selected": len(rows), "completed": 0, "retried": 0, "failed": 0}
    for task in rows:
        task_id = int(task["task_id"])
        attempts = int(task["attempt_count"])
        is_critical = bool(task["is_critical"])
        try:
            event = fetch_event(conn, str(task["event_id"]))
            execute_task(conn, task, event, window_name)
            mark_task_complete(conn, task_id, str(task["event_id"]))
            counters["completed"] += 1
        except Exception as exc:
            attempts += 1
            error_text = str(exc)
            if attempts <= 3:
                mark_task_retry(conn, task_id, attempts, error_text)
                counters["retried"] += 1
            else:
                mark_task_failed(conn, task_id, attempts, error_text, is_critical)
                counters["failed"] += 1
    return counters


def get_since_timestamp(conn: sqlite3.Connection) -> dt.datetime:
    row = conn.execute(
        """
        SELECT finished_at
        FROM report_runs
        WHERE status = 'ok' AND finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 1
        """
    ).fetchone()
    if not row:
        return now_utc() - dt.timedelta(hours=12)
    return parse_iso(str(row["finished_at"]))


def compute_health(
    unresolved_critical_alerts: int,
    failed_tasks: int,
    retries: int,
    quota_warning_count: int,
) -> str:
    if unresolved_critical_alerts > 0:
        return "RED"
    if failed_tasks > 0 or retries > 0 or quota_warning_count > 0:
        return "YELLOW"
    return "GREEN"


def count_active_red_incidents(conn: sqlite3.Connection) -> int:
    """
    Count unresolved RED incidents that represent underlying system issues.

    Excludes `sentinel_dispatch` bookkeeping alerts so sentinel notifications
    cannot recursively keep the system in RED on their own.
    """
    return int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM alerts
            WHERE resolved_at IS NULL
              AND severity = 'RED'
              AND alert_type != 'sentinel_dispatch'
            """
        ).fetchone()["c"]
    )


def auto_resolve_recovered_alerts(conn: sqlite3.Connection) -> Dict[str, int]:
    """
    Resolve alert classes that can be safely auto-closed when recovery is verified.
    """
    now = iso_utc()
    resolved: Dict[str, int] = {
        "critical_rate_limited": 0,
        "quota_hard_stop": 0,
    }

    has_recent_critical_429 = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM api_call_log
            WHERE status = 'rate_limited' AND critical = 1
              AND created_at >= ?
            """,
            (iso_utc(now_utc() - dt.timedelta(minutes=30)),),
        ).fetchone()["c"]
    )
    if has_recent_critical_429 == 0:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM alerts
            WHERE resolved_at IS NULL
              AND alert_type = 'critical_rate_limited'
              AND severity = 'RED'
            """
        ).fetchone()
        resolved["critical_rate_limited"] = int(row["c"])
        if resolved["critical_rate_limited"] > 0:
            conn.execute(
                """
                UPDATE alerts
                SET resolved_at = ?
                WHERE resolved_at IS NULL
                  AND alert_type = 'critical_rate_limited'
                  AND severity = 'RED'
                """,
                (now,),
            )

    hard_stop_still_active = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM api_usage
            WHERE window_start = ?
              AND quota_pct >= ?
            """,
            (today_window_start(), STOP_QUOTA_PCT),
        ).fetchone()["c"]
    )
    if hard_stop_still_active == 0:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM alerts
            WHERE resolved_at IS NULL
              AND alert_type = 'quota_hard_stop'
              AND severity = 'RED'
            """
        ).fetchone()
        resolved["quota_hard_stop"] = int(row["c"])
        if resolved["quota_hard_stop"] > 0:
            conn.execute(
                """
                UPDATE alerts
                SET resolved_at = ?
                WHERE resolved_at IS NULL
                  AND alert_type = 'quota_hard_stop'
                  AND severity = 'RED'
                """,
                (now,),
            )

    if any(count > 0 for count in resolved.values()):
        conn.commit()
        log_action(conn, "sentinel", "auto_resolve_recovered_alerts", resolved)
    return resolved


def summarize_event_task_reconciliation(conn: sqlite3.Connection, since: dt.datetime) -> Dict[str, Any]:
    since_iso = iso_utc(since)
    stale_minutes = int(os.getenv("OPENCLAW_PENDING_TASK_STALE_MINUTES", "30"))
    stale_cutoff = iso_utc(now_utc() - dt.timedelta(minutes=stale_minutes))

    orphan_events_total = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM ops_events e
            LEFT JOIN task_queue t ON t.event_id = e.event_id
            WHERE t.task_id IS NULL
            """
        ).fetchone()["c"]
    )
    orphan_events_since = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM ops_events e
            LEFT JOIN task_queue t ON t.event_id = e.event_id
            WHERE t.task_id IS NULL
              AND e.received_at >= ?
            """,
            (since_iso,),
        ).fetchone()["c"]
    )
    orphan_tasks_total = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM task_queue t
            LEFT JOIN ops_events e ON e.event_id = t.event_id
            WHERE e.event_id IS NULL
            """
        ).fetchone()["c"]
    )
    stale_pending_count = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM task_queue
            WHERE status IN ('pending', 'retry_wait')
              AND updated_at < ?
            """,
            (stale_cutoff,),
        ).fetchone()["c"]
    )

    oldest_pending_row = conn.execute(
        """
        SELECT created_at
        FROM task_queue
        WHERE status IN ('pending', 'retry_wait')
        ORDER BY created_at ASC
        LIMIT 1
        """
    ).fetchone()
    oldest_pending_minutes: Optional[int] = None
    if oldest_pending_row and oldest_pending_row["created_at"]:
        oldest_pending_minutes = int((now_utc() - parse_iso(str(oldest_pending_row["created_at"]))).total_seconds() // 60)

    lines: List[str] = [
        f"Orphan events (total): {orphan_events_total}",
        f"Orphan events (since last report): {orphan_events_since}",
        f"Orphan tasks referencing missing events: {orphan_tasks_total}",
        f"Pending/retry tasks stale > {stale_minutes}m: {stale_pending_count}",
    ]
    if oldest_pending_minutes is not None:
        lines.append(f"Oldest queued task age: {oldest_pending_minutes} minutes")

    has_drift = orphan_events_total > 0 or orphan_tasks_total > 0 or stale_pending_count > 0
    return {
        "orphan_events_total": orphan_events_total,
        "orphan_events_since": orphan_events_since,
        "orphan_tasks_total": orphan_tasks_total,
        "stale_pending_count": stale_pending_count,
        "oldest_pending_minutes": oldest_pending_minutes,
        "has_drift": has_drift,
        "lines": lines,
    }


def summarize_sentinel_telemetry(conn: sqlite3.Connection, since: dt.datetime) -> List[str]:
    since_iso = iso_utc(since)

    sent = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM action_log
            WHERE component = 'sentinel'
              AND action = 'sentinel_notification_sent'
              AND created_at >= ?
            """,
            (since_iso,),
        ).fetchone()["c"]
    )
    suppressed_interval = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM action_log
            WHERE component = 'sentinel'
              AND action = 'sentinel_notification_suppressed_min_interval'
              AND created_at >= ?
            """,
            (since_iso,),
        ).fetchone()["c"]
    )
    suppressed_reminder = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM action_log
            WHERE component = 'sentinel'
              AND action = 'sentinel_notification_suppressed_reminder'
              AND created_at >= ?
            """,
            (since_iso,),
        ).fetchone()["c"]
    )
    no_alert_runs = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM action_log
            WHERE component = 'sentinel'
              AND action = 'sentinel_notification_no_alert'
              AND created_at >= ?
            """,
            (since_iso,),
        ).fetchone()["c"]
    )

    resolved_rows = conn.execute(
        """
        SELECT details_json
        FROM action_log
        WHERE component = 'sentinel'
          AND action = 'auto_resolve_recovered_alerts'
          AND created_at >= ?
        """,
        (since_iso,),
    ).fetchall()
    auto_resolved_total = 0
    for row in resolved_rows:
        try:
            details = json.loads(str(row["details_json"]))
            auto_resolved_total += sum(int(v) for v in details.values() if isinstance(v, int))
        except Exception:
            continue

    return [
        f"sent={sent}",
        f"suppressed_min_interval={suppressed_interval}",
        f"suppressed_reminder={suppressed_reminder}",
        f"auto_resolved={auto_resolved_total}",
        f"no_alert_runs={no_alert_runs}",
    ]


def format_list_or_none(lines: List[str], none_text: str) -> str:
    if not lines:
        return f"- {none_text}"
    return "\n".join(f"- {line}" for line in lines)


def summarize_api_usage(conn: sqlite3.Connection, since: dt.datetime) -> Tuple[List[str], int]:
    calls = conn.execute(
        """
        SELECT api_name, endpoint, COUNT(*) AS call_count,
               SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) AS rate_limited
        FROM api_call_log
        WHERE created_at >= ?
        GROUP BY api_name, endpoint
        ORDER BY api_name, endpoint
        """,
        (iso_utc(since),),
    ).fetchall()

    usage_rows = conn.execute(
        """
        SELECT api_name, endpoint, calls_made, quota_limit, quota_pct
        FROM api_usage
        WHERE window_start = ?
        ORDER BY api_name, endpoint
        """,
        (today_window_start(),),
    ).fetchall()
    usage_map = {(str(r["api_name"]), str(r["endpoint"])): r for r in usage_rows}

    lines: List[str] = []
    warning_count = 0
    for row in calls:
        key = (str(row["api_name"]), str(row["endpoint"]))
        usage = usage_map.get(key)
        calls_made = int(usage["calls_made"]) if usage else int(row["call_count"])
        quota_limit = int(usage["quota_limit"]) if usage else 0
        quota_pct = float(usage["quota_pct"]) if usage else 0.0
        remaining = max(quota_limit - calls_made, 0) if quota_limit > 0 else -1
        flag = ""
        if quota_pct >= WARNING_QUOTA_PCT:
            warning_count += 1
            flag = " [ACTION REQUIRED]" if quota_pct >= PAUSE_QUOTA_PCT else " [WARNING]"
        rate_info = f", rate_limited={int(row['rate_limited'])}" if int(row["rate_limited"] or 0) > 0 else ""
        remaining_text = str(remaining) if remaining >= 0 else "unknown"
        lines.append(
            f"{row['api_name']} {row['endpoint']}: calls={int(row['call_count'])}, "
            f"remaining={remaining_text}, quota={quota_pct:.1f}%{rate_info}{flag}"
        )

    if not lines:
        lines.append("No external API calls recorded since last report.")
    return lines, warning_count


def ensure_governance_scaffold(
    *,
    governance_dir: str,
    memory_dir: str,
) -> Dict[str, str]:
    gov = Path(governance_dir).expanduser()
    mem = Path(memory_dir).expanduser()
    gov.mkdir(parents=True, exist_ok=True)
    mem.mkdir(parents=True, exist_ok=True)

    decision_path = mem / "decision-register.md"
    if not decision_path.exists():
        decision_path.write_text(
            "# Decision Register\n\n"
            "Use this format for every decision:\n"
            "- Decision:\n"
            "- Rationale:\n"
            "- Expected KPI Impact:\n"
            "- Owner:\n"
            "- Review Date:\n\n",
            encoding="utf-8",
        )

    skill_matrix_path = gov / "skill-matrix.md"
    if not skill_matrix_path.exists():
        skill_matrix_path.write_text(
            "# Skill Matrix\n\n"
            "Tracks: `human`, `agent`\n\n"
            "| skill_id | skill_name | track | level_current | level_target | owner | review_cycle_days |\n"
            "|---|---|---|---:|---:|---|---:|\n",
            encoding="utf-8",
        )

    coverage_path = gov / "automation-coverage.md"
    if not coverage_path.exists():
        coverage_path.write_text(
            "# Automation Coverage\n\n"
            "Formula:\n"
            "`automation_coverage = automated_repeatable_tasks / total_repeatable_tasks`\n\n"
            "Classifications:\n"
            "- `A`: fully automated\n"
            "- `B`: assisted automation (review gate)\n"
            "- `C`: manual\n",
            encoding="utf-8",
        )

    checklist_path = gov / "day1-14-execution-checklist.md"
    if not checklist_path.exists():
        checklist_path.write_text(
            "# Day 1-14 Execution Checklist\n\n"
            "Start Date: __________\n"
            "Owner: __________\n\n"
            "## Week 1 (Days 1-7)\n\n"
            "- Day 1: Canonical cron cutover.\n"
            "- Day 2: Timezone and report-window validation.\n"
            "- Day 3: Webhook contract and idempotency validation.\n"
            "- Day 4: Queue retry/backoff validation.\n"
            "- Day 5: Secrets actionable audit cleanup and reload.\n"
            "- Day 6: Sentinel and report format validation.\n"
            "- Day 7: Week 1 review and Week 2 assignment.\n\n"
            "## Week 2 (Days 8-14)\n\n"
            "- Day 8: KPI baseline snapshot lock.\n"
            "- Day 9: Weekly cadence schedule lock (Mon/Wed/Fri).\n"
            "- Day 10: Decision-to-KPI linkage enforcement.\n"
            "- Day 11: Capability Sprint kickoff.\n"
            "- Day 12: Repeatable task A/B/C catalog update.\n"
            "- Day 13: Resilience and quota-gate test run.\n"
            "- Day 14: Closure review and Week 3 kickoff plan.\n",
            encoding="utf-8",
        )

    weekly_tracker_path = gov / "weekly-tracking-day90.md"
    if not weekly_tracker_path.exists():
        weekly_tracker_path.write_text(
            "# Weekly Tracking Board (Day 1-90)\n\n"
            "Program Start Date: __________\n"
            "Program End Date (Day 90): __________\n"
            "Owner: __________\n\n"
            "| Week | Day Range | Phase | Primary Outcome | Coverage Target | Status |\n"
            "|---:|---|---|---|---|---|\n"
            "| 1 | 1-7 | Stabilize Runtime | Canonical schedule + sentinel stability | Baseline | Not Started |\n"
            "| 2 | 8-14 | Stabilize Runtime | Governance baseline lock | Baseline | Not Started |\n"
            "| 3 | 15-21 | Strategy OS | KPI cadence in production | 40-50% | Not Started |\n"
            "| 4 | 22-28 | Strategy OS | Experiment and bottleneck loop | 45-55% | Not Started |\n"
            "| 5 | 29-35 | Strategy OS | Day 30 milestone review | 45-55% | Not Started |\n"
            "| 6 | 36-42 | Skill Sustainability | Sprint system active | 50-60% | Not Started |\n"
            "| 7 | 43-49 | Skill Sustainability | Skills with workflow evidence | 55-65% | Not Started |\n"
            "| 8 | 50-56 | Skill Sustainability | Bus-factor hardening | 60-70% | Not Started |\n"
            "| 9 | 57-63 | Skill Sustainability | Day 60 milestone review | 60-70% | Not Started |\n"
            "| 10 | 64-70 | Automation Program | Low-risk migration to A/B | 62-72% | Not Started |\n"
            "| 11 | 71-77 | Automation Program | Medium-risk migration with gates | 65-75% | Not Started |\n"
            "| 12 | 78-84 | Automation Program | Final migration + rollback drills | 68-78% | Not Started |\n"
            "| 13 | 85-90 | Automation Program | Day 90 acceptance and handoff | 70-80% | Not Started |\n",
            encoding="utf-8",
        )

    strategy_path = gov / "strategy-operating-system.md"
    if not strategy_path.exists():
        strategy_path.write_text(
            "# Open Claw Strategy Operating System (Truth j Blue)\n\n"
            "## Governance File Index\n\n"
            "1. `day1-14-execution-checklist.md`\n"
            "2. `weekly-tracking-day90.md`\n"
            "3. `automation-coverage.md`\n"
            "4. `skill-matrix.md`\n"
            "5. `~/.openclaw/workspace/memory/decision-register.md`\n\n"
            "## Weekly Cadence\n\n"
            "1. Monday: KPI review and bottleneck diagnosis.\n"
            "2. Wednesday: experiment checkpoint and route decision.\n"
            "3. Friday: decision log update, risk review, and next-week lock.\n",
            encoding="utf-8",
        )

    return {
        "decision_register": str(decision_path),
        "skill_matrix": str(skill_matrix_path),
        "automation_coverage": str(coverage_path),
        "day1_14_checklist": str(checklist_path),
        "weekly_tracking_day90": str(weekly_tracker_path),
        "strategy_operating_system": str(strategy_path),
    }


def calculate_automation_coverage(conn: sqlite3.Connection) -> Dict[str, Any]:
    rows = conn.execute(
        """
        SELECT classification, COUNT(*) AS c
        FROM repeatable_tasks
        GROUP BY classification
        """
    ).fetchall()
    counts = {"A": 0, "B": 0, "C": 0}
    for row in rows:
        key = str(row["classification"])
        if key in counts:
            counts[key] = int(row["c"])
    total = counts["A"] + counts["B"] + counts["C"]
    coverage = (counts["A"] / total) * 100 if total > 0 else 0.0
    return {"coverage_pct": round(coverage, 2), "counts": counts, "total": total}


def summarize_skill_health(conn: sqlite3.Connection) -> Dict[str, Any]:
    rows = conn.execute(
        """
        SELECT track,
               COUNT(*) AS total,
               SUM(CASE WHEN level_current >= level_target THEN 1 ELSE 0 END) AS target_met
        FROM skill_cards
        WHERE status = 'active'
        GROUP BY track
        """
    ).fetchall()
    data: Dict[str, Dict[str, int]] = {
        "human": {"total": 0, "target_met": 0},
        "agent": {"total": 0, "target_met": 0},
    }
    for row in rows:
        track = str(row["track"])
        if track in data:
            data[track]["total"] = int(row["total"])
            data[track]["target_met"] = int(row["target_met"] or 0)
    return data


def strategy_cadence_actions(timezone_name: str) -> List[str]:
    day = now_utc().astimezone(ZoneInfo(timezone_name)).strftime("%A").lower()
    if day == "monday":
        return ["Monday strategy cadence: run KPI review and bottleneck diagnosis before noon."]
    if day == "wednesday":
        return ["Wednesday strategy cadence: run experiment checkpoint and log pass/fail learning."]
    if day == "friday":
        return ["Friday strategy cadence: update decision register and risk review notes."]
    return []


def next_window_times(timezone_name: str) -> Dict[str, str]:
    tz = ZoneInfo(timezone_name)
    local_now = now_utc().astimezone(tz)
    morning = local_now.replace(hour=7, minute=0, second=0, microsecond=0)
    evening = local_now.replace(hour=21, minute=0, second=0, microsecond=0)
    if morning <= local_now:
        morning += dt.timedelta(days=1)
    if evening <= local_now:
        evening += dt.timedelta(days=1)
    return {"morning": morning.isoformat(), "evening": evening.isoformat()}


def compose_report(
    conn: sqlite3.Connection,
    *,
    window_name: str,
    timezone_name: str,
    extra_upcoming_actions: Optional[List[str]] = None,
) -> str:
    since = get_since_timestamp(conn)
    since_iso = iso_utc(since)
    now_iso = iso_utc()

    completed_rows = conn.execute(
        """
        SELECT task_type, COUNT(*) AS total
        FROM task_queue
        WHERE status = 'completed' AND updated_at >= ?
        GROUP BY task_type
        ORDER BY total DESC, task_type
        """,
        (since_iso,),
    ).fetchall()
    completed_lines = [f"{row['task_type']}: {int(row['total'])}" for row in completed_rows]

    active_rows = conn.execute(
        """
        SELECT task_type, COUNT(*) AS total
        FROM task_queue
        WHERE status IN ('pending', 'retry_wait')
        GROUP BY task_type
        ORDER BY total DESC, task_type
        """
    ).fetchall()
    active_lines = [f"{row['task_type']}: {int(row['total'])}" for row in active_rows]

    failed_count = int(
        conn.execute(
            "SELECT COUNT(*) AS c FROM task_queue WHERE status = 'failed' AND updated_at >= ?",
            (since_iso,),
        ).fetchone()["c"]
    )
    retry_count = int(conn.execute("SELECT COUNT(*) AS c FROM task_queue WHERE status = 'retry_wait'").fetchone()["c"])
    unresolved_critical = count_active_red_incidents(conn)
    reconciliation = summarize_event_task_reconciliation(conn, since)
    sentinel_telemetry_lines = summarize_sentinel_telemetry(conn, since)

    api_lines, quota_warning_count = summarize_api_usage(conn, since)
    health = compute_health(unresolved_critical, failed_count, retry_count, quota_warning_count)
    coverage = calculate_automation_coverage(conn)
    skill_health = summarize_skill_health(conn)

    workflow_rows = conn.execute(
        """
        SELECT event_type, COUNT(*) AS total
        FROM ops_events
        WHERE received_at >= ?
        GROUP BY event_type
        ORDER BY total DESC, event_type
        """,
        (since_iso,),
    ).fetchall()

    ghl_lines: List[str] = []
    supabase_lines: List[str] = []
    webhook_received = 0
    for row in workflow_rows:
        event_type = str(row["event_type"])
        count = int(row["total"])
        if event_type.startswith("ghl.") or event_type.startswith("social."):
            ghl_lines.append(f"{event_type}: {count}")
        if event_type.startswith("supabase."):
            supabase_lines.append(f"{event_type}: {count}")
        webhook_received += count

    sent_count = int(
        conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM action_log
            WHERE created_at >= ? AND action IN ('webhook_forwarded', 'alert_telegram_sent', 'alert_msteams_sent')
            """,
            (since_iso,),
        ).fetchone()["c"]
    )

    error_rows = conn.execute(
        """
        SELECT task_type, last_error, attempt_count, updated_at
        FROM task_queue
        WHERE status = 'failed' AND updated_at >= ?
        ORDER BY updated_at DESC
        LIMIT 10
        """,
        (since_iso,),
    ).fetchall()
    error_lines = [
        f"{row['task_type']} failed (attempts={int(row['attempt_count'])}) at {row['updated_at']}: {row['last_error']}"
        for row in error_rows
    ]
    retry_rows = conn.execute(
        """
        SELECT task_type, attempt_count, next_retry_at
        FROM task_queue
        WHERE status = 'retry_wait'
        ORDER BY next_retry_at ASC
        LIMIT 10
        """
    ).fetchall()
    retry_lines = [f"{row['task_type']} retry={int(row['attempt_count'])} next={row['next_retry_at']}" for row in retry_rows]

    alerts = conn.execute(
        """
        SELECT severity, message
        FROM alerts
        WHERE resolved_at IS NULL
                    AND alert_type != 'sentinel_dispatch'
        ORDER BY
          CASE severity WHEN 'RED' THEN 0 WHEN 'YELLOW' THEN 1 ELSE 2 END,
          last_seen_at DESC
        LIMIT 10
        """
    ).fetchall()
    action_required: List[str] = []
    for alert in alerts:
        sev = str(alert["severity"])
        msg = str(alert["message"])
        marker = "[ACTION REQUIRED] " if sev == "RED" else ""
        action_required.append(f"{marker}{sev}: {msg}")

    if reconciliation["has_drift"]:
        action_required.append(
            "[ACTION REQUIRED] YELLOW: Event/task reconciliation drift detected "
            f"(orphan_events={reconciliation['orphan_events_total']}, "
            f"orphan_tasks={reconciliation['orphan_tasks_total']}, "
            f"stale_pending={reconciliation['stale_pending_count']})"
        )

    windows = next_window_times(timezone_name)
    pending_total = int(conn.execute("SELECT COUNT(*) AS c FROM task_queue WHERE status IN ('pending', 'retry_wait')").fetchone()["c"])
    next_actions = [
        f"Next morning report window: {windows['morning']}",
        f"Next evening report window: {windows['evening']}",
        f"Pending queued tasks before next window: {pending_total}",
        (
            "Automation coverage status: "
            f"{coverage['coverage_pct']}% (A={coverage['counts']['A']}, "
            f"B={coverage['counts']['B']}, C={coverage['counts']['C']})"
        ),
    ]
    next_actions.extend(strategy_cadence_actions(timezone_name))
    if extra_upcoming_actions:
        next_actions.extend(extra_upcoming_actions)

    report = f"""# OPENCLAW {window_name.upper()} REPORT
Generated at: {now_iso}
Coverage since: {since_iso}

### 1. STATUS SUMMARY
- Overall system health: [{health}]
- Active unresolved critical incidents: {unresolved_critical}
- Automation coverage (A over A+B+C): {coverage['coverage_pct']}%
- Skill health: human {skill_health['human']['target_met']}/{skill_health['human']['total']} at target, agent {skill_health['agent']['target_met']}/{skill_health['agent']['total']} at target
- Active queued tasks (pending/retry):
{format_list_or_none(active_lines, "No active tasks running.")}
- Tasks completed since last report:
{format_list_or_none(completed_lines, "No tasks completed in this interval.")}

### 2. API USAGE LOG
{format_list_or_none(api_lines, "No API usage logged.")}

### 3. WORKFLOW ACTIVITY
- GoHighLevel automations triggered or errors detected:
{format_list_or_none(ghl_lines, "No GHL workflow activity recorded.")}
- Supabase database operations (reads/writes performed):
{format_list_or_none(supabase_lines, "No Supabase operations recorded.")}
- Any webhook events received or sent:
- Received events: {webhook_received}
- Sent events/alerts: {sent_count}
- Event/task reconciliation checks:
{format_list_or_none(reconciliation['lines'], "No reconciliation data recorded.")}
- Sentinel notification telemetry (since last report):
{format_list_or_none(sentinel_telemetry_lines, "No sentinel runs recorded in interval.")}

### 4. ERRORS & ANOMALIES
- Any failed tasks or retries:
{format_list_or_none(error_lines + retry_lines, "No failed tasks or retries in current state.")}
- Any unexpected behavior or access denials:
{format_list_or_none(action_required, "No unresolved anomalies requiring owner action.")}
- Recommended actions for owner review:
{format_list_or_none(action_required, "No owner actions required.")}

### 5. UPCOMING SCHEDULED ACTIONS
{format_list_or_none(next_actions, "No upcoming actions queued.")}
"""
    return report


def generate_social_content_plan(
    conn: sqlite3.Connection,
    *,
    report_dir: str,
    window_name: str,
    timezone_name: str,
) -> Tuple[str, List[str]]:
    since = get_since_timestamp(conn)
    rows = conn.execute(
        """
        SELECT channel, COUNT(*) AS total
        FROM ops_events
        WHERE received_at >= ? AND channel IN ('instagram', 'facebook')
        GROUP BY channel
        ORDER BY total DESC, channel
        """,
        (iso_utc(since),),
    ).fetchall()
    volumes = {str(r["channel"]): int(r["total"]) for r in rows}

    themes = [part.strip() for part in os.getenv("OPENCLAW_CAMPAIGN_THEMES", "").split(",") if part.strip()]
    if not themes:
        themes = ["Divine Alignment", "Purpose Clarity", "Momentum Habits"]

    offers = [part.strip() for part in os.getenv("OPENCLAW_ACTIVE_OFFERS", "").split(",") if part.strip()]
    primary_offer = offers[0] if offers else "Scorecard + Next Step Mapping"

    now_local = now_utc().astimezone(ZoneInfo(timezone_name))
    next_publish = now_local.replace(hour=11, minute=0, second=0, microsecond=0)
    if next_publish <= now_local:
        next_publish += dt.timedelta(days=1)

    plan_lines = [
        "# DAILY SOCIAL CONTENT PLAN",
        f"Generated at: {iso_utc()}",
        f"Window: {window_name}",
        f"Primary offer: {primary_offer}",
        "",
        "## Channel Activity Snapshot",
        f"- Instagram events since last report: {volumes.get('instagram', 0)}",
        f"- Facebook events since last report: {volumes.get('facebook', 0)}",
        "",
        "## Draft 1",
        f"- Theme: {themes[0]}",
        "- Caption: You are not behind. Alignment starts when your next decision matches your deepest values.",
        f"- CTA: Reply ALIGN and we will map your next step into {primary_offer}.",
        f"- Suggested publish slot (CST): {next_publish.isoformat()}",
        "",
        "## Draft 2",
        f"- Theme: {themes[min(1, len(themes)-1)]}",
        "- Caption: One clear move today beats ten perfect plans tomorrow. Choose clarity, then move.",
        "- CTA: Comment READY for the call path or OFFER for a low-ticket starter path.",
        f"- Suggested publish slot (CST): {(next_publish + dt.timedelta(hours=6)).isoformat()}",
        "",
        "## Governance",
        "- Max volume: 2 posts/channel/day",
        "- Routine auto-send only for approved templates",
        "- Pricing/theological/escalation requests remain review-required",
    ]

    base = Path(report_dir).expanduser()
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{now_utc().strftime('%Y%m%d-%H%M%S')}-{window_name}-content-plan.md"
    path.write_text("\n".join(plan_lines) + "\n", encoding="utf-8")
    return str(path), [f"Generated social content plan: {path}"]

class FileLock:
    def __init__(self, lock_path: str) -> None:
        self.lock_path = str(Path(lock_path).expanduser())
        self.handle: Optional[Any] = None

    def __enter__(self) -> "FileLock":
        ensure_parent(self.lock_path)
        self.handle = open(self.lock_path, "w", encoding="utf-8")
        if os.name == "nt":
            import msvcrt

            try:
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise RuntimeError("report-window lock is already held") from exc
        else:
            import fcntl

            try:
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                raise RuntimeError("report-window lock is already held") from exc
        self.handle.write(str(os.getpid()))
        self.handle.flush()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if not self.handle:
            return
        if os.name == "nt":
            import msvcrt

            self.handle.seek(0)
            try:
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        else:
            import fcntl

            try:
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
        self.handle.close()


def write_report(report_dir: str, window_name: str, content: str) -> str:
    base = Path(report_dir).expanduser()
    base.mkdir(parents=True, exist_ok=True)
    stamp = now_utc().strftime("%Y%m%d-%H%M%S")
    path = base / f"{stamp}-{window_name}.md"
    path.write_text(content, encoding="utf-8")
    return str(path)


def run_report_window(args: argparse.Namespace) -> int:
    with FileLock(args.lock_path):
        conn = connect_db(args.db_path)
        init_db(conn)
        run_id = str(uuid.uuid4())
        started_at = iso_utc()
        conn.execute(
            """
            INSERT INTO report_runs(run_id, window_name, started_at, status)
            VALUES(?, ?, ?, 'running')
            """,
            (run_id, args.window, started_at),
        )
        conn.commit()

        try:
            processed = process_task_queue(conn, max_tasks=args.max_tasks, window_name=args.window)
            content_plan_path, content_notes = generate_social_content_plan(
                conn,
                report_dir=args.report_dir,
                window_name=args.window,
                timezone_name=args.timezone,
            )
            report = compose_report(
                conn,
                window_name=args.window,
                timezone_name=args.timezone,
                extra_upcoming_actions=content_notes,
            )
            report_path = write_report(args.report_dir, args.window, report)
            summary = {
                "selected_tasks": processed["selected"],
                "completed": processed["completed"],
                "retried": processed["retried"],
                "failed": processed["failed"],
                "content_plan_path": content_plan_path,
            }
            conn.execute(
                """
                UPDATE report_runs
                SET finished_at = ?, status = 'ok', report_path = ?, summary_json = ?
                WHERE run_id = ?
                """,
                (iso_utc(), report_path, safe_json(summary), run_id),
            )
            conn.commit()
            log_action(conn, "reporting", "report_window_completed", {"window": args.window, "report_path": report_path})
            if args.print_report:
                print(report)
            else:
                print(report_path)
            return 0
        except Exception as exc:
            conn.execute(
                """
                UPDATE report_runs
                SET finished_at = ?, status = 'error', error_text = ?
                WHERE run_id = ?
                """,
                (iso_utc(), str(exc), run_id),
            )
            conn.commit()
            log_action(conn, "reporting", "report_window_failed", {"window": args.window, "error": str(exc)})
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


def collect_critical_conditions(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    critical: List[Dict[str, Any]] = []

    unresolved_red = conn.execute(
        """
        SELECT alert_id, alert_type, severity, message, details_json
        FROM alerts
        WHERE resolved_at IS NULL
          AND severity = 'RED'
          AND alert_type != 'sentinel_dispatch'
        ORDER BY last_seen_at DESC
        """
    ).fetchall()
    for row in unresolved_red:
        critical.append(
            {
                "kind": "alert",
                "message": str(row["message"]),
                "key": f"alert:{row['alert_id']}",
                "details": json.loads(str(row["details_json"])),
            }
        )

    blocked_429 = conn.execute(
        """
        SELECT api_name, endpoint, created_at
        FROM api_call_log
        WHERE status = 'rate_limited' AND critical = 1
          AND created_at >= ?
        ORDER BY created_at DESC
        """,
        (iso_utc(now_utc() - dt.timedelta(minutes=30)),),
    ).fetchall()
    for row in blocked_429:
        critical.append(
            {
                "kind": "critical_429",
                "message": f"{row['api_name']} {row['endpoint']} returned 429 for critical flow at {row['created_at']}",
                "key": f"critical_429:{row['api_name']}:{row['endpoint']}",
                "details": {"api_name": row["api_name"], "endpoint": row["endpoint"]},
            }
        )

    recent_failed_critical = conn.execute(
        """
        SELECT task_id, task_type, last_error, updated_at
        FROM task_queue
        WHERE status = 'failed' AND is_critical = 1
          AND updated_at >= ?
        ORDER BY updated_at DESC
        """,
        (iso_utc(now_utc() - dt.timedelta(hours=12)),),
    ).fetchall()
    for row in recent_failed_critical:
        critical.append(
            {
                "kind": "critical_task_failed",
                "message": f"critical task failed: id={row['task_id']} type={row['task_type']} at {row['updated_at']}",
                "key": f"critical_task_failed:{row['task_id']}",
                "details": {"task_id": row["task_id"], "error": row["last_error"]},
            }
        )

    return critical


def send_telegram_alert(bot_token: str, chat_id: str, text: str) -> None:
    endpoint = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    body = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=15):
        return


def send_msteams_alert(webhook_url: str, text: str) -> None:
    body = {"text": text}
    req = urllib.request.Request(
        webhook_url,
        data=safe_json(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15):
        return


def resolve_openclaw_cli() -> str:
    preferred = os.getenv("OPENCLAW_CLI_PATH", "").strip()
    candidates = [preferred] if preferred else []
    candidates.extend(["openclaw", "openclaw.cmd", "openclaw.exe"])
    for candidate in candidates:
        if not candidate:
            continue
        found = shutil.which(candidate)
        if found:
            return found
    raise FileNotFoundError("openclaw CLI executable not found in PATH")


def check_and_repair_gateway(conn: sqlite3.Connection) -> Dict[str, str]:
    try:
        cli = resolve_openclaw_cli()
        status_cmd = subprocess.run(
            [cli, "gateway", "status"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
        probe_cmd = subprocess.run(
            [cli, "gateway", "probe"],
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except Exception as exc:
        create_alert(
            conn,
            alert_type="gateway_check_failed",
            severity="RED",
            message=f"Gateway consistency check failed to execute: {exc}",
            details={"error": str(exc)},
            fingerprint=f"gateway_check_failed:{today_window_start()}",
        )
        return {"status": "failed", "message": f"Gateway check command failed: {exc}"}

    runtime_running = "Runtime: running" in status_cmd.stdout
    rpc_probe_ok = "RPC probe: ok" in status_cmd.stdout
    connect_ok = "Connect: ok" in probe_cmd.stdout
    if connect_ok and (runtime_running or rpc_probe_ok):
        return {"status": "healthy", "message": "Gateway endpoint health verified"}

    restart_cmd = subprocess.run(
        [cli, "gateway", "restart"],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if restart_cmd.returncode == 0:
        log_action(
            conn,
            "sentinel",
            "gateway_auto_restart",
            {
                "runtime_ok_before": runtime_running,
                "connect_ok_before": connect_ok,
                "stdout": restart_cmd.stdout[-2000:],
            },
        )
        create_alert(
            conn,
            alert_type="gateway_auto_restarted",
            severity="YELLOW",
            message="Gateway mismatch detected and auto-restart executed",
            details={"runtime_ok_before": runtime_running, "connect_ok_before": connect_ok},
            fingerprint=f"gateway_auto_restarted:{today_window_start()}",
        )
        return {"status": "restarted", "message": "Gateway mismatch auto-restarted successfully"}

    create_alert(
        conn,
        alert_type="gateway_restart_failed",
        severity="RED",
        message="Gateway mismatch detected and auto-restart failed",
        details={
            "runtime_ok_before": runtime_running,
            "connect_ok_before": connect_ok,
            "stderr": restart_cmd.stderr[-2000:],
        },
        fingerprint=f"gateway_restart_failed:{today_window_start()}",
    )
    return {"status": "failed", "message": "Gateway mismatch detected and restart failed"}


def run_sentinel(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    auto_resolved = auto_resolve_recovered_alerts(conn)
    gateway_state = check_and_repair_gateway(conn)
    critical = collect_critical_conditions(conn)
    if gateway_state["status"] == "failed":
        critical.append(
            {
                "message": gateway_state["message"],
                "key": "gateway:check_failed",
                "details": {"kind": "gateway"},
            }
        )
    if not critical:
        conn.execute(
            """
            UPDATE alerts
            SET resolved_at = COALESCE(resolved_at, ?)
            WHERE resolved_at IS NULL AND alert_type = 'sentinel_dispatch'
            """,
            (iso_utc(),),
        )
        conn.commit()
        log_action(
            conn,
            "sentinel",
            "sentinel_notification_no_alert",
            {
                "auto_resolved_total": sum(auto_resolved.values()),
                "auto_resolved": auto_resolved,
            },
        )
        print("NO_ALERT")
        return 0

    lines = ["CRITICAL ALERT", "[ACTION REQUIRED]", "Immediate exception criteria matched:"]
    for item in critical:
        lines.append(f"- {item['message']}")
    message = "\n".join(lines)

    incident_keys = sorted(str(item.get("key") or item["message"]) for item in critical)
    incident_seed = safe_json({"keys": incident_keys})
    fingerprint = hashlib.sha256(incident_seed.encode("utf-8")).hexdigest()
    row = conn.execute(
        "SELECT alert_id, notified_at FROM alerts WHERE fingerprint = ?",
        (f"sentinel:{fingerprint}",),
    ).fetchone()
    already_recent = False
    reminder_not_due = False
    elapsed_minutes: Optional[int] = None
    if row and row["notified_at"]:
        notified_at = parse_iso(str(row["notified_at"]))
        elapsed = now_utc() - notified_at
        elapsed_minutes = int(elapsed.total_seconds() // 60)
        already_recent = elapsed < dt.timedelta(minutes=args.min_notify_interval_minutes)
        if args.remind_after_minutes > 0 and elapsed < dt.timedelta(minutes=args.remind_after_minutes):
            reminder_not_due = True

    if already_recent:
        log_action(
            conn,
            "sentinel",
            "sentinel_notification_suppressed_min_interval",
            {
                "elapsed_minutes": elapsed_minutes,
                "min_notify_interval_minutes": args.min_notify_interval_minutes,
                "incident_fingerprint": fingerprint,
            },
        )
        print("CRITICAL_ALERT_ALREADY_SENT")
        return 0

    if reminder_not_due:
        log_action(
            conn,
            "sentinel",
            "sentinel_notification_suppressed_reminder",
            {
                "elapsed_minutes": elapsed_minutes,
                "remind_after_minutes": args.remind_after_minutes,
                "incident_fingerprint": fingerprint,
            },
        )
        print("CRITICAL_ALERT_STILL_ACTIVE_NO_REMINDER")
        return 0

    if not already_recent and not reminder_not_due:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.getenv("OPENCLAW_ALERT_TELEGRAM_CHAT_ID", "")
        teams_url = os.getenv("OPENCLAW_ALERT_MSTEAMS_WEBHOOK_URL", "")
        sent_count = 0

        if bot_token and chat_id:
            send_telegram_alert(bot_token, chat_id, message)
            log_action(conn, "sentinel", "alert_telegram_sent", {"chat_id": chat_id})
            sent_count += 1
        if teams_url:
            send_msteams_alert(teams_url, message)
            log_action(conn, "sentinel", "alert_msteams_sent", {"has_url": True})
            sent_count += 1

        create_alert(
            conn,
            alert_type="sentinel_dispatch",
            severity="RED",
            message="Critical sentinel notification dispatched",
            details={
                "critical_count": len(critical),
                "channels_sent": sent_count,
                "incident_keys": incident_keys,
            },
            fingerprint=f"sentinel:{fingerprint}",
        )
        conn.execute(
            "UPDATE alerts SET notified_at = ? WHERE fingerprint = ?",
            (iso_utc(), f"sentinel:{fingerprint}"),
        )
        conn.commit()
        log_action(
            conn,
            "sentinel",
            "sentinel_notification_sent",
            {
                "critical_count": len(critical),
                "channels_sent": sent_count,
                "incident_fingerprint": fingerprint,
                "incident_keys": incident_keys,
            },
        )
        if sent_count > 0:
            print("CRITICAL_ALERT_SENT")
        else:
            print("CRITICAL_ALERT_QUEUED_NO_CHANNEL")
        return 0

    print("CRITICAL_ALERT_ALREADY_SENT")
    return 0


class WebhookHandler(BaseHTTPRequestHandler):
    db_path: str = DEFAULT_DB_PATH
    shared_secret: str = ""

    def _json_response(self, code: int, payload: Dict[str, Any]) -> None:
        body = safe_json(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        if self.path != "/healthz":
            self._json_response(404, {"ok": False, "error": "not_found"})
            return
        conn = connect_db(self.db_path)
        init_db(conn)
        pending = int(
            conn.execute("SELECT COUNT(*) AS c FROM task_queue WHERE status IN ('pending', 'retry_wait')").fetchone()["c"]
        )
        self._json_response(200, {"ok": True, "pending_tasks": pending})

    def do_POST(self) -> None:
        if self.path != "/webhooks/ghl":
            self._json_response(404, {"ok": False, "error": "not_found"})
            return

        if self.shared_secret:
            incoming_secret = self.headers.get("X-OpenClaw-Secret", "").strip()
            if incoming_secret != self.shared_secret:
                self._json_response(401, {"ok": False, "error": "unauthorized"})
                return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0 or content_length > 1_000_000:
            self._json_response(400, {"ok": False, "error": "invalid_content_length"})
            return

        raw = self.rfile.read(content_length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json_response(400, {"ok": False, "error": "invalid_json"})
            return

        conn = connect_db(self.db_path)
        init_db(conn)
        try:
            result = ingest_event(conn, payload, source="ghl_webhook")
            self._json_response(202, {"ok": True, **result})
        except ValueError as exc:
            self._json_response(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            self._json_response(500, {"ok": False, "error": str(exc)})


def run_webhook_server(args: argparse.Namespace) -> int:
    host = args.host or os.getenv("OPENCLAW_GHL_WEBHOOK_HOST", "127.0.0.1")
    port = int(args.port or os.getenv("OPENCLAW_GHL_WEBHOOK_PORT", "8788"))
    secret = args.secret or os.getenv("OPENCLAW_GHL_WEBHOOK_SECRET", "")
    db_path = args.db_path or os.getenv("OPENCLAW_OPS_DB_PATH", DEFAULT_DB_PATH)

    conn = connect_db(db_path)
    init_db(conn)
    conn.close()

    WebhookHandler.db_path = db_path
    WebhookHandler.shared_secret = secret
    server = ThreadingHTTPServer((host, port), WebhookHandler)
    print(f"listening on {host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        server.server_close()

def cmd_init_db(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    print(f"initialized:{Path(args.db_path).expanduser()}")
    return 0


def cmd_ingest_event(args: argparse.Namespace) -> int:
    payload: Dict[str, Any]
    if args.json_file:
        payload = json.loads(Path(args.json_file).read_text(encoding="utf-8"))
    else:
        payload = json.loads(args.json)
    conn = connect_db(args.db_path)
    init_db(conn)
    result = ingest_event(conn, payload, source="manual")
    print(safe_json(result))
    return 0


def cmd_record_api_call(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    update_api_usage(
        conn,
        api_name=args.api_name,
        endpoint=args.endpoint,
        quota_limit=args.quota_limit,
        status=args.status,
        http_status=args.http_status,
        critical=args.critical,
        error_text=args.error_text,
    )
    print("ok")
    return 0


def cmd_snapshot(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    pending = int(conn.execute("SELECT COUNT(*) AS c FROM task_queue WHERE status IN ('pending','retry_wait')").fetchone()["c"])
    failed = int(conn.execute("SELECT COUNT(*) AS c FROM task_queue WHERE status = 'failed'").fetchone()["c"])
    critical = count_active_red_incidents(conn)
    print(
        safe_json(
            {
                "pending_tasks": pending,
                "failed_tasks": failed,
                "critical_alerts": critical,
                "db_path": str(Path(args.db_path).expanduser()),
            }
        )
    )
    return 0


def cmd_init_governance(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    paths = ensure_governance_scaffold(
        governance_dir=args.governance_dir,
        memory_dir=args.memory_dir,
    )
    has_tasks = int(conn.execute("SELECT COUNT(*) AS c FROM repeatable_tasks").fetchone()["c"])
    if has_tasks == 0:
        now = iso_utc()
        seeds = [
            ("social_sales_morning_report", "Morning consolidated report window", "A", "low", "marketing", ""),
            ("social_sales_evening_report", "Evening consolidated report window", "A", "low", "sales", ""),
            ("critical_incident_sentinel", "Critical incident sentinel", "B", "medium", "support", ""),
            ("pricing_review_triage", "Pricing/theology/review-required triage", "B", "high", "support", ""),
            ("mentorship_application_review", "Mentorship application review", "C", "high", "jeremiah", ""),
        ]
        conn.executemany(
            """
            INSERT INTO repeatable_tasks(
              repeatable_task_id, task_name, classification, risk_tier, owner, notes, updated_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            [(task_id, name, cls, risk, owner, notes, now) for task_id, name, cls, risk, owner, notes in seeds],
        )
        conn.commit()

    print(safe_json({"ok": True, "paths": paths}))
    return 0


def cmd_record_decision(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    decided_at = args.decided_at or iso_utc()
    conn.execute(
        """
        INSERT INTO decisions(decided_at, decision_text, rationale, expected_kpi, owner, review_date, status)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        """,
        (decided_at, args.decision, args.rationale, args.expected_kpi, args.owner, args.review_date, args.status),
    )
    conn.commit()

    memory_dir = Path(args.memory_dir).expanduser()
    memory_dir.mkdir(parents=True, exist_ok=True)
    register_path = memory_dir / "decision-register.md"
    if not register_path.exists():
        ensure_governance_scaffold(governance_dir=args.governance_dir, memory_dir=args.memory_dir)
    with register_path.open("a", encoding="utf-8") as fh:
        fh.write(
            f"## {decided_at}\n"
            f"- Decision: {args.decision}\n"
            f"- Rationale: {args.rationale}\n"
            f"- Expected KPI Impact: {args.expected_kpi}\n"
            f"- Owner: {args.owner}\n"
            f"- Review Date: {args.review_date}\n"
            f"- Status: {args.status}\n\n"
        )
    print(safe_json({"ok": True, "decision_register": str(register_path)}))
    return 0


def cmd_record_kpi(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    captured_at = args.captured_at or iso_utc()
    conn.execute(
        """
        INSERT INTO kpi_snapshots(captured_at, tier, kpi_name, kpi_value, unit, period, notes)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        """,
        (captured_at, args.tier, args.kpi_name, args.kpi_value, args.unit, args.period, args.notes),
    )
    conn.commit()
    print("ok")
    return 0


def cmd_upsert_skill_card(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    conn.execute(
        """
        INSERT INTO skill_cards(
          skill_id, skill_name, track, level_current, level_target, evidence_required,
          owner, review_cycle_days, status, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(skill_id) DO UPDATE SET
          skill_name = excluded.skill_name,
          track = excluded.track,
          level_current = excluded.level_current,
          level_target = excluded.level_target,
          evidence_required = excluded.evidence_required,
          owner = excluded.owner,
          review_cycle_days = excluded.review_cycle_days,
          status = excluded.status,
          updated_at = excluded.updated_at
        """,
        (
            args.skill_id,
            args.skill_name,
            args.track,
            args.level_current,
            args.level_target,
            args.evidence_required,
            args.owner,
            args.review_cycle_days,
            args.status,
            iso_utc(),
        ),
    )
    conn.commit()
    print("ok")
    return 0


def cmd_record_capability_sprint(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    now = iso_utc()
    conn.execute(
        """
        INSERT INTO capability_sprints(
          week_start, skill_id, objective, evidence_notes, outcome, remediation_notes, owner, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            args.week_start,
            args.skill_id,
            args.objective,
            args.evidence_notes,
            args.outcome,
            args.remediation_notes,
            args.owner,
            now,
            now,
        ),
    )
    conn.commit()
    print("ok")
    return 0


def cmd_upsert_repeatable_task(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    conn.execute(
        """
        INSERT INTO repeatable_tasks(
          repeatable_task_id, task_name, classification, risk_tier, owner, notes, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repeatable_task_id) DO UPDATE SET
          task_name = excluded.task_name,
          classification = excluded.classification,
          risk_tier = excluded.risk_tier,
          owner = excluded.owner,
          notes = excluded.notes,
          updated_at = excluded.updated_at
        """,
        (
            args.repeatable_task_id,
            args.task_name,
            args.classification,
            args.risk_tier,
            args.owner,
            args.notes,
            iso_utc(),
        ),
    )
    conn.commit()
    print("ok")
    return 0


def cmd_governance_snapshot(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    coverage = calculate_automation_coverage(conn)
    skills = summarize_skill_health(conn)
    recent_decisions = conn.execute(
        """
        SELECT decided_at, decision_text, expected_kpi, owner, review_date, status
        FROM decisions
        ORDER BY decided_at DESC
        LIMIT 10
        """
    ).fetchall()
    decisions = [
        {
            "decided_at": row["decided_at"],
            "decision_text": row["decision_text"],
            "expected_kpi": row["expected_kpi"],
            "owner": row["owner"],
            "review_date": row["review_date"],
            "status": row["status"],
        }
        for row in recent_decisions
    ]
    print(
        safe_json(
            {
                "coverage": coverage,
                "skill_health": skills,
                "recent_decisions": decisions,
            }
        )
    )
    return 0


def cmd_resolve_alerts(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    now = iso_utc()
    clauses = ["resolved_at IS NULL"]
    params: List[Any] = []
    if args.alert_type:
        clauses.append("alert_type = ?")
        params.append(args.alert_type)
    if args.severity:
        clauses.append("severity = ?")
        params.append(args.severity)
    where_sql = " AND ".join(clauses)
    row = conn.execute(f"SELECT COUNT(*) AS c FROM alerts WHERE {where_sql}", tuple(params)).fetchone()
    count = int(row["c"])
    if args.dry_run:
        print(safe_json({"dry_run": True, "matching_open_alerts": count, "where": where_sql}))
        return 0
    conn.execute(f"UPDATE alerts SET resolved_at = ? WHERE {where_sql}", (now, *params))
    conn.commit()
    print(safe_json({"resolved": count, "resolved_at": now}))
    return 0


def cmd_reconciliation_check(args: argparse.Namespace) -> int:
    conn = connect_db(args.db_path)
    init_db(conn)
    since = now_utc() - dt.timedelta(minutes=args.since_minutes)
    summary = summarize_event_task_reconciliation(conn, since)
    summary_payload = {
        "since_minutes": args.since_minutes,
        "status": "drift" if summary["has_drift"] else "ok",
        "orphan_events_total": summary["orphan_events_total"],
        "orphan_events_since": summary["orphan_events_since"],
        "orphan_tasks_total": summary["orphan_tasks_total"],
        "stale_pending_count": summary["stale_pending_count"],
        "oldest_pending_minutes": summary["oldest_pending_minutes"],
        "lines": summary["lines"],
    }
    print(safe_json(summary_payload))
    return 0


def cmd_queue_check(args: argparse.Namespace) -> int:
    """Check if a job can run within its control loop budget."""
    import time as _time
    jobs_path = args.jobs_path
    job_id = args.job_id

    try:
        with open(jobs_path, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(safe_json({"error": str(e), "job_id": job_id, "decision": "allow"}))
        return 0  # fail-open: if we can't read config, allow the job

    loops = config.get("control_loops", {})
    loop_name = None
    loop_def = None
    for name, defn in loops.items():
        if job_id in defn.get("members", []):
            loop_name = name
            loop_def = defn
            break

    if loop_name is None:
        print(safe_json({"job_id": job_id, "loop": None, "decision": "allow", "reason": "not in any control loop"}))
        return 0

    max_concurrent = loop_def.get("max_concurrent", 1)
    member_ids = set(loop_def.get("members", []))
    jobs = config.get("jobs", [])
    now_ms = int(_time.time() * 1000)
    running = 0

    for job in jobs:
        if job.get("id") not in member_ids or job.get("id") == job_id:
            continue
        state = job.get("state", {})
        last_run = state.get("lastRunAtMs", 0)
        max_runtime = job.get("max_runtime_ms", 300000)
        if last_run > 0 and (now_ms - last_run) < max_runtime:
            last_success = state.get("lastSuccessAtMs", 0)
            if last_success < last_run:
                running += 1

    if running >= max_concurrent:
        print(safe_json({"job_id": job_id, "loop": loop_name, "decision": "defer", "running": running, "max": max_concurrent}))
        return 1

    print(safe_json({"job_id": job_id, "loop": loop_name, "decision": "allow", "running": running, "max": max_concurrent}))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenClaw low-API operations control")
    parser.add_argument("--db-path", default=os.getenv("OPENCLAW_OPS_DB_PATH", DEFAULT_DB_PATH))
    sub = parser.add_subparsers(dest="command", required=True)

    initp = sub.add_parser("init-db", help="Initialize sqlite schema")
    initp.set_defaults(func=cmd_init_db)

    serve = sub.add_parser("serve-webhook", help="Run webhook server")
    serve.add_argument("--host", default=None)
    serve.add_argument("--port", default=None)
    serve.add_argument("--secret", default=None)
    serve.set_defaults(func=run_webhook_server)

    ingest = sub.add_parser("ingest-event", help="Ingest one event for testing")
    ingest_group = ingest.add_mutually_exclusive_group(required=True)
    ingest_group.add_argument("--json")
    ingest_group.add_argument("--json-file")
    ingest.set_defaults(func=cmd_ingest_event)

    report = sub.add_parser("report-window", help="Process queue and compose scheduled report")
    report.add_argument("--window", choices=["morning", "evening"], required=True)
    report.add_argument("--timezone", default="America/Chicago")
    report.add_argument("--report-dir", default=os.getenv("OPENCLAW_REPORT_DIR", DEFAULT_REPORT_DIR))
    report.add_argument("--lock-path", default=os.getenv("OPENCLAW_REPORT_LOCK_PATH", DEFAULT_LOCK_PATH))
    report.add_argument("--max-tasks", type=int, default=500)
    report.add_argument("--print-report", action="store_true")
    report.set_defaults(func=run_report_window)

    sentinel = sub.add_parser("sentinel", help="Evaluate critical conditions and notify only on exceptions")
    sentinel.add_argument("--timezone", default="America/Chicago")
    sentinel.add_argument("--min-notify-interval-minutes", type=int, default=60)
    sentinel.add_argument(
        "--remind-after-minutes",
        type=int,
        default=360,
        help="Reminder cadence for unchanged active incidents (0 disables reminders).",
    )
    sentinel.set_defaults(func=run_sentinel)

    apilog = sub.add_parser("record-api-call", help="Record API call usage")
    apilog.add_argument("--api-name", required=True)
    apilog.add_argument("--endpoint", required=True)
    apilog.add_argument("--quota-limit", type=int, required=True)
    apilog.add_argument("--status", choices=["ok", "cached", "error", "rate_limited"], required=True)
    apilog.add_argument("--http-status", type=int, default=None)
    apilog.add_argument("--critical", action="store_true")
    apilog.add_argument("--error-text", default=None)
    apilog.set_defaults(func=cmd_record_api_call)

    snapshot = sub.add_parser("snapshot", help="Print current queue/alert counters")
    snapshot.set_defaults(func=cmd_snapshot)

    gov_init = sub.add_parser("init-governance", help="Initialize strategy/skill governance scaffold")
    gov_init.add_argument("--governance-dir", default=os.getenv("OPENCLAW_GOVERNANCE_DIR", DEFAULT_GOV_DIR))
    gov_init.add_argument("--memory-dir", default=os.getenv("OPENCLAW_MEMORY_DIR", DEFAULT_MEMORY_DIR))
    gov_init.set_defaults(func=cmd_init_governance)

    decision = sub.add_parser("record-decision", help="Append decision register entry")
    decision.add_argument("--decision", required=True)
    decision.add_argument("--rationale", required=True)
    decision.add_argument("--expected-kpi", required=True)
    decision.add_argument("--owner", required=True)
    decision.add_argument("--review-date", required=True, help="YYYY-MM-DD")
    decision.add_argument("--status", default="open")
    decision.add_argument("--decided-at", default=None)
    decision.add_argument("--governance-dir", default=os.getenv("OPENCLAW_GOVERNANCE_DIR", DEFAULT_GOV_DIR))
    decision.add_argument("--memory-dir", default=os.getenv("OPENCLAW_MEMORY_DIR", DEFAULT_MEMORY_DIR))
    decision.set_defaults(func=cmd_record_decision)

    kpi = sub.add_parser("record-kpi", help="Record KPI snapshot")
    kpi.add_argument("--tier", choices=["systems", "growth", "strategy"], required=True)
    kpi.add_argument("--kpi-name", required=True)
    kpi.add_argument("--kpi-value", type=float, required=True)
    kpi.add_argument("--unit", default="count")
    kpi.add_argument("--period", default="daily")
    kpi.add_argument("--notes", default=None)
    kpi.add_argument("--captured-at", default=None)
    kpi.set_defaults(func=cmd_record_kpi)

    skill = sub.add_parser("upsert-skill-card", help="Create or update a skill card")
    skill.add_argument("--skill-id", required=True)
    skill.add_argument("--skill-name", required=True)
    skill.add_argument("--track", choices=["human", "agent"], required=True)
    skill.add_argument("--level-current", type=int, required=True)
    skill.add_argument("--level-target", type=int, required=True)
    skill.add_argument("--evidence-required", required=True)
    skill.add_argument("--owner", required=True)
    skill.add_argument("--review-cycle-days", type=int, default=7)
    skill.add_argument("--status", default="active")
    skill.set_defaults(func=cmd_upsert_skill_card)

    sprint = sub.add_parser("record-capability-sprint", help="Record weekly capability sprint result")
    sprint.add_argument("--week-start", required=True, help="YYYY-MM-DD")
    sprint.add_argument("--skill-id", required=True)
    sprint.add_argument("--objective", required=True)
    sprint.add_argument("--outcome", choices=["planned", "pass", "fail"], required=True)
    sprint.add_argument("--owner", required=True)
    sprint.add_argument("--evidence-notes", default=None)
    sprint.add_argument("--remediation-notes", default=None)
    sprint.set_defaults(func=cmd_record_capability_sprint)

    repeatable = sub.add_parser("upsert-repeatable-task", help="Create or update repeatable task classification")
    repeatable.add_argument("--repeatable-task-id", required=True)
    repeatable.add_argument("--task-name", required=True)
    repeatable.add_argument("--classification", choices=["A", "B", "C"], required=True)
    repeatable.add_argument("--risk-tier", choices=["low", "medium", "high"], required=True)
    repeatable.add_argument("--owner", required=True)
    repeatable.add_argument("--notes", default=None)
    repeatable.set_defaults(func=cmd_upsert_repeatable_task)

    gov_snapshot = sub.add_parser("governance-snapshot", help="Show automation coverage and skill progress")
    gov_snapshot.set_defaults(func=cmd_governance_snapshot)

    resolve_alerts = sub.add_parser("resolve-alerts", help="Resolve open alerts by type/severity filter")
    resolve_alerts.add_argument("--alert-type", default=None)
    resolve_alerts.add_argument("--severity", choices=["YELLOW", "RED"], default=None)
    resolve_alerts.add_argument("--dry-run", action="store_true", help="Preview matching alerts without resolving them")
    resolve_alerts.set_defaults(func=cmd_resolve_alerts)

    reconciliation = sub.add_parser("reconciliation-check", help="Check event/task reconciliation drift")
    reconciliation.add_argument("--since-minutes", type=int, default=720, help="Lookback window for recent orphan-event count")
    reconciliation.set_defaults(func=cmd_reconciliation_check)

    queue_check = sub.add_parser("queue-check", help="Check if a job can run within its control loop budget")
    queue_check.add_argument("--job-id", required=True, help="Cron job ID to check")
    queue_check.add_argument("--jobs-path", default=os.path.expanduser("~/.openclaw/cron/jobs.json"), help="Path to jobs.json")
    queue_check.set_defaults(func=cmd_queue_check)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
