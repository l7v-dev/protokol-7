#!/usr/bin/env python3
"""
DOAJ Ingestion Pipeline Orchestrator CLI -- protokol-7

Executes continuous harvesting of DOAJ open access articles, cleans records
into LLM-ready tabular format, stores metadata in ACID SQLite ledger,
packs them into Zstandard Parquet shards, and uploads to Google Drive with
zero local disk residue.
"""

import argparse
import datetime
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from cleaner import DoajCleaner
from downloader import DoajDownloader
from drive_sync import DoajDriveSync
from ledger import DoajLedger
from packer import DoajParquetSharder


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    parser = argparse.ArgumentParser(description="DOAJ Open Access Article Ingestion Pipeline")
    parser.add_argument(
        "--query",
        default="*",
        help="Search query or keyword for DOAJ articles (default: * for all)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Harvest full DOAJ repository continuously via high-speed OAI-PMH service",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=50000,
        help="Maximum articles to fetch (set 0 for unlimited continuous harvest)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Records per Parquet write batch",
    )
    parser.add_argument(
        "--shard-size-mb",
        type=int,
        default=512,
        help="Max Parquet shard size in MB",
    )
    parser.add_argument(
        "--max-shard-records",
        type=int,
        default=50000,
        help="Max records per Parquet shard before rotation (default: 50000)",
    )
    parser.add_argument(
        "--resumption-token",
        default=None,
        help="Resume OAI-PMH harvest from specific resumptionToken",
    )
    parser.add_argument(
        "--output-dir",
        default="data/parquets/doaj",
        help="Local Parquet directory",
    )
    parser.add_argument(
        "--db-path",
        default="data/catalogs/doaj_catalog.sqlite",
        help="SQLite ledger path",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate Drive upload without remote network calls",
    )
    parser.add_argument(
        "--no-drive",
        action="store_true",
        help="Skip Google Drive upload and retain local shards",
    )
    parser.add_argument(
        "--sync-shards",
        action="store_true",
        help="Flush un-uploaded local shards to Google Drive and exit",
    )
    args = parser.parse_args()

    max_recs = None if args.max_records == 0 else args.max_records
    use_oai = args.all or (args.query in ("*", "*:*", "") and (max_recs is None or max_recs > 1000))
    mode_str = "OAI-PMH Bulk Harvest (Full Catalog)" if use_oai else f"REST API v2 Search (query: {args.query})"

    print("============================================================================", flush=True)
    print("[DOAJ] Starting DOAJ Open Access Article Ingestion Pipeline", flush=True)
    print(f"[DOAJ] Mode: {mode_str}", flush=True)
    print(f"[DOAJ] Target records: {max_recs if max_recs else 'UNLIMITED'} | Batch size: {args.batch_size}", flush=True)
    print(f"[DOAJ] Shard size threshold: {args.shard_size_mb} MB | Max shard records: {args.max_shard_records}", flush=True)
    print(f"[DOAJ] SQLite Database: {args.db_path}", flush=True)
    print(f"[DOAJ] Local Scratch: {args.output_dir}", flush=True)
    print("============================================================================", flush=True)

    downloader = DoajDownloader()
    cleaner = DoajCleaner()
    ledger = DoajLedger(db_path=args.db_path)

    drive_sync = None
    if not args.no_drive:
        try:
            drive_sync = DoajDriveSync(dry_run=args.dry_run)
        except Exception as e:
            print(f"[DRIVE-WARN] Google Drive authentication unavailable: {e}")
            print(f"[DRIVE-WARN] Falling back to local storage buffer mode in {args.output_dir}.")
            print("[DRIVE-WARN] Run 'npm run auth:gdrive' to refresh Google Drive token and flush shards.")

    if args.sync_shards:
        print("[DOAJ] Scanning for un-uploaded local shards...")
        if not drive_sync:
            print("[ERROR] Cannot sync shards without active Google Drive authentication.")
            sys.exit(1)
        uploaded_count = 0
        if os.path.exists(args.output_dir):
            for fname in sorted(os.listdir(args.output_dir)):
                if fname.endswith(".parquet"):
                    fpath = os.path.join(args.output_dir, fname)
                    print(f"[DRIVE-SYNC] Uploading {fname} to Drive...")
                    res = drive_sync.sync_shard(fpath, purge_on_success=True)
                    fid = res.get("file_id") or ""
                    vmd5 = res.get("md5")
                    if fid:
                        ledger.mark_shard_uploaded(fname, drive_file_id=fid, verified_md5=vmd5)
                        uploaded_count += 1
            ledger.sync_to_central_catalog("doaj")
        print(f"[DRIVE-SYNC] Flushed {uploaded_count} shards to Google Drive.")
        return

    # Shard completion callback
    def on_shard_completed(shard_info):
        ledger.register_shard(
            shard_name=shard_info["shard_name"],
            part_index=shard_info["part_index"],
            record_count=shard_info["record_count"],
            byte_size=shard_info["byte_size"],
            sha256=shard_info["sha256"],
            md5=shard_info["md5"],
        )
        if drive_sync:
            try:
                sync_res = drive_sync.sync_shard(
                    local_path=shard_info["file_path"],
                    purge_on_success=True,
                )
                file_id = sync_res.get("file_id") or ""
                verified_md5 = sync_res.get("md5")
                if file_id:
                    ledger.mark_shard_uploaded(
                        shard_name=shard_info["shard_name"],
                        drive_file_id=file_id,
                        verified_md5=verified_md5,
                    )
                    ledger.sync_to_central_catalog("doaj")
            except Exception as e:
                print(f"[DRIVE-WARN] Shard upload deferred: {e}. Preserved locally at {shard_info['file_path']}")

    start_part = ledger.get_next_part_index()
    sharder = DoajParquetSharder(
        output_dir=args.output_dir,
        filename_prefix="doaj",
        max_part_bytes=args.shard_size_mb * 1024 * 1024,
        max_part_entries=args.max_shard_records,
        batch_size=min(args.batch_size, 1000),
        start_part_idx=start_part,
        on_shard_completed=on_shard_completed,
    )

    t0 = time.time()
    raw_count = 0
    clean_count = 0
    rejected_count = 0

    article_stream = (
        downloader.stream_oai_articles(max_records=max_recs, resumption_token=args.resumption_token)
        if use_oai
        else downloader.stream_articles(query=args.query, max_records=max_recs)
    )

    try:
        for raw_item in article_stream:
            raw_count += 1
            cleaned = cleaner.clean_record(raw_item)
            if not cleaned:
                rejected_count += 1
                continue

            clean_count += 1
            ledger.index_article(cleaned)
            sharder.add_record(cleaned)

            if raw_count % 100 == 0:
                elapsed = time.time() - t0
                rps = raw_count / elapsed if elapsed > 0 else 0
                print(
                    f"[DOAJ] Processed {raw_count} raw ({clean_count} clean, "
                    f"{rejected_count} rejected) | {rps:.1f} rec/s",
                    flush=True,
                )

        sharder.close()
        ledger.sync_to_central_catalog("doaj")

    except KeyboardInterrupt:
        print("\n[DOAJ] Ingestion interrupted by operator. Finalizing open shards...", flush=True)
        sharder.close()
        ledger.sync_to_central_catalog("doaj")

    total_time = time.time() - t0
    final_count = ledger.get_article_count()
    print("============================================================================", flush=True)
    print(f"[DOAJ] Ingestion Complete in {total_time:.1f}s", flush=True)
    print(f"[DOAJ] Raw items processed: {raw_count}", flush=True)
    print(f"[DOAJ] Clean records accepted: {clean_count}", flush=True)
    print(f"[DOAJ] Records rejected: {rejected_count}", flush=True)
    print(f"[DOAJ] Total articles in SQLite catalog: {final_count}", flush=True)
    print("============================================================================", flush=True)


if __name__ == "__main__":
    main()
