#!/usr/bin/env python3
"""
OpenAlex Bulk Harvest Orchestrator -- protokol-7

Streams all Open Access works from the OpenAlex API via cursor pagination,
cleans records, packs to Zstd Parquet shards, uploads to Google Drive.

The SQLite ledger at data/openalex_catalog.sqlite stores:
  - per-cursor checkpoint (resume after interruption)
  - per-shard stats (works, MB, Drive ID)

Usage
-----
  # Full OA harvest (all years, resumable)
  python3 scripts/openalex_pipeline/orchestrator.py --all

  # Specific year range
  python3 scripts/openalex_pipeline/orchestrator.py --all --year-from 2020 --year-to 2024

  # Dry-run: first 2000 works only
  python3 scripts/openalex_pipeline/orchestrator.py --all --dry-run

  # Status
  python3 scripts/openalex_pipeline/orchestrator.py --status

  # No Drive upload
  python3 scripts/openalex_pipeline/orchestrator.py --all --no-drive

Rate limits: OpenAlex polite pool = 10 req/s (add OPENALEX_MAILTO env var).
"""

import argparse
import datetime
import os
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import report_producer_error, producer_run, EvidenceWriteError, record_output
from cleaner import build_record
from downloader import (
    build_filter_string, iter_works_cursor, DEFAULT_MAILTO,
    fetch_fulltext, fetch_fulltext_batch,
)
from drive_sync import OpenAlexDriveSync
from packer import OpenAlexParquetSharder

DEFAULT_DB_PATH  = "data/catalogs/openalex_catalog.sqlite"
DEFAULT_OUT_DIR  = "data/parquets/openalex"
FLUSH_EVERY      = 10_000   # commit shard to Drive every N works


# ------------------------------------------------------------------
# SQLite ledger
# ------------------------------------------------------------------

