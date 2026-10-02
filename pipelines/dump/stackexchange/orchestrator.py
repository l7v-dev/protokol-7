#!/usr/bin/env python3
"""
StackExchange Full-Corpus Harvest Orchestrator -- protokol-7

Per-site pipeline:
  archive.org (7z dump) -> extract Posts.xml + Comments.xml
  -> parse + assemble threads -> clean HTML -> Zstd Parquet
  -> Google Drive upload -> zero local disk residue.

SQLite ledger at data/stackexchange_catalog.sqlite tracks per-site status
so the run is fully resumable.

Usage
-----
  # All sites (priority order: 1 -> 2 -> 3), resumable
  python3 scripts/stackexchange_pipeline/orchestrator.py --all

  # Single site
  python3 scripts/stackexchange_pipeline/orchestrator.py --site stackoverflow

  # Priority-1 sites only
  python3 scripts/stackexchange_pipeline/orchestrator.py --all --priority 1

  # Dry-run (first 500 threads per site, no Drive upload)
  python3 scripts/stackexchange_pipeline/orchestrator.py --all --dry-run

  # Status
  python3 scripts/stackexchange_pipeline/orchestrator.py --status

  # No Drive (keep Parquet locally)
  python3 scripts/stackexchange_pipeline/orchestrator.py --all --no-drive
"""

import argparse
import datetime
import json
import os
import shutil
import sqlite3
import sys
import time
from typing import Dict, Any, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleaner import stream_threads
from downloader import build_dump_url, download_7z, extract_xml_files, remove_safely
from drive_sync import StackExchangeDriveSync
from packer import StackExchangeParquetSharder

DEFAULT_DB_PATH  = "data/stackexchange_catalog.sqlite"
DEFAULT_TEMP_DIR = "data/temp_stackexchange"
SITES_JSON       = os.path.join(os.path.dirname(__file__), "sites.json")


# ------------------------------------------------------------------
# Site catalog loader
# ------------------------------------------------------------------

