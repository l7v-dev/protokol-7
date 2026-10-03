#!/usr/bin/env python3
"""
OpenAlex Snapshot SQLite Ledger & Metadata Registry -- protokol-7

Maintains transactional tracking of S3 partitions, clean output shards,
checksum verification, Google Drive replica identifiers, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import contextlib
import datetime
import os
import sqlite3
from typing import Any, Dict, List, Optional

DEFAULT_SNAPSHOT_DB_PATH = "data/catalogs/openalex_snapshot_catalog.sqlite"
DEFAULT_CENTRAL_DB_PATH = "data/catalog.sqlite"


class SnapshotLedger:
    """
    Transactional ledger for tracking progress across OpenAlex S3 snapshot partitions,
    recording local shard generation, and verifying remote Drive uploads.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_SNAPSHOT_DB_PATH,
        central_db_path: str = DEFAULT_CENTRAL_DB_PATH,
    ):
        self.db_path = db_path
        self.central_db_path = central_db_path
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self._init_db()

    @contextlib.contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA synchronous=NORMAL;")

            # 1. S3 partitions tracker
            cur.execute("""
                CREATE TABLE IF NOT EXISTS s3_partitions (
                    s3_url TEXT PRIMARY KEY,
                    partition_index INTEGER,
                    content_length INTEGER,
                    expected_records INTEGER,
                    cleaned_records INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
                    error_message TEXT,
                    started_at TEXT,
                    completed_at TEXT
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_s3_status ON s3_partitions(status);")

            # 2. Output shards tracker
            cur.execute("""
                CREATE TABLE IF NOT EXISTS output_shards (
                    shard_name TEXT PRIMARY KEY,
                    part_index INTEGER,
                    record_count INTEGER NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    size_mb REAL NOT NULL,
                    sha256_hash TEXT NOT NULL,
                    md5_hash TEXT NOT NULL,
                    drive_file_id TEXT,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'uploaded', 'verified', 'failed')),
                    created_at TEXT NOT NULL,
                    uploaded_at TEXT
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_shards_status ON output_shards(status);")

            # 3. Pipeline metadata key-value
            cur.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_metadata (
                    meta_key TEXT PRIMARY KEY,
                    meta_value TEXT,
                    updated_at TEXT
                );
            """)
            conn.commit()

    def register_manifest(
        self, partitions: List[Dict[str, Any]], manifest_date: str
    ) -> int:
        """
        Populates s3_partitions table with manifest entries if not already present.
        Returns count of newly inserted partitions.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        inserted = 0

        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO pipeline_metadata (meta_key, meta_value, updated_at)
                VALUES ('manifest_date', ?, ?)
            """,
                (manifest_date, now),
            )

            for p in partitions:
                cur.execute(
                    """
                    INSERT OR IGNORE INTO s3_partitions
                    (s3_url, partition_index, content_length, expected_records, status)
                    VALUES (?, ?, ?, ?, 'pending')
                """,
                    (
                        p["s3_url"],
                        p["index"],
                        p.get("content_length", 0),
                        p.get("record_count", 0),
                    ),
                )
                if cur.rowcount > 0:
                    inserted += 1

            conn.commit()

        print(
            f"[LEDGER] Manifest registered. Partitions: total={len(partitions)}, newly_added={inserted}"
        )
        return inserted

    def get_pending_partitions(
        self, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Returns ordered list of uncompleted partitions."""
        query = """
            SELECT s3_url, partition_index, content_length, expected_records
            FROM s3_partitions
            WHERE status IN ('pending', 'failed')
            ORDER BY partition_index ASC
        """
        if limit and limit > 0:
            query += f" LIMIT {int(limit)}"

        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(query)
            rows = cur.fetchall()
            return [dict(r) for r in rows]

    def mark_partition_started(self, s3_url: str) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE s3_partitions
                SET status = 'processing', started_at = ?, error_message = NULL
                WHERE s3_url = ?
            """,
                (now, s3_url),
            )
            conn.commit()

    def mark_partition_completed(self, s3_url: str, cleaned_records: int) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE s3_partitions
                SET status = 'completed', cleaned_records = ?, completed_at = ?
                WHERE s3_url = ?
            """,
                (cleaned_records, now, s3_url),
            )
            conn.commit()

    def mark_partition_failed(self, s3_url: str, error_msg: str) -> None:
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE s3_partitions
                SET status = 'failed', error_message = ?
                WHERE s3_url = ?
            """,
                (str(error_msg), s3_url),
            )
            conn.commit()

    def get_next_shard_index(self) -> int:
        """Finds next available part index for output shard naming."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT MAX(part_index) FROM output_shards;")
            row = cur.fetchone()
            if row and row[0] is not None:
                return int(row[0]) + 1
            return 0

    def record_shard_created(self, shard_info: Dict[str, Any]) -> None:
        """Records metadata of a generated local shard."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO output_shards (
                    shard_name, part_index, record_count, size_bytes,
                    size_mb, sha256_hash, md5_hash, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
                (
                    shard_info["filename"],
                    shard_info["part_index"],
                    shard_info["record_count"],
                    shard_info["size_bytes"],
                    shard_info["size_mb"],
                    shard_info["sha256"],
                    shard_info["md5"],
                    now,
                ),
            )
            conn.commit()

    def record_shard_verified(
        self, shard_name: str, drive_file_id: str, shard_info: Optional[Dict[str, Any]] = None
    ) -> None:
        """Marks shard as uploaded and verified in Google Drive, dual-syncing to central DB."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE output_shards
                SET drive_file_id = ?, status = 'verified', uploaded_at = ?
                WHERE shard_name = ?
            """,
                (drive_file_id, now, shard_name),
            )
            conn.commit()

        # Dual-sync to Protokol-7 central catalog (data/catalog.sqlite)
        if shard_info:
            self._sync_to_central_registry(shard_name, drive_file_id, shard_info, now)

    def _sync_to_central_registry(
        self,
        shard_name: str,
        drive_file_id: str,
        shard_info: Dict[str, Any],
        timestamp_iso: str,
    ) -> None:
        """Inserts shard and Drive replica into central catalog.sqlite if present."""
        if not os.path.exists(self.central_db_path):
            return

        try:
            with sqlite3.connect(self.central_db_path, timeout=15.0) as conn:
                cur = conn.cursor()
                # 1. Ensure dataset exists
                cur.execute(
                    """
                    INSERT OR IGNORE INTO datasets (
                        dataset_id, name, source_platform, license_group,
                        default_language, description, created_at
                    ) VALUES (
                        'openalex_snapshot', 'OpenAlex Works Snapshot',
                        'aws_s3_openalex', 'permissive_commercial', 'en',
                        'Official OpenAlex S3 Parquet Snapshot Clean LLM Corpus', ?
                    )
                """,
                    (timestamp_iso,),
                )

                # 2. Insert dataset_shard
                shard_id = f"openalex_snapshot_{shard_name.replace('.parquet', '')}"
                cur.execute(
                    """
                    INSERT OR REPLACE INTO dataset_shards (
                        shard_id, pipeline_run_id, dataset_name, file_name,
                        storage_uri, storage_backend, record_count, size_bytes,
                        sha256_hash, compression_codec, created_at
                    ) VALUES (?, 'openalex_snapshot_pipeline', 'openalex_snapshot', ?, ?, 'gdrive', ?, ?, ?, 'zstd', ?)
                """,
                    (
                        shard_id,
                        shard_name,
                        f"gdrive://{drive_file_id}",
                        shard_info.get("record_count", 0),
                        shard_info.get("size_bytes", 0),
                        shard_info.get("sha256", ""),
                        timestamp_iso,
                    ),
                )

                # 3. Insert storage_replica
                replica_id = f"replica_gdrive_{shard_id}"
                cur.execute(
                    """
                    INSERT OR REPLACE INTO storage_replicas (
                        replica_id, shard_id, storage_provider, remote_uri,
                        remote_sha256_hash, remote_size_bytes, sync_status,
                        verified_at, last_error
                    ) VALUES (?, ?, 'google_drive', ?, ?, ?, 'VERIFIED', ?, NULL)
                """,
                    (
                        replica_id,
                        shard_id,
                        drive_file_id,
                        shard_info.get("sha256", ""),
                        shard_info.get("size_bytes", 0),
                        timestamp_iso,
                    ),
                )
                conn.commit()
                print(f"[CENTRAL REGISTRY] Shard {shard_name} registered in {self.central_db_path}")
        except Exception as err:
            print(f"[WARN] Failed to sync to central catalog.sqlite: {err}")

    def get_summary_stats(self) -> Dict[str, Any]:
        """Calculates snapshot progress and corpus totals."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT
                    COUNT(*) as total_partitions,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_partitions,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_partitions,
                    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as in_progress_partitions,
                    SUM(expected_records) as total_expected_records,
                    SUM(cleaned_records) as total_cleaned_records
                FROM s3_partitions;
            """)
            part_row = cur.fetchone()

            cur.execute("""
                SELECT
                    COUNT(*) as total_shards,
                    SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified_shards,
                    SUM(record_count) as total_shard_records,
                    SUM(size_mb) as total_shard_mb
                FROM output_shards;
            """)
            shard_row = cur.fetchone()

            return {
                "total_partitions": part_row["total_partitions"] or 0,
                "completed_partitions": part_row["completed_partitions"] or 0,
                "failed_partitions": part_row["failed_partitions"] or 0,
                "in_progress_partitions": part_row["in_progress_partitions"] or 0,
                "total_expected_records": part_row["total_expected_records"] or 0,
                "total_cleaned_records": part_row["total_cleaned_records"] or 0,
                "total_shards": shard_row["total_shards"] or 0,
                "verified_shards": shard_row["verified_shards"] or 0,
                "total_shard_records": shard_row["total_shard_records"] or 0,
                "total_shard_mb": shard_row["total_shard_mb"] or 0.0,
            }
