"""Transactional state schema extension for an existing pipeline run catalog."""

import sqlite3
from contextlib import closing
from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[2] / "infra/migrations/0006-pipeline-state.sql"


def apply_state_migration(db_path: str):
    with closing(sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=rw", uri=True, timeout=5)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            columns = {row[1]: row for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
            if "run_id" not in columns:
                raise ValueError("pipeline_runs with run_id is required")
            expected = {"state_type": "TEXT", "state_payload": "JSON", "cursor_version": "INTEGER"}
            for name, kind in expected.items():
                if name in columns and columns[name][2].upper() != kind:
                    raise ValueError(f"Incompatible state column: {name}")
            if "cursor_version" in columns and (
                columns["cursor_version"][3] != 1 or str(columns["cursor_version"][4]) != "0"
            ):
                raise ValueError("cursor_version requires NOT NULL DEFAULT 0")
            sql = "\n".join(line for line in MIGRATION.read_text().splitlines() if not line.startswith("--"))
            for statement in sql.split(";"):
                statement = statement.strip()
                if not statement:
                    continue
                if statement.startswith("ALTER TABLE") and statement.split()[5] in columns:
                    continue
                conn.execute(statement)
            state_columns = {row[1]: row for row in conn.execute("PRAGMA table_info(pipeline_states)")}
            required = {"stream_id": "TEXT", "owner_run_id": "TEXT", "state_type": "TEXT",
                        "state_payload": "JSON", "cursor_version": "INTEGER", "updated_at": "TEXT"}
            if any(name not in state_columns or state_columns[name][2].upper() != kind
                   for name, kind in required.items()) or not state_columns["stream_id"][5]:
                raise ValueError("Incompatible pipeline_states table")
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
