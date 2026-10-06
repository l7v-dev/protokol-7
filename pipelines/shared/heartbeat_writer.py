"""Periodic liveness updates for an existing, migrated pipeline run."""

import sqlite3
import threading
import logging
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


class HeartbeatWriter:
    """Use a fresh connection per ping; surface background failures on stop.

    Run creation and migration belong to the caller. A heartbeat updates only
    liveness fields and never changes a cursor or a run's terminal state.
    """

    def __init__(self, db_path: str, run_id: str, interval_s: int = 60):
        if isinstance(interval_s, bool) or not isinstance(interval_s, int) or interval_s <= 0:
            raise ValueError("interval_s must be a positive integer")
        if not isinstance(run_id, str) or not run_id.strip():
            raise ValueError("run_id must be non-empty")
        self.run_id = run_id
        self.interval_s = interval_s
        self._uri = Path(db_path).resolve().as_uri() + "?mode=rw"
        self._stop_event = threading.Event()
        self._lifecycle_lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._thread = None
        self._error = None

    @property
    def error(self):
        """First background write failure, if any."""
        return self._error

    def _write(self):
        with self._write_lock:
            with closing(sqlite3.connect(self._uri, uri=True, timeout=5.0)) as conn:
                with conn:
                    rows = conn.execute(
                        "UPDATE pipeline_runs SET last_heartbeat_at=?, "
                        "heartbeat_interval_seconds=? WHERE run_id=? "
                        "AND status IN ('INITIALIZING','INGESTING','CLEANING','PACKING','VERIFYING')",
                        (datetime.now(timezone.utc).isoformat(), self.interval_s, self.run_id),
                    ).rowcount
                    if rows != 1:
                        raise LookupError("Heartbeat run is missing or inactive")

    def ping(self):
        if self._error is not None:
            raise RuntimeError("Background heartbeat failed") from self._error
        self._write()

    def _run(self):
        while not self._stop_event.wait(self.interval_s):
            try:
                self._write()
            except Exception as exc:
                self._error = exc
                self._stop_event.set()
                logging.getLogger(__name__).error("[ERROR] Heartbeat writer stopped: %s", type(exc).__name__)
                return

    def start(self):
        with self._lifecycle_lock:
            if self._thread is not None:
                if self._error is not None:
                    raise RuntimeError("Background heartbeat failed") from self._error
                return self
            self.ping()
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, name="pipeline-heartbeat", daemon=True)
            self._thread.start()
            return self

    def stop(self):
        with self._lifecycle_lock:
            if self._thread is None:
                return
            self._stop_event.set()
            self._thread.join()
            self._thread = None
            self.ping()

    def __enter__(self):
        return self.start()

    def __exit__(self, exc_type, exc, traceback):
        try:
            self.stop()
        except Exception as stop_error:
            if exc is None:
                raise
            exc.add_note(f"Heartbeat shutdown failed: {type(stop_error).__name__}")
        return False