class OpenAlexLedger:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init()

    def _init(self) -> None:
        with self.conn:
            self.conn.executescript("""
                CREATE TABLE IF NOT EXISTS checkpoints (
                    key        TEXT PRIMARY KEY,
                    value      TEXT
                );
                CREATE TABLE IF NOT EXISTS shards (
                    shard_name    TEXT PRIMARY KEY,
                    work_count    INTEGER DEFAULT 0,
                    size_mb       REAL DEFAULT 0.0,
                    drive_file_id TEXT,
                    created_at    TEXT
                );
                CREATE TABLE IF NOT EXISTS stats (
                    key   TEXT PRIMARY KEY,
                    value INTEGER DEFAULT 0
                );
            """)

    def close(self) -> None:
        self.conn.close()

    def get_cursor(self) -> str:
        row = self.conn.execute(
            "SELECT value FROM checkpoints WHERE key = 'next_cursor'"
        ).fetchone()
        return row["value"] if row else "*"

    def save_cursor(self, cursor: str) -> None:
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO checkpoints (key, value) VALUES ('next_cursor', ?)",
                (cursor,),
            )

    def increment_stat(self, key: str, amount: int = 1) -> None:
        with self.conn:
            self.conn.execute("""
                INSERT INTO stats (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = value + excluded.value
            """, (key, amount))

    def record_shard(self, shard_name: str, work_count: int, size_mb: float, drive_id: Optional[str]) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self.conn:
            self.conn.execute("""
                INSERT OR REPLACE INTO shards (shard_name, work_count, size_mb, drive_file_id, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (shard_name, work_count, size_mb, drive_id, now))

    def get_shard_count(self) -> int:
        row = self.conn.execute("SELECT COUNT(*) FROM shards").fetchone()
        return row[0] if row else 0

    def print_summary(self) -> None:
        print("\n=== OpenAlex Harvest Summary ===")
        for key in ("total_processed", "total_html", "total_pdf", "total_skipped", "total_failed"):
            row = self.conn.execute("SELECT value FROM stats WHERE key = ?", (key,)).fetchone()
            print(f"  {key:20s}: {(row['value'] if row else 0):,}")
        shards = self.conn.execute("SELECT COUNT(*), SUM(work_count), SUM(size_mb) FROM shards").fetchone()
        print(f"  {'shards':20s}: {shards[0] or 0}")
        print(f"  {'total_works':20s}: {(shards[1] or 0):,}")
        print(f"  {'total_parquet_mb':20s}: {(shards[2] or 0.0):.1f} MB")
        cursor = self.get_cursor()
        print(f"  {'resume_cursor':20s}: {cursor[:40]}...")
        print("================================\n")


# ------------------------------------------------------------------
# Orchestrator
# ------------------------------------------------------------------

class OpenAlexOrchestrator:
    def __init__(
        self,
        ledger: OpenAlexLedger,
        out_dir: str = DEFAULT_OUT_DIR,
        enable_drive: bool = True,
        dry_run: bool = False,
        mailto: str = DEFAULT_MAILTO,
    ):
        self.ledger       = ledger
        self.out_dir      = out_dir
        self.enable_drive = enable_drive
        self.dry_run      = dry_run
        self.mailto       = mailto
        self.drive: Optional[OpenAlexDriveSync] = None

        if enable_drive:
            try:
                self.drive = OpenAlexDriveSync()
            except Exception as e:
                report_producer_error(e)
                print(f"[WARN] Drive init failed: {e} -- local-only.", file=sys.stderr)
                self.enable_drive = False

        os.makedirs(self.out_dir, exist_ok=True)

    def _new_sharder(self, shard_idx: int) -> OpenAlexParquetSharder:
        return OpenAlexParquetSharder(
            output_dir=self.out_dir,
            corpus_prefix=f"openalex_shard{shard_idx:05d}",
        )

    def _commit_shard(self, sharder: OpenAlexParquetSharder, shard_idx: int) -> Optional[str]:
        files = sharder.close()
        if not files:
            return None
        drive_id: Optional[str] = None
        for fpath in files:
            size_mb    = os.path.getsize(fpath) / 1024**2
            shard_name = os.path.basename(fpath)
            print(f"[SHARD] {shard_name} ({size_mb:.2f} MB, {sharder.total_entries:,} works)")
            if self.enable_drive and self.drive:
                res      = self.drive.upload_and_clean(fpath)
                drive_id = res.get("drive_file_id")
            self.ledger.record_shard(shard_name, sharder.total_entries, size_mb, drive_id)
        return drive_id

    def run(
        self,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        concept_id: Optional[str] = None,
        limit: int = 0,
    ) -> None:
        filter_str    = build_filter_string(
            only_oa=True,
            year_from=year_from,
            year_to=year_to,
            concept_id=concept_id,
        )
        start_cursor  = self.ledger.get_cursor()

        print(f"[INIT] OpenAlex harvest — filter: {filter_str}")
        print(f"[INIT] Resume cursor: {start_cursor[:60]}")

        total_processed = 0
        total_skipped   = 0
        total_failed    = 0
        total_html      = 0   # fulltext fetched via HTML
        total_pdf       = 0   # fulltext fetched via PDF
        shard_idx       = self.ledger.get_shard_count()
        sharder         = self._new_sharder(shard_idx)
        works_in_shard  = 0
        t_start         = time.time()

        try:
            for page_works, next_cursor in iter_works_cursor(
                filter_str=filter_str,
                mailto=self.mailto,
                start_cursor=start_cursor,
            ):
                # Fetch full text for the entire page in parallel (16 workers)
                ft_results = fetch_fulltext_batch(page_works)

                for raw, (fulltext, ft_source) in zip(page_works, ft_results):
                    if fulltext is None:
                        # No accessible full text — skip per policy
                        total_skipped += 1
                        continue

                    try:
                        record = build_record(raw, fulltext=fulltext, fulltext_source=ft_source)
                    except Exception as e:
                        report_producer_error(e)
                        print(f"[WARN] build_record error: {e}", file=sys.stderr)
                        total_failed += 1
                        continue

                    if record is None:
                        total_skipped += 1
                        continue

                    record_output(record, raw.get("_fulltext_evidence"))
                    sharder.append(record)
                    works_in_shard  += 1
                    total_processed += 1
                    if ft_source and ft_source.startswith("pdf"):
                        total_pdf += 1
                    else:
                        total_html += 1

                if next_cursor:
                    self.ledger.save_cursor(next_cursor)

                elapsed = time.time() - t_start
                rate    = total_processed / max(1, elapsed)
                print(
                    f"[PROGRESS] {total_processed:,} works "
                    f"({rate:.2f}/s) | html: {total_html:,} | pdf: {total_pdf:,} | "
                    f"skipped: {total_skipped:,} | failed: {total_failed}"
                )

                if works_in_shard >= FLUSH_EVERY:
                    self._commit_shard(sharder, shard_idx)
                    shard_idx      += 1
                    sharder         = self._new_sharder(shard_idx)
                    works_in_shard  = 0

                if self.dry_run and total_processed >= 200:
                    print("[DRY-RUN] 200-work limit reached.")
                    break
                if limit and total_processed >= limit:
                    print(f"[INFO] --limit {limit} reached.")
                    break

        finally:
            if works_in_shard > 0:
                self._commit_shard(sharder, shard_idx)
            self.ledger.increment_stat("total_processed", total_processed)
            self.ledger.increment_stat("total_skipped",   total_skipped)
            self.ledger.increment_stat("total_failed",    total_failed)
            self.ledger.increment_stat("total_html",      total_html)
            self.ledger.increment_stat("total_pdf",       total_pdf)

        elapsed_total = time.time() - t_start
        print(
            f"\n[DONE] OpenAlex harvest complete in {elapsed_total:.0f}s.\n"
            f"  Processed : {total_processed:,}\n"
            f"  HTML full : {total_html:,}\n"
            f"  PDF full  : {total_pdf:,}\n"
            f"  Skipped   : {total_skipped:,}\n"
            f"  Failed    : {total_failed:,}\n"
        )
        self.ledger.print_summary()


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

@producer_run("openalex")
def main() -> None:
    parser = argparse.ArgumentParser(
        description="OpenAlex Bulk Harvest Pipeline -- protokol-7"
    )
    parser.add_argument("--all",        action="store_true",  help="Run full harvest (resumable)")
    parser.add_argument("--year-from",  type=int, default=None, help="Filter publication year from")
    parser.add_argument("--year-to",    type=int, default=None, help="Filter publication year to")
    parser.add_argument("--concept",    type=str, default=None, help="OpenAlex concept ID filter")
    parser.add_argument("--limit",      type=int, default=0,   help="Stop after N works")
    parser.add_argument("--dry-run",    action="store_true",   help="Process first 2000 works only")
    parser.add_argument("--no-drive",   action="store_true",   help="Skip Drive upload")
    parser.add_argument("--mailto",     type=str, default=DEFAULT_MAILTO, help="Polite API email")
    parser.add_argument("--status",     action="store_true",   help="Print summary and exit")
    args = parser.parse_args()

    ledger = OpenAlexLedger()

    if args.status:
        ledger.print_summary()
        return

    if not args.all and not args.dry_run:
        parser.print_help()
        return

    orch = OpenAlexOrchestrator(
        ledger=ledger,
        enable_drive=not args.no_drive,
        dry_run=args.dry_run,
        mailto=args.mailto,
    )
    orch.run(
        year_from=args.year_from,
        year_to=args.year_to,
        concept_id=args.concept,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
