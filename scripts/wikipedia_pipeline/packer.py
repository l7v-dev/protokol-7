import datetime
import os
from typing import List, Dict, Any, Callable, Optional
import pyarrow as pa
import pyarrow.parquet as pq

ARTICLE_SCHEMA = pa.schema(
    [
        ("id", pa.string()),
        ("url", pa.string()),
        ("title", pa.string()),
        ("text", pa.string()),
    ]
)

DEFAULT_BATCH_SIZE = 10000
DEFAULT_MAX_PART_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB


class StreamingParquetSharder:
    """
    Streams cleaned articles directly into Parquet files with Zstandard compression.
    Flushes batches as Arrow row-groups to keep RAM usage minimal (< 200 MB),
    and rolls over to a new part file only when the current file size reaches max_part_bytes (e.g. 10 GB).
    Naming Convention: <corpus>_<date>_part<index>_<codec>.parquet
    """

    def __init__(
        self,
        output_dir: str,
        corpus_prefix: str = "trwiki",
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = DEFAULT_MAX_PART_BYTES,
        batch_size: int = DEFAULT_BATCH_SIZE,
        compression: str = "zstd",
        compression_level: int = 6,
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
        self.total_articles = 0
        self.current_part_articles = 0
        self.buffer: List[Dict[str, Any]] = []

        self.current_writer: Optional[pq.ParquetWriter] = None
        self.current_part_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    def _open_new_part(self) -> None:
        """Initializes a new Parquet part file with data-governance naming convention."""
        filename = f"{self.corpus_prefix}_{self.snapshot_date}_part{self.current_part_idx:05d}_{self.compression}.parquet"
        self.current_part_path = os.path.join(self.output_dir, filename)
        self.current_part_articles = 0
        print(f"[INFO] Opening new Parquet part: {filename} (Target limit: {self.max_part_bytes / (1024**3):.1f} GB)")

        self.current_writer = pq.ParquetWriter(
            self.current_part_path,
            schema=ARTICLE_SCHEMA,
            compression=self.compression,
            compression_level=self.compression_level,
        )

    def _flush_batch(self) -> None:
        """Writes current in-memory buffer as a row group to the active part file."""
        if not self.buffer:
            return

        if self.current_writer is None:
            self._open_new_part()

        ids = [doc["id"] for doc in self.buffer]
        urls = [doc["url"] for doc in self.buffer]
        titles = [doc["title"] for doc in self.buffer]
        texts = [doc["text"] for doc in self.buffer]

        table = pa.Table.from_arrays(
            [
                pa.array(ids, type=pa.string()),
                pa.array(urls, type=pa.string()),
                pa.array(titles, type=pa.string()),
                pa.array(texts, type=pa.string()),
            ],
            schema=ARTICLE_SCHEMA,
        )

        self.current_writer.write_table(table)
        self.current_part_articles += len(self.buffer)
        self.buffer.clear()

    def add_article(self, article: Dict[str, Any]) -> None:
        """Adds an article to the memory buffer. Flushes to disk and rolls part if size limit reached."""
        self.buffer.append(article)
        self.total_articles += 1

        if len(self.buffer) >= self.batch_size:
            self._flush_batch()

            # Check if active part file exceeded max_part_bytes
            if self.current_part_path and os.path.exists(self.current_part_path):
                current_size = os.path.getsize(self.current_part_path)
                if current_size >= self.max_part_bytes:
                    self._close_current_part()

    def _close_current_part(self) -> Optional[str]:
        """Finalizes the active Parquet writer and invokes the upload callback."""
        self._flush_batch()

        if self.current_writer is not None:
            self.current_writer.close()
            self.current_writer = None

            part_path = self.current_part_path
            part_count = self.current_part_articles
            file_size_mb = os.path.getsize(part_path) / (1024 * 1024)

            print(
                f"[OK] Closed part {self.current_part_idx}: {os.path.basename(part_path)} "
                f"({file_size_mb:.2f} MB, {part_count} articles)"
            )

            self.current_part_idx += 1
            self.current_part_path = None
            self.current_part_articles = 0

            if self.on_part_ready and part_path:
                self.on_part_ready(part_path, part_count)

            return part_path
        return None

    def close(self) -> None:
        """Finalizes the last part."""
        self._close_current_part()
        print(
            f"[INFO] Streaming sharder closed. Total parts: {self.current_part_idx}, "
            f"Total clean articles: {self.total_articles}"
        )
