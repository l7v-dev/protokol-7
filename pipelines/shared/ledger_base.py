#!/usr/bin/env python3
"""
Base SQLite Ledger and Registry Sync Engine -- protokol-7

Maintains transactional tracking of processing partitions, output shards,
checksum verification, Google Drive replica identifiers, and dual-sync
with the central Protokol-7 catalog.
"""

import contextlib
import datetime
import json
import os
import sqlite3
from typing import Any, Dict, List, Optional

DEFAULT_CENTRAL_CATALOG = "data/catalog.sqlite"


class BaseLedger:
    """
    ACID transactional SQLite ledger with WAL mode and central catalog synchronization.
    """

    def __init__(
        self,
        db_path: str,
        central_db_path: str = DEFAULT_CENTRAL_CATALOG,
    ):
        self.db_path = db_path
        self.central_db_path = central_db_path
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self._init_db()

    @contextlib.contextmanager
    def _get_conn(self, path: Optional[str] = None):
        target = path or self.db_path
        conn = sqlite3.connect(target, timeout=30.0)
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

            cur.execute("""
                CREATE TABLE IF NOT EXISTS shards (
                    shard_name TEXT PRIMARY KEY,
                    part_index INTEGER,
                    record_count INTEGER,
                    byte_size INTEGER,
                    sha256 TEXT,
                    md5 TEXT,
                    drive_file_id TEXT,
                    status TEXT DEFAULT 'created' CHECK(status IN ('created', 'uploaded', 'verified', 'failed')),
                    created_at TEXT,
                    uploaded_at TEXT
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS work_items (
                    item_id TEXT PRIMARY KEY,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
                    record_count INTEGER DEFAULT 0,
                    error_message TEXT,
                    metadata_json TEXT,
                    created_at TEXT,
                    completed_at TEXT
                );
            """)
            conn.commit()

    def register_shard(
        self,
        shard_name: str,
        part_index: int,
        record_count: int,
        byte_size: int,
        sha256: str,
        md5: str,
    ) -> None:
        """Records a completed local shard."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO shards (
                    shard_name, part_index, record_count, byte_size,
                    sha256, md5, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'created', ?)
                ON CONFLICT(shard_name) DO UPDATE SET
                    record_count = excluded.record_count,
                    byte_size = excluded.byte_size,
                    sha256 = excluded.sha256,
                    md5 = excluded.md5;
                """,
                (shard_name, part_index, record_count, byte_size, sha256, md5, now),
            )
            conn.commit()

    def mark_shard_uploaded(
        self,
        shard_name: str,
        drive_file_id: str,
        verified_md5: Optional[str] = None,
    ) -> None:
        """Marks a shard as uploaded and verified on remote storage."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE shards
                SET status = 'uploaded',
                    drive_file_id = ?,
                    md5 = COALESCE(?, md5),
                    uploaded_at = ?
                WHERE shard_name = ?;
                """,
                (drive_file_id, verified_md5, now, shard_name),
            )
            conn.commit()

    def register_item(self, item_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Registers a discrete processing item / partition."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        meta_json = json.dumps(metadata or {})
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO work_items (item_id, status, metadata_json, created_at)
                VALUES (?, 'pending', ?, ?);
                """,
                (item_id, meta_json, now),
            )
            conn.commit()

    def mark_item_completed(self, item_id: str, record_count: int = 0) -> None:
        """Marks a work item completed."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE work_items
                SET status = 'completed',
                    record_count = ?,
                    completed_at = ?
                WHERE item_id = ?;
                """,
                (record_count, now, item_id),
            )
            conn.commit()

    def get_stats(self) -> Dict[str, Any]:
        """Returns aggregate execution statistics."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT
                    COUNT(*) as total_shards,
                    COALESCE(SUM(record_count), 0) as total_records,
                    COALESCE(SUM(byte_size), 0) as total_bytes,
                    COALESCE(SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END), 0) as uploaded_shards
                FROM shards;
            """)
            shard_row = cur.fetchone()

            cur.execute("""
                SELECT
                    COUNT(*) as total_items,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_items,
                    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_items
                FROM work_items;
            """)
            item_row = cur.fetchone()

            return {
                "total_shards": shard_row["total_shards"] if shard_row else 0,
                "total_records": shard_row["total_records"] if shard_row else 0,
                "total_bytes": shard_row["total_bytes"] if shard_row else 0,
                "uploaded_shards": shard_row["uploaded_shards"] if shard_row else 0,
                "total_items": item_row["total_items"] if item_row else 0,
                "completed_items": item_row["completed_items"] if item_row else 0,
                "failed_items": item_row["failed_items"] if item_row else 0,
            }

    def get_next_part_index(self) -> int:
        """Returns the next available partition index based on existing recorded shards."""
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT MAX(part_index) as max_idx FROM shards;")
            row = cur.fetchone()
            if row and row["max_idx"] is not None:
                return int(row["max_idx"]) + 1
            return 0

    def sync_to_central_catalog(
        self,
        dataset_name: str,
        storage_uri_template: str = "gdrive://{file_id}",
    ) -> int:
        """
        Synchronizes all uploaded shards to central catalog.sqlite (table dataset_shards).
        """
        if not os.path.exists(self.central_db_path):
            return 0

        synced = 0
        with self._get_conn() as local_conn:
            local_cur = local_conn.cursor()
            local_cur.execute("""
                SELECT shard_name, part_index, record_count, byte_size, sha256, drive_file_id
                FROM shards
                WHERE status = 'uploaded' AND drive_file_id IS NOT NULL;
            """)
            rows = local_cur.fetchall()

        if not rows:
            return 0

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn(self.central_db_path) as central_conn:
            c_cur = central_conn.cursor()
            cols_info = c_cur.execute("PRAGMA table_info(dataset_shards);").fetchall()
            col_names = {c["name"] if isinstance(c, dict) else c[1] for c in cols_info}
            has_shard_index = "shard_index" in col_names

            for r in rows:
                shard_id = f"{dataset_name}:{r['shard_name']}"
                storage_uri = storage_uri_template.format(file_id=r["drive_file_id"])
                if has_shard_index:
                    c_cur.execute(
                        """
                        INSERT INTO dataset_shards (
                            shard_id, dataset_name, shard_index, byte_size,
                            record_count, sha256_checksum, storage_uri, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(shard_id) DO UPDATE SET
                            record_count = excluded.record_count,
                            byte_size = excluded.byte_size,
                            sha256_checksum = excluded.sha256_checksum,
                            storage_uri = excluded.storage_uri;
                        """,
                        (
                            shard_id,
                            dataset_name,
                            r["part_index"],
                            r["byte_size"],
                            r["record_count"],
                            r["sha256"],
                            storage_uri,
                            now,
                        ),
                    )
                else:
                    c_cur.execute(
                        """
                        INSERT INTO dataset_shards (
                            shard_id, pipeline_run_id, dataset_name, file_name,
                            storage_uri, storage_backend, record_count, size_bytes,
                            sha256_hash, compression_codec, created_at
                        ) VALUES (?, ?, ?, ?, ?, 'gdrive', ?, ?, ?, 'zstd', ?)
                        ON CONFLICT(shard_id) DO UPDATE SET
                            record_count = excluded.record_count,
                            size_bytes = excluded.size_bytes,
                            sha256_hash = excluded.sha256_hash,
                            storage_uri = excluded.storage_uri;
                        """,
                        (
                            shard_id,
                            f"pipeline_{dataset_name}",
                            dataset_name,
                            r["shard_name"],
                            storage_uri,
                            r["record_count"],
                            r["byte_size"],
                            r["sha256"],
                            now,
                        ),
                    )
                synced += 1
            central_conn.commit()

        print(f"[LEDGER] Synchronized {synced} shards to central catalog: {self.central_db_path}")
        return synced
