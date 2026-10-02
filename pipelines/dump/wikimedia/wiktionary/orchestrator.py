#!/usr/bin/env python3
"""
Wiktionary Multi-Language Orchestrator & Autonomous Harvest Pipeline — protokol-7

Executes automated dump harvesting across all 198 Wiktionary language editions
(including ancient and classical languages). Features:
1. SQLite-backed progress ledger with resumption and fault isolation.
2. Sequential streaming: Download -> Clean -> Zstd Parquet -> Drive Upload -> Immediate Delete.
3. Zero disk residue: Dump archives and Parquet shards are deleted upon verified upload.
4. Language queue sorting (smallest to largest) for rapid turnaround.
"""

import argparse
import datetime
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple, Any

from cleaner import stream_wiktionary_entries
from downloader import (
    build_dump_urls,
    download_dump_file,
    remove_file_safely,
    resolve_dump_db_name,
    SSL_CONTEXT,
    USER_AGENT,
)
from drive_sync import WiktionaryDriveSync
from packer import StreamingParquetSharder

DEFAULT_DB_PATH = "data/wiktionary_catalog.sqlite"
DEFAULT_TEMP_DIR = "data/temp_wiktionary"

ANCIENT_LANGUAGES = {"ang", "la", "sa", "grc", "yi", "fro", "non", "got", "cu", "sux", "akk", "hit", "cop"}


def load_wiktionary_databases() -> List[Dict[str, Any]]:
    """Loads all 198 Wiktionary database records from bundled json or fallback."""
    json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "wiktionary_dbs.json")
    if not os.path.exists(json_path):
        json_path = os.path.abspath("scripts/wiktionary_dbs.json")

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
            return [
                {
                    "db": item["db"],
                    "lang": item["lang"],
                    "ancient": item["lang"] in ANCIENT_LANGUAGES,
                }
                for item in raw
            ]

    # Minimal fallback catalog if json is missing
    return [
        {"db": "angwiktionary", "lang": "ang", "ancient": True},
        {"db": "lawiktionary", "lang": "la", "ancient": True},
        {"db": "sawiktionary", "lang": "sa", "ancient": True},
        {"db": "trwiktionary", "lang": "tr", "ancient": False},
        {"db": "enwiktionary", "lang": "en", "ancient": False},
    ]


class LedgerManager:
    """Manages SQLite checkpoint ledger for Wiktionary dump harvesting."""

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
                    is_ancient INTEGER DEFAULT 0,
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
            # Pre-populate catalog entries if missing
            dbs = load_wiktionary_databases()
            for item in dbs:
                self.conn.execute(
                    """
                    INSERT OR IGNORE INTO harvests (db_name, lang, is_ancient, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))
                    """,
                    (item["db"], item["lang"], 1 if item.get("ancient") else 0),
                )

    def get_pending(self, ancient_only: bool = False) -> List[sqlite3.Row]:
        query = "SELECT * FROM harvests WHERE status IN ('pending', 'failed')"
        if ancient_only:
            query += " AND is_ancient = 1"
        query += " ORDER BY is_ancient DESC, rowid ASC"
        cur = self.conn.cursor()
        cur.execute(query)
        return cur.fetchall()

    def get_entry(self, lang_or_db: str) -> Optional[sqlite3.Row]:
        clean = lang_or_db.strip().lower()
        cur = self.conn.cursor()
        cur.execute(
            "SELECT * FROM harvests WHERE lang = ? OR db_name = ? LIMIT 1",
            (clean, resolve_dump_db_name(clean)),
        )
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
        with self.conn:
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
            self.conn.execute(
                f"UPDATE harvests SET {', '.join(fields)} WHERE db_name = ?",
                params,
            )

    def print_summary(self) -> None:
        cur = self.conn.cursor()
        cur.execute("SELECT status, count(*) FROM harvests GROUP BY status")
        rows = cur.fetchall()
        print("\n================ WIKTIONARY HARVEST SUMMARY ================")
        total = 0
        for row in rows:
            print(f"Status [{row[0]}]: {row[1]} languages")
            total += row[1]
        print(f"Total Registered Databases: {total}")

        cur.execute("SELECT SUM(total_entries), SUM(parquet_size_mb) FROM harvests WHERE status = 'completed'")
        stat = cur.fetchone()
        entries = stat[0] or 0
        p_mb = stat[1] or 0.0
        print(f"Total Preserved Lexical Entries: {entries:,}")
        print(f"Total Cloud Parquet Size: {p_mb:.2f} MB")
        print("============================================================\n")


