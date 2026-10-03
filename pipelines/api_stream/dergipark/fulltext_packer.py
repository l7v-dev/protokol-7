#!/usr/bin/env python3
"""
DergiPark Full-Text Parquet Streaming Sharder -- protokol-7

Packs extracted academic article full-text markdown and metadata into
Zstandard-compressed Parquet shards with cryptographic SHA-256 and MD5 hashing.
Conforms to Protokol-7 storage and cold vault packaging specifications.
"""

import os
import sys
from typing import Any, Callable, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

try:
    import pyarrow as pa
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False

from pipelines.shared.sharder_base import BaseParquetSharder

DERGIPARK_FULLTEXT_SCHEMA = pa.schema([
    ("id", pa.string()),
    ("doi", pa.string()),
    ("title", pa.string()),
    ("journal", pa.string()),
    ("year", pa.int16()),
    ("language", pa.string()),
    ("pdf_url", pa.string()),
    ("page_count", pa.int16()),
    ("fulltext", pa.string()),
    ("char_count", pa.int32()),
    ("word_count", pa.int32()),
    ("extracted_at", pa.string()),
]) if HAS_PYARROW else None


class DergiParkFulltextSharder(BaseParquetSharder):
    """
    Streaming Parquet sharder for DergiPark article full-text text corpus.
    """

    def __init__(
        self,
        output_dir: str = "data/parquets/dergipark/fulltext",
        filename_prefix: str = "dergipark_fulltext",
        max_part_bytes: int = 512 * 1024 * 1024,
        max_part_entries: Optional[int] = 5000,
        batch_size: int = 500,
        start_part_idx: int = 0,
        compression: str = "zstd",
        compression_level: int = 6,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        super().__init__(
            output_dir=output_dir,
            schema=DERGIPARK_FULLTEXT_SCHEMA,
            filename_prefix=filename_prefix,
            max_part_bytes=max_part_bytes,
            max_part_entries=max_part_entries,
            batch_size=batch_size,
            start_part_idx=start_part_idx,
            compression=compression,
            compression_level=compression_level,
            on_shard_completed=on_shard_completed,
        )

    @property
    def current_shard_name(self) -> str:
        """Returns the filename of the active shard being written."""
        return self._format_filename()

    def append_article_fulltext(self, record: Dict[str, Any]) -> None:
        """Adds an extracted full-text article record to the streaming buffer."""
        clean_record = {
            "id": str(record.get("id", "")).strip(),
            "doi": str(record.get("doi", "") or "").strip(),
            "title": str(record.get("title", "") or "").strip(),
            "journal": str(record.get("journal", "") or "").strip(),
            "year": int(record.get("year", 0) or 0),
            "language": str(record.get("language", "tr") or "tr").strip(),
            "pdf_url": str(record.get("pdf_url", "") or "").strip(),
            "page_count": int(record.get("page_count", 0) or 0),
            "fulltext": str(record.get("text", "") or record.get("fulltext", "") or "").strip(),
            "char_count": int(record.get("char_count", 0) or 0),
            "word_count": int(record.get("word_count", 0) or 0),
            "extracted_at": str(record.get("extracted_at", "") or "").strip(),
        }
        self.add_record(clean_record)

