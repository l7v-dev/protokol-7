#!/usr/bin/env python3
"""
Wikiversity Streaming Parquet Sharder — protokol-7

Streams cleaned university modules, research projects, and courses into Zstandard-compressed
Parquet shards with RowGroup buffering.
"""

import datetime
import os
from typing import List, Dict, Any, Callable, Optional
import pyarrow as pa
import pyarrow.parquet as pq

WIKIVERSITY_SCHEMA = pa.schema(
    [
        ("article_id", pa.int64()),
        ("title", pa.string()),
        ("lang", pa.string()),
        ("text", pa.string()),
        ("raw_length", pa.int32()),
        ("clean_length", pa.int32()),
        ("url", pa.string()),
        ("timestamp", pa.string()),
    ]
)

DEFAULT_BATCH_SIZE = 50000
DEFAULT_MAX_PART_BYTES = 4 * 1024 * 1024 * 1024  # 4 GB part target ceiling


class StreamingParquetSharder:
    """
    Streams cleaned Wikiversity entries directly into Parquet files with Zstandard compression.
    Flushes 50k batches as Arrow row-groups to maximize memory throughput and I/O efficiency.
    """

    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "wikiversity_en",
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = DEFAULT_MAX_PART_BYTES,
        batch_size: int = DEFAULT_BATCH_SIZE,
        compression: str = "zstd",
        compression_level: int = 3,
        on_part_ready: Optional[Callable[[str, int], None]] = None,
    ):
        self.output_dir = output_dir
        self.corpus_prefix = corpus_prefix
        self.snapshot_date = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.max_part_bytes = max_part_bytes
        self.batch_size = batch_size
        self.compression = compression
        self.compression_level = compression_level
        self.on_part_ready = on_part_ready

        self.current_part_idx = 0
        self.total_entries = 0
        self.current_part_entries = 0
        self.buffer: List[Dict[str, Any]] = []

        self.current_writer: Optional[pq.ParquetWriter] = None
        self.current_part_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    def _open_new_part(self) -> None:
        filename = f"{self.corpus_prefix}_{self.snapshot_date}_part{self.current_part_idx:05d}_{self.compression}.parquet"
        self.current_part_path = os.path.join(self.output_dir, filename)
        self.current_part_entries = 0
        print(f"[INFO] Opening new Parquet part: {filename} (Target limit: {self.max_part_bytes / (1024**3):.1f} GB)")

        self.current_writer = pq.ParquetWriter(
            self.current_part_path,
            schema=WIKIVERSITY_SCHEMA,
            compression=self.compression,
            compression_level=self.compression_level,
        )

    def _flush_batch(self) -> None:
        if not self.buffer:
            return

        if self.current_writer is None:
            self._open_new_part()

        article_ids = [int(doc["article_id"]) for doc in self.buffer]
        titles = [str(doc["title"]) for doc in self.buffer]
        langs = [str(doc["lang"]) for doc in self.buffer]
        texts = [str(doc["text"]) for doc in self.buffer]
        raw_lengths = [int(doc["raw_length"]) for doc in self.buffer]
        clean_lengths = [int(doc["clean_length"]) for doc in self.buffer]
        urls = [str(doc["url"]) for doc in self.buffer]
        timestamps = [str(doc["timestamp"]) for doc in self.buffer]

        table = pa.Table.from_arrays(
            [
                pa.array(article_ids, type=pa.int64()),
                pa.array(titles, type=pa.string()),
                pa.array(langs, type=pa.string()),
                pa.array(texts, type=pa.string()),
                pa.array(raw_lengths, type=pa.int32()),
                pa.array(clean_lengths, type=pa.int32()),
                pa.array(urls, type=pa.string()),
                pa.array(timestamps, type=pa.string()),
            ],
            schema=WIKIVERSITY_SCHEMA,
        )

        assert self.current_writer is not None
        self.current_writer.write_table(table)

        self.current_part_entries += len(self.buffer)
        self.total_entries += len(self.buffer)
        self.buffer.clear()

        if (
            self.current_part_path
            and os.path.exists(self.current_part_path)
            and os.path.getsize(self.current_part_path) >= self.max_part_bytes
        ):
            self._close_current_part()
            self.current_part_idx += 1

    def append(self, entry: Dict[str, Any]) -> None:
        self.buffer.append(entry)
        if len(self.buffer) >= self.batch_size:
            self._flush_batch()

    def _close_current_part(self) -> None:
        if self.current_writer:
            self.current_writer.close()
            self.current_writer = None

            if self.current_part_path and os.path.exists(self.current_part_path):
                size_mb = os.path.getsize(self.current_part_path) / (1024 * 1024)
                print(
                    f"[OK] Closed Parquet part: {os.path.basename(self.current_part_path)} "
                    f"({self.current_part_entries:,} entries, {size_mb:.2f} MB)"
                )
                if self.on_part_ready:
                    self.on_part_ready(self.current_part_path, self.current_part_entries)

    def close(self) -> List[str]:
        self._flush_batch()
        self._close_current_part()

        produced = []
        if os.path.exists(self.output_dir):
            for f in sorted(os.listdir(self.output_dir)):
                if f.startswith(self.corpus_prefix) and f.endswith(".parquet"):
                    produced.append(os.path.join(self.output_dir, f))
        return produced
