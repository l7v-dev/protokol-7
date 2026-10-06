#!/usr/bin/env python3
"""
Gutenberg Full-Corpus Harvest Orchestrator -- protokol-7

End-to-end pipeline:
  Gutendex API (paginated) -> stream plain text -> clean boilerplate
  -> Zstd Parquet shards -> Google Drive upload -> zero local disk residue.

The SQLite ledger in data/gutenberg_catalog.sqlite tracks every book so
the run is fully resumable: re-running skips already-completed book IDs.

Usage examples
--------------
  # Harvest everything (resumable)
  python3 scripts/gutenberg_pipeline/orchestrator.py --all

  # Dry-run: process first 100 books only
  python3 scripts/gutenberg_pipeline/orchestrator.py --all --limit 100 --dry-run

  # Show current status
  python3 scripts/gutenberg_pipeline/orchestrator.py --status

  # Disable Drive upload (keep Parquet locally for inspection)
  python3 scripts/gutenberg_pipeline/orchestrator.py --all --no-drive
"""

import argparse
import datetime
import os
import sqlite3
import sys
import time
from typing import Dict, Any, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import report_producer_error, EvidenceWriteError, producer_run, capture_bytes, record_output
from cleaner import build_entry
from downloader import (
    iter_catalog_from_rdf_dump,
    iter_catalog_pages,
    pick_text_url,
    stream_book_text,
    fetch_book_images,
)
from drive_sync import GutenbergDriveSync
from packer import GutenbergParquetSharder, GutenbergImageTarSharder

DEFAULT_DB_PATH   = "data/catalogs/gutenberg_catalog.sqlite"
DEFAULT_OUT_DIR   = "data/parquets/gutenberg"



# ------------------------------------------------------------------
# SQLite ledger
# ------------------------------------------------------------------

