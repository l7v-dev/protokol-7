"""SQLite and thread lifecycle integration tests for heartbeat writes."""

import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from pipelines.shared.heartbeat_migration import apply_heartbeat_migration
from pipelines.shared.heartbeat_writer import HeartbeatWriter


class HeartbeatWriterTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "catalog.sqlite")
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("CREATE TABLE pipeline_runs (run_id TEXT PRIMARY KEY, status TEXT, cursor TEXT)")
                conn.execute("INSERT INTO pipeline_runs VALUES ('run', 'INGESTING', 'durable')")
                conn.execute("INSERT INTO pipeline_runs VALUES ('other', 'COMPLETED', 'other')")
        apply_heartbeat_migration(self.path)

    def row(self, run_id="run"):
        with closing(sqlite3.connect(self.path)) as conn:
            return conn.execute("SELECT status, cursor, last_heartbeat_at, heartbeat_interval_seconds FROM pipeline_runs WHERE run_id=?", (run_id,)).fetchone()

    def test_ping_updates_only_target_liveness(self):
        HeartbeatWriter(self.path, "run", 30).ping()
        row = self.row()
        self.assertEqual(row[:2], ("INGESTING", "durable"))
        self.assertIsNotNone(datetime.fromisoformat(row[2]).tzinfo)
        self.assertEqual(row[3], 30)
        self.assertEqual(self.row("other"), ("COMPLETED", "other", None, 60))

    def test_periodic_write_and_stop_join(self):
        writer = HeartbeatWriter(self.path, "run", 1)
        updated = threading.Event()
        original = writer._write

        def write():
            original()
            if threading.current_thread().name == "pipeline-heartbeat":
                updated.set()

        with patch.object(writer, "_write", side_effect=write):
            writer.start()
            thread = writer._thread
            first = self.row()[2]
            try:
                self.assertTrue(updated.wait(3), "Periodic heartbeat did not run")
                self.assertGreater(self.row()[2], first)
            finally:
                writer.stop()
            self.assertFalse(thread.is_alive())

    def test_stop_writes_final_heartbeat_and_is_idempotent(self):
        writer = HeartbeatWriter(self.path, "run")
        with patch.object(writer, "_write", wraps=writer._write) as write:
            writer.start()
            thread = writer._thread
            writer.start()
            self.assertIs(writer._thread, thread)
            writer.stop()
            writer.stop()
            self.assertEqual(write.call_count, 2)

    def test_context_closes_thread_on_body_failure(self):
        writer = HeartbeatWriter(self.path, "run")
        with self.assertRaisesRegex(ValueError, "body failed"):
            with writer:
                thread = writer._thread
                raise ValueError("body failed")
        self.assertFalse(thread.is_alive())

    def test_missing_run_fails_before_thread_start(self):
        writer = HeartbeatWriter(self.path, "missing")
        with self.assertRaises(LookupError):
            writer.start()
        self.assertIsNone(writer._thread)

    def test_terminal_run_cannot_receive_heartbeat(self):
        writer = HeartbeatWriter(self.path, "other")
        with self.assertRaisesRegex(LookupError, "inactive"):
            writer.ping()
        self.assertEqual(self.row("other"), ("COMPLETED", "other", None, 60))

    def test_missing_catalog_is_not_created(self):
        missing = str(Path(self.directory.name) / "missing.sqlite")
        with self.assertRaises(sqlite3.OperationalError):
            HeartbeatWriter(missing, "run").start()
        self.assertFalse(Path(missing).exists())

    def test_unmigrated_catalog_fails_before_thread_start(self):
        unmigrated = str(Path(self.directory.name) / "unmigrated.sqlite")
        with closing(sqlite3.connect(unmigrated)) as conn:
            with conn:
                conn.execute("CREATE TABLE pipeline_runs (run_id TEXT PRIMARY KEY)")
                conn.execute("INSERT INTO pipeline_runs VALUES ('run')")
        writer = HeartbeatWriter(unmigrated, "run")
        with self.assertRaises(sqlite3.OperationalError):
            writer.start()
        self.assertIsNone(writer._thread)

    def test_shutdown_failure_preserves_body_exception(self):
        writer = HeartbeatWriter(self.path, "run")
        with self.assertRaisesRegex(ValueError, "body failed") as failure:
            with writer:
                thread = writer._thread
                with closing(sqlite3.connect(self.path)) as conn:
                    with conn:
                        conn.execute("DELETE FROM pipeline_runs WHERE run_id='run'")
                raise ValueError("body failed")
        self.assertFalse(thread.is_alive())
        self.assertIn("Heartbeat shutdown failed: LookupError", failure.exception.__notes__)

    def test_background_failure_is_visible_and_thread_is_joined(self):
        writer = HeartbeatWriter(self.path, "run", 1)
        writer.start()
        thread = writer._thread
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("DELETE FROM pipeline_runs WHERE run_id='run'")
        self.assertTrue(writer._stop_event.wait(3))
        self.assertIsInstance(writer.error, LookupError)
        with self.assertRaisesRegex(RuntimeError, "Background heartbeat failed"):
            writer.stop()
        self.assertFalse(thread.is_alive())

    def test_invalid_arguments(self):
        for interval in (0, -1, True, 0.5, float("nan")):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                HeartbeatWriter(self.path, "run", interval)
        with self.assertRaises(ValueError):
            HeartbeatWriter(self.path, " ")


if __name__ == "__main__":
    unittest.main()
