"""Detect expired heartbeats without changing the corpus run state contract."""

import math
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


STALE_REASON = "Heartbeat expired"
STALE_PREDICATE = """
    status IN ('INITIALIZING', 'INGESTING', 'CLEANING', 'PACKING', 'VERIFYING')
    AND last_heartbeat_at IS NOT NULL
    AND heartbeat_interval_seconds > 0
    AND julianday(last_heartbeat_at) + heartbeat_interval_seconds * ? / 86400.0 < julianday(?)
"""


class StalePipelineDetector:
    """NULL heartbeats remain unmonitored; stale writes recheck expiry atomically.

    The caller must supply a migrated corpus-compatible pipeline_runs table.
    Detection alone never changes a run or creates a database.
    """

    def __init__(self, db_path: str):
        self._uri = Path(db_path).resolve().as_uri()

    @staticmethod
    def _parameters(grace_multiplier, now):
        if isinstance(grace_multiplier, bool) or not isinstance(grace_multiplier, (int, float)):
            raise ValueError("grace_multiplier must be a positive finite number")
        if not math.isfinite(grace_multiplier) or grace_multiplier <= 0:
            raise ValueError("grace_multiplier must be a positive finite number")
        timestamp = now if now is not None else datetime.now(timezone.utc)
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise ValueError("now must be timezone-aware")
        return grace_multiplier, timestamp.astimezone(timezone.utc).isoformat()

    def get_stale_runs(self, grace_multiplier=3, *, now=None) -> list[dict]:
        parameters = self._parameters(grace_multiplier, now)
        with closing(sqlite3.connect(self._uri + "?mode=ro", uri=True, timeout=5.0)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT run_id, status, last_heartbeat_at, heartbeat_interval_seconds "
                "FROM pipeline_runs WHERE " + STALE_PREDICATE + " ORDER BY run_id",
                parameters,
            ).fetchall()
            return [dict(row) for row in rows]

    def mark_stale(self, run_id: str, grace_multiplier=3, *, now=None) -> bool:
        """Return False if missing, terminal, unmonitored, or freshly heartbeating.

        FAILED plus error_message represents expiry in the existing CHECK schema;
        no unsupported 'stale' status is introduced. This never kills a process.
        """
        if not isinstance(run_id, str) or not run_id.strip():
            raise ValueError("run_id must be non-empty")
        multiplier, timestamp = self._parameters(grace_multiplier, now)
        with closing(sqlite3.connect(self._uri + "?mode=rw", uri=True, timeout=5.0)) as conn:
            with conn:
                result = conn.execute(
                    "UPDATE pipeline_runs SET status='FAILED', completed_at=?, "
                    "error_message=? WHERE run_id=? AND " + STALE_PREDICATE,
                    (timestamp, STALE_REASON, run_id, multiplier, timestamp),
                )
                return result.rowcount == 1
