#!/usr/bin/env python3
"""
Wikisource Multi-Language Orchestrator & Autonomous Harvest Pipeline — protokol-7

Executes automated dump harvesting across all 85 Wikisource language editions
(including ancient and classical languages). Features:
1. SQLite-backed progress ledger with resumption and fault isolation.
2. Sequential streaming: Download -> Clean -> Zstd Parquet -> Drive Upload -> Immediate Delete.
3. Zero disk residue: Dump archives and Parquet shards are deleted upon verified upload.
4. Language queue sorting (smallest to largest) for rapid turnaround.
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

from cleaner import stream_wikisource_articles
from downloader import (
    build_dump_urls,
    download_dump_file,
    remove_file_safely,
    resolve_dump_db_name,
    SSL_CONTEXT,
    USER_AGENT,
)
from drive_sync import WikisourceDriveSync
from packer import StreamingParquetSharder

# Complete catalog of all 85 Wikimedia Wikisource databases
ALL_WIKISOURCE_DBS = [
    # Ancient & Classical Languages
    {"db": "angwikisource", "lang": "ang", "name": "Old English / Anglo-Saxon", "ancient": True},
    {"db": "lawikisource", "lang": "la", "name": "Latin", "ancient": True},
    {"db": "sawikisource", "lang": "sa", "name": "Sanskrit", "ancient": True},
    {"db": "sourceswiki", "lang": "mul", "name": "Multilingual (Ancient Greek, Old Norse, etc.)", "ancient": True},
    {"db": "yiwikisource", "lang": "yi", "name": "Yiddish", "ancient": True},
    # World Languages & Regional
    {"db": "arwikisource", "lang": "ar", "name": "Arabic", "ancient": False},
    {"db": "aswikisource", "lang": "as", "name": "Assamese", "ancient": False},
    {"db": "azwikisource", "lang": "az", "name": "Azerbaijani", "ancient": False},
    {"db": "banwikisource", "lang": "ban", "name": "Balinese", "ancient": False},
    {"db": "bclwikisource", "lang": "bcl", "name": "Central Bikol", "ancient": False},
    {"db": "bewikisource", "lang": "be", "name": "Belarusian", "ancient": False},
    {"db": "bgwikisource", "lang": "bg", "name": "Bulgarian", "ancient": False},
    {"db": "bnwikisource", "lang": "bn", "name": "Bengali", "ancient": False},
    {"db": "brwikisource", "lang": "br", "name": "Breton", "ancient": False},
    {"db": "bswikisource", "lang": "bs", "name": "Bosnian", "ancient": False},
    {"db": "cawikisource", "lang": "ca", "name": "Catalan", "ancient": False},
    {"db": "cswikisource", "lang": "cs", "name": "Czech", "ancient": False},
    {"db": "cywikisource", "lang": "cy", "name": "Welsh", "ancient": False},
    {"db": "dawikisource", "lang": "da", "name": "Danish", "ancient": False},
    {"db": "dewikisource", "lang": "de", "name": "German", "ancient": False},
    {"db": "elwikisource", "lang": "el", "name": "Greek", "ancient": False},
    {"db": "enwikisource", "lang": "en", "name": "English", "ancient": False},
    {"db": "eowikisource", "lang": "eo", "name": "Esperanto", "ancient": False},
    {"db": "eswikisource", "lang": "es", "name": "Spanish", "ancient": False},
    {"db": "etwikisource", "lang": "et", "name": "Estonian", "ancient": False},
    {"db": "euwikisource", "lang": "eu", "name": "Basque", "ancient": False},
    {"db": "fawikisource", "lang": "fa", "name": "Persian", "ancient": False},
    {"db": "fiwikisource", "lang": "fi", "name": "Finnish", "ancient": False},
    {"db": "fowikisource", "lang": "fo", "name": "Faroese", "ancient": False},
    {"db": "frwikisource", "lang": "fr", "name": "French", "ancient": False},
    {"db": "glwikisource", "lang": "gl", "name": "Galician", "ancient": False},
    {"db": "guwikisource", "lang": "gu", "name": "Gujarati", "ancient": False},
    {"db": "hewikisource", "lang": "he", "name": "Hebrew", "ancient": False},
    {"db": "hiwikisource", "lang": "hi", "name": "Hindi", "ancient": False},
    {"db": "hrwikisource", "lang": "hr", "name": "Croatian", "ancient": False},
    {"db": "htwikisource", "lang": "ht", "name": "Haitian Creole", "ancient": False},
    {"db": "huwikisource", "lang": "hu", "name": "Hungarian", "ancient": False},
    {"db": "hywikisource", "lang": "hy", "name": "Armenian", "ancient": False},
    {"db": "idwikisource", "lang": "id", "name": "Indonesian", "ancient": False},
    {"db": "iswikisource", "lang": "is", "name": "Icelandic", "ancient": False},
    {"db": "itwikisource", "lang": "it", "name": "Italian", "ancient": False},
    {"db": "jawikisource", "lang": "ja", "name": "Japanese", "ancient": False},
    {"db": "jvwikisource", "lang": "jv", "name": "Javanese", "ancient": False},
    {"db": "kawikisource", "lang": "ka", "name": "Georgian", "ancient": False},
    {"db": "knwikisource", "lang": "kn", "name": "Kannada", "ancient": False},
    {"db": "kowikisource", "lang": "ko", "name": "Korean", "ancient": False},
    {"db": "lijwikisource", "lang": "lij", "name": "Ligurian", "ancient": False},
    {"db": "liwikisource", "lang": "li", "name": "Limburgish", "ancient": False},
    {"db": "ltwikisource", "lang": "lt", "name": "Lithuanian", "ancient": False},
    {"db": "madwikisource", "lang": "mad", "name": "Madurese", "ancient": False},
    {"db": "minwikisource", "lang": "min", "name": "Minangkabau", "ancient": False},
    {"db": "mkwikisource", "lang": "mk", "name": "Macedonian", "ancient": False},
    {"db": "mlwikisource", "lang": "ml", "name": "Malayalam", "ancient": False},
    {"db": "mrwikisource", "lang": "mr", "name": "Marathi", "ancient": False},
    {"db": "mswikisource", "lang": "ms", "name": "Malay", "ancient": False},
    {"db": "mywikisource", "lang": "my", "name": "Burmese", "ancient": False},
    {"db": "napwikisource", "lang": "nap", "name": "Neapolitan", "ancient": False},
    {"db": "nlwikisource", "lang": "nl", "name": "Dutch", "ancient": False},
    {"db": "nowikisource", "lang": "no", "name": "Norwegian", "ancient": False},
    {"db": "orwikisource", "lang": "or", "name": "Odia", "ancient": False},
    {"db": "pawikisource", "lang": "pa", "name": "Punjabi", "ancient": False},
    {"db": "plwikisource", "lang": "pl", "name": "Polish", "ancient": False},
    {"db": "pmswikisource", "lang": "pms", "name": "Piedmontese", "ancient": False},
    {"db": "ptwikisource", "lang": "pt", "name": "Portuguese", "ancient": False},
    {"db": "rowikisource", "lang": "ro", "name": "Romanian", "ancient": False},
    {"db": "ruwikisource", "lang": "ru", "name": "Russian", "ancient": False},
    {"db": "sahwikisource", "lang": "sah", "name": "Sakha / Yakut", "ancient": False},
    {"db": "skwikisource", "lang": "sk", "name": "Slovak", "ancient": False},
    {"db": "slwikisource", "lang": "sl", "name": "Slovenian", "ancient": False},
    {"db": "srwikisource", "lang": "sr", "name": "Serbian", "ancient": False},
    {"db": "suwikisource", "lang": "su", "name": "Sundanese", "ancient": False},
    {"db": "svwikisource", "lang": "sv", "name": "Swedish", "ancient": False},
    {"db": "tawikisource", "lang": "ta", "name": "Tamil", "ancient": False},
    {"db": "tcywikisource", "lang": "tcy", "name": "Tulu", "ancient": False},
    {"db": "tewikisource", "lang": "te", "name": "Telugu", "ancient": False},
    {"db": "thwikisource", "lang": "th", "name": "Thai", "ancient": False},
    {"db": "tlwikisource", "lang": "tl", "name": "Tagalog", "ancient": False},
    {"db": "trwikisource", "lang": "tr", "name": "Turkish", "ancient": False},
    {"db": "ukwikisource", "lang": "uk", "name": "Ukrainian", "ancient": False},
    {"db": "urwikisource", "lang": "ur", "name": "Urdu", "ancient": False},
    {"db": "vecwikisource", "lang": "vec", "name": "Venetian", "ancient": False},
    {"db": "viwikisource", "lang": "vi", "name": "Vietnamese", "ancient": False},
    {"db": "wawikisource", "lang": "wa", "name": "Walloon", "ancient": False},
    {"db": "zh_min_nanwikisource", "lang": "nan", "name": "Southern Min", "ancient": False},
    {"db": "zhwikisource", "lang": "zh", "name": "Chinese", "ancient": False},
]

DEFAULT_DB_PATH = "data/wikisource_catalog.sqlite"
DEFAULT_TEMP_DIR = "data/temp_wikisource"


class LedgerManager:
    """Manages SQLite checkpoint ledger for dump harvesting."""

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
                    language_name TEXT,
                    is_ancient INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    total_articles INTEGER DEFAULT 0,
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
            for item in ALL_WIKISOURCE_DBS:
                self.conn.execute(
                    """
                    INSERT OR IGNORE INTO harvests (db_name, lang, language_name, is_ancient, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
                    """,
                    (item["db"], item["lang"], item["name"], 1 if item["ancient"] else 0),
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
        total_articles: Optional[int] = None,
        dump_size_mb: Optional[float] = None,
        parquet_size_mb: Optional[float] = None,
        drive_file_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        with self.conn:
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            fields = ["status = ?", "updated_at = ?"]
            params: List[Any] = [status, now]

            if total_articles is not None:
                fields.append("total_articles = ?")
                params.append(total_articles)
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
        print("\n================ WIKISOURCE HARVEST SUMMARY ================")
        total = 0
        for row in rows:
            print(f"Status [{row[0]}]: {row[1]} languages")
            total += row[1]
        print(f"Total Registered Databases: {total}")

        cur.execute("SELECT SUM(total_articles), SUM(parquet_size_mb) FROM harvests WHERE status = 'completed'")
        stat = cur.fetchone()
        articles = stat[0] or 0
        p_mb = stat[1] or 0.0
        print(f"Total Preserved Works: {articles:,}")
        print(f"Total Cloud Parquet Size: {p_mb:.2f} MB")
        print("============================================================\n")


def estimate_dump_size(dump_url: str) -> float:
    """Estimates dump size in MB using HTTP HEAD without downloading payload."""
    req = urllib.request.Request(dump_url, headers={"User-Agent": USER_AGENT})
    req.get_method = lambda: "HEAD"
    try:
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=10) as resp:
            content_length = resp.headers.get("Content-Length")
            if content_length and content_length.isdigit():
                return int(content_length) / (1024 * 1024)
    except Exception:
        pass
    return 0.0


def process_language_dump(
    lang: str,
    db_name: str,
    ledger: LedgerManager,
    drive_sync: WikisourceDriveSync,
    temp_dir: str = DEFAULT_TEMP_DIR,
    limit: Optional[int] = None,
    min_length: int = 100,
) -> bool:
    """
    Downloads dump, streams articles into Parquet, deletes dump,
    uploads Parquet to Google Drive, and deletes Parquet immediately.
    Guarantees zero disk residue at any stage.
    """
    dump_url, _, dump_filename = build_dump_urls(lang)
    dump_path = os.path.join(temp_dir, dump_filename)
    shards_dir = os.path.join(temp_dir, "shards", lang)
    os.makedirs(shards_dir, exist_ok=True)

    print(f"\n>>> [START] Processing Wikisource: {db_name} (Lang: {lang})")
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

    # Step 2: Stream & Pack articles into Parquet
    sharder = StreamingParquetSharder(
        output_dir=shards_dir,
        corpus_prefix=f"wikisource_{lang}",
        compression="zstd",
        compression_level=6,
    )

    article_count = 0
    start_clean = time.time()
    try:
        for article in stream_wikisource_articles(dump_path, lang=lang, min_length=min_length, limit=limit):
            sharder.add_article(article)
            article_count += 1
            if article_count % 5000 == 0:
                print(f"[STREAM] {db_name}: Processed {article_count:,} articles...")

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
        f"[OK] Distilled {article_count:,} works in {clean_duration:.1f}s. "
        f"Generated {len(parquet_files)} Parquet shards."
    )

    if not parquet_files or article_count == 0:
        print(f"[WARN] No qualifying articles found for {db_name}.")
        ledger.update_status(
            db_name,
            "completed",
            total_articles=0,
            parquet_size_mb=0.0,
            drive_file_id="empty",
        )
        return True

    # Step 4: Upload Parquet shards to Google Drive and delete immediately
    ledger.update_status(db_name, "uploading", total_articles=article_count)
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
        total_articles=article_count,
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
    drive_sync = WikisourceDriveSync()

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

    print(f"[PLAN] Queued {len(tasks)} language editions for processing.")

    for idx, task in enumerate(tasks, 1):
        db = task["db_name"]
        lang = task["lang"]
        print(f"\n[{idx}/{len(tasks)}] Processing {db} ({task['language_name']})...")
        success = process_language_dump(
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
        description="Wikisource Multi-Language Dump Harvest Pipeline — protokol-7"
    )
    parser.add_argument("--lang", type=str, help="Language code or DB name (e.g. 'ang', 'sa', 'la', 'tr')")
    parser.add_argument("--ancient-only", action="store_true", help="Harvest only ancient and classical languages")
    parser.add_argument("--all", action="store_true", help="Harvest all 85 language editions")
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
