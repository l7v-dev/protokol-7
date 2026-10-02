#!/usr/bin/env python3
"""
Wikispecies Global Taxonomy Orchestrator & Autonomous Harvest Pipeline — protokol-7

Executes automated dump harvesting for specieswiki (the global taxonomy database).
Features:
1. SQLite-backed progress ledger with resumption and fault isolation.
2. Sequential streaming: Download -> Clean -> Zstd Parquet -> Drive Upload -> Immediate Delete.
3. Zero disk residue: Dump archives and Parquet shards are deleted upon verified upload.
4. Resilient failure isolation: Clean exception handling and recovery.
"""

import argparse
import datetime
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple, Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleaner import stream_wikispecies_entries
from downloader import (
    build_dump_urls,
    download_dump_file,
    remove_file_safely,
    SSL_CONTEXT,
    USER_AGENT,
)
from drive_sync import WikispeciesDriveSync
from packer import StreamingParquetSharder

DEFAULT_DB_PATH = "data/wikispecies_catalog.sqlite"
DEFAULT_TEMP_DIR = "data/temp_wikispecies"


class LedgerManager:
    """Manages SQLite checkpoint ledger for Wikispecies dump harvesting."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self.conn:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS harvests (
                    db_name TEXT PRIMARY KEY,
                    lang TEXT NOT NULL,
                    name TEXT,
                    status TEXT DEFAULT 'pending',
                    total_entries INTEGER DEFAULT 0,
                    dump_size_mb REAL DEFAULT 0.0,
                    parquet_size_mb REAL DEFAULT 0.0,
                    drive_file_id TEXT,
                    error_message TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
                """
            )
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.conn.execute(
                """
                INSERT OR IGNORE INTO harvests (db_name, lang, name, status, created_at, updated_at)
                VALUES ('specieswiki', 'mul', 'Wikispecies Global Taxonomy', 'pending', ?, ?)
                """,
                (now, now),
            )

    def close(self) -> None:
        self.conn.close()

    def get_pending_languages(self) -> List[sqlite3.Row]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM harvests WHERE status = 'pending'")
        return cur.fetchall()

    def get_record(self) -> Optional[sqlite3.Row]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM harvests WHERE db_name = 'specieswiki'")
        return cur.fetchone()

    def update_status(
        self,
        db_name: str,
        status: str,
        total_entries: Optional[int] = None,
        dump_size_mb: Optional[float] = None,
        parquet_size_mb: Optional[float] = None,
        drive_file_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fields = ["status = ?", "updated_at = ?"]
        params: List[Any] = [status, now]

        if total_entries is not None:
            fields.append("total_entries = ?")
            params.append(total_entries)
        if dump_size_mb is not None:
            fields.append("dump_size_mb = ?")
            params.append(dump_size_mb)
        if parquet_size_mb is not None:
            fields.append("parquet_size_mb = ?")
            params.append(parquet_size_mb)
        if drive_file_id is not None:
            fields.append("drive_file_id = ?")
            params.append(drive_file_id)
        if error_message is not None:
            fields.append("error_message = ?")
            params.append(error_message)

        params.append(db_name)
        sql = f"UPDATE harvests SET {', '.join(fields)} WHERE db_name = ?"
        with self.conn:
            self.conn.execute(sql, params)

    def print_summary(self) -> None:
        cur = self.conn.cursor()
        cur.execute(
            """
            SELECT status, count(*) as count, sum(total_entries) as entries,
                   sum(parquet_size_mb) as total_parquet_mb
            FROM harvests GROUP BY status
            """
        )
        print("\n=== Wikispecies Harvest Catalog Status ===")
        rows = cur.fetchall()
        for r in rows:
            print(
                f"[{r['status'].upper():10s}] Count: {r['count']:3d} | "
                f"Entries: {r['entries'] or 0:10,d} | "
                f"Total Parquet: {(r['total_parquet_mb'] or 0.0):.2f} MB"
            )
        print("==========================================\n")


class WikispeciesHarvestOrchestrator:
    """Orchestrates end-to-end Wikispecies dump ETL."""

    def __init__(
        self,
        ledger: LedgerManager,
        temp_dir: str = DEFAULT_TEMP_DIR,
        enable_drive: bool = True,
        dry_run: bool = False,
    ):
        self.ledger = ledger
        self.temp_dir = temp_dir
        self.enable_drive = enable_drive
        self.dry_run = dry_run
        self.drive_sync: Optional[WikispeciesDriveSync] = None

        if self.enable_drive:
            try:
                self.drive_sync = WikispeciesDriveSync()
            except Exception as e:
                print(f"[WARN] Google Drive initialization failed: {e}. Switching to local-only mode.", file=sys.stderr)
                self.enable_drive = False

        os.makedirs(self.temp_dir, exist_ok=True)

    def process(self) -> bool:
        db_name = "specieswiki"
        print(f"\n{'='*70}\n[START] Processing Wikispecies global taxonomy database: {db_name}\n{'='*70}")

        self.ledger.update_status(db_name, "in_progress")
        dump_url, _, dump_filename = build_dump_urls()
        local_dump_path = os.path.join(self.temp_dir, dump_filename)
        out_parquet_dir = os.path.join(self.temp_dir, "out_specieswiki")
        os.makedirs(out_parquet_dir, exist_ok=True)

        try:
            print(f"[STAGE 1/4] Downloading {db_name} dump from Wikimedia...")
            try:
                download_dump_file(dump_url, local_dump_path)
            except urllib.error.HTTPError as http_err:
                if http_err.code == 404:
                    print(f"[WARN] Dump not found (HTTP 404) at: {dump_url}.")
                    self.ledger.update_status(db_name, "skipped", error_message="Dump not found (404)")
                    return False
                raise

            dump_size_mb = os.path.getsize(local_dump_path) / (1024 * 1024)
            print(f"[INFO] Downloaded dump size: {dump_size_mb:.2f} MB")

            print(f"[STAGE 2/4] Parsing XML and streaming Zstd Parquet shards...")
            sharder = StreamingParquetSharder(
                output_dir=out_parquet_dir,
                corpus_prefix="wikispecies_global",
                batch_size=50000,
            )

            entry_count = 0
            start_clean = time.time()
            for entry in stream_wikispecies_entries(local_dump_path):
                sharder.append(entry)
                entry_count += 1
                if self.dry_run and entry_count >= 50:
                    print(f"[DRY-RUN] Reached sample limit of 50 entries for Wikispecies.")
                    break
                if entry_count % 10000 == 0:
                    print(f"[PARSE] Extracted {entry_count:,} species entries...")

            parquet_files = sharder.close()
            elapsed_clean = time.time() - start_clean
            print(
                f"[OK] Cleaned {entry_count:,} species in {elapsed_clean:.1f}s. "
                f"Generated {len(parquet_files)} Parquet shard(s)."
            )

            remove_file_safely(local_dump_path)

            if entry_count == 0 or not parquet_files:
                print(f"[WARN] No valid species found in {db_name}.")
                self.ledger.update_status(
                    db_name,
                    "completed",
                    total_entries=0,
                    dump_size_mb=dump_size_mb,
                    parquet_size_mb=0.0,
                )
                return True

            total_parquet_size_mb = sum(os.path.getsize(f) for f in parquet_files) / (1024 * 1024)

            drive_file_id = None
            if self.enable_drive and self.drive_sync:
                print(f"[STAGE 3/4] Uploading {len(parquet_files)} shard(s) to Google Drive (Zero Disk Residue)...")
                for p_file in parquet_files:
                    res = self.drive_sync.upload_and_clean(p_file)
                    drive_file_id = res.get("drive_file_id")
            else:
                print(f"[STAGE 3/4] Drive upload disabled; Parquet files retained at {out_parquet_dir}")

            self.ledger.update_status(
                db_name,
                "completed",
                total_entries=entry_count,
                dump_size_mb=dump_size_mb,
                parquet_size_mb=total_parquet_size_mb,
                drive_file_id=drive_file_id,
            )
            print(f"[STAGE 4/4] Completed {db_name}: {entry_count:,} entries, {total_parquet_size_mb:.2f} MB Parquet.")
            return True

        except Exception as e:
            msg = f"{type(e).__name__}: {e}"
            print(f"[ERROR] Failed processing {db_name}: {msg}", file=sys.stderr)
            self.ledger.update_status(db_name, "failed", error_message=msg)
            remove_file_safely(local_dump_path)
            return False


def main():
    parser = argparse.ArgumentParser(description="Wikispecies Global Taxonomy Dump Harvest Pipeline")
    parser.add_argument("--no-drive", action="store_true", help="Disable Google Drive upload (retain local files)")
    parser.add_argument("--dry-run", action="store_true", help="Dry-run: harvest 50 sample entries")
    parser.add_argument("--status", action="store_true", help="Display harvest catalog summary table and exit")
    args = parser.parse_args()

    ledger = LedgerManager()

    if args.status:
        ledger.print_summary()
        ledger.close()
        return

    orchestrator = WikispeciesHarvestOrchestrator(
        ledger=ledger,
        enable_drive=not args.no_drive,
        dry_run=args.dry_run,
    )

    orchestrator.process()
    ledger.close()


if __name__ == "__main__":
    main()
