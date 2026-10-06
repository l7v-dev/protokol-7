"""Run catalog lifecycle and opt-in decorator integration."""

import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from pipelines.shared.daemon_run import DaemonRun, monitor_daemon


class DaemonRunTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "daemon.sqlite")

    def rows(self):
        with closing(sqlite3.connect(self.path)) as conn:
            return conn.execute("SELECT status,last_heartbeat_at,error_message FROM pipeline_runs ORDER BY run_id").fetchall()

    def test_run_is_active_then_completed_after_thread_join(self):
        with DaemonRun(self.path, "pilot") as run:
            thread = run.writer._thread
            self.assertEqual(self.rows()[0][0], "INGESTING")
            self.assertIsNotNone(self.rows()[0][1])
        self.assertFalse(thread.is_alive())
        self.assertEqual(self.rows()[0][0], "COMPLETED")

    def test_failure_is_recorded_without_message_secrets(self):
        with self.assertRaisesRegex(ValueError, "private"):
            with DaemonRun(self.path, "pilot"):
                raise ValueError("private")
        self.assertEqual(self.rows()[0][::2], ("FAILED", "ValueError"))

    def test_source_catalog_is_rejected_without_modification(self):
        with closing(sqlite3.connect(self.path)) as conn:
            conn.execute("CREATE TABLE shards (name TEXT)")
        with self.assertRaises(ValueError):
            with DaemonRun(self.path, "pilot"):
                pass
        with closing(sqlite3.connect(self.path)) as conn:
            self.assertEqual(conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(), [("shards",)])

    def test_reaper_failure_is_not_overwritten_by_completion(self):
        with self.assertRaisesRegex(LookupError, "missing or inactive"):
            with DaemonRun(self.path, "pilot"):
                with closing(sqlite3.connect(self.path)) as conn:
                    with conn:
                        conn.execute("UPDATE pipeline_runs SET status='FAILED',error_message='Heartbeat expired'")
        self.assertEqual(self.rows()[0][::2], ("FAILED", "Heartbeat expired"))

    def test_disabled_decorator_preserves_function(self):
        @monitor_daemon("pilot")
        def compute(value):
            return value + 1
        with patch.dict(os.environ, {"PROTOKOL_DAEMON_RUN_DB": ""}):
            self.assertEqual(compute(4), 5)
        self.assertFalse(Path(self.path).exists())

    def test_enabled_decorator_and_status_bypass(self):
        @monitor_daemon("pilot", enabled=lambda status: not status)
        def compute(status):
            return "done"
        with patch.dict(os.environ, {"PROTOKOL_DAEMON_RUN_DB": self.path}):
            self.assertEqual(compute(True), "done")
            self.assertFalse(Path(self.path).exists())
            self.assertEqual(compute(False), "done")
        self.assertEqual(self.rows()[0][0], "COMPLETED")

    def test_multiple_producers_have_distinct_runs(self):
        with DaemonRun(self.path, "one") as first:
            with DaemonRun(self.path, "two") as second:
                self.assertNotEqual(first.run_id, second.run_id)
                self.assertEqual([r[0] for r in self.rows()], ["INGESTING", "INGESTING"])
        self.assertEqual([r[0] for r in self.rows()], ["COMPLETED", "COMPLETED"])


if __name__ == "__main__":
    unittest.main()
