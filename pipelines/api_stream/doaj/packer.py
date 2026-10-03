#!/usr/bin/env python3
"""
DOAJ Parquet Streaming Sharder -- protokol-7

Batches cleaned DOAJ article records into PyArrow Table buffers and writes
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


DOAJ_ARROW_SCHEMA = pa.schema([
    ("id", pa.string()),
    ("doi", pa.string()),
    ("title", pa.string()),
    ("abstract", pa.string()),
    ("journal", pa.string()),
    ("publisher", pa.string()),
    ("issn", pa.string()),
    ("language", pa.string()),
    ("year", pa.int16()),
    ("authors", pa.string()),
    ("affiliations", pa.string()),
    ("keywords", pa.string()),
    ("subjects", pa.string()),
    ("fulltext_url", pa.string()),
    ("char_count", pa.int32()),
    ("word_count", pa.int32()),
]) if HAS_PYARROW else None


class DoajParquetSharder(BaseParquetSharder):
    """
    Streaming Parquet sharder tailored for DOAJ open access articles.
    """

    def __init__(
        self,
        output_dir: str = "data/parquets/doaj",
        filename_prefix: str = "doaj",
        max_part_bytes: int = 512 * 1024 * 1024,
        batch_size: int = 5000,
        start_part_idx: int = 0,
        compression: str = "zstd",
        compression_level: int = 3,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        super().__init__(
            output_dir=output_dir,
            schema=DOAJ_ARROW_SCHEMA,
            filename_prefix=filename_prefix,
            max_part_bytes=max_part_bytes,
            batch_size=batch_size,
            start_part_idx=start_part_idx,
            compression=compression,
            compression_level=compression_level,
            on_shard_completed=on_shard_completed,
        )

    def append_record(self, record: Dict[str, Any]) -> None:
        """Alias for add_record."""
        self.add_record(record)
