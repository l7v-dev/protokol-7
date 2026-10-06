"""Heartbeat migration compatibility and atomicity checks."""

from contextlib import contextmanager
import sqlite3
import tempfile
import unittest
from pathlib import Path

from pipelines.shared.heartbeat_migration import apply_heartbeat_migration


@contextmanager
def connect(path):
    conn = sqlite3.connect(path)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


class HeartbeatMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "catalog.sqlite")
        with connect(self.path) as conn:
            conn.execute("CREATE TABLE pipeline_runs (run_id TEXT PRIMARY KEY, status TEXT)")
            conn.execute("INSERT INTO pipeline_runs VALUES ('legacy', 'INGESTING')")

    def test_preserves_legacy_rows_and_old_inserts(self):
        apply_heartbeat_migration(self.path)
        apply_heartbeat_migration(self.path)
        with connect(self.path) as conn:
            self.assertEqual(conn.execute("SELECT * FROM pipeline_runs").fetchone(),
                             ("legacy", "INGESTING", None, 60))
            conn.execute("INSERT INTO pipeline_runs (run_id, status) VALUES ('new', 'PACKING')")
            self.assertEqual(conn.execute("SELECT last_heartbeat_at, heartbeat_interval_seconds FROM pipeline_runs WHERE run_id='new'").fetchone(), (None, 60))
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("UPDATE pipeline_runs SET heartbeat_interval_seconds=0")

    def test_missing_database_is_not_created(self):
        missing = str(Path(self.directory.name) / "missing.sqlite")
        with self.assertRaises(sqlite3.OperationalError):
            apply_heartbeat_migration(missing)
        self.assertFalse(Path(missing).exists())

    def test_corpus_schema_is_compatible(self):
        corpus = str(Path(self.directory.name) / "corpus.sqlite")
        schema = Path(__file__).resolve().parents[1] / "dump/corpus_pipeline/schema.sql"
        with connect(corpus) as conn:
            conn.executescript(schema.read_text(encoding="utf-8"))
        apply_heartbeat_migration(corpus)
        with connect(corpus) as conn:
            columns = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
            self.assertIn("last_heartbeat_at", columns)
            self.assertIn("heartbeat_interval_seconds", columns)
            self.assertEqual(conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_missing_run_table_is_rejected(self):
        with connect(self.path) as conn:
            conn.execute("DROP TABLE pipeline_runs")
        with self.assertRaises(ValueError):
            apply_heartbeat_migration(self.path)

    def test_incompatible_existing_column_is_rejected(self):
        with connect(self.path) as conn:
            conn.execute("ALTER TABLE pipeline_runs ADD COLUMN heartbeat_interval_seconds TEXT")
        with self.assertRaises(ValueError):
            apply_heartbeat_migration(self.path)
        with connect(self.path) as conn:
            self.assertNotIn("last_heartbeat_at", [row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")])

    def test_schema_changes_roll_back_when_second_alter_fails(self):
        from unittest.mock import patch
        sql = "ALTER TABLE pipeline_runs ADD COLUMN last_heartbeat_at DATETIME DEFAULT NULL;\nALTER TABLE pipeline_runs ADD COLUMN invalid_column INTEGER CHECK (;"
        with patch.object(Path, "read_text", return_value=sql):
            with self.assertRaises(sqlite3.OperationalError):
                apply_heartbeat_migration(self.path)
        with connect(self.path) as conn:
            self.assertEqual(len(conn.execute("PRAGMA table_info(pipeline_runs)").fetchall()), 2)


if __name__ == "__main__":
    unittest.main()
