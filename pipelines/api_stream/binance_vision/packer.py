#!/usr/bin/env python3
"""
Binance Vision Parquet Sharder -- protokol-7

Serializes PyArrow market tables into Zstandard-compressed (level 6) Parquet files,
computes MD5 checksums for Google Drive upload verification,
and integrates with the SQLite catalog.
"""

import hashlib
import os
import sys
from typing import Any, Dict, Optional, Tuple
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

DEFAULT_PARQUET_DIR = "data/parquets/binance"


class BinanceVisionParquetSharder:
    """
    Shards PyArrow market tables into compressed Parquet files with cryptographic verification.
    """

    def __init__(self, output_dir: str = DEFAULT_PARQUET_DIR):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    @staticmethod
    def compute_md5(file_path: str) -> str:
        """Computes MD5 hash of a local file in chunks."""
        hasher = hashlib.md5()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    def write_shard(
        self,
        table: pa.Table,
        market: str,
        data_type: str,
        symbol: str,
        interval: str = "",
        shard_seq: int = 1,
    ) -> Dict[str, Any]:
        """
        Writes a PyArrow Table into a Zstandard-compressed Parquet shard.
        Returns metadata dictionary including path, row_count, size_bytes, and md5.
        """
        if table.num_rows == 0:
            return {"row_count": 0, "size_bytes": 0, "path": "", "shard_name": "", "md5": ""}

        subfolder = os.path.join(self.output_dir, market, data_type)
        os.makedirs(subfolder, exist_ok=True)

        interval_tag = f"_{interval}" if interval else ""
        shard_name = f"binance_{market}_{data_type}_{symbol}{interval_tag}_{shard_seq:04d}.parquet"
        file_path = os.path.join(subfolder, shard_name)

        pq.write_table(
            table,
            file_path,
            compression="zstd",
            compression_level=6,
        )

        size_bytes = os.path.getsize(file_path)
        md5_checksum = self.compute_md5(file_path)

        return {
            "shard_name": shard_name,
            "path": file_path,
            "row_count": table.num_rows,
            "size_bytes": size_bytes,
            "md5": md5_checksum,
        }
