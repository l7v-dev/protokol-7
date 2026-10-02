#!/usr/bin/env python3
"""
Enterprise Big Data LLM Metadata & Verification Catalog
Manages dataset lifecycles, storage replicas, and cryptographic verification audit records.
"""

import datetime
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

DEFAULT_CATALOG_DB = os.environ.get("PROTOKOL_DB_PATH", "data/catalog.sqlite")
SCHEMA_FILE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "context",
    "schema.sql",
)
if not os.path.exists(SCHEMA_FILE_PATH):
    SCHEMA_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def get_utc_iso_now() -> str:
    """Returns current UTC timestamp formatted as ISO-8601."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


try:
    import blake3
except ImportError:
    blake3 = None


def compute_file_sha256(filepath: str, block_size: int = 1024 * 1024) -> str:
    """Computes SHA-256 hash of a file efficiently in streaming chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(block_size):
            h.update(chunk)
    return h.hexdigest()


def compute_file_blake3(filepath: str, block_size: int = 1024 * 1024) -> Optional[str]:
    """Computes BLAKE3 hash of a file at SIMD/multi-thread speeds (5+ GB/s)."""
    if blake3 is None:
        return None
    h = blake3.blake3()
    with open(filepath, "rb") as f:
        while chunk := f.read(block_size):
            h.update(chunk)
    return h.hexdigest()


