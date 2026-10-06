"""Versioned partial/completed state with stable stream identity and run fencing."""

import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from pipelines.shared.state_merge import merge_partial, validate_state
from pipelines.shared.stale_detector import STALE_PREDICATE, STALE_REASON


class StaleWriteError(RuntimeError):
    """The checkpoint changed or a different run owns the stream."""


class OffsetContext:
    """A caller commits only after its source output is durably persisted.

    Run UUIDs are observation identities; stream_id is the stable checkpoint
    key. One transaction updates authoritative stream state and run evidence.
    """

    def __init__(self, db_path: str, stream_id: str):
        if not isinstance(stream_id, str) or not stream_id.strip():
            raise ValueError("stream_id must be non-empty")
        self.stream_id = stream_id
        self._uri = Path(db_path).resolve().as_uri()

    @staticmethod
    def _view(row):
        if row is None:
            return None
        envelope = json.loads(row["state_payload"])
        return {
            "state_type": row["state_type"],
            "state_payload": merge_partial(envelope["completed"], envelope["partial"]),
            "cursor_version": row["cursor_version"],
            "snapshot_completed": envelope["snapshot_completed"],
        }

    def load_latest(self, run_id: str) -> dict | None:
        """Load committed stream state for a new or resumed existing run."""
        with closing(sqlite3.connect(self._uri + "?mode=ro", uri=True, timeout=5)) as conn:
            conn.row_factory = sqlite3.Row
            if conn.execute("SELECT 1 FROM pipeline_runs WHERE run_id=?", (run_id,)).fetchone() is None:
                raise LookupError("Run does not exist")
            row = conn.execute("SELECT * FROM pipeline_states WHERE stream_id=?", (self.stream_id,)).fetchone()
            return self._view(row)

    def _update(self, run_id, expected_version, partial, *, begin=False, complete=False):
        if isinstance(expected_version, bool) or not isinstance(expected_version, int) or expected_version < 0:
            raise ValueError("expected_version must be a nonnegative integer")
        validate_state(partial)
        timestamp = datetime.now(timezone.utc).isoformat()
        with closing(sqlite3.connect(self._uri + "?mode=rw", uri=True, timeout=5)) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("BEGIN IMMEDIATE")
            try:
                run = conn.execute("SELECT status FROM pipeline_runs WHERE run_id=?", (run_id,)).fetchone()
                if run is None:
                    raise LookupError("Run does not exist")
                if run["status"] not in ("INITIALIZING", "INGESTING", "CLEANING", "PACKING", "VERIFYING"):
                    raise StaleWriteError("Run is no longer active")
                row = conn.execute("SELECT * FROM pipeline_states WHERE stream_id=?", (self.stream_id,)).fetchone()
                version = row["cursor_version"] if row else 0
                if version != expected_version:
                    raise StaleWriteError("Concurrent cursor update detected")
                if row and row["owner_run_id"] != run_id:
                    if not begin:
                        raise StaleWriteError("Stream belongs to another run")
                    owner = conn.execute("SELECT status FROM pipeline_runs WHERE run_id=?", (row["owner_run_id"],)).fetchone()
                    if owner and owner["status"] not in ("COMPLETED", "FAILED"):
                        expired = conn.execute(
                            "UPDATE pipeline_runs SET status='FAILED',completed_at=?,error_message=? "
                            "WHERE run_id=? AND " + STALE_PREDICATE,
                            (timestamp, STALE_REASON, row["owner_run_id"], 3, timestamp),
                        ).rowcount
                        if expired != 1:
                            raise StaleWriteError("Previous owner is still heartbeating")
                elif row is None and not begin:
                    raise StaleWriteError("Snapshot must be started before checkpointing")
                envelope = json.loads(row["state_payload"]) if row else {
                    "completed": {}, "partial": {}, "snapshot_completed": False,
                }
                envelope["partial"] = merge_partial(envelope["partial"], partial)
                if complete:
                    envelope["completed"] = merge_partial(envelope["completed"], envelope["partial"])
                    envelope["partial"] = {}
                    envelope["snapshot_completed"] = True
                state_type = "completed" if complete else "partial"
                encoded = json.dumps(envelope, allow_nan=False, sort_keys=True)
                new_version = version + 1
                if row is None:
                    conn.execute("INSERT INTO pipeline_states (stream_id,owner_run_id,state_type,state_payload,cursor_version,updated_at) VALUES (?,?,?,?,?,?)",
                                 (self.stream_id, run_id, state_type, encoded, new_version, timestamp))
                else:
                    changed = conn.execute(
                        "UPDATE pipeline_states SET owner_run_id=?,state_type=?,state_payload=?,"
                        "cursor_version=?,updated_at=? WHERE stream_id=? AND cursor_version=? AND owner_run_id=?",
                        (run_id, state_type, encoded, new_version, timestamp, self.stream_id,
                         expected_version, row["owner_run_id"]),
                    ).rowcount
                    if changed != 1:
                        raise StaleWriteError("Concurrent cursor update detected")
                conn.execute("UPDATE pipeline_runs SET state_type=?,state_payload=?,cursor_version=? WHERE run_id=?",
                             (state_type, encoded, new_version, run_id))
                conn.commit()
                return self._view({"state_type": state_type, "state_payload": encoded, "cursor_version": new_version})
            except BaseException:
                conn.rollback()
                raise

    def pre_snapshot_start(self, run_id, expected_version):
        """Claim the stream without discarding a partial or completed checkpoint."""
        return self._update(run_id, expected_version, {}, begin=True)

    def advance_streaming(self, run_id, cursor, expected_version):
        return self._update(run_id, expected_version, {"cursor": cursor})

    def set_partial_state(self, run_id, state, expected_version):
        return self._update(run_id, expected_version, state)

    def post_snapshot_completion(self, run_id, expected_version):
        return self._update(run_id, expected_version, {}, complete=True)
