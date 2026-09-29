#!/usr/bin/env python3
"""
Gutenberg Streaming Parquet Sharder -- protokol-7

Streams cleaned book records into Zstandard-compressed Parquet shards.
Schema is deliberately wide: full text plus all catalog metadata so that
downstream LLM pre-training pipelines can filter by language, subject, etc.
"""

import datetime
import os
from typing import Dict, Any, List, Optional, Callable

import pyarrow as pa
import pyarrow.parquet as pq

# ------------------------------------------------------------------
# Arrow schema
# ------------------------------------------------------------------
GUTENBERG_SCHEMA = pa.schema([
    ("book_id",        pa.int64()),
    ("title",          pa.string()),
    ("authors",        pa.string()),   # semicolon-joined
    ("subjects",       pa.string()),   # semicolon-joined (capped at 20)
    ("languages",      pa.string()),   # semicolon-joined ISO codes
    ("download_count", pa.int32()),
    ("text_url",       pa.string()),
    ("text",           pa.string()),   # clean plain text
    ("char_count",     pa.int32()),
    ("word_count",     pa.int32()),
])

DEFAULT_BATCH_SIZE    = 2_000             # books per Arrow row-group
DEFAULT_MAX_PART_BYTES = 10 * 1024**3    # 10 GB part ceiling


class GutenbergParquetSharder:
    """
    Appends cleaned book dicts to Zstd Parquet shards.
    Auto-rolls to a new part file when the current part hits DEFAULT_MAX_PART_BYTES.
    """

    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "gutenberg",
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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

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
            schema=GUTENBERG_SCHEMA,
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
                "book_id":        [int(r["book_id"])        for r in self.buffer],
                "title":          [str(r["title"])          for r in self.buffer],
                "authors":        [str(r["authors"])        for r in self.buffer],
                "subjects":       [str(r["subjects"])       for r in self.buffer],
                "languages":      [str(r["languages"])      for r in self.buffer],
                "download_count": [int(r["download_count"]) for r in self.buffer],
                "text_url":       [str(r["text_url"])       for r in self.buffer],
                "text":           [str(r["text"])           for r in self.buffer],
                "char_count":     [int(r["char_count"])     for r in self.buffer],
                "word_count":     [int(r["word_count"])     for r in self.buffer],
            },
            schema=GUTENBERG_SCHEMA,
        )
        assert self._writer is not None
        self._writer.write_table(table)
        self.part_entries  += len(self.buffer)
        self.total_entries += len(self.buffer)
        self.buffer.clear()

        # Roll part if size ceiling hit
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
                    f"({self.part_entries:,} books, {size_mb:.2f} MB)"
                )
                if self.on_part_ready:
                    self.on_part_ready(self._part_path, self.part_entries)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def append(self, entry: Dict[str, Any]) -> None:
        self.buffer.append(entry)
        if len(self.buffer) >= self.batch_size:
            self._flush()

    def close(self) -> List[str]:
        """Flush remaining buffer, close writer, return list of produced files."""
        self._flush()
        self._close_part()
        produced = sorted(
            os.path.join(self.output_dir, f)
            for f in os.listdir(self.output_dir)
            if f.startswith(self.corpus_prefix) and f.endswith(".parquet")
        )
        return produced
