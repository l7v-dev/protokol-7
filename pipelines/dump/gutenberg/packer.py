#!/usr/bin/env python3
"""
Gutenberg Streaming Parquet Sharder -- protokol-7

Streams cleaned book records into Zstandard-compressed Parquet shards.
Schema is deliberately wide: full text plus all catalog metadata so that
downstream LLM pre-training pipelines can filter by language, subject, etc.
"""

import datetime
import os
import sys
from typing import Dict, Any, List, Optional, Callable

from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from pipelines.shared.pii_status import with_pii_schema, with_pii_table

# ------------------------------------------------------------------
# Arrow schema
# ------------------------------------------------------------------
GUTENBERG_SCHEMA = pa.schema([
    ("book_id",             pa.int64()),
    ("title",               pa.string()),
    ("authors",             pa.string()),   # semicolon-joined
    ("subjects",            pa.string()),   # semicolon-joined (capped at 20)
    ("languages",           pa.string()),   # semicolon-joined ISO codes
    ("download_count",      pa.int32()),
    ("text_url",            pa.string()),
    ("text",                pa.string()),   # clean plain text
    ("char_count",          pa.int32()),
    ("word_count",          pa.int32()),
    ("has_images",          pa.int8()),     # 1 if book has illustrations, 0 otherwise
    ("image_count",         pa.int32()),    # total image count extracted
    ("image_archive_shard", pa.string()),   # TAR shard filename containing book's images
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
            schema=with_pii_schema(GUTENBERG_SCHEMA),
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
                "book_id":             [int(r.get("book_id", 0))                for r in self.buffer],
                "title":               [str(r.get("title", ""))                  for r in self.buffer],
                "authors":             [str(r.get("authors", ""))                for r in self.buffer],
                "subjects":            [str(r.get("subjects", ""))               for r in self.buffer],
                "languages":           [str(r.get("languages", ""))              for r in self.buffer],
                "download_count":      [int(r.get("download_count", 0))          for r in self.buffer],
                "text_url":            [str(r.get("text_url", ""))               for r in self.buffer],
                "text":                [str(r.get("text", ""))                   for r in self.buffer],
                "char_count":          [int(r.get("char_count", 0))              for r in self.buffer],
                "word_count":          [int(r.get("word_count", 0))              for r in self.buffer],
                "has_images":          [int(r.get("has_images", 0))              for r in self.buffer],
                "image_count":         [int(r.get("image_count", 0))             for r in self.buffer],
                "image_archive_shard": [str(r.get("image_archive_shard", ""))    for r in self.buffer],
            },
            schema=GUTENBERG_SCHEMA,
        )
        assert self._writer is not None
        table = with_pii_table(table, self.buffer)
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


class GutenbergImageTarSharder:
    """
    Packs extracted book illustrations/images into 10 GB WebDataset-standard
    TAR.GZ shards with zero-disk streaming.
    Folder layout inside archive: '{book_id}/{image_name}'
    """

    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "gutenberg_images",
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = DEFAULT_MAX_PART_BYTES,
        on_part_ready: Optional[Callable[[str, int], None]] = None,
    ):
        import tarfile
        self.tarfile_mod       = tarfile
        self.output_dir        = output_dir
        self.corpus_prefix     = corpus_prefix
        self.snapshot_date     = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.max_part_bytes    = max_part_bytes
        self.on_part_ready     = on_part_ready

        self.part_idx          = 0
        self.total_images      = 0
        self.part_images       = 0
        self._tar              = None
        self._part_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    def current_shard_name(self) -> str:
        return (
            f"{self.corpus_prefix}_{self.snapshot_date}"
            f"_part{self.part_idx:05d}.tar.gz"
        )

    def _open_part(self) -> None:
        self._part_path = os.path.join(self.output_dir, self.current_shard_name())
        self.part_images = 0
        self._tar = self.tarfile_mod.open(self._part_path, mode="w:gz")
        print(
            f"[INFO] Opened Image TAR shard: {self.current_shard_name()} "
            f"(max {self.max_part_bytes / 1024**3:.1f} GB)"
        )

    def append_images(self, book_id: int, images: List[Dict[str, Any]]) -> str:
        """
        Adds list of images for a book into the current TAR shard.
        Returns the filename of the shard that received the images.
        """
        import io

        if not images:
            return ""

        if self._tar is None:
            self._open_part()

        shard_name = self.current_shard_name()

        for img in images:
            img_name = img["name"]
            img_bytes = img["bytes"]
            arcname = f"{book_id}/{img_name}"

            tarinfo = self.tarfile_mod.TarInfo(name=arcname)
            tarinfo.size = len(img_bytes)
            tarinfo.mtime = int(datetime.datetime.now().timestamp())

            self._tar.addfile(tarinfo, io.BytesIO(img_bytes))
            self.part_images += 1
            self.total_images += 1

        # Check part ceiling
        if (
            self._part_path
            and os.path.exists(self._part_path)
            and os.path.getsize(self._part_path) >= self.max_part_bytes
        ):
            self._close_part()
            self.part_idx += 1

        return shard_name

    def _close_part(self) -> None:
        if self._tar:
            self._tar.close()
            self._tar = None
            if self._part_path and os.path.exists(self._part_path):
                size_mb = os.path.getsize(self._part_path) / 1024**2
                print(
                    f"[OK] Closed Image TAR shard: {os.path.basename(self._part_path)} "
                    f"({self.part_images:,} images, {size_mb:.2f} MB)"
                )
                if self.on_part_ready:
                    self.on_part_ready(self._part_path, self.part_images)

    def close(self) -> List[str]:
        self._close_part()
        produced = sorted(
            os.path.join(self.output_dir, f)
            for f in os.listdir(self.output_dir)
            if f.startswith(self.corpus_prefix) and f.endswith(".tar.gz")
        )
        return produced

