"""Window state and latest work versions share the page commit transaction."""

import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import uuid

from pipelines.shared.ledger_base import BaseLedger

STREAM = "openalex-works-delta"


def instant(value):
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def timestamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


class DeltaLedger(BaseLedger):
    def _init_db(self):
        super()._init_db()
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS stream_cursors (stream TEXT PRIMARY KEY, cursor_json TEXT NOT NULL, committed_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS delta_works (work_id TEXT PRIMARY KEY, updated_date TEXT NOT NULL, record_json TEXT NOT NULL, pii_status TEXT NOT NULL DEFAULT 'unchecked');
                CREATE TABLE IF NOT EXISTS delta_pages (artifact_sha256 TEXT NOT NULL, artifact_path TEXT PRIMARY KEY, record_count INTEGER NOT NULL);
            """)
            conn.commit()

    def open_window(self, since, until, overlap_seconds=86400):
        if overlap_seconds < 0:
            raise ValueError("overlap_seconds must be nonnegative")
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT cursor_json FROM stream_cursors WHERE stream = ?", (STREAM,)).fetchone()
            state = json.loads(row[0]) if row else {"watermark": timestamp(instant(since))}
            if state.get("window"):
                return state
            if instant(until) > dt.datetime.now(dt.timezone.utc):
                raise ValueError("until must not be in the future")
            if instant(until) <= instant(state["watermark"]):
                raise ValueError("until must follow the committed watermark")
            state["window"] = {"from": timestamp(instant(state["watermark"]) - dt.timedelta(seconds=overlap_seconds)),
                "to": timestamp(instant(until)), "cursor": "*", "run_id": str(uuid.uuid4())}
            self._write_state(conn, state)
            conn.commit()
            return state

    def _write_state(self, conn, state):
        conn.execute("INSERT INTO stream_cursors VALUES (?, ?, ?) ON CONFLICT(stream) DO UPDATE SET cursor_json = excluded.cursor_json, committed_at = excluded.committed_at",
            (STREAM, json.dumps(state), timestamp(dt.datetime.now(dt.timezone.utc))))

    def commit_page(self, expected_state, records, next_cursor, artifact_path, artifact_sha256):
        if hashlib.sha256(Path(artifact_path).read_bytes()).hexdigest() != artifact_sha256:
            raise ValueError("Durable raw artifact checksum mismatch")
        window = expected_state["window"]
        if next_cursor is not None and (not isinstance(next_cursor, str) or not next_cursor or next_cursor == window["cursor"]):
            raise ValueError("Invalid or repeated next cursor")
        encoded = []
        for record in records:
            if not isinstance(record, dict) or not re.fullmatch(r"https://openalex.org/W[0-9]+", record.get("id", "")):
                raise ValueError("Invalid OpenAlex work ID")
            updated = instant(record["updated_date"])
            if not instant(window["from"]) <= updated <= instant(window["to"]):
                raise ValueError("Work update is outside the fixed window")
            encoded.append((record["id"], timestamp(updated), json.dumps(record, ensure_ascii=False)))
        state = json.loads(json.dumps(expected_state))
        if next_cursor is None:
            state = {"watermark": window["to"]}
        else:
            state["window"]["cursor"] = next_cursor
        with self._get_conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            current = conn.execute("SELECT cursor_json FROM stream_cursors WHERE stream = ?", (STREAM,)).fetchone()
            if not current or json.loads(current[0]) != expected_state:
                raise ValueError("Delta state changed concurrently. Reopen the saved window.")
            conn.executemany("INSERT INTO delta_works (work_id, updated_date, record_json) VALUES (?, ?, ?) ON CONFLICT(work_id) DO UPDATE SET updated_date = excluded.updated_date, record_json = excluded.record_json WHERE excluded.updated_date >= delta_works.updated_date", encoded)
            conn.execute("INSERT OR IGNORE INTO delta_pages VALUES (?, ?, ?)", (artifact_sha256, artifact_path, len(records)))
            self._write_state(conn, state)
            conn.commit()
        return state
