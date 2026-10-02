#!/usr/bin/env python3
"""
Streaming Parquet Sharder & Packaging Engine for Big Data LLM Corpus.
Writes normalized, schema-enforced records into Zstandard (ZSTD) compressed Parquet shards,
partitioned by configurable chunk size (default 512 MB - 1 GB).
"""

from dataclasses import dataclass
import datetime
import hashlib
import os
from typing import Any, Dict, List, Optional
import pyarrow as pa
import pyarrow.parquet as pq

# Standard Schema for LLM Pre-training / Fine-tuning Shards
PARQUET_SCHEMA = pa.schema([
    ("doc_id", pa.string()),
    ("text", pa.string()),
    ("title", pa.string()),
    ("source", pa.string()),
    ("domain", pa.string()),
    ("license_group", pa.string()),
    ("char_count", pa.int64()),
    ("word_count", pa.int64()),
    ("ref_token_count", pa.int64()),
    ("created_at", pa.string()),
])


@dataclass
class CompletedShard:
    """Metadata describing a finalized Parquet shard."""

    shard_id: str
    shard_index: int
    filename: str
    filepath: str
    record_count: int
    size_bytes: int
    sha256_hash: str
    row_group_count: int
    char_count: int
    word_count: int
    estimated_tokens: int
    blake3_hash: Optional[str] = None


class StreamingParquetPacker:
    """Manages buffered writing of records into rolled Parquet files."""

    def __init__(
        self,
        output_dir: str,
        dataset_id: str,
        run_id: str,
        max_shard_bytes: int = 512 * 1024 * 1024,  # Default 512 MB
        row_group_size: int = 5000,
        compression_level: int = 6,
    ):
        self.output_dir = os.path.abspath(output_dir)
        self.dataset_id = dataset_id
        self.run_id = run_id
        self.max_shard_bytes = max_shard_bytes
        self.row_group_size = row_group_size
        self.compression_level = compression_level

        os.makedirs(self.output_dir, exist_ok=True)
        self.current_shard_index = 0
        self.current_writer: Optional[pq.ParquetWriter] = None
        self.current_filepath: Optional[str] = None
        self.current_shard_records = 0
        self.current_shard_chars = 0
        self.current_shard_words = 0
        self.current_shard_tokens = 0
        self.current_row_groups = 0

        self.buffer: List[Dict[str, Any]] = []
        self.completed_shards: List[CompletedShard] = []

    def _start_new_shard(self) -> None:
        """Initializes a new Parquet file writer."""
        self.current_shard_index += 1
        filename = f"{self.dataset_id}-part-{self.current_shard_index:05d}.parquet"
        self.current_filepath = os.path.join(self.output_dir, filename)

        self.current_writer = pq.ParquetWriter(
            self.current_filepath,
            PARQUET_SCHEMA,
            compression="zstd",
            compression_level=self.compression_level,
        )
        self.current_shard_records = 0
        self.current_shard_chars = 0
        self.current_shard_words = 0
        self.current_shard_tokens = 0
        self.current_row_groups = 0

    def _flush_buffer(self) -> None:
        """Flushes in-memory buffer as a new RowGroup into the active Parquet file."""
        if not self.buffer:
            return

        if self.current_writer is None:
            self._start_new_shard()

        # Build columnar arrays
        arrays = [
            pa.array([r["doc_id"] for r in self.buffer], type=pa.string()),
            pa.array([r["text"] for r in self.buffer], type=pa.string()),
            pa.array([r["title"] for r in self.buffer], type=pa.string()),
            pa.array([r["source"] for r in self.buffer], type=pa.string()),
            pa.array([r["domain"] for r in self.buffer], type=pa.string()),
            pa.array([r["license_group"] for r in self.buffer], type=pa.string()),
            pa.array([r["char_count"] for r in self.buffer], type=pa.int64()),
            pa.array([r["word_count"] for r in self.buffer], type=pa.int64()),
            pa.array([r["ref_token_count"] for r in self.buffer], type=pa.int64()),
            pa.array([r["created_at"] for r in self.buffer], type=pa.string()),
        ]
        table = pa.Table.from_arrays(arrays, schema=PARQUET_SCHEMA)
        self.current_writer.write_table(table)
        self.current_row_groups += 1

        self.current_shard_records += len(self.buffer)
        self.current_shard_chars += sum(r["char_count"] for r in self.buffer)
        self.current_shard_words += sum(r["word_count"] for r in self.buffer)
        self.current_shard_tokens += sum(r["ref_token_count"] for r in self.buffer)
        self.buffer.clear()

        # Check if active file size has crossed threshold
        current_size = os.path.getsize(self.current_filepath)
        if current_size >= self.max_shard_bytes:
            self._close_active_shard()

    def _close_active_shard(self) -> None:
        """Finalizes the active Parquet shard and computes its checksum."""
        if self.current_writer is None:
            return

        self.current_writer.close()
        self.current_writer = None

        size_bytes = os.path.getsize(self.current_filepath)
        h_sha = hashlib.sha256()
        try:
            import blake3
            h_blake = blake3.blake3()
        except ImportError:
            h_blake = None

        with open(self.current_filepath, "rb") as f:
            while chunk := f.read(1024 * 1024):
                h_sha.update(chunk)
                if h_blake:
                    h_blake.update(chunk)

        sha256_hash = h_sha.hexdigest()
        blake3_hash = h_blake.hexdigest() if h_blake else None

        filename = os.path.basename(self.current_filepath)
        shard_id = f"{self.run_id}-part-{self.current_shard_index:05d}"

        completed = CompletedShard(
            shard_id=shard_id,
            shard_index=self.current_shard_index,
            filename=filename,
            filepath=self.current_filepath,
            record_count=self.current_shard_records,
            size_bytes=size_bytes,
            sha256_hash=sha256_hash,
            row_group_count=self.current_row_groups,
            char_count=self.current_shard_chars,
            word_count=self.current_shard_words,
            estimated_tokens=self.current_shard_tokens,
            blake3_hash=blake3_hash,
        )
        self.completed_shards.append(completed)

    def write_record(
        self,
        doc_id: str,
        text: str,
        title: str,
        source: str,
        domain: str = "",
        license_group: str = "permissive_commercial",
        ref_token_count: Optional[int] = None,
    ) -> None:
        """Appends a document record to the staging buffer."""
        char_count = len(text)
        words = text.split()
        word_count = len(words)
        token_est = ref_token_count if ref_token_count is not None else max(1, int(word_count * 1.33))
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        record = {
            "doc_id": doc_id,
            "text": text,
            "title": title,
            "source": source,
            "domain": domain,
            "license_group": license_group,
            "char_count": char_count,
            "word_count": word_count,
            "ref_token_count": token_est,
            "created_at": now,
        }
        self.buffer.append(record)

        if len(self.buffer) >= self.row_group_size:
            self._flush_buffer()

    def finish(self) -> List[CompletedShard]:
        """Flushes remaining records, closes writers, and returns list of completed shards."""
        if self.buffer:
            self._flush_buffer()
        if self.current_writer is not None:
            self._close_active_shard()
        return self.completed_shards
