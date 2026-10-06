#!/usr/bin/env python3
"""
Wikiquote Multi-Language Orchestrator & Autonomous Harvest Pipeline — protokol-7

Executes automated dump harvesting across all 100 Wikiquote language editions.
Features:
1. SQLite-backed progress ledger with resumption and fault isolation.
2. Sequential streaming: Download -> Clean -> Zstd Parquet -> Drive Upload -> Immediate Delete.
3. Zero disk residue: Dump archives and Parquet shards are deleted upon verified upload.
4. Resilient failure isolation: If a single language fails, the pipeline logs and proceeds.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))
from pipelines.shared.producer_provenance import report_producer_error, EvidenceWriteError, producer_run, capture_path, record_output
from cleaner import stream_wikiquote_entries
from downloader import (
    build_dump_urls,
    download_dump_file,
    remove_file_safely,
    resolve_dump_db_name,
    SSL_CONTEXT,
    USER_AGENT,
)
from drive_sync import WikiquoteDriveSync
from packer import StreamingParquetSharder

DEFAULT_DB_PATH = "data/catalogs/wikiquote_catalog.sqlite"
DEFAULT_TEMP_DIR = "data/temp_wikiquote"

ANCIENT_LANGUAGES = {"ang", "la", "sa", "grc", "yi", "fro", "non", "got", "cu"}


def load_wikiquote_databases() -> List[Dict[str, Any]]:
    """Loads all 100 Wikiquote database records from bundled json or fallback."""
    json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "configs", "wikiquote_dbs.json")
    if not os.path.exists(json_path):
        json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "wikiquote_dbs.json")
    if not os.path.exists(json_path):
        json_path = os.path.abspath("scripts/wikiquote_dbs.json")

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
            return [
                {
                    "db": item["db"],
                    "lang": item["lang"],
                    "name": item.get("name", item["lang"]),
                    "ancient": item["lang"] in ANCIENT_LANGUAGES,
                }
                for item in raw
            ]

    # Minimal fallback catalog
    return [
        {"db": "trwikiquote", "lang": "tr", "name": "Türkçe", "ancient": False},
        {"db": "enwikiquote", "lang": "en", "name": "English", "ancient": False},
        {"db": "lawikiquote", "lang": "la", "name": "Latina", "ancient": True},
        {"db": "sawikiquote", "lang": "sa", "name": "Sanskrit", "ancient": True},
    ]


class LedgerManager:
    """Manages SQLite checkpoint ledger for Wikiquote dump harvesting."""

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
            dbs = load_wikiquote_databases()
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            for d in dbs:
                self.conn.execute(
                    """
                    INSERT OR IGNORE INTO harvests (db_name, lang, name, is_ancient, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'pending', ?, ?)
                    """,
                    (d["db"], d["lang"], d.get("name", d["lang"]), 1 if d.get("ancient") else 0, now, now),
                )

    def close(self) -> None:
        self.conn.close()

    def get_pending_languages(self, only_ancient: bool = False) -> List[sqlite3.Row]:
        cur = self.conn.cursor()
        query = "SELECT * FROM harvests WHERE status = 'pending'"
        if only_ancient:
            query += " AND is_ancient = 1"
        query += " ORDER BY is_ancient DESC, db_name ASC"
        cur.execute(query)
        return cur.fetchall()

    def get_language(self, lang_or_db: str) -> Optional[sqlite3.Row]:
        db_name = resolve_dump_db_name(lang_or_db)
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM harvests WHERE db_name = ? OR lang = ?", (db_name, lang_or_db))
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
        print("\n=== Wikiquote Harvest Catalog Status ===")
        rows = cur.fetchall()
        for r in rows:
            print(
                f"[{r['status'].upper():10s}] Count: {r['count']:3d} | "
                f"Entries: {r['entries'] or 0:10,d} | "
                f"Total Parquet: {(r['total_parquet_mb'] or 0.0):.2f} MB"
            )
        print("=========================================\n")


class WikiquoteHarvestOrchestrator:
    """Orchestrates end-to-end multi-language Wikiquote dump ETL."""

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
        self.drive_sync: Optional[WikiquoteDriveSync] = None

        if self.enable_drive:
            try:
                self.drive_sync = WikiquoteDriveSync()
            except EvidenceWriteError:
                raise
            except Exception as e:
                report_producer_error(e)
                print(f"[WARN] Google Drive initialization failed: {e}. Switching to local-only mode.", file=sys.stderr)
                self.enable_drive = False

        os.makedirs(self.temp_dir, exist_ok=True)

    def process_language(self, row: sqlite3.Row) -> bool:
        db_name = row["db_name"]
        lang = row["lang"]
        print(f"\n{'='*70}\n[START] Processing Wikiquote edition: {db_name} (lang={lang})\n{'='*70}")

        self.ledger.update_status(db_name, "in_progress")
        dump_url, _, dump_filename = build_dump_urls(lang)
        local_dump_path = os.path.join(self.temp_dir, dump_filename)
        out_parquet_dir = os.path.join(self.temp_dir, f"out_{db_name}")
        os.makedirs(out_parquet_dir, exist_ok=True)

        try:
            # 1. Download official dump archive
            print(f"[STAGE 1/4] Downloading {db_name} dump from Wikimedia...")
            try:
                download_dump_file(dump_url, local_dump_path)
            except urllib.error.HTTPError as http_err:
                if http_err.code == 404:
                    print(f"[WARN] Dump not found (HTTP 404) at: {dump_url}. Language might be inactive.")
                    self.ledger.update_status(db_name, "skipped", error_message="Dump not found (404)")
                    return False
                raise

            raw_evidence = capture_path(local_dump_path, "wikiquote", dump_url)

            dump_size_mb = os.path.getsize(local_dump_path) / (1024 * 1024)
            print(f"[INFO] Downloaded dump size: {dump_size_mb:.2f} MB")

            # 2. Stream XML, clean wikitext, and pack to Parquet
            print(f"[STAGE 2/4] Parsing XML and streaming Zstd Parquet shards...")
            sharder = StreamingParquetSharder(
                output_dir=out_parquet_dir,
                corpus_prefix=f"wikiquote_{lang}",
                batch_size=50000,
            )

            entry_count = 0
            start_clean = time.time()
            for entry in stream_wikiquote_entries(local_dump_path, lang=lang):
                record_output(entry, raw_evidence, source_record_id=f"{lang}:{entry['article_id']}")
                sharder.append(entry)
                entry_count += 1
                if self.dry_run and entry_count >= 50:
                    print(f"[DRY-RUN] Reached sample limit of 50 entries for {lang}.")
                    break
                if entry_count % 5000 == 0:
                    print(f"[PARSE] Extracted {entry_count:,} entries for {lang}...")

            parquet_files = sharder.close()
            elapsed_clean = time.time() - start_clean
            print(
                f"[OK] Cleaned {entry_count:,} articles in {elapsed_clean:.1f}s. "
                f"Generated {len(parquet_files)} Parquet shard(s)."
            )

            # 3. Zero Disk Residue: Delete downloaded .bz2 archive immediately
            remove_file_safely(local_dump_path)

            if entry_count == 0 or not parquet_files:
                print(f"[WARN] No valid articles found in {db_name}.")
                self.ledger.update_status(
                    db_name,
                    "completed",
                    total_entries=0,
                    dump_size_mb=dump_size_mb,
                    parquet_size_mb=0.0,
                )
                return True

            total_parquet_size_mb = sum(os.path.getsize(f) for f in parquet_files) / (1024 * 1024)

            # 4. Upload to Google Drive and delete local Parquet files immediately
            drive_file_id = None
            if self.enable_drive and self.drive_sync:
                print(f"[STAGE 3/4] Uploading {len(parquet_files)} shard(s) to Google Drive (Zero Disk Residue)...")
                for p_file in parquet_files:
                    res = self.drive_sync.upload_and_clean(p_file, lang=lang)
                    drive_file_id = res.get("drive_file_id")
            else:
                print(f"[STAGE 3/4] Drive upload disabled; Parquet files retained at {out_parquet_dir}")

            # 5. Record completion in SQLite ledger
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

        except EvidenceWriteError:

            raise

        except Exception as e:

            report_producer_error(e)
            msg = f"{type(e).__name__}: {e}"
            print(f"[ERROR] Failed processing {db_name}: {msg}", file=sys.stderr)
            self.ledger.update_status(db_name, "failed", error_message=msg)
            # Cleanup any residue
            remove_file_safely(local_dump_path)
            return False


@producer_run("wikiquote")
def main():
    parser = argparse.ArgumentParser(description="Wikiquote Multi-Language Dump Harvest Pipeline")
    parser.add_argument("--lang", type=str, help="Process single language or database (e.g. 'tr', 'en', 'la')")
    parser.add_argument("--all", action="store_true", help="Process all pending languages in queue")
    parser.add_argument("--ancient", action="store_true", help="Process ancient / classical languages first")
    parser.add_argument("--limit", type=int, default=0, help="Maximum number of languages to process")
    parser.add_argument("--no-drive", action="store_true", help="Disable Google Drive upload (retain local files)")
    parser.add_argument("--dry-run", action="store_true", help="Dry-run: harvest 50 sample entries per language")
    parser.add_argument("--status", action="store_true", help="Display harvest catalog summary table and exit")
    args = parser.parse_args()

    ledger = LedgerManager()

    if args.status:
        ledger.print_summary()
        return

    orchestrator = WikiquoteHarvestOrchestrator(
        ledger=ledger,
        enable_drive=not args.no_drive,
        dry_run=args.dry_run,
    )

    if args.lang:
        row = ledger.get_language(args.lang)
        if not row:
            print(f"[ERROR] Language or database not found in catalog: {args.lang}", file=sys.stderr)
            sys.exit(1)
        orchestrator.process_language(row)
    elif args.all or args.ancient:
        pending = ledger.get_pending_languages(only_ancient=args.ancient)
        total = len(pending)
        print(f"[INFO] Discovered {total} pending Wikiquote languages in ledger queue.")
        count = 0
        for row in pending:
            orchestrator.process_language(row)
            count += 1
            if args.limit > 0 and count >= args.limit:
                print(f"[INFO] Reached requested limit of {args.limit} languages.")
                break
    else:
        # Default: print usage and summary
        ledger.print_summary()
        print("Usage: python3 scripts/wikiquote_pipeline/orchestrator.py [--lang <lang>] [--all] [--dry-run] [--status]")


if __name__ == "__main__":
    main()
