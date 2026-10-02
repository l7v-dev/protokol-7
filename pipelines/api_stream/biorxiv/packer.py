#!/usr/bin/env python3
"""
bioRxiv & medRxiv Streaming Parquet Sharder -- protokol-7

Batches clean preprint records into Zstandard-compressed Parquet shards
with compact naming (bx_YYYYMMDD_p00000.parquet), computes SHA-256 and MD5 hashes,
and invokes callbacks for cloud storage synchronization and local disk eviction.
"""

import os
import sys
from typing import Any, Callable, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import pyarrow as pa
from pipelines.shared.sharder_base import BaseParquetSharder

BIORXIV_SCHEMA = pa.schema([
    ("doi", pa.string()),
    ("title", pa.string()),
    ("server", pa.string()),
    ("category", pa.string()),
    ("pub_date", pa.string()),
    ("pub_year", pa.int16()),
    ("version", pa.int16()),
    ("authors", pa.string()),
    ("corresponding_author", pa.string()),
    ("institution", pa.string()),
    ("license", pa.string()),
    ("published_doi", pa.string()),
    ("abstract", pa.string()),
    ("text", pa.string()),
    ("char_count", pa.int32()),
    ("word_count", pa.int32()),
])


class BiorxivSharder(BaseParquetSharder):
    """
    Streaming Parquet sharder for bioRxiv & medRxiv life science and medical preprints.
    """

    def __init__(
        self,
        output_dir: str,
        filename_prefix: str = "bx",
        max_part_bytes: int = 10 * 1024**3,  # 10 GB
        batch_size: int = 10_000,
        start_part_idx: int = 0,
        compression: str = "zstd",
        compression_level: int = 3,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        super().__init__(
            output_dir=output_dir,
            schema=BIORXIV_SCHEMA,
            filename_prefix=filename_prefix,
            max_part_bytes=max_part_bytes,
            batch_size=batch_size,
            start_part_idx=start_part_idx,
            compression=compression,
            compression_level=compression_level,
            on_shard_completed=on_shard_completed,
        )
