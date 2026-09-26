#!/usr/bin/env python3
import datetime
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Dict, Any, List, Optional

DEFAULT_DB_PATH = "data/wikipedia_metadata.sqlite"
SCHEMA_FILE_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def get_iso_now() -> str:
    """Returns current UTC ISO-8601 timestamp."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class MetadataDB:
    """Manages dataset lifecycle, cryptographic hash ledger, and provenance tracking."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self._init_schema()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _init_schema(self) -> None:
        """Executes schema DDL to create tables and indexes."""
        if os.path.exists(SCHEMA_FILE_PATH):
            with open(SCHEMA_FILE_PATH, "r", encoding="utf-8") as f:
                ddl = f.read()
            with self._get_connection() as conn:
                conn.executescript(ddl)

    def start_run(
        self,
        run_id: str,
        language: str = "tr",
        source_url: str = "",
        source_md5: Optional[str] = None,
        source_size_bytes: Optional[int] = None,
    ) -> None:
        """Initializes a new dataset pipeline run record."""
        now = get_iso_now()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO pipeline_runs (
                    run_id, language, source_dump_url, source_dump_md5,
                    source_dump_size_bytes, status, created_at
                ) VALUES (?, ?, ?, ?, ?, 'INITIALIZING', ?)
                """,
                (run_id, language, source_url, source_md5, source_size_bytes, now),
            )

    def update_run_status(self, run_id: str, status: str) -> None:
        """Updates the status of a pipeline run."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE pipeline_runs SET status = ? WHERE run_id = ?",
                (status, run_id),
            )

    def update_run_stats(
        self,
        run_id: str,
        scanned: int = 0,
        clean: int = 0,
        redirects: int = 0,
        short: int = 0,
        uncompressed_bytes: int = 0,
        compressed_bytes: int = 0,
        estimated_tokens: int = 0,
        parts: int = 0,
    ) -> None:
        """Updates cumulative counters for an active run."""
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs SET
                    total_scanned_pages = ?,
                    total_clean_articles = ?,
                    total_skipped_redirects = ?,
                    total_skipped_short = ?,
                    total_uncompressed_bytes = ?,
                    total_compressed_bytes = ?,
                    total_estimated_tokens = ?,
                    total_parts = ?
                WHERE run_id = ?
                """,
                (
                    scanned,
                    clean,
                    redirects,
                    short,
                    uncompressed_bytes,
                    compressed_bytes,
                    estimated_tokens,
                    parts,
                    run_id,
                ),
            )

    def complete_run(self, run_id: str, error_message: Optional[str] = None) -> None:
        """Marks run as COMPLETED or FAILED."""
        status = "FAILED" if error_message else "COMPLETED"
        now = get_iso_now()
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs SET
                    status = ?,
                    completed_at = ?,
                    error_message = ?
                WHERE run_id = ?
                """,
                (status, now, error_message, run_id),
            )

    def register_part(
        self,
        part_id: str,
        run_id: str,
        part_index: int,
        filename: str,
        record_count: int,
        size_bytes: int,
        local_md5: str,
        local_sha256: Optional[str] = None,
        codec: str = "zstd",
        level: int = 6,
    ) -> None:
        """Registers a newly produced Parquet shard before sync."""
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO dataset_parts (
                    part_id, run_id, part_index, filename, record_count,
                    size_bytes, compression_codec, compression_level,
                    local_md5_hash, local_sha256_hash, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
                """,
                (
                    part_id,
                    run_id,
                    part_index,
                    filename,
                    record_count,
                    size_bytes,
                    codec,
                    level,
                    local_md5.lower(),
                    local_sha256.lower() if local_sha256 else None,
                ),
            )

    def start_part_sync(self, part_id: str, drive_folder_id: Optional[str]) -> None:
        """Flags part as actively uploading."""
        now = get_iso_now()
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE dataset_parts SET
                    sync_status = 'UPLOADING',
                    drive_folder_id = ?,
                    sync_started_at = ?,
                    sync_attempts = sync_attempts + 1
                WHERE part_id = ?
                """,
                (drive_folder_id, now, part_id),
            )

    def confirm_part_sync(
        self,
        part_id: str,
        drive_file_id: str,
        drive_md5: str,
        local_deleted: bool = True,
    ) -> None:
        """Records verified cryptographic checksum match and local file unlinking."""
        now = get_iso_now()
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE dataset_parts SET
                    sync_status = 'VERIFIED',
                    drive_file_id = ?,
                    drive_md5_hash = ?,
                    sync_completed_at = ?,
                    verified_at = ?,
                    local_file_deleted = ?,
                    deleted_at = ?
                WHERE part_id = ?
                """,
                (
                    drive_file_id,
                    drive_md5.lower(),
                    now,
                    now,
                    1 if local_deleted else 0,
                    now if local_deleted else None,
                    part_id,
                ),
            )

    def fail_part_sync(self, part_id: str, error_message: str) -> None:
        """Records sync failure without marking local file as deleted."""
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE dataset_parts SET
                    sync_status = 'FAILED',
                    last_error = ?
                WHERE part_id = ?
                """,
                (error_message, part_id),
            )

    def index_article(
        self,
        article_id: str,
        run_id: str,
        part_index: int,
        title: str,
        url: str,
        char_count: int,
        word_count: int,
        estimated_tokens: int,
    ) -> None:
        """Records single article provenance entry."""
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO article_provenance_index (
                    article_id, run_id, part_index, title, url,
                    char_count, word_count, estimated_tokens
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    article_id,
                    run_id,
                    part_index,
                    title,
                    url,
                    char_count,
                    word_count,
                    estimated_tokens,
                ),
            )

    def export_manifest(self, run_id: str, output_path: Optional[str] = None) -> Dict[str, Any]:
        """Exports complete JSON manifest for the dataset batch (provenance card)."""
        with self._get_connection() as conn:
            run = conn.execute(
                "SELECT * FROM pipeline_runs WHERE run_id = ?", (run_id,)
            ).fetchone()
            if not run:
                raise ValueError(f"Run {run_id} not found.")

            parts = conn.execute(
                "SELECT * FROM dataset_parts WHERE run_id = ? ORDER BY part_index ASC",
                (run_id,),
            ).fetchall()

        manifest = {
            "metadata_version": "1.0",
            "run_id": run["run_id"],
            "language": run["language"],
            "source_dump": {
                "url": run["source_dump_url"],
                "md5": run["source_dump_md5"],
                "size_bytes": run["source_dump_size_bytes"],
            },
            "status": run["status"],
            "statistics": {
                "total_clean_articles": run["total_clean_articles"],
                "total_uncompressed_bytes": run["total_uncompressed_bytes"],
                "total_compressed_bytes": run["total_compressed_bytes"],
                "total_estimated_tokens": run["total_estimated_tokens"],
                "total_parts": run["total_parts"],
                "compression_ratio": (
                    round(run["total_uncompressed_bytes"] / run["total_compressed_bytes"], 2)
                    if run["total_compressed_bytes"] > 0
                    else 1.0
                ),
            },
            "timestamps": {
                "created_at": run["created_at"],
                "completed_at": run["completed_at"],
            },
            "shards": [
                {
                    "part_index": p["part_index"],
                    "filename": p["filename"],
                    "record_count": p["record_count"],
                    "size_bytes": p["size_bytes"],
                    "compression": {
                        "codec": p["compression_codec"],
                        "level": p["compression_level"],
                    },
                    "checksums": {
                        "local_md5": p["local_md5_hash"],
                        "local_sha256": p["local_sha256_hash"],
                        "drive_md5": p["drive_md5_hash"],
                    },
                    "drive": {
                        "file_id": p["drive_file_id"],
                        "folder_id": p["drive_folder_id"],
                        "sync_status": p["sync_status"],
                        "verified_at": p["verified_at"],
                        "local_deleted": bool(p["local_file_deleted"]),
                    },
                }
                for p in parts
            ],
        }

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
            print(f"[OK] Dataset manifest exported to: {output_path}")

        return manifest
