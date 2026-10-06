"""Expiry thresholds, corpus schema, and stale write races."""

import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from pipelines.shared.heartbeat_migration import apply_heartbeat_migration
from pipelines.shared.heartbeat_writer import HeartbeatWriter
from pipelines.shared.stale_detector import StalePipelineDetector


class StaleDetectorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "catalog.sqlite")
        schema = Path(__file__).resolve().parents[1] / "dump/corpus_pipeline/schema.sql"
        with closing(sqlite3.connect(self.path)) as conn:
            conn.executescript(schema.read_text(encoding="utf-8"))
        apply_heartbeat_migration(self.path)
        self.now = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
        self.detector = StalePipelineDetector(self.path)

    def add_run(self, run_id, age=None, status="INGESTING", interval=60):
        heartbeat = (self.now - timedelta(seconds=age)).isoformat() if age is not None else None
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("INSERT INTO pipeline_runs (run_id, dataset_id, status, target_storage_provider, created_at, last_heartbeat_at, heartbeat_interval_seconds) VALUES (?, 'dataset', ?, 'local', ?, ?, ?)",
                             (run_id, status, self.now.isoformat(), heartbeat, interval))

    def test_threshold_null_terminal_and_future(self):
        for run_id, age, status in (("expired", 181, "INGESTING"), ("edge", 180, "PACKING"), ("fresh", 179, "CLEANING"), ("legacy", None, "VERIFYING"), ("terminal", 500, "COMPLETED"), ("failed", 500, "FAILED"), ("future", -20, "INITIALIZING")):
            self.add_run(run_id, age, status)
        self.assertEqual([r["run_id"] for r in self.detector.get_stale_runs(now=self.now)], ["expired"])

    def test_interval_and_grace_are_per_run(self):
        self.add_run("slow", 181, interval=120)
        self.add_run("fast", 181, interval=30)
        self.assertEqual([r["run_id"] for r in self.detector.get_stale_runs(now=self.now)], ["fast"])
        self.assertEqual(len(self.detector.get_stale_runs(1, now=self.now)), 2)

    def test_atomic_mark_uses_supported_status_and_is_idempotent(self):
        self.add_run("expired", 181)
        self.assertTrue(self.detector.mark_stale("expired", now=self.now))
        self.assertFalse(self.detector.mark_stale("expired", now=self.now))
        with closing(sqlite3.connect(self.path)) as conn:
            row = conn.execute("SELECT status, completed_at, error_message FROM pipeline_runs").fetchone()
        self.assertEqual(row, ("FAILED", self.now.isoformat(), "Heartbeat expired"))

    def test_heartbeat_refresh_between_detection_and_mark_is_preserved(self):
        self.add_run("race", 181)
        self.assertEqual(len(self.detector.get_stale_runs(now=self.now)), 1)
        with patch("pipelines.shared.heartbeat_writer.datetime") as clock:
            clock.now.return_value = self.now
            HeartbeatWriter(self.path, "race").ping()
        self.assertFalse(self.detector.mark_stale("race", now=self.now))

    def test_timezone_offsets_are_normalized(self):
        self.add_run("offset", 181)
        stamp = (self.now - timedelta(seconds=181)).astimezone(timezone(timedelta(hours=3)))
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("UPDATE pipeline_runs SET last_heartbeat_at=?", (stamp.isoformat(),))
        self.assertEqual([r["run_id"] for r in self.detector.get_stale_runs(now=self.now)], ["offset"])
        with closing(sqlite3.connect(self.path)) as conn:
            self.assertEqual(conn.execute("SELECT status FROM pipeline_runs").fetchone()[0], "INGESTING")

    def test_completed_after_detection_is_preserved(self):
        self.add_run("race", 181)
        self.detector.get_stale_runs(now=self.now)
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("UPDATE pipeline_runs SET status='COMPLETED'")
        self.assertFalse(self.detector.mark_stale("race", now=self.now))

    def test_null_and_missing_run_are_not_marked(self):
        self.add_run("legacy")
        self.assertFalse(self.detector.mark_stale("legacy", now=self.now))
        self.assertFalse(self.detector.mark_stale("missing", now=self.now))

    def test_invalid_timestamp_is_not_classified_as_expired(self):
        self.add_run("invalid", 300)
        with closing(sqlite3.connect(self.path)) as conn:
            with conn:
                conn.execute("UPDATE pipeline_runs SET last_heartbeat_at='invalid'")
        self.assertEqual(self.detector.get_stale_runs(now=self.now), [])

    def test_missing_database_is_not_created(self):
        path = Path(self.directory.name) / "missing.sqlite"
        detector = StalePipelineDetector(str(path))
        with self.assertRaises(sqlite3.OperationalError):
            detector.get_stale_runs()
        with self.assertRaises(sqlite3.OperationalError):
            detector.mark_stale("run")
        self.assertFalse(path.exists())

    def test_invalid_parameters(self):
        for value in (0, -1, True, float("nan"), float("inf"), "3"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.detector.get_stale_runs(value, now=self.now)
        with self.assertRaises(ValueError):
            self.detector.get_stale_runs(now=datetime(2026, 10, 5))


if __name__ == "__main__":
    unittest.main()
