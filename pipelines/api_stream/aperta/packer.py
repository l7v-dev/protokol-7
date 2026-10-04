#!/usr/bin/env python3
"""
Aperta Parquet Streaming Sharder -- protokol-7

Batches cleaned Aperta records into PyArrow Table buffers and writes
Zstandard-compressed Parquet files (512 MB - 10 GB target shard size).
Computes SHA-256 and MD5 hashes upon closing shards.
"""

import os
import sys
from typing import Any, Callable, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False

from pipelines.shared.sharder_base import BaseParquetSharder

APERTA_ARROW_SCHEMA = pa.schema([
    ("id", pa.string()),
    ("doi", pa.string()),
    ("title", pa.string()),
    ("creators", pa.string()),
    ("description", pa.string()),
    ("publisher", pa.string()),
    ("publication_date", pa.string()),
    ("resource_type", pa.string()),
    ("language", pa.string()),
    ("keywords", pa.string()),
    ("subjects", pa.string()),
    ("rights", pa.string()),
    ("file_count", pa.int32()),
    ("total_file_size", pa.int64()),
    ("files_json", pa.string()),
    ("char_count", pa.int32()),
    ("word_count", pa.int32()),
]) if HAS_PYARROW else None


class ApertaParquetSharder(BaseParquetSharder):
    """
    Streaming Parquet sharder tailored for TUBITAK ULAKBIM Aperta records.
    """

    def __init__(
        self,
        output_dir: str = "data/parquets/aperta",
        filename_prefix: str = "aperta",
        max_part_bytes: int = 512 * 1024 * 1024,
        max_part_entries: Optional[int] = None,
        batch_size: int = 5000,
        start_part_idx: int = 0,
        compression: str = "zstd",
        compression_level: int = 6,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        super().__init__(
            output_dir=output_dir,
            schema=APERTA_ARROW_SCHEMA,
            filename_prefix=filename_prefix,
            max_part_bytes=max_part_bytes,
            max_part_entries=max_part_entries,
            batch_size=batch_size,
            start_part_idx=start_part_idx,
            compression=compression,
            compression_level=compression_level,
            on_shard_completed=on_shard_completed,
        )

    def append_record(self, record: Dict[str, Any]) -> None:
        """Alias for add_record."""
        self.add_record(record)
