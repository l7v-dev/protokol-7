#!/usr/bin/env python3
"""
Semantic Scholar Bulk Harvest Orchestrator -- protokol-7

Streams papers from the S2 Academic Graph API bulk endpoint,
cleans records, packs to Zstd Parquet shards, uploads to Google Drive.

SQLite ledger at data/semanticscholar_catalog.sqlite tracks token-based
cursor position so the run is fully resumable.

Usage
-----
  # Full harvest (all papers with abstracts, resumable)
  python3 scripts/semanticscholar_pipeline/orchestrator.py --all

  # Computer Science papers only, citation count >= 10
  python3 scripts/semanticscholar_pipeline/orchestrator.py --all \
      --fields "Computer Science" --min-citations 10

  # Dry-run: first 2000 papers
  python3 scripts/semanticscholar_pipeline/orchestrator.py --all --dry-run

  # Status
  python3 scripts/semanticscholar_pipeline/orchestrator.py --status

Set S2_API_KEY env var for 10x higher rate limits (1 req/s -> ~8 req/s).
"""

import argparse
import datetime
import os
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleaner import build_record
from downloader import iter_papers_bulk
from drive_sync import S2DriveSync
from packer import S2ParquetSharder

DEFAULT_DB_PATH = "data/semanticscholar_catalog.sqlite"
DEFAULT_OUT_DIR = "data/temp_semanticscholar"
FLUSH_EVERY     = 10_000


# ------------------------------------------------------------------
# SQLite ledger
# ------------------------------------------------------------------

