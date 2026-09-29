#!/usr/bin/env python3
"""
OpenAlex Streaming Parquet Sharder -- protokol-7
"""

import datetime
import os
from typing import Dict, Any, List, Optional, Callable

import pyarrow as pa
import pyarrow.parquet as pq

OPENALEX_SCHEMA = pa.schema([
    ("work_id",           pa.string()),
    ("doi",               pa.string()),
    ("title",             pa.string()),
    ("authors",           pa.string()),
    ("publication_year",  pa.int32()),
    ("publication_date",  pa.string()),
    ("abstract",          pa.string()),
    ("concepts",          pa.string()),
    ("language",          pa.string()),
    ("work_type",         pa.string()),
    ("cited_by_count",    pa.int32()),
    ("oa_url",            pa.string()),
    ("text",              pa.string()),
    ("char_count",        pa.int32()),
    ("word_count",        pa.int32()),
])

DEFAULT_BATCH_SIZE     = 5_000
DEFAULT_MAX_PART_BYTES = 4 * 1024**3


class OpenAlexParquetSharder:
    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "openalex",
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

        self.part_idx      = 0
        self.total_entries = 0
        self.part_entries  = 0
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
            schema=OPENALEX_SCHEMA,
            compression=self.compression,
            compression_level=self.compression_level,
        )
        print(f"[INFO] Opened: {self._part_filename()}")

    def _flush(self) -> None:
        if not self.buffer:
            return
        if self._writer is None:
            self._open_part()

        def _s(key): return [str(r.get(key) or "") for r in self.buffer]
        def _i(key): return [int(r.get(key) or 0) for r in self.buffer]

        table = pa.Table.from_pydict({
            "work_id":          pa.array(_s("work_id"),          type=pa.string()),
            "doi":              pa.array(_s("doi"),              type=pa.string()),
            "title":            pa.array(_s("title"),            type=pa.string()),
            "authors":          pa.array(_s("authors"),          type=pa.string()),
            "publication_year": pa.array(_i("publication_year"), type=pa.int32()),
            "publication_date": pa.array(_s("publication_date"), type=pa.string()),
            "abstract":         pa.array(_s("abstract"),         type=pa.string()),
            "concepts":         pa.array(_s("concepts"),         type=pa.string()),
            "language":         pa.array(_s("language"),         type=pa.string()),
            "work_type":        pa.array(_s("work_type"),        type=pa.string()),
            "cited_by_count":   pa.array(_i("cited_by_count"),   type=pa.int32()),
            "oa_url":           pa.array(_s("oa_url"),           type=pa.string()),
            "text":             pa.array(_s("text"),             type=pa.string()),
            "char_count":       pa.array(_i("char_count"),       type=pa.int32()),
            "word_count":       pa.array(_i("word_count"),       type=pa.int32()),
        }, schema=OPENALEX_SCHEMA)

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
                    f"[OK] Closed: {os.path.basename(self._part_path)} "
                    f"({self.part_entries:,} works, {size_mb:.2f} MB)"
                )
                if self.on_part_ready:
                    self.on_part_ready(self._part_path, self.part_entries)

    def append(self, record: Dict[str, Any]) -> None:
        self.buffer.append(record)
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