def load_sites() -> List[Dict[str, Any]]:
    with open(SITES_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------
# SQLite ledger
# ------------------------------------------------------------------

class SELedger:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init()

    def _init(self) -> None:
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS sites (
                    slug          TEXT PRIMARY KEY,
                    site          TEXT,
                    priority      INTEGER DEFAULT 3,
                    status        TEXT DEFAULT 'pending',
                    thread_count  INTEGER DEFAULT 0,
                    parquet_mb    REAL DEFAULT 0.0,
                    drive_file_id TEXT,
                    error_message TEXT,
                    created_at    TEXT,
                    updated_at    TEXT
                )
            """)
            sites = load_sites()
            now   = datetime.datetime.now(datetime.timezone.utc).isoformat()
            for s in sites:
                self.conn.execute("""
                    INSERT OR IGNORE INTO sites
                        (slug, site, priority, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'pending', ?, ?)
                """, (s["slug"], s["site"], s.get("priority", 3), now, now))

    def close(self) -> None:
        self.conn.close()

    def get_pending(self, priority: Optional[int] = None) -> List[sqlite3.Row]:
        q = "SELECT * FROM sites WHERE status = 'pending'"
        params = []
        if priority is not None:
            q += " AND priority <= ?"
            params.append(priority)
        q += " ORDER BY priority ASC, slug ASC"
        return self.conn.execute(q, params).fetchall()

    def get_site(self, slug: str) -> Optional[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM sites WHERE slug = ?", (slug,)
        ).fetchone()

    def mark(
        self,
        slug: str,
        status: str,
        thread_count: int = 0,
        parquet_mb: float = 0.0,
        drive_file_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        now    = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fields = ["status = ?", "updated_at = ?"]
        params: List[Any] = [status, now]
        for col, val in [
            ("thread_count",  thread_count),
            ("parquet_mb",    parquet_mb),
            ("drive_file_id", drive_file_id),
            ("error_message", error_message),
        ]:
            if val is not None:
                fields.append(f"{col} = ?")
                params.append(val)
        params.append(slug)
        with self.conn:
            self.conn.execute(
                f"UPDATE sites SET {', '.join(fields)} WHERE slug = ?", params
            )

    def reset_failed(self) -> int:
        with self.conn:
            cur = self.conn.execute(
                "UPDATE sites SET status = 'pending', error_message = NULL WHERE status IN ('failed', 'skipped', 'in_progress')"
            )
            return cur.rowcount

    def print_summary(self) -> None:
        print("\n=== StackExchange Harvest Summary ===")
        rows = self.conn.execute("""
            SELECT status, COUNT(*) AS cnt,
                   SUM(thread_count) AS threads,
                   SUM(parquet_mb)   AS total_mb
            FROM sites GROUP BY status
        """).fetchall()
        for r in rows:
            print(
                f"  [{r['status'].upper():12s}] sites: {r['cnt']:3d} | "
                f"threads: {(r['threads'] or 0):10,d} | "
                f"Parquet: {(r['total_mb'] or 0.0):.1f} MB"
            )
        print("=====================================\n")


# ------------------------------------------------------------------
# Per-site processor
# ------------------------------------------------------------------

class SEOrchestrator:
    def __init__(
        self,
        ledger: SELedger,
        temp_dir: str = DEFAULT_TEMP_DIR,
        enable_drive: bool = True,
        dry_run: bool = False,
    ):
        self.ledger       = ledger
        self.temp_dir     = temp_dir
        self.enable_drive = enable_drive
        self.dry_run      = dry_run
        self.drive: Optional[StackExchangeDriveSync] = None

        if enable_drive:
            try:
                self.drive = StackExchangeDriveSync()
            except Exception as e:
                print(f"[WARN] Drive init failed: {e} -- local-only.", file=sys.stderr)
                self.enable_drive = False

        os.makedirs(self.temp_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Single site
    # ------------------------------------------------------------------

    def process_site(self, slug: str, site: str) -> bool:
        print(f"\n{'='*70}")
        print(f"[START] Site: {site} (slug={slug})")
        print(f"{'='*70}")

        self.ledger.mark(slug, "in_progress")
        site_tmp  = os.path.join(self.temp_dir, slug)
        os.makedirs(site_tmp, exist_ok=True)

        archive_path: Optional[str] = None

        try:
            # 1. Download 7z archive from archive.org
            url          = build_dump_url(slug, site=site)
            archive_path = os.path.join(site_tmp, f"{slug}.7z")

            try:
                archive_path, dump_size_mb = download_7z(url, archive_path)
            except Exception as e:
                import urllib.error
                if isinstance(e, urllib.error.HTTPError) and e.code == 404:
                    print(f"[WARN] Dump not found (404) for {slug}: {url}")
                    self.ledger.mark(slug, "skipped", error_message="404 not found")
                    return False
                raise

            # 2. Extract Posts.xml + Comments.xml
            extracted = extract_xml_files(archive_path, site_tmp)
            # Free 7z immediately
            remove_safely(archive_path)
            archive_path = None

            posts_path    = extracted.get("Posts.xml")
            comments_path = extracted.get("Comments.xml")

            if not posts_path or not os.path.exists(posts_path):
                self.ledger.mark(slug, "failed", error_message="Posts.xml missing after extraction")
                return False

            # 3. Parse, assemble threads, clean, pack
            out_dir = os.path.join(site_tmp, "parquet")
            sharder = StackExchangeParquetSharder(
                output_dir=out_dir,
                corpus_prefix=f"se_{slug}",
            )

            thread_count = 0
            t0 = time.time()

            for thread in stream_threads(posts_path, comments_path, site=slug):
                sharder.append(thread)
                thread_count += 1
                if thread_count % 50_000 == 0:
                    elapsed = time.time() - t0
                    print(
                        f"[PARSE] {thread_count:,} threads processed "
                        f"({thread_count / max(1, elapsed):.0f}/s)"
                    )
                if self.dry_run and thread_count >= 500:
                    print("[DRY-RUN] 500-thread limit reached.")
                    break

            parquet_files = sharder.close()
            elapsed_total = time.time() - t0

            # Free XML files immediately
            remove_safely(posts_path)
            remove_safely(comments_path)

            if not parquet_files:
                print(f"[WARN] No threads produced for {slug}.")
                self.ledger.mark(slug, "completed", thread_count=0)
                return True

            total_mb = sum(os.path.getsize(f) / 1024**2 for f in parquet_files)
            print(
                f"[OK] {slug}: {thread_count:,} threads | "
                f"{len(parquet_files)} shard(s) | {total_mb:.1f} MB | {elapsed_total:.0f}s"
            )

            # 4. Upload to Drive
            drive_id: Optional[str] = None
            if self.enable_drive and self.drive:
                for fpath in parquet_files:
                    res      = self.drive.upload_and_clean(fpath, site=slug)
                    drive_id = res.get("drive_file_id")
            else:
                print(f"[INFO] Drive disabled -- files at: {out_dir}")

            self.ledger.mark(
                slug, "completed",
                thread_count=thread_count,
                parquet_mb=total_mb,
                drive_file_id=drive_id,
            )
            return True

        except Exception as e:
            msg = f"{type(e).__name__}: {e}"
            print(f"[ERROR] {slug}: {msg}", file=sys.stderr)
            self.ledger.mark(slug, "failed", error_message=msg)
            return False

        finally:
            # Always clean up temp dir for this site
            remove_safely(archive_path)
            if os.path.isdir(site_tmp):
                try:
                    shutil.rmtree(site_tmp, ignore_errors=True)
                    print(f"[CLEANUP] Removed temp dir: {site_tmp}")
                except Exception:
                    pass

    def run_all(self, priority: Optional[int] = None) -> None:
        pending = self.ledger.get_pending(priority=priority)
        total   = len(pending)
        print(f"[INFO] {total} pending site(s) in queue (priority <= {priority or 'all'}).")
        for i, row in enumerate(pending, 1):
            print(f"\n[{i}/{total}] Processing {row['slug']} ...")
            self.process_site(row["slug"], row["site"])
        self.ledger.print_summary()


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="StackExchange Full-Corpus Harvest Pipeline -- protokol-7"
    )
    parser.add_argument("--all",       action="store_true",  help="Process all pending sites")
    parser.add_argument("--site",      type=str,             help="Process single site slug")
    parser.add_argument("--priority",  type=int, default=None, help="Max priority tier (1/2/3)")
    parser.add_argument("--dry-run",   action="store_true",  help="First 500 threads per site only")
    parser.add_argument("--no-drive",      action="store_true",  help="Skip Drive upload")
    parser.add_argument("--status",        action="store_true",  help="Print summary and exit")
    parser.add_argument("--retry-failed",  action="store_true",  help="Reset failed/skipped/in_progress sites to pending")
    args = parser.parse_args()

    ledger = SELedger()

    if args.retry_failed:
        cnt = ledger.reset_failed()
        print(f"[INFO] Reset {cnt} failed/skipped/in_progress site(s) back to 'pending'.")
        if not args.all and not args.site:
            return

    if args.status:
        ledger.print_summary()
        return

    if not args.all and not args.site:
        parser.print_help()
        return

    orch = SEOrchestrator(
        ledger=ledger,
        enable_drive=not args.no_drive,
        dry_run=args.dry_run,
    )

    if args.site:
        row = ledger.get_site(args.site)
        if not row:
            print(f"[ERROR] Site slug not found: {args.site}", file=sys.stderr)
            sys.exit(1)
        orch.process_site(row["slug"], row["site"])
    else:
        orch.run_all(priority=args.priority)


if __name__ == "__main__":
    main()