class GutenbergLedger:
    """
    Persists per-book harvest status so the pipeline is resumable.
    Schema stores enough metadata for post-hoc analysis.
    """

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init()

    def _init(self) -> None:
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS books (
                    book_id        INTEGER PRIMARY KEY,
                    title          TEXT,
                    authors        TEXT,
                    languages      TEXT,
                    subjects       TEXT,
                    download_count INTEGER DEFAULT 0,
                    text_url       TEXT,
                    status         TEXT DEFAULT 'pending',
                    word_count     INTEGER DEFAULT 0,
                    char_count     INTEGER DEFAULT 0,
                    image_count    INTEGER DEFAULT 0,
                    parquet_shard  TEXT,
                    drive_file_id  TEXT,
                    error_message  TEXT,
                    created_at     TEXT,
                    updated_at     TEXT
                )
            """)


    def close(self) -> None:
        self.conn.close()

    def upsert_book(self, book: Dict[str, Any]) -> None:
        """Insert catalog metadata if not already tracked."""
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self.conn:
            self.conn.execute("""
                INSERT OR IGNORE INTO books
                    (book_id, title, authors, languages, subjects, download_count,
                     text_url, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            """, (
                book["book_id"], book["title"], book["authors"],
                book["languages"], book["subjects"], book["download_count"],
                book.get("text_url", ""), now, now,
            ))

    def mark_status(
        self,
        book_id: int,
        status: str,
        word_count: int = 0,
        char_count: int = 0,
        image_count: int = 0,
        parquet_shard: Optional[str] = None,
        drive_file_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fields = ["status = ?", "updated_at = ?"]
        params: List[Any] = [status, now]
        for col, val in [
            ("word_count", word_count),
            ("char_count", char_count),
            ("image_count", image_count),
            ("parquet_shard", parquet_shard),
            ("drive_file_id", drive_file_id),
            ("error_message", error_message),
        ]:
            if val is not None:
                fields.append(f"{col} = ?")
                params.append(val)

        params.append(book_id)
        with self.conn:
            self.conn.execute(
                f"UPDATE books SET {', '.join(fields)} WHERE book_id = ?",
                params,
            )

    def is_done(self, book_id: int) -> bool:
        row = self.conn.execute(
            "SELECT status FROM books WHERE book_id = ?", (book_id,)
        ).fetchone()
        return row is not None and row["status"] == "completed"

    def print_summary(self) -> None:
        print("\n=== Gutenberg Harvest Summary ===")
        rows = self.conn.execute("""
            SELECT status,
                   COUNT(*)           AS cnt,
                   SUM(word_count)    AS total_words,
                   SUM(char_count)    AS total_chars
            FROM books GROUP BY status
        """).fetchall()
        for r in rows:
            print(
                f"  [{r['status'].upper():12s}] books: {r['cnt']:6,d} | "
                f"words: {(r['total_words'] or 0):12,d} | "
                f"chars: {(r['total_chars'] or 0):12,d}"
            )
        total = self.conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        print(f"  Total books in ledger: {total:,}")
        print("=================================\n")


# ------------------------------------------------------------------
# Orchestrator
# ------------------------------------------------------------------

class GutenbergOrchestrator:
    """
    Drives the full harvest loop:
      page -> books -> text download -> clean -> pack -> upload.
    Flushes the Parquet shard (and uploads) every FLUSH_EVERY books so that
    partial progress is committed to Drive even on long runs.
    """

    FLUSH_EVERY = 5_000  # commit shard to Drive every N books

    def __init__(
        self,
        ledger: GutenbergLedger,
        out_dir: str = DEFAULT_OUT_DIR,
        enable_drive: bool = True,
        dry_run: bool = False,
    ):
        self.ledger       = ledger
        self.out_dir      = out_dir
        self.enable_drive = enable_drive
        self.dry_run      = dry_run
        self.drive: Optional[GutenbergDriveSync] = None

        if enable_drive:
            try:
                self.drive = GutenbergDriveSync()
            except EvidenceWriteError:
                raise
            except Exception as e:
                report_producer_error(e)
                print(f"[WARN] Drive init failed: {e} -- local-only mode.", file=sys.stderr)
                self.enable_drive = False

        os.makedirs(self.out_dir, exist_ok=True)

    def _new_sharder(self, shard_idx: int) -> GutenbergParquetSharder:
        return GutenbergParquetSharder(
            output_dir=self.out_dir,
            corpus_prefix=f"gutenberg_shard{shard_idx:04d}",
        )

    def _commit_shard(self, sharder: GutenbergParquetSharder, shard_idx: int) -> None:
        """Close sharder, upload produced files, delete local copies."""
        files = sharder.close()
        if not files:
            return
        for fpath in files:
            size_mb = os.path.getsize(fpath) / 1024**2
            print(f"[SHARD] Produced {os.path.basename(fpath)} ({size_mb:.2f} MB)")
            if self.enable_drive and self.drive:
                result = self.drive.upload_and_clean(fpath)
                drive_id = result.get("drive_file_id", "")
                # Patch ledger rows for this shard
                shard_name = os.path.basename(fpath)
                with self.ledger.conn:
                    self.ledger.conn.execute(
                        "UPDATE books SET drive_file_id = ?, parquet_shard = ? "
                        "WHERE parquet_shard = ?",
                        (drive_id, shard_name, shard_name),
                    )
            else:
                print(f"[INFO] Drive disabled -- file kept at: {fpath}")

    def _commit_images(self, image_sharder: GutenbergImageTarSharder) -> None:
        """Close image sharder, upload produced TAR shards to Drive/Gutenberg/Images/, delete local."""
        tar_files = image_sharder.close()
        if not tar_files:
            return
        for fpath in tar_files:
            size_mb = os.path.getsize(fpath) / 1024**2
            print(f"[IMAGE SHARD] Produced {os.path.basename(fpath)} ({size_mb:.2f} MB)")
            if self.enable_drive and self.drive:
                self.drive.upload_and_clean(fpath, subfolder="Images")
            else:
                print(f"[INFO] Drive disabled -- image TAR kept at: {fpath}")

    def run(self, limit: int = 0) -> None:
        print("[INIT] Starting Gutenberg full-corpus harvest with text and image sharding...")
        total_processed = 0
        total_skipped   = 0
        total_failed    = 0
        total_images    = 0
        shard_idx       = 0
        sharder         = self._new_sharder(shard_idx)
        image_sharder   = GutenbergImageTarSharder(
            output_dir=self.out_dir,
            on_part_ready=lambda p, cnt: self.drive.upload_and_clean(p, subfolder="Images") if (self.enable_drive and self.drive) else None,
        )
        books_in_shard  = 0
        t_start         = time.time()

        try:
            for page_books in iter_catalog_from_rdf_dump():
                for raw_book in page_books:
                    book_id = raw_book.get("id") or 0
                    if not book_id:
                        continue

                    # Resume: skip already-completed books
                    if self.ledger.is_done(book_id):
                        total_skipped += 1
                        continue

                    title      = raw_book.get("title") or ""
                    authors    = [a["name"] for a in (raw_book.get("authors") or [])]
                    subjects   = raw_book.get("subjects") or []
                    languages  = raw_book.get("languages") or []
                    dl_count   = raw_book.get("download_count") or 0
                    formats    = raw_book.get("formats") or {}
                    text_url   = pick_text_url(formats) or ""

                    # Register in ledger (idempotent)
                    self.ledger.upsert_book({
                        "book_id": book_id,
                        "title": title,
                        "authors": "; ".join(authors),
                        "languages": "; ".join(languages),
                        "subjects": "; ".join(subjects[:20]),
                        "download_count": dl_count,
                        "text_url": text_url,
                    })

                    if not text_url:
                        self.ledger.mark_status(book_id, "skipped", error_message="no text/plain URL")
                        total_skipped += 1
                        continue

                    # Download raw bytes
                    raw_bytes = stream_book_text(text_url)
                    if not raw_bytes:
                        self.ledger.mark_status(book_id, "failed", error_message="download failed")
                        total_failed += 1
                        continue

                    raw_evidence = capture_bytes(raw_bytes, "gutenberg", text_url)

                    # Extract illustrations/images from EPUB/Zip/Cover
                    images = fetch_book_images(book_id, formats)
                    image_shard = ""
                    if images:
                        image_shard = image_sharder.append_images(book_id, images)
                        total_images += len(images)

                    # Build clean entry
                    entry = build_entry(
                        book_id=book_id,
                        title=title,
                        authors=authors,
                        subjects=subjects,
                        languages=languages,
                        download_count=dl_count,
                        text_url=text_url,
                        raw_bytes=raw_bytes,
                        image_count=len(images),
                        image_archive_shard=image_shard,
                    )
                    if entry is None:
                        self.ledger.mark_status(book_id, "skipped", error_message="below quality threshold")
                        total_skipped += 1
                        continue

                    # Write to shard
                    shard_name = sharder._part_filename()
                    record_output(entry, raw_evidence, source_record_id=book_id)
                    sharder.append(entry)
                    books_in_shard += 1
                    total_processed += 1

                    self.ledger.mark_status(
                        book_id, "completed",
                        word_count=entry["word_count"],
                        char_count=entry["char_count"],
                        image_count=len(images),
                        parquet_shard=shard_name,
                    )

                    if total_processed % 500 == 0:
                        elapsed = time.time() - t_start
                        rate = total_processed / max(1, elapsed)
                        print(
                            f"[PROGRESS] {total_processed:,} books | {total_images:,} images "
                            f"({rate:.1f} books/s) | skipped: {total_skipped} | failed: {total_failed}"
                        )

                    # Periodic shard commit to Drive
                    if books_in_shard >= self.FLUSH_EVERY:
                        self._commit_shard(sharder, shard_idx)
                        shard_idx      += 1
                        sharder         = self._new_sharder(shard_idx)
                        books_in_shard  = 0

                    if self.dry_run and total_processed >= 100:
                        print("[DRY-RUN] Limit reached (100 books). Stopping.")
                        break

                    if limit and total_processed >= limit:
                        print(f"[INFO] --limit {limit} reached.")
                        break

                if (self.dry_run and total_processed >= 100) or (limit and total_processed >= limit):
                    break

        finally:
            # Always commit remaining shards (both text Parquet and image TAR)
            self._commit_shard(sharder, shard_idx)
            self._commit_images(image_sharder)


        elapsed_total = time.time() - t_start
        print(
            f"\n[DONE] Gutenberg harvest complete in {elapsed_total:.0f}s.\n"
            f"  Processed : {total_processed:,}\n"
            f"  Skipped   : {total_skipped:,}\n"
            f"  Failed    : {total_failed:,}\n"
        )
        self.ledger.print_summary()


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------

@producer_run("gutenberg")
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gutenberg Full-Corpus Harvest Pipeline -- protokol-7"
    )
    parser.add_argument("--all",      action="store_true", help="Run full harvest (resumable)")
    parser.add_argument("--limit",    type=int, default=0, help="Stop after N books")
    parser.add_argument("--dry-run",  action="store_true", help="Process first 100 books only")
    parser.add_argument("--no-drive", action="store_true", help="Skip Drive upload")
    parser.add_argument("--status",   action="store_true", help="Print ledger summary and exit")
    args = parser.parse_args()

    ledger = GutenbergLedger()

    if args.status:
        ledger.print_summary()
        return

    if not args.all and not args.dry_run:
        parser.print_help()
        return

    orchestrator = GutenbergOrchestrator(
        ledger=ledger,
        enable_drive=not args.no_drive,
        dry_run=args.dry_run,
    )
    orchestrator.run(limit=args.limit)


if __name__ == "__main__":
    main()