def process_wiktionary_dump(
    lang: str,
    db_name: str,
    ledger: LedgerManager,
    drive_sync: WiktionaryDriveSync,
    temp_dir: str = DEFAULT_TEMP_DIR,
    limit: Optional[int] = None,
    min_length: int = 30,
) -> bool:
    """
    Downloads dump, streams entries into Parquet, deletes dump,
    uploads Parquet to Google Drive, and deletes Parquet immediately.
    Guarantees zero disk residue at any stage.
    """
    dump_url, _, dump_filename = build_dump_urls(lang)
    dump_path = os.path.join(temp_dir, dump_filename)
    shards_dir = os.path.join(temp_dir, "shards", lang)
    os.makedirs(shards_dir, exist_ok=True)

    print(f"\n>>> [START] Processing Wiktionary: {db_name} (Lang: {lang})")
    ledger.update_status(db_name, "downloading")

    # Step 1: Download dump
    try:
        download_dump_file(dump_url, dump_path)
    except Exception as e:
        print(f"[ERROR] Failed to download {dump_url}: {e}")
        ledger.update_status(db_name, "failed", error_message=str(e))
        remove_file_safely(dump_path)
        return False

    dump_size_mb = os.path.getsize(dump_path) / (1024 * 1024)
    ledger.update_status(db_name, "processing", dump_size_mb=dump_size_mb)

    # Step 2: Stream & Pack entries into Parquet
    sharder = StreamingParquetSharder(
        output_dir=shards_dir,
        corpus_prefix=f"wiktionary_{lang}",
        compression="zstd",
        compression_level=6,
    )

    entry_count = 0
    start_clean = time.time()
    try:
        for entry in stream_wiktionary_entries(dump_path, lang=lang, min_length=min_length, limit=limit):
            sharder.add_entry(entry)
            entry_count += 1
            if entry_count % 10000 == 0:
                print(f"[STREAM] {db_name}: Processed {entry_count:,} lemmas...")

        parquet_files = sharder.close()
    except Exception as e:
        print(f"[ERROR] Parsing failed for {dump_path}: {e}")
        ledger.update_status(db_name, "failed", error_message=str(e))
        remove_file_safely(dump_path)
        return False
    finally:
        # Step 3: ZERO RAW DATA DISK RESIDUE: Remove raw .xml.bz2 dump immediately
        remove_file_safely(dump_path)

    clean_duration = time.time() - start_clean
    print(
        f"[OK] Distilled {entry_count:,} lexical lemmas in {clean_duration:.1f}s. "
        f"Generated {len(parquet_files)} Parquet shards."
    )

    if not parquet_files or entry_count == 0:
        print(f"[WARN] No qualifying entries found for {db_name}.")
        ledger.update_status(
            db_name,
            "completed",
            total_entries=0,
            parquet_size_mb=0.0,
            drive_file_id="empty",
        )
        return True

    # Step 4: Upload Parquet shards to Google Drive and delete immediately
    ledger.update_status(db_name, "uploading", total_entries=entry_count)
    total_parquet_size_mb = 0.0
    drive_ids = []

    for p_file in parquet_files:
        try:
            p_size_mb = os.path.getsize(p_file) / (1024 * 1024)
            upload_res = drive_sync.upload_file_and_cleanup(p_file, lang=lang)
            drive_ids.append(upload_res["drive_file_id"])
            total_parquet_size_mb += p_size_mb
        except Exception as e:
            print(f"[ERROR] Upload failed for {p_file}: {e}")
            ledger.update_status(db_name, "failed", error_message=str(e))
            return False

    ledger.update_status(
        db_name,
        "completed",
        total_entries=entry_count,
        parquet_size_mb=total_parquet_size_mb,
        drive_file_id=",".join(drive_ids),
    )
    print(f"[SUCCESS] Harvest finished for {db_name}. Zero disk residue maintained.\n")
    return True


def run_pipeline(
    lang_filter: Optional[str] = None,
    ancient_only: bool = False,
    all_languages: bool = False,
    limit: Optional[int] = None,
    dry_run: bool = False,
    reset_failed: bool = False,
) -> None:
    """Controls the overall harvest queue and execution flow."""
    ledger = LedgerManager()

    if reset_failed:
        cur = ledger.conn.cursor()
        cur.execute("UPDATE harvests SET status = 'pending' WHERE status = 'failed'")
        ledger.conn.commit()
        print("[OK] Reset all failed languages to pending.")

    if dry_run:
        ledger.print_summary()
        return

    # Initialize Drive Sync client
    print("[INIT] Initializing Google Drive client and verifying OAuth2 session...")
    drive_sync = WiktionaryDriveSync()

    # Determine tasks
    if lang_filter:
        entry = ledger.get_entry(lang_filter)
        if not entry:
            print(f"[ERROR] Unknown language or database identifier: {lang_filter}")
            sys.exit(1)
        tasks = [entry]
    elif ancient_only:
        tasks = ledger.get_pending(ancient_only=True)
    elif all_languages:
        tasks = ledger.get_pending(ancient_only=False)
    else:
        print("[INFO] No run mode specified. Use --all, --ancient-only, or --lang <code|all>.")
        ledger.print_summary()
        return

    print(f"[PLAN] Queued {len(tasks)} Wiktionary language editions for processing.")

    for idx, task in enumerate(tasks, 1):
        db = task["db_name"]
        lang = task["lang"]
        print(f"\n[{idx}/{len(tasks)}] Processing {db}...")
        success = process_wiktionary_dump(
            lang=lang,
            db_name=db,
            ledger=ledger,
            drive_sync=drive_sync,
            limit=limit,
        )
        if not success:
            print(f"[WARN] Failed processing {db}. Proceeding with remaining queue.")

    ledger.print_summary()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Wiktionary Multi-Language Dump Harvest Pipeline — protokol-7"
    )
    parser.add_argument("--lang", type=str, help="Language code or DB name (e.g. 'ang', 'sa', 'la', 'tr')")
    parser.add_argument("--ancient-only", action="store_true", help="Harvest only ancient and classical languages")
    parser.add_argument("--all", action="store_true", help="Harvest all 198 language editions")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of articles per language (for test runs)")
    parser.add_argument("--dry-run", action="store_true", help="Show catalog status without downloading")
    parser.add_argument("--status", action="store_true", help="Show summary report of all databases")
    parser.add_argument("--reset-failed", action="store_true", help="Reset failed tasks to pending")

    args = parser.parse_args()

    if args.status:
        ledger = LedgerManager()
        ledger.print_summary()
        sys.exit(0)

    run_pipeline(
        lang_filter=args.lang,
        ancient_only=args.ancient_only,
        all_languages=args.all,
        limit=args.limit,
        dry_run=args.dry_run,
        reset_failed=args.reset_failed,
    )


if __name__ == "__main__":
    main()
