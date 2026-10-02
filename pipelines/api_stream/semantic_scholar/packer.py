#!/usr/bin/env python3
"""
Semantic Scholar Streaming Parquet Sharder -- protokol-7
"""

import datetime
import os
from typing import Dict, Any, List, Optional, Callable

import pyarrow as pa
import pyarrow.parquet as pq

S2_SCHEMA = pa.schema([
    ("paper_id",          pa.string()),
    ("doi",               pa.string()),
    ("arxiv_id",          pa.string()),
    ("pubmed_id",         pa.string()),
    ("title",             pa.string()),
    ("abstract",          pa.string()),
    ("authors",           pa.string()),
    ("year",              pa.int32()),
    ("publication_date",  pa.string()),
    ("citation_count",    pa.int32()),
    ("reference_count",   pa.int32()),
    ("is_open_access",    pa.int8()),
    ("oa_pdf_url",        pa.string()),
    ("fields_of_study",   pa.string()),
    ("publication_types", pa.string()),
    ("journal",           pa.string()),
    ("text",              pa.string()),
    ("char_count",        pa.int32()),
    ("word_count",        pa.int32()),
    # PDF extraction columns (Stage 1: pdfminer, Stage 2/3: Colab OCR)
    ("pdf_text",          pa.string()),
    ("pdf_ocr_needed",    pa.int8()),
    ("pdf_char_count",    pa.int32()),
])

DEFAULT_BATCH_SIZE     = 5_000
DEFAULT_MAX_PART_BYTES = 10 * 1024**3   # 10 GB part ceiling


class S2ParquetSharder:
    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "semanticscholar",
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
            schema=S2_SCHEMA,
            compression=self.compression,
            compression_level=self.compression_level,
        )
        print(f"[INFO] Opened: {self._part_filename()}")

    def _flush(self) -> None:
        if not self.buffer:
            return
        if self._writer is None:
            self._open_part()

        def _s(k): return [str(r.get(k) or "") for r in self.buffer]
        def _i(k): return [int(r.get(k) or 0) for r in self.buffer]
        def _i8(k): return [int(r.get(k) or 0) for r in self.buffer]

        table = pa.Table.from_pydict({
            "paper_id":          pa.array(_s("paper_id"),          type=pa.string()),
            "doi":               pa.array(_s("doi"),               type=pa.string()),
            "arxiv_id":          pa.array(_s("arxiv_id"),          type=pa.string()),
            "pubmed_id":         pa.array(_s("pubmed_id"),         type=pa.string()),
            "title":             pa.array(_s("title"),             type=pa.string()),
            "abstract":          pa.array(_s("abstract"),          type=pa.string()),
            "authors":           pa.array(_s("authors"),           type=pa.string()),
            "year":              pa.array(_i("year"),              type=pa.int32()),
            "publication_date":  pa.array(_s("publication_date"),  type=pa.string()),
            "citation_count":    pa.array(_i("citation_count"),    type=pa.int32()),
            "reference_count":   pa.array(_i("reference_count"),   type=pa.int32()),
            "is_open_access":    pa.array(_i8("is_open_access"),   type=pa.int8()),
            "oa_pdf_url":        pa.array(_s("oa_pdf_url"),        type=pa.string()),
            "fields_of_study":   pa.array(_s("fields_of_study"),   type=pa.string()),
            "publication_types": pa.array(_s("publication_types"), type=pa.string()),
            "journal":           pa.array(_s("journal"),           type=pa.string()),
            "text":              pa.array(_s("text"),              type=pa.string()),
            "char_count":        pa.array(_i("char_count"),        type=pa.int32()),
            "word_count":        pa.array(_i("word_count"),        type=pa.int32()),
            "pdf_text":          pa.array(_s("pdf_text"),          type=pa.string()),
            "pdf_ocr_needed":    pa.array(_i8("pdf_ocr_needed"),   type=pa.int8()),
            "pdf_char_count":    pa.array(_i("pdf_char_count"),    type=pa.int32()),
        }, schema=S2_SCHEMA)

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
                    f"({self.part_entries:,} papers, {size_mb:.2f} MB)"
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
