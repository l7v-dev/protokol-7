"""Opt-in daemon lifecycle records in a dedicated monitoring catalog."""

import os
import json
import sys
import time
import sqlite3
from contextlib import closing
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from uuid import uuid4

from pipelines.shared.heartbeat_writer import HeartbeatWriter
from pipelines.shared.state_migration import apply_state_migration
from pipelines.shared.offset_context import OffsetContext
from pipelines.shared.pipeline_runtime import pipeline_runtime


_CURRENT_RUN = ContextVar("daemon_run", default=None)


SCHEMA = """
CREATE TABLE IF NOT EXISTS daemon_monitor_schema (version INTEGER PRIMARY KEY CHECK(version=1));
INSERT OR IGNORE INTO daemon_monitor_schema VALUES (1);
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id TEXT PRIMARY KEY,
    pipeline_name TEXT NOT NULL,
    process_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('INGESTING','COMPLETED','FAILED')),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT,
    retry_config JSON,
    stop_reason TEXT,
    stats_json JSON,
    backfill_start TEXT,
    backfill_end TEXT,
    backfill_current TEXT,
    last_heartbeat_at DATETIME DEFAULT NULL,
    heartbeat_interval_seconds INTEGER DEFAULT 60 CHECK(heartbeat_interval_seconds > 0)
);
"""


