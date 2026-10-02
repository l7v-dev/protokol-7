#!/usr/bin/env python3
"""
OpenAlex Snapshot Streaming Parquet Sharder -- protokol-7

Batches clean OpenAlex records, packs them into Zstandard-compressed Parquet shards
with short, space-saving enterprise naming (oa_w_YYYYMMDD_p00000.parquet),
computes SHA256 and MD5 hashes, and triggers callbacks for upload and zero-disk cleanup.
"""

import datetime
import hashlib
import os
from typing import Any, Callable, Dict, List, Optional

import pyarrow as pa
import pyarrow.parquet as pq

OA_CLEAN_SCHEMA = pa.schema([
    ("id", pa.string()),
    ("doi", pa.string()),
    ("title", pa.string()),
    ("year", pa.int16()),
    ("authors", pa.string()),
    ("topics", pa.string()),
    ("is_oa", pa.bool_()),
    ("oa_url", pa.string()),
    ("citations", pa.int32()),
    ("text", pa.string()),
    ("char_count", pa.int32()),
    ("word_count", pa.int32()),
])

DEFAULT_BATCH_SIZE = 10_000
DEFAULT_MAX_PART_BYTES = 10 * 1024**3  # 10 GB


def compute_file_hashes(path: str, chunk_size: int = 4 * 1024 * 1024) -> Dict[str, str]:
    """Computes SHA-256 and MD5 checksums of a local file in chunks."""
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


class OpenAlexSnapshotSharder:
    """
    Manages continuous sharded output of clean OpenAlex Parquet files.
    When a shard reaches max_part_bytes, it is closed, hashed, and reported
    via on_shard_completed for immediate upload and disk purge.
    """

    def __init__(
        self,
        output_dir: str,
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = DEFAULT_MAX_PART_BYTES,
        batch_size: int = DEFAULT_BATCH_SIZE,
        start_part_idx: int = 0,
        compression: str = "zstd",
        compression_level: int = 3,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.output_dir = output_dir
        self.snapshot_date = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.max_part_bytes = max_part_bytes
        self.batch_size = batch_size
        self.part_idx = start_part_idx
        self.compression = compression
        self.compression_level = compression_level
        self.on_shard_completed = on_shard_completed

        self.buffer: List[Dict[str, Any]] = []
        self.part_entries = 0
        self.total_entries = 0
        self._writer: Optional[pq.ParquetWriter] = None
        self._current_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    def _format_filename(self) -> str:
        return f"oa_w_{self.snapshot_date}_p{self.part_idx:05d}.parquet"

    def _open_shard(self) -> None:
        filename = self._format_filename()
        self._current_path = os.path.join(self.output_dir, filename)
        self.part_entries = 0
        self._writer = pq.ParquetWriter(
            self._current_path,
            schema=OA_CLEAN_SCHEMA,
            compression=self.compression,
            compression_level=self.compression_level,
        )
        print(f"[SHARDER] Opened new shard: {filename}")

    def _flush_buffer(self) -> None:
        if not self.buffer:
            return
        if self._writer is None:
            self._open_shard()

        def _str_list(k: str) -> List[str]:
            return [str(r.get(k) or "") for r in self.buffer]

        def _int16_list(k: str) -> List[int]:
            res = []
            for r in self.buffer:
                try:
                    val = int(r.get(k) or 0)
                    res.append(max(-32768, min(32767, val)))
                except (ValueError, TypeError):
                    res.append(0)
            return res

        def _int32_list(k: str) -> List[int]:
            res = []
            for r in self.buffer:
                try:
                    val = int(r.get(k) or 0)
                    res.append(max(-2147483648, min(2147483647, val)))
                except (ValueError, TypeError):
                    res.append(0)
            return res

        def _bool_list(k: str) -> List[bool]:
            return [bool(r.get(k)) for r in self.buffer]

        table = pa.Table.from_pydict(
            {
                "id": pa.array(_str_list("id"), type=pa.string()),
                "doi": pa.array(_str_list("doi"), type=pa.string()),
                "title": pa.array(_str_list("title"), type=pa.string()),
                "year": pa.array(_int16_list("year"), type=pa.int16()),
                "authors": pa.array(_str_list("authors"), type=pa.string()),
                "topics": pa.array(_str_list("topics"), type=pa.string()),
                "is_oa": pa.array(_bool_list("is_oa"), type=pa.bool_()),
                "oa_url": pa.array(_str_list("oa_url"), type=pa.string()),
                "citations": pa.array(_int32_list("citations"), type=pa.int32()),
                "text": pa.array(_str_list("text"), type=pa.string()),
                "char_count": pa.array(_int32_list("char_count"), type=pa.int32()),
                "word_count": pa.array(_int32_list("word_count"), type=pa.int32()),
            },
            schema=OA_CLEAN_SCHEMA,
        )

        assert self._writer is not None
        self._writer.write_table(table)
        count = len(self.buffer)
        self.part_entries += count
        self.total_entries += count
        self.buffer.clear()

        # Check if shard size exceeds threshold
        if (
            self._current_path
            and os.path.exists(self._current_path)
            and os.path.getsize(self._current_path) >= self.max_part_bytes
        ):
            self._close_shard()
            self.part_idx += 1

    def _close_shard(self) -> Optional[Dict[str, Any]]:
        if self._writer is None:
            return None

        self._writer.close()
        self._writer = None

        if not self._current_path or not os.path.exists(self._current_path):
            return None

        size_bytes = os.path.getsize(self._current_path)
        size_mb = size_bytes / (1024 * 1024)
        filename = os.path.basename(self._current_path)

        hashes = compute_file_hashes(self._current_path)
        shard_info = {
            "path": self._current_path,
            "filename": filename,
            "part_index": self.part_idx,
            "record_count": self.part_entries,
            "size_bytes": size_bytes,
            "size_mb": size_mb,
            "sha256": hashes["sha256"],
            "md5": hashes["md5"],
        }

        print(
            f"[SHARDER] Shard completed: {filename} "
            f"({self.part_entries:,} works, {size_mb:.2f} MB, sha256={hashes['sha256'][:12]}...)"
        )

        if self.on_shard_completed:
            self.on_shard_completed(shard_info)

        self._current_path = None
        return shard_info

    def append(self, record: Dict[str, Any]) -> None:
        """Appends a cleaned record to the internal buffer, flushing when batch size is reached."""
        self.buffer.append(record)
        if len(self.buffer) >= self.batch_size:
            self._flush_buffer()

    def append_batch(self, records: List[Dict[str, Any]]) -> None:
        """Appends multiple cleaned records and flushes if necessary."""
        self.buffer.extend(records)
        if len(self.buffer) >= self.batch_size:
            self._flush_buffer()

    def close(self) -> Optional[Dict[str, Any]]:
        """Flushes remaining records in buffer and closes current open shard."""
        self._flush_buffer()
        return self._close_shard()