class S2Ledger:
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
                    key   TEXT PRIMARY KEY,
                    value TEXT
                );
                CREATE TABLE IF NOT EXISTS shards (
                    shard_name    TEXT PRIMARY KEY,
                    paper_count   INTEGER DEFAULT 0,
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

    def get_token(self) -> Optional[str]:
        row = self.conn.execute(
            "SELECT value FROM checkpoints WHERE key = 'next_token'"
        ).fetchone()
        return row["value"] if row else None

    def save_token(self, token: Optional[str]) -> None:
        if token is None:
            return
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO checkpoints (key, value) VALUES ('next_token', ?)",
                (token,),
            )

    def increment_stat(self, key: str, amount: int = 1) -> None:
        with self.conn:
            self.conn.execute("""
                INSERT INTO stats (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = value + excluded.value
            """, (key, amount))

    def record_shard(self, shard_name: str, paper_count: int, size_mb: float, drive_id: Optional[str]) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self.conn:
            self.conn.execute("""
                INSERT OR REPLACE INTO shards (shard_name, paper_count, size_mb, drive_file_id, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (shard_name, paper_count, size_mb, drive_id, now))

    def print_summary(self) -> None:
        print("\n=== Semantic Scholar Harvest Summary ===")
        for key in ("total_processed", "total_skipped", "total_failed"):
            row = self.conn.execute("SELECT value FROM stats WHERE key = ?", (key,)).fetchone()
            print(f"  {key:22s}: {(row['value'] if row else 0):,}")
        shards = self.conn.execute(
            "SELECT COUNT(*), SUM(paper_count), SUM(size_mb) FROM shards"
        ).fetchone()
        print(f"  {'shards':22s}: {shards[0] or 0}")
        print(f"  {'total_papers':22s}: {(shards[1] or 0):,}")
        print(f"  {'total_parquet_mb':22s}: {(shards[2] or 0.0):.1f} MB")
        token = self.get_token()
        if token:
            print(f"  {'resume_token':22s}: {token[:60]}...")
        print("========================================\n")


# ------------------------------------------------------------------
# Orchestrator
# ------------------------------------------------------------------

class S2Orchestrator:
    def __init__(
        self,
        ledger: S2Ledger,
        out_dir: str = DEFAULT_OUT_DIR,
        enable_drive: bool = True,
        dry_run: bool = False,
    ):
        self.ledger       = ledger
        self.out_dir      = out_dir
        self.enable_drive = enable_drive
        self.dry_run      = dry_run
        self.drive: Optional[S2DriveSync] = None

        if enable_drive:
            try:
                self.drive = S2DriveSync()
            except Exception as e:
                print(f"[WARN] Drive init failed: {e} -- local-only.", file=sys.stderr)
                self.enable_drive = False

        os.makedirs(self.out_dir, exist_ok=True)

    def _new_sharder(self, shard_idx: int) -> S2ParquetSharder:
        return S2ParquetSharder(
            output_dir=self.out_dir,
            corpus_prefix=f"s2_shard{shard_idx:05d}",
        )

    def _commit_shard(self, sharder: S2ParquetSharder, shard_idx: int) -> Optional[str]:
        files = sharder.close()
        if not files:
            return None
        drive_id: Optional[str] = None
        for fpath in files:
            size_mb    = os.path.getsize(fpath) / 1024**2
            shard_name = os.path.basename(fpath)
            print(f"[SHARD] {shard_name} ({size_mb:.2f} MB, {sharder.total_entries:,} papers)")
            if self.enable_drive and self.drive:
                res      = self.drive.upload_and_clean(fpath)
                drive_id = res.get("drive_file_id")
            self.ledger.record_shard(shard_name, sharder.total_entries, size_mb, drive_id)
        return drive_id

    def run(
        self,
        query: str = "",
        fields_of_study: Optional[str] = None,
        year_range: Optional[str] = None,
        min_citations: int = 0,
        limit: int = 0,
    ) -> None:
        start_token     = self.ledger.get_token()
        total_processed = 0
        total_skipped   = 0
        total_failed    = 0
        shard_idx       = 0
        sharder         = self._new_sharder(shard_idx)
        papers_in_shard = 0
        t_start         = time.time()

        print(f"[INIT] Semantic Scholar harvest started.")
        if start_token:
            print(f"[INIT] Resuming from token: {start_token[:60]}...")

        try:
            for page_papers in iter_papers_bulk(
                query=query,
                fields_of_study=fields_of_study,
                year_range=year_range,
                min_citations=min_citations,
                start_token=start_token,
            ):
                for raw in page_papers:
                    try:
                        record = build_record(raw)
                    except Exception as e:
                        print(f"[WARN] build_record error: {e}", file=sys.stderr)
                        total_failed += 1
                        continue

                    if record is None:
                        total_skipped += 1
                        continue

                    sharder.append(record)
                    papers_in_shard += 1
                    total_processed += 1

                    if total_processed % 10_000 == 0:
                        elapsed = time.time() - t_start
                        rate    = total_processed / max(1, elapsed)
                        print(
                            f"[PROGRESS] {total_processed:,} papers "
                            f"({rate:.0f}/s) | skipped: {total_skipped:,} | failed: {total_failed}"
                        )

                    if papers_in_shard >= FLUSH_EVERY:
                        self._commit_shard(sharder, shard_idx)
                        shard_idx       += 1
                        sharder          = self._new_sharder(shard_idx)
                        papers_in_shard  = 0

                    if self.dry_run and total_processed >= 2_000:
                        print("[DRY-RUN] 2000-paper limit reached.")
                        break
                    if limit and total_processed >= limit:
                        print(f"[INFO] --limit {limit} reached.")
                        break

                if (self.dry_run and total_processed >= 2_000) or (limit and total_processed >= limit):
                    break

        finally:
            self._commit_shard(sharder, shard_idx)
            self.ledger.increment_stat("total_processed", total_processed)
            self.ledger.increment_stat("total_skipped",   total_skipped)
            self.ledger.increment_stat("total_failed",    total_failed)

        elapsed_total = time.time() - t_start
        print(
            f"\n[DONE] S2 harvest complete in {elapsed_total:.0f}s.\n"
            f"  Processed : {total_processed:,}\n"
            f"  Skipped   : {total_skipped:,}\n"
            f"  Failed    : {total_failed:,}\n"
        )
        self.ledger.print_summary()


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Semantic Scholar Bulk Harvest Pipeline -- protokol-7"
    )
    parser.add_argument("--all",            action="store_true",   help="Run full harvest (resumable)")
    parser.add_argument("--query",          type=str, default="",  help="Free-text search query")
    parser.add_argument("--fields",         type=str, default=None,help="Fields of study filter (comma-separated)")
    parser.add_argument("--year",           type=str, default=None,help="Year range e.g. 2015-2024")
    parser.add_argument("--min-citations",  type=int, default=0,   help="Minimum citation count")
    parser.add_argument("--limit",          type=int, default=0,   help="Stop after N papers")
    parser.add_argument("--dry-run",        action="store_true",   help="Process first 2000 papers only")
    parser.add_argument("--no-drive",       action="store_true",   help="Skip Drive upload")
    parser.add_argument("--status",         action="store_true",   help="Print summary and exit")
    args = parser.parse_args()

    ledger = S2Ledger()

    if args.status:
        ledger.print_summary()
        return

    if not args.all and not args.dry_run:
        parser.print_help()
        return

    orch = S2Orchestrator(
        ledger=ledger,
        enable_drive=not args.no_drive,
        dry_run=args.dry_run,
    )
    orch.run(
        query=args.query,
        fields_of_study=args.fields,
        year_range=args.year,
        min_citations=args.min_citations,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
