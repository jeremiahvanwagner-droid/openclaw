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


class HetznerRestartServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "ops.db")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_args(self, server: str, token: str = "tok-test") -> argparse.Namespace:
        return argparse.Namespace(db_path=self.db_path, server=server, hetzner_token=token)

    def test_reboot_by_numeric_id_success(self) -> None:
        action_payload = {"action": {"id": 42, "status": "running"}}
        with mock.patch.object(ops_control, "hetzner_reboot_server", return_value=action_payload) as mock_reboot:
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.cmd_hetzner_restart_server(self._make_args("12345"))
        self.assertEqual(rc, 0)
        mock_reboot.assert_called_once_with("tok-test", "12345")
        result = json.loads(stdout.getvalue())
        self.assertTrue(result["ok"])
        self.assertEqual(result["server"], "12345")

    def test_reboot_by_name_success(self) -> None:
        action_payload = {"action": {"id": 99, "status": "running"}}
        with mock.patch.object(ops_control, "hetzner_reboot_server", return_value=action_payload):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.cmd_hetzner_restart_server(self._make_args("my-prod-server"))
        self.assertEqual(rc, 0)
        result = json.loads(stdout.getvalue())
        self.assertTrue(result["ok"])

    def test_missing_token_returns_error(self) -> None:
        args = argparse.Namespace(db_path=self.db_path, server="my-server", hetzner_token=None)
        with mock.patch.dict("os.environ", {}, clear=True):
            # Remove HETZNER_API_TOKEN if set in the environment
            import os as _os
            _os.environ.pop("HETZNER_API_TOKEN", None)
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.cmd_hetzner_restart_server(args)
        self.assertEqual(rc, 1)
        result = json.loads(stdout.getvalue())
        self.assertFalse(result["ok"])
        self.assertIn("HETZNER_API_TOKEN", result["error"])

    def test_api_error_returns_error(self) -> None:
        with mock.patch.object(ops_control, "hetzner_reboot_server", side_effect=RuntimeError("API error 404")):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.cmd_hetzner_restart_server(self._make_args("bad-server"))
        self.assertEqual(rc, 1)
        result = json.loads(stdout.getvalue())
        self.assertFalse(result["ok"])
        self.assertIn("API error 404", result["error"])

    def test_hetzner_reboot_server_resolves_name(self) -> None:
        list_response_body = json.dumps({"servers": [{"id": 777, "name": "my-server"}]}).encode()
        reboot_response_body = json.dumps({"action": {"id": 1, "status": "running"}}).encode()

        responses = iter([list_response_body, reboot_response_body])

        class FakeResp:
            def __init__(self, body: bytes) -> None:
                self._body = body
                self.status = 200

            def read(self) -> bytes:
                return self._body

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        def fake_urlopen(req, timeout=15):
            return FakeResp(next(responses))

        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = ops_control.hetzner_reboot_server("tok", "my-server")

        self.assertEqual(result["action"]["id"], 1)

    def test_hetzner_reboot_server_name_not_found(self) -> None:
        list_response_body = json.dumps({"servers": []}).encode()

        class FakeResp:
            def __init__(self, body):
                self._body = body

            def read(self):
                return self._body

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        with mock.patch("urllib.request.urlopen", return_value=FakeResp(list_response_body)):
            with self.assertRaises(ValueError) as ctx:
                ops_control.hetzner_reboot_server("tok", "ghost-server")

        self.assertIn("ghost-server", str(ctx.exception))

    def test_parser_registers_hetzner_restart_server(self) -> None:
        parser = ops_control.build_parser()
        # If the subcommand is not registered, parse_args raises SystemExit
        args = parser.parse_args(["--db-path", "/tmp/x.db", "hetzner-restart-server", "--server", "myserver", "--hetzner-token", "t"])
        self.assertEqual(args.server, "myserver")
        self.assertEqual(args.hetzner_token, "t")
        self.assertIs(args.func, ops_control.cmd_hetzner_restart_server)

    def test_success_logs_action_to_db(self) -> None:
        action_payload = {"action": {"id": 55, "status": "running"}}
        conn = ops_control.connect_db(self.db_path)
        ops_control.init_db(conn)
        conn.close()
        with mock.patch.object(ops_control, "hetzner_reboot_server", return_value=action_payload):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.cmd_hetzner_restart_server(self._make_args("prod-server"))
        self.assertEqual(rc, 0)
        conn2 = ops_control.connect_db(self.db_path)
        row = conn2.execute("SELECT action, details_json FROM action_log WHERE component = 'hetzner' ORDER BY created_at DESC LIMIT 1").fetchone()
        conn2.close()
        self.assertIsNotNone(row)
        self.assertEqual(row["action"], "server_reboot")
        details = json.loads(row["details_json"])
        self.assertEqual(details["server"], "prod-server")
        self.assertEqual(details["action_id"], 55)

    def test_failure_logs_action_to_db(self) -> None:
        conn = ops_control.connect_db(self.db_path)
        ops_control.init_db(conn)
        conn.close()
        with mock.patch.object(ops_control, "hetzner_reboot_server", side_effect=RuntimeError("timeout")):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                rc = ops_control.cmd_hetzner_restart_server(self._make_args("prod-server"))
        self.assertEqual(rc, 1)
        conn2 = ops_control.connect_db(self.db_path)
        row = conn2.execute("SELECT action, details_json FROM action_log WHERE component = 'hetzner' ORDER BY created_at DESC LIMIT 1").fetchone()
        conn2.close()
        self.assertIsNotNone(row)
        self.assertEqual(row["action"], "server_reboot_failed")
        details = json.loads(row["details_json"])
        self.assertIn("timeout", details["error"])


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
