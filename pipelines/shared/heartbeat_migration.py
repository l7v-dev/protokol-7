"""Apply the additive heartbeat schema to an existing pipeline run catalog."""

from contextlib import closing
import sqlite3
from pathlib import Path


MIGRATION_PATH = Path(__file__).resolve().parents[2] / "infra/migrations/0005-pipeline-heartbeat.sql"


def apply_heartbeat_migration(db_path: str) -> None:
    """Commit both columns atomically; never create a missing catalog or run table.

    Live activation requires a separate backup and rehearsal. Existing producers
    keep working because this migration does not change run states or records.
    """
    uri = Path(db_path).resolve().as_uri() + "?mode=rw"
    with closing(sqlite3.connect(uri, uri=True, timeout=5.0)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            columns = {
                row[1]: row
                for row in conn.execute("PRAGMA table_info(pipeline_runs)")
            }
            if "run_id" not in columns:
                raise ValueError("pipeline_runs with run_id is required")
            expected_types = {
                "last_heartbeat_at": "DATETIME",
                "heartbeat_interval_seconds": "INTEGER",
            }
            for name, sql_type in expected_types.items():
                if name in columns and (
                    columns[name][2].upper() != sql_type or columns[name][3] != 0
                ):
                    raise ValueError(f"Incompatible heartbeat column: {name}")
            statements = MIGRATION_PATH.read_text(encoding="utf-8").splitlines()
            for statement in statements:
                if not statement.startswith("ALTER TABLE"):
                    continue
                name = statement.split()[5]
                if name not in columns:
                    conn.execute(statement)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
