#!/usr/bin/env python3
"""
Base Streaming Parquet Sharder -- protokol-7

Manages continuous batched output of schema-validated records into
Zstandard-compressed Parquet shards with size caps, SHA-256 / MD5 hashing,
and completion callbacks for immediate cloud sync and local disk eviction.
"""

import datetime
import hashlib
import os
from typing import Any, Callable, Dict, List, Optional

import pyarrow as pa
import pyarrow.parquet as pq

DEFAULT_BATCH_SIZE = 10_000
DEFAULT_MAX_PART_BYTES = 10 * 1024**3  # 10 GB


def compute_file_hashes(path: str, chunk_size: int = 4 * 1024 * 1024) -> Dict[str, str]:
    """Computes SHA-256 and MD5 checksums of a local file in stream blocks."""
    h_sha256 = hashlib.sha256()
    h_md5 = hashlib.md5()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            h_sha256.update(chunk)
            h_md5.update(chunk)
    return {
        "sha256": h_sha256.hexdigest().lower(),
        "md5": h_md5.hexdigest().lower(),
    }


class BaseParquetSharder:
    """
    Streaming Parquet sharder with automatic partitioning and hash verification.
    """

    def __init__(
        self,
        output_dir: str,
        schema: pa.Schema,
        filename_prefix: str = "shard",
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = DEFAULT_MAX_PART_BYTES,
        max_part_entries: Optional[int] = None,
        batch_size: int = DEFAULT_BATCH_SIZE,
        start_part_idx: int = 0,
        compression: str = "zstd",
        compression_level: int = 3,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.output_dir = output_dir
        if "pii_status" in schema.names and not pa.types.is_string(schema.field("pii_status").type):
            raise ValueError("pii_status must be a string column")
        self.schema = schema if "pii_status" in schema.names else schema.append(pa.field("pii_status", pa.string()))
        self.filename_prefix = filename_prefix
        self.snapshot_date = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.max_part_bytes = max_part_bytes
        self.max_part_entries = max_part_entries
        self.batch_size = batch_size
        self.part_idx = start_part_idx
        self.compression = compression
        self.compression_level = compression_level
        self.on_shard_completed = on_shard_completed

        self.buffer: List[Dict[str, Any]] = []
        self.part_entries = 0
        self.total_entries = 0
        self.completed_shards: List[Dict[str, Any]] = []
        self._writer: Optional[pq.ParquetWriter] = None
        self._current_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    def _format_filename(self) -> str:
        return f"{self.filename_prefix}_{self.snapshot_date}_p{self.part_idx:05d}.parquet"

    def _open_shard(self) -> None:
        filename = self._format_filename()
        self._current_path = os.path.join(self.output_dir, filename)
        self.part_entries = 0
        self._writer = pq.ParquetWriter(
            self._current_path,
            schema=self.schema,
            compression=self.compression,
            compression_level=self.compression_level,
        )
        print(f"[SHARDER] Opened new shard: {filename}")

    def _flush_buffer(self) -> None:
        if not self.buffer:
            return

        if self._writer is None:
            self._open_shard()

        arrays = []
        for field in self.schema:
            col_name = field.name
            col_vals = [row.get(col_name) for row in self.buffer]
            arrays.append(pa.array(col_vals, type=field.type))

        table = pa.Table.from_arrays(arrays, schema=self.schema)
        self._writer.write_table(table)
        self.part_entries += len(self.buffer)
        self.total_entries += len(self.buffer)
        self.buffer.clear()

    def add_record(self, record: Dict[str, Any]) -> None:
        """Adds a single record to write buffer, checking size thresholds."""
        status = record.get("pii_status", "unchecked")
        if status not in ("unchecked", "clear", "redacted", "quarantined"):
            raise ValueError("Invalid pii_status")
        self.buffer.append({**record, "pii_status": status})
        if len(self.buffer) >= self.batch_size:
            self._flush_buffer()
            self._check_rotation()

    def add_records(self, records: List[Dict[str, Any]]) -> None:
        """Adds multiple records to write buffer."""
        for rec in records:
            self.add_record(rec)

    def _check_rotation(self) -> None:
        if self._current_path and os.path.exists(self._current_path):
            current_size = os.path.getsize(self._current_path)
            if current_size >= self.max_part_bytes:
                self.close_shard()
                return
        if self.max_part_entries and self.part_entries >= self.max_part_entries:
            self.close_shard()

    def close_shard(self) -> Optional[Dict[str, Any]]:
        """Closes active shard, hashes output file, and fires completion callback."""
        self._flush_buffer()

        if self._writer is None or self._current_path is None:
            return None

        self._writer.close()
        self._writer = None

        if not os.path.exists(self._current_path):
            return None

        byte_size = os.path.getsize(self._current_path)
        if byte_size == 0 or self.part_entries == 0:
            try:
                os.remove(self._current_path)
            except OSError:
                pass
            self._current_path = None
            return None

        hashes = compute_file_hashes(self._current_path)
        shard_info = {
            "shard_name": os.path.basename(self._current_path),
            "file_path": self._current_path,
            "part_index": self.part_idx,
            "record_count": self.part_entries,
            "byte_size": byte_size,
            "sha256": hashes["sha256"],
            "md5": hashes["md5"],
        }
        self.completed_shards.append(shard_info)
        print(
            f"[SHARDER] Shard completed: {shard_info['shard_name']} "
            f"({self.part_entries} records, {byte_size / (1024**2):.2f} MB, "
            f"sha256={hashes['sha256'][:12]}...)"
        )

        if self.on_shard_completed:
            self.on_shard_completed(shard_info)

        self.part_idx += 1
        self._current_path = None
        self.part_entries = 0
        return shard_info

    def close(self) -> List[Dict[str, Any]]:
        """Flushes remaining records and closes writer."""
        self.close_shard()
        return self.completed_shards

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