class MetadataCatalog:
    """Manages SQLite/ANSI relational catalog for datasets, shards, replicas, and audit trails."""

    def __init__(self, db_path: str = DEFAULT_CATALOG_DB):
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
        """Executes DDL script to create tables and indexes."""
        if os.path.exists(SCHEMA_FILE_PATH):
            with open(SCHEMA_FILE_PATH, "r", encoding="utf-8") as f:
                ddl = f.read()
            with self._get_connection() as conn:
                conn.executescript(ddl)

    def register_dataset(
        self,
        dataset_id: str,
        name: str,
        source_platform: str,
        license_group: str,
        default_language: str = "und",
        description: Optional[str] = None,
    ) -> None:
        """Registers a new dataset definition or ignores if already registered."""
        now = get_utc_iso_now()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO datasets (
                    dataset_id, name, source_platform, license_group, default_language, description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(dataset_id) DO UPDATE SET
                    name=excluded.name,
                    description=excluded.description
                """,
                (dataset_id, name, source_platform, license_group, default_language, description, now),
            )

    def start_run(
        self,
        run_id: str,
        dataset_id: str,
        target_storage_provider: str,
    ) -> None:
        """Initializes a new ingestion / ETL run."""
        now = get_utc_iso_now()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO pipeline_runs (
                    run_id, dataset_id, status, target_storage_provider, created_at
                ) VALUES (?, ?, 'INITIALIZING', ?, ?)
                """,
                (run_id, dataset_id, target_storage_provider, now),
            )

    def update_run_status(self, run_id: str, status: str, error_message: Optional[str] = None) -> None:
        """Updates pipeline run status and records completion timestamp if terminal."""
        now = get_utc_iso_now() if status in ("COMPLETED", "FAILED") else None
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs SET
                    status = ?,
                    completed_at = COALESCE(?, completed_at),
                    error_message = ?
                WHERE run_id = ?
                """,
                (status, now, error_message, run_id),
            )

    def update_run_stats(
        self,
        run_id: str,
        total_raw_documents: int,
        total_clean_documents: int,
        total_rejected_documents: int,
        total_uncompressed_bytes: int,
        total_compressed_bytes: int,
        total_estimated_tokens: int,
        total_shards: int,
        raw_data_purged: int = 0,
    ) -> None:
        """Updates cumulative counters for an active run."""
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE pipeline_runs SET
                    total_raw_documents = ?,
                    total_clean_documents = ?,
                    total_rejected_documents = ?,
                    total_uncompressed_bytes = ?,
                    total_compressed_bytes = ?,
                    total_estimated_tokens = ?,
                    total_shards = ?,
                    raw_data_purged = ?
                WHERE run_id = ?
                """,
                (
                    total_raw_documents,
                    total_clean_documents,
                    total_rejected_documents,
                    total_uncompressed_bytes,
                    total_compressed_bytes,
                    total_estimated_tokens,
                    total_shards,
                    raw_data_purged,
                    run_id,
                ),
            )

    def register_shard(
        self,
        shard_id: str,
        run_id: str,
        shard_index: int,
        filename: str,
        record_count: int,
        size_bytes: int,
        sha256_hash: str,
        blake3_hash: Optional[str] = None,
        row_group_count: int = 1,
        char_count: int = 0,
        word_count: int = 0,
        estimated_tokens: int = 0,
        compression_codec: str = "zstd",
        compression_level: int = 6,
        dataset_name: Optional[str] = None,
    ) -> None:
        """Registers a packaged Parquet shard."""
        now = get_utc_iso_now()
        with self._get_connection() as conn:
            actual_dataset_name = dataset_name
            if not actual_dataset_name:
                row = conn.execute("SELECT dataset_id FROM pipeline_runs WHERE run_id = ?", (run_id,)).fetchone()
                actual_dataset_name = row[0] if (row and row[0]) else "default"

            conn.execute(
                """
                INSERT INTO dataset_shards (
                    shard_id, run_id, shard_index, dataset_name, filename, record_count, size_bytes,
                    compression_codec, compression_level, sha256_hash, blake3_hash,
                    row_group_count, char_count, word_count, estimated_tokens, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    shard_id,
                    run_id,
                    shard_index,
                    actual_dataset_name,
                    filename,
                    record_count,
                    size_bytes,
                    compression_codec,
                    compression_level,
                    sha256_hash,
                    blake3_hash,
                    row_group_count,
                    char_count,
                    word_count,
                    estimated_tokens,
                    now,
                ),
            )

    def register_replica(
        self,
        replica_id: str,
        shard_id: str,
        storage_provider: str,
        remote_uri: str,
        remote_sha256_hash: str,
        remote_size_bytes: int,
        sync_status: str = "PENDING",
        last_error: Optional[str] = None,
    ) -> None:
        """Registers a remote storage replica location for a shard."""
        now = get_utc_iso_now() if sync_status == "VERIFIED" else None
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO storage_replicas (
                    replica_id, shard_id, storage_provider, remote_uri, remote_sha256_hash,
                    remote_size_bytes, sync_status, verified_at, last_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    replica_id,
                    shard_id,
                    storage_provider,
                    remote_uri,
                    remote_sha256_hash,
                    remote_size_bytes,
                    sync_status,
                    now,
                    last_error,
                ),
            )

    def update_replica_status(
        self,
        replica_id: str,
        sync_status: str,
        last_error: Optional[str] = None,
    ) -> None:
        """Updates replica status and timestamp."""
        now = get_utc_iso_now() if sync_status == "VERIFIED" else None
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE storage_replicas SET
                    sync_status = ?,
                    verified_at = COALESCE(?, verified_at),
                    last_error = ?
                WHERE replica_id = ?
                """,
                (sync_status, now, last_error, replica_id),
            )

    def commit_verification_audit(
        self,
        audit_id: str,
        shard_id: str,
        run_id: str,
        record_count_matches: bool,
        parquet_readable: bool,
        checksum_matches: bool,
        verification_passed: bool,
        raw_source_path: str,
        raw_source_sha256: Optional[str],
        raw_purged: bool,
        verifier_identity: str,
        notes: Optional[str] = None,
    ) -> None:
        """Commits verification result and raw purge status into the immutable audit ledger."""
        now = get_utc_iso_now()
        purged_at = now if raw_purged else None
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO verification_audit_ledger (
                    audit_id, shard_id, run_id, record_count_matches, parquet_readable,
                    checksum_matches, verification_passed, raw_source_path, raw_source_sha256,
                    raw_purged, purged_at, verifier_identity, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    audit_id,
                    shard_id,
                    run_id,
                    1 if record_count_matches else 0,
                    1 if parquet_readable else 0,
                    1 if checksum_matches else 0,
                    1 if verification_passed else 0,
                    raw_source_path,
                    raw_source_sha256,
                    1 if raw_purged else 0,
                    purged_at,
                    verifier_identity,
                    notes,
                    now,
                ),
            )

    def get_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Fetches dataset record by ID."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Fetches pipeline run record by ID."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM pipeline_runs WHERE run_id = ?", (run_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def get_shard(self, shard_id: str) -> Optional[Dict[str, Any]]:
        """Fetches shard record by ID."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM dataset_shards WHERE shard_id = ?", (shard_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def get_run_shards(self, run_id: str) -> List[Dict[str, Any]]:
        """Lists all shards for a given run in index order."""
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM dataset_shards WHERE run_id = ? ORDER BY shard_index ASC",
                (run_id,),
            )
            return [dict(row) for row in cur.fetchall()]

    def get_audit_record(self, audit_id: str) -> Optional[Dict[str, Any]]:
        """Fetches verification audit record by ID."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM verification_audit_ledger WHERE audit_id = ?", (audit_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def export_dataset_manifest(self, dataset_id: str, output_path: str) -> None:
        """Exports standalone, self-describing JSON manifest of a dataset with all its shards and replicas."""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")

        with self._get_connection() as conn:
            cur = conn.execute(
                """
                SELECT s.*, r.storage_provider, r.remote_uri, r.sync_status, r.verified_at
                FROM dataset_shards s
                JOIN pipeline_runs pr ON s.run_id = pr.run_id
                LEFT JOIN storage_replicas r ON s.shard_id = r.shard_id
                WHERE pr.dataset_id = ?
                ORDER BY s.shard_index ASC
                """,
                (dataset_id,),
            )
            shards = [dict(row) for row in cur.fetchall()]

        manifest = {
            "manifest_schema_version": "1.0.0",
            "generated_at": get_utc_iso_now(),
            "dataset": dataset,
            "total_shards": len(shards),
            "total_records": sum(s.get("record_count", 0) for s in shards),
            "total_bytes": sum(s.get("size_bytes", 0) for s in shards),
            "total_estimated_tokens": sum(s.get("estimated_tokens", 0) for s in shards),
            "shards": shards,
        }

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
