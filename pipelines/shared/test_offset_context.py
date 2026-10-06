"""State restart, atomicity, and concurrent cursor fencing integration tests."""

import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from pipelines.shared.daemon_run import DaemonRun
from pipelines.shared.offset_context import OffsetContext, StaleWriteError
from pipelines.shared.stale_detector import StalePipelineDetector
from pipelines.shared.state_merge import merge_partial
from pipelines.shared.state_migration import apply_state_migration


class OffsetTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "monitor.sqlite")
        self.context = OffsetContext(self.path, "source:query:revision")

    def test_merge_objects_arrays_null_and_input_isolation(self):
        before = {"source": {"page": 4, "schema": "v1"}, "items": [1, 2], "token": "old"}
        patch = {"source": {"page": 5}, "items": [3], "token": None}
        merged = merge_partial(before, patch)
        self.assertEqual(merged, {"source": {"page": 5, "schema": "v1"}, "items": [3], "token": None})
        merged["source"]["schema"] = "v2"
        self.assertEqual(before["source"]["schema"], "v1")
        self.assertEqual(patch["source"], {"page": 5})

    def test_snapshot_completion_then_streaming_partial_preserves_baseline(self):
        with DaemonRun(self.path, "pilot") as run:
            self.assertIsNone(self.context.load_latest(run.run_id))
            initial = self.context.pre_snapshot_start(run.run_id, 0)
            partial = self.context.set_partial_state(run.run_id, {"metadata": {"schema": "v1"}, "cursor": 4}, initial["cursor_version"])
            completed = self.context.post_snapshot_completion(run.run_id, partial["cursor_version"])
            self.assertTrue(completed["snapshot_completed"])
            self.assertEqual(completed["state_type"], "completed")
            streamed = self.context.advance_streaming(run.run_id, 5, completed["cursor_version"])
            self.assertEqual(streamed["state_type"], "partial")
            self.assertTrue(streamed["snapshot_completed"])
            self.assertEqual(streamed["state_payload"], {"metadata": {"schema": "v1"}, "cursor": 5})
            self.assertEqual(self.context.load_latest(run.run_id), streamed)

    def test_parallel_writers_one_wins_one_is_fenced(self):
        with DaemonRun(self.path, "pilot") as run:
            self.context.pre_snapshot_start(run.run_id, 0)
            barrier = threading.Barrier(2)

            def update(cursor):
                barrier.wait()
                try:
                    self.context.advance_streaming(run.run_id, cursor, 1)
                    return "won"
                except StaleWriteError:
                    return "fenced"

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(update, [10, 20]))
            self.assertEqual(sorted(results), ["fenced", "won"])
            self.assertEqual(self.context.load_latest(run.run_id)["cursor_version"], 2)

    def test_crash_then_new_run_resumes_partial_after_reaping(self):
        script = """import os, sys
from pipelines.shared.daemon_run import DaemonRun
from pipelines.shared.offset_context import OffsetContext
run = DaemonRun(sys.argv[1], 'pilot').__enter__()
context = OffsetContext(sys.argv[1], 'source:query:revision')
context.pre_snapshot_start(run.run_id, 0)
context.advance_streaming(run.run_id, {'token':'durable-page','records':100}, 1)
os._exit(23)
"""
        result = subprocess.run([sys.executable, "-c", script, self.path], check=False)
        self.assertEqual(result.returncode, 23)
        old = StalePipelineDetector(self.path).get_stale_runs(now=datetime.now(timezone.utc) + timedelta(minutes=4))
        self.assertEqual(len(old), 1)
        self.assertTrue(StalePipelineDetector(self.path).mark_stale(old[0]["run_id"], now=datetime.now(timezone.utc) + timedelta(minutes=4)))
        with DaemonRun(self.path, "pilot") as restarted:
            previous = self.context.load_latest(restarted.run_id)
            self.assertEqual(previous["state_payload"]["cursor"], {"token": "durable-page", "records": 100})
            claimed = self.context.pre_snapshot_start(restarted.run_id, previous["cursor_version"])
            self.assertEqual(claimed["state_payload"], previous["state_payload"])
            with self.assertRaises(StaleWriteError):
                self.context.advance_streaming(old[0]["run_id"], "old-write", claimed["cursor_version"])

    def test_active_owner_cannot_be_stolen_and_completed_owner_can_resume(self):
        with DaemonRun(self.path, "pilot") as first:
            self.context.pre_snapshot_start(first.run_id, 0)
            with DaemonRun(self.path, "pilot") as second:
                with self.assertRaises(StaleWriteError):
                    self.context.pre_snapshot_start(second.run_id, 1)
        with DaemonRun(self.path, "pilot") as third:
            previous = self.context.load_latest(third.run_id)
            resumed = self.context.pre_snapshot_start(third.run_id, previous["cursor_version"])
            self.assertEqual(resumed["cursor_version"], 2)

    def test_expired_owner_is_reaped_atomically_during_resume(self):
        old = DaemonRun(self.path, 'pilot').__enter__()
        try:
            self.context.pre_snapshot_start(old.run_id, 0)
            old.writer.stop()
            future = datetime.now(timezone.utc) + timedelta(minutes=4)
            with DaemonRun(self.path, 'pilot') as restarted:
                with patch('pipelines.shared.offset_context.datetime') as clock:
                    clock.now.return_value = future
                    resumed = self.context.pre_snapshot_start(restarted.run_id, 1)
                self.assertEqual(resumed['cursor_version'], 2)
            with closing(sqlite3.connect(self.path)) as conn:
                self.assertEqual(conn.execute('SELECT status FROM pipeline_runs WHERE run_id=?', (old.run_id,)).fetchone()[0], 'FAILED')
        finally:
            old.writer.stop()

    def test_run_evidence_failure_rolls_back_stream_cursor(self):
        with DaemonRun(self.path, "pilot") as run:
            initial = self.context.pre_snapshot_start(run.run_id, 0)
            with closing(sqlite3.connect(self.path)) as conn:
                conn.execute("CREATE TRIGGER reject_state BEFORE UPDATE OF state_payload ON pipeline_runs BEGIN SELECT RAISE(ABORT, 'fixture'); END")
            with self.assertRaises(sqlite3.IntegrityError):
                self.context.advance_streaming(run.run_id, "lost", 1)
            self.assertEqual(self.context.load_latest(run.run_id), initial)

    def test_invalid_payload_and_versions_preserve_checkpoint(self):
        with DaemonRun(self.path, "pilot") as run:
            initial = self.context.pre_snapshot_start(run.run_id, 0)
            for payload in ({"bad": float("nan")}, {1: "bad"}):
                with self.assertRaises(ValueError):
                    self.context.set_partial_state(run.run_id, payload, 1)
            for version in (-1, True, 1.5):
                with self.assertRaises(ValueError):
                    self.context.advance_streaming(run.run_id, None, version)
            self.assertEqual(self.context.load_latest(run.run_id), initial)

    def test_migration_is_idempotent_and_preserves_legacy_state(self):
        with DaemonRun(self.path, "pilot") as run:
            self.context.pre_snapshot_start(run.run_id, 0)
            self.context.advance_streaming(run.run_id, "saved", 1)
            apply_state_migration(self.path)
            apply_state_migration(self.path)
            self.assertEqual(self.context.load_latest(run.run_id)["state_payload"], {"cursor": "saved"})

    def test_incompatible_state_table_rolls_back_added_run_columns(self):
        with closing(sqlite3.connect(self.path)) as conn:
            conn.executescript("CREATE TABLE pipeline_runs (run_id TEXT PRIMARY KEY); CREATE TABLE pipeline_states (stream_id INTEGER)")
        with self.assertRaises(ValueError):
            apply_state_migration(self.path)
        with closing(sqlite3.connect(self.path)) as conn:
            self.assertEqual([row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")], ["run_id"])

    def test_missing_catalog_is_not_created(self):
        with self.assertRaises(sqlite3.OperationalError):
            apply_state_migration(self.path)
        self.assertFalse(Path(self.path).exists())

    def test_real_corpus_schema_and_legacy_run_are_preserved(self):
        schema = Path(__file__).resolve().parents[1] / 'dump/corpus_pipeline/schema.sql'
        with closing(sqlite3.connect(self.path)) as conn:
            conn.executescript(schema.read_text())
            with conn:
                conn.execute("INSERT INTO datasets (dataset_id,name,source_platform,license_group,created_at) VALUES ('fixture','fixture','local','public_domain','2026-10-05')")
                conn.execute("INSERT INTO pipeline_runs (run_id,dataset_id,status,target_storage_provider,created_at) VALUES ('legacy','fixture','INGESTING','local','2026-10-05')")
        apply_state_migration(self.path)
        apply_state_migration(self.path)
        with closing(sqlite3.connect(self.path)) as conn:
            row = conn.execute('SELECT status,state_type,state_payload,cursor_version FROM pipeline_runs').fetchone()
            self.assertEqual(row, ('INGESTING',None,None,0))
            self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(self.context.pre_snapshot_start('legacy', 0)['cursor_version'], 1)


if __name__ == "__main__":
    unittest.main()
