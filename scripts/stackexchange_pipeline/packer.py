#!/usr/bin/env python3
"""
StackExchange Streaming Parquet Sharder -- protokol-7

Streams cleaned Q&A thread dicts into Zstandard-compressed Parquet shards.
Schema is deliberately denormalised (question + answer in same row) so
LLM pre-training pipelines can consume it as a flat text corpus.
"""

import datetime
import os
from typing import Dict, Any, List, Optional, Callable

import pyarrow as pa
import pyarrow.parquet as pq

# ------------------------------------------------------------------
# Arrow schema
# One row = one resolved Q&A thread (question + best answer)
# ------------------------------------------------------------------
SE_SCHEMA = pa.schema([
    ("thread_id",     pa.int64()),
    ("site",          pa.string()),
    ("title",         pa.string()),
    ("tags",          pa.string()),    # semicolon-joined
    ("score",         pa.int32()),
    ("view_count",    pa.int32()),
    ("question",      pa.string()),    # cleaned plain text
    ("answer",        pa.string()),    # cleaned plain text
    ("answer_score",  pa.int32()),
    ("comments",      pa.string()),    # pipe-joined top comments
    ("creation_date", pa.string()),
    ("answer_count",  pa.int32()),
])

DEFAULT_BATCH_SIZE     = 10_000          # threads per Arrow row-group
DEFAULT_MAX_PART_BYTES = 4 * 1024**3    # 4 GB part ceiling


class StackExchangeParquetSharder:
    """
    Appends cleaned SE thread dicts to Zstd Parquet shards.
    Auto-rolls to a new part when the current part exceeds DEFAULT_MAX_PART_BYTES.
    """

    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "stackexchange",
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = DEFAULT_MAX_PART_BYTES,
        batch_size: int = DEFAULT_BATCH_SIZE,
        compression: str = "zstd",
        compression_level: int = 3,
        on_part_ready: Optional[Callable[[str, int], None]] = None,
    ):
        self.output_dir        = output_dir
        self.corpus_prefix     = corpus_prefix
        self.snapshot_date     = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.max_part_bytes    = max_part_bytes
        self.batch_size        = batch_size
        self.compression       = compression
        self.compression_level = compression_level
        self.on_part_ready     = on_part_ready

        self.part_idx          = 0
        self.total_entries     = 0
        self.part_entries      = 0
        self.buffer: List[Dict[str, Any]] = []

        self._writer: Optional[pq.ParquetWriter] = None
        self._part_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    def _part_filename(self) -> str:
        return (
            f"{self.corpus_prefix}_{self.snapshot_date}"
            f"_part{self.part_idx:05d}_{self.compression}.parquet"
        )

    def _open_part(self) -> None:
        self._part_path = os.path.join(self.output_dir, self._part_filename())
        self.part_entries = 0
        self._writer = pq.ParquetWriter(
            self._part_path,
            schema=SE_SCHEMA,
            compression=self.compression,
            compression_level=self.compression_level,
        )
        print(
            f"[INFO] Opened Parquet part: {self._part_filename()} "
            f"(max {self.max_part_bytes / 1024**3:.1f} GB)"
        )

    def _flush(self) -> None:
        if not self.buffer:
            return
        if self._writer is None:
            self._open_part()

        table = pa.Table.from_pydict(
            {
                "thread_id":     pa.array([int(r["thread_id"])    for r in self.buffer], type=pa.int64()),
                "site":          pa.array([str(r["site"])         for r in self.buffer], type=pa.string()),
                "title":         pa.array([str(r["title"])        for r in self.buffer], type=pa.string()),
                "tags":          pa.array([str(r["tags"])         for r in self.buffer], type=pa.string()),
                "score":         pa.array([int(r["score"])        for r in self.buffer], type=pa.int32()),
                "view_count":    pa.array([int(r["view_count"])   for r in self.buffer], type=pa.int32()),
                "question":      pa.array([str(r["question"])     for r in self.buffer], type=pa.string()),
                "answer":        pa.array([str(r["answer"])       for r in self.buffer], type=pa.string()),
                "answer_score":  pa.array([int(r["answer_score"]) for r in self.buffer], type=pa.int32()),
                "comments":      pa.array([str(r["comments"])     for r in self.buffer], type=pa.string()),
                "creation_date": pa.array([str(r["creation_date"])for r in self.buffer], type=pa.string()),
                "answer_count":  pa.array([int(r["answer_count"]) for r in self.buffer], type=pa.int32()),
            },
            schema=SE_SCHEMA,
        )
        assert self._writer is not None
        self._writer.write_table(table)
        self.part_entries  += len(self.buffer)
        self.total_entries += len(self.buffer)
        self.buffer.clear()

        if (
            self._part_path
            and os.path.exists(self._part_path)
            and os.path.getsize(self._part_path) >= self.max_part_bytes
        ):
            self._close_part()
            self.part_idx += 1

    def _close_part(self) -> None:
        if self._writer:
            self._writer.close()
            self._writer = None
            if self._part_path and os.path.exists(self._part_path):
                size_mb = os.path.getsize(self._part_path) / 1024**2
                print(
                    f"[OK] Closed Parquet part: {os.path.basename(self._part_path)} "
                    f"({self.part_entries:,} threads, {size_mb:.2f} MB)"
                )
                if self.on_part_ready:
                    self.on_part_ready(self._part_path, self.part_entries)

    def append(self, entry: Dict[str, Any]) -> None:
        self.buffer.append(entry)
        if len(self.buffer) >= self.batch_size:
            self._flush()

    def close(self) -> List[str]:
        self._flush()
        self._close_part()
        return sorted(
            os.path.join(self.output_dir, f)
            for f in os.listdir(self.output_dir)
            if f.startswith(self.corpus_prefix) and f.endswith(".parquet")
        )
