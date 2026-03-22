import argparse
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parent))
import ops_control


class OpsControlSentinelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "ops.db")
        self.conn = ops_control.connect_db(self.db_path)
        ops_control.init_db(self.conn)

    def tearDown(self) -> None:
        self.conn.close()
        self.temp_dir.cleanup()

    def _insert_alert(self, *, fingerprint: str, alert_type: str, severity: str, message: str) -> None:
        now = ops_control.iso_utc()
        self.conn.execute(
            """
            INSERT INTO alerts(
              alert_id, fingerprint, alert_type, severity, message, details_json,
              first_seen_at, last_seen_at, notified_at, resolved_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            """,
            (
                f"aid-{fingerprint}",
                fingerprint,
                alert_type,
                severity,
                message,
                json.dumps({"source": "test"}),
                now,
                now,
            ),
        )
        self.conn.commit()

    def test_collect_critical_conditions_excludes_sentinel_dispatch(self) -> None:
        self._insert_alert(
            fingerprint="f1",
            alert_type="sentinel_dispatch",
            severity="RED",
            message="Critical sentinel notification dispatched",
        )
        self._insert_alert(
            fingerprint="f2",
            alert_type="critical_task_failed",
            severity="RED",
            message="Critical task failed",
        )

        critical = ops_control.collect_critical_conditions(self.conn)
        messages = [item["message"] for item in critical]

        self.assertIn("Critical task failed", messages)
        self.assertNotIn("Critical sentinel notification dispatched", messages)

    def test_compose_report_dedupes_owner_actions_and_ignores_sentinel_dispatch(self) -> None:
        self._insert_alert(
            fingerprint="dup-1",
            alert_type="critical_task_failed",
            severity="RED",
            message="Queue overflow on critical worker",
        )
        self._insert_alert(
            fingerprint="dup-2",
            alert_type="critical_task_failed",
            severity="RED",
            message="Queue overflow on critical worker",
        )
        self._insert_alert(
            fingerprint="sent-1",
            alert_type="sentinel_dispatch",
            severity="RED",
            message="Critical sentinel notification dispatched",
        )

        report = ops_control.compose_report(
            self.conn,
            window_name="morning",
            timezone_name="UTC",
        )

        self.assertEqual(report.count("[ACTION REQUIRED] RED: Queue overflow on critical worker"), 2)
        self.assertNotIn("Critical sentinel notification dispatched", report)

    def test_compose_report_health_green_when_only_sentinel_dispatch_open(self) -> None:
        self._insert_alert(
            fingerprint="sent-only",
            alert_type="sentinel_dispatch",
            severity="RED",
            message="Critical sentinel notification dispatched",
        )

        report = ops_control.compose_report(
            self.conn,
            window_name="evening",
            timezone_name="UTC",
        )

        self.assertIn("- Overall system health: [GREEN]", report)

    def test_snapshot_excludes_sentinel_dispatch_from_critical_count(self) -> None:
        self._insert_alert(
            fingerprint="sent-snapshot",
            alert_type="sentinel_dispatch",
            severity="RED",
            message="Critical sentinel notification dispatched",
        )

        args = argparse.Namespace(db_path=self.db_path)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            rc = ops_control.cmd_snapshot(args)

        self.assertEqual(rc, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["critical_alerts"], 0)

    def test_run_sentinel_no_alert_when_only_sentinel_dispatch_exists(self) -> None:
        self._insert_alert(
            fingerprint="sent-loop",
            alert_type="sentinel_dispatch",
            severity="RED",
            message="Critical sentinel notification dispatched",
        )

        args = argparse.Namespace(
            db_path=self.db_path,
            timezone="UTC",
            min_notify_interval_minutes=60,
        )

        stdout = io.StringIO()
        with mock.patch.object(ops_control, "check_and_repair_gateway", return_value={"status": "healthy", "message": "ok"}):
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.run_sentinel(args)

        self.assertEqual(rc, 0)
        self.assertIn("NO_ALERT", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