class DaemonRun:
    """Own one run record and join its heartbeat before recording completion."""

    def __init__(self, db_path: str, pipeline_name: str, interval_s: int = 60):
        if not isinstance(pipeline_name, str) or not pipeline_name.strip():
            raise ValueError("pipeline_name must be non-empty")
        self.path = Path(db_path).resolve()
        self.pipeline_name = pipeline_name
        self.run_id = str(uuid4())
        self._retry_policy_payload = None
        self.writer = HeartbeatWriter(str(self.path), self.run_id, interval_s)

    def _connect(self):
        return sqlite3.connect(self.path.as_uri() + "?mode=rw", uri=True, timeout=5.0)

    def record_retry_policy(self, policy):
        payload = json.dumps(policy, allow_nan=False, sort_keys=True)
        if payload == self._retry_policy_payload:
            return
        with closing(self._connect()) as conn:
            with conn:
                conn.execute("UPDATE pipeline_runs SET retry_config=? WHERE run_id=? AND status='INGESTING'",
                             (payload, self.run_id))
        self._retry_policy_payload = payload

    def record_backfill(self, start, end, current):
        """Persist bounded UTC progress without changing the source checkpoint."""
        values = []
        for value in (start, end, current):
            stamp = datetime.fromisoformat(value)
            if stamp.tzinfo is None:
                raise ValueError('Backfill timestamps require a timezone')
            values.append(stamp.astimezone(timezone.utc))
        first, last, progress = values
        if not first <= progress <= last:
            raise ValueError('Backfill progress is outside bounds')
        payload = tuple(value.isoformat() for value in values)
        with closing(self._connect()) as conn, conn:
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute('SELECT backfill_start,backfill_end,backfill_current,status FROM pipeline_runs WHERE run_id=?', (self.run_id,)).fetchone()
            if row is None or row[3] != 'INGESTING':
                raise RuntimeError('Backfill requires an active run')
            if row[0] is not None and (row[:2] != payload[:2] or progress < datetime.fromisoformat(row[2])):
                raise ValueError('Backfill bounds are immutable and progress cannot regress')
            conn.execute('UPDATE pipeline_runs SET backfill_start=?,backfill_end=?,backfill_current=? WHERE run_id=?', (*payload, self.run_id))

    def _finish(self, error=None):
        with closing(self._connect()) as conn:
            with conn:
                result = conn.execute(
                    "UPDATE pipeline_runs SET status=?, completed_at=?, error_message=? "
                    "WHERE run_id=? AND status='INGESTING'",
                    ("FAILED" if error else "COMPLETED", datetime.now(timezone.utc).isoformat(),
                     type(error).__name__ if error else None, self.run_id),
                )
                if result.rowcount != 1 and error is None:
                    raise RuntimeError("Daemon run was already marked failed")

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=5.0)) as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if tables and "daemon_monitor_schema" not in tables:
                raise ValueError("A dedicated daemon monitoring catalog is required")
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            with conn:
                columns = {row[1]: row[2] for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
                for column in ('backfill_start', 'backfill_end', 'backfill_current'):
                    if column not in columns:
                        conn.execute(f'ALTER TABLE pipeline_runs ADD COLUMN {column} TEXT')
                    elif columns[column].upper() != 'TEXT':
                        raise ValueError(f'Incompatible {column} column')
                if "stats_json" not in columns:
                    conn.execute("ALTER TABLE pipeline_runs ADD COLUMN stats_json JSON")
                if "stop_reason" not in columns:
                    conn.execute("ALTER TABLE pipeline_runs ADD COLUMN stop_reason TEXT")
                if "retry_config" not in columns:
                    conn.execute("ALTER TABLE pipeline_runs ADD COLUMN retry_config JSON")
                elif columns["retry_config"].upper() != "JSON":
                    raise ValueError("Incompatible retry_config column")
        apply_state_migration(str(self.path))
        with closing(self._connect()) as conn:
            with conn:
                conn.execute(
                    "INSERT INTO pipeline_runs (run_id,pipeline_name,process_id,status,created_at) "
                    "VALUES (?,?,?,'INGESTING',?)",
                    (self.run_id, self.pipeline_name, os.getpid(), datetime.now(timezone.utc).isoformat()),
                )
        try:
            self.writer.start()
        except BaseException as exc:
            self._finish(exc)
            raise
        return self

    def __exit__(self, exc_type, exc, traceback):
        shutdown_error = None
        try:
            self.writer.stop()
        except Exception as error:
            shutdown_error = error
        try:
            self._finish(exc or shutdown_error)
        except Exception as error:
            if exc is None:
                raise
            exc.add_note(f"Daemon run completion failed: {type(error).__name__}")
        if shutdown_error is not None:
            if exc is None:
                raise shutdown_error
            exc.add_note(f"Heartbeat shutdown failed: {type(shutdown_error).__name__}")
        return False


def monitor_daemon(pipeline_name, *, enabled=None, interrupt_on_parent_loss=True):
    """Monitor a synchronous run function when PROTOKOL_DAEMON_RUN_DB is set."""
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            if enabled is not None and not enabled(*args, **kwargs):
                return function(*args, **kwargs)
            with pipeline_runtime(interrupt_on_parent_loss=interrupt_on_parent_loss) as stopper:
                path = os.environ.get("PROTOKOL_DAEMON_RUN_DB")
                if not path:
                    return function(*args, **kwargs)
                with DaemonRun(path, pipeline_name) as run:
                    token = _CURRENT_RUN.set(run)
                    try:
                        return function(*args, **kwargs)
                    finally:
                        body_error = sys.exc_info()[1]
                        stopper.stats.set("elapsed_seconds", time.monotonic() - stopper.started)
                        try:
                            with closing(run._connect()) as conn:
                                with conn:
                                    conn.execute("UPDATE pipeline_runs SET stop_reason=?,stats_json=? WHERE run_id=?",
                                                 (stopper.should_stop()[1], json.dumps(stopper.stats.dump(), allow_nan=False), run.run_id))
                        except Exception as error:
                            if body_error is None:
                                raise
                            body_error.add_note(f"Stop reason persistence failed: {type(error).__name__}")
                        finally:
                            _CURRENT_RUN.reset(token)
        return wrapped
    return decorate


class RunCheckpoint:
    """Keep the expected version from the last successful checkpoint locally."""

    def __init__(self, run, stream_id):
        self.run = run
        self.context = OffsetContext(str(run.path), stream_id)
        previous = self.context.load_latest(run.run_id)
        version = previous["cursor_version"] if previous else 0
        self.state = self.context.pre_snapshot_start(run.run_id, version)

    def advance(self, cursor):
        self.state = self.context.advance_streaming(self.run.run_id, cursor, self.state["cursor_version"])

    def complete(self):
        self.state = self.context.post_snapshot_completion(self.run.run_id, self.state["cursor_version"])


def current_checkpoint(stream_id):
    """Return None outside opt-in monitoring; callers choose durable commit points."""
    run = _CURRENT_RUN.get()
    return RunCheckpoint(run, stream_id) if run is not None else None


def record_current_retry_policy(policy):
    """Persist the last selected HTTP policy in the opt-in run record."""
    run = _CURRENT_RUN.get()
    if run is not None:
        run.record_retry_policy(policy)


def current_run_id():
    """Return the actual monitored run identity, or None outside a daemon run."""
    run = _CURRENT_RUN.get()
    return run.run_id if run else None
