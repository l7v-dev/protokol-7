#!/usr/bin/env python3
"""
bioRxiv & medRxiv Ingestion Pipeline Orchestrator CLI -- protokol-7

Executes continuous harvesting of bioRxiv/medRxiv preprints, cleans records
into LLM-ready markdown, stores metadata in ACID SQLite ledger, packs them
into Zstandard Parquet shards, and uploads to Google Drive with zero local disk residue.
"""

import argparse
import datetime
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from cleaner import BiorxivCleaner
from downloader import BiorxivDownloader
from drive_sync import BiorxivDriveSync
from ledger import BiorxivLedger
from packer import BiorxivSharder


def main():
    parser = argparse.ArgumentParser(description="bioRxiv & medRxiv Preprint Ingestion Pipeline")
    parser.add_argument(
        "--server",
        choices=["biorxiv", "medrxiv"],
        default="biorxiv",
        help="Target preprint repository server",
    )
    parser.add_argument(
        "--interval",
        default="2026-01-01/2026-10-02",
        help="Date interval format YYYY-MM-DD/YYYY-MM-DD",
    )
    parser.add_argument(
        "--category",
        default=None,
        help="Subject category filter (e.g. neuroscience, bioinformatics, oncology)",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=1000,
        help="Maximum preprint articles to fetch",
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
        default=10240,
        help="Max Parquet shard size in MB",
    )
    parser.add_argument(
        "--output-dir",
        default="data/parquets/biorxiv",
        help="Local Parquet directory",
    )
    parser.add_argument(
        "--db-path",
        default="data/catalogs/biorxiv_catalog.sqlite",
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
    args = parser.parse_args()

    print("============================================================================")
    print(f"[BIORXIV] Starting {args.server.upper()} Preprint Ingestion Pipeline")
    print(f"[BIORXIV] Server: {args.server} | Interval: {args.interval}")
    if args.category:
        print(f"[BIORXIV] Category Filter: {args.category}")
    print(f"[BIORXIV] Target records: {args.max_records} | Batch size: {args.batch_size}")
    print(f"[BIORXIV] SQLite Database: {args.db_path}")
    print(f"[BIORXIV] Local Scratch: {args.output_dir}")
    print("============================================================================")

    downloader = BiorxivDownloader()
    cleaner = BiorxivCleaner()
    ledger = BiorxivLedger(db_path=args.db_path)
    drive_sync = BiorxivDriveSync(dry_run=args.dry_run) if not args.no_drive else None

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
                ledger.sync_to_central_catalog("biorxiv")

    sharder = BiorxivSharder(
        output_dir=args.output_dir,
        filename_prefix="bx" if args.server == "biorxiv" else "mx",
        max_part_bytes=args.shard_size_mb * 1024 * 1024,
        batch_size=min(args.batch_size, 1000),
        on_shard_completed=on_shard_completed,
    )

    t0 = time.time()
    raw_count = 0
    clean_count = 0
    rejected_count = 0

    try:
        for raw_item in downloader.stream_records(
            server=args.server,
            interval=args.interval,
            max_records=args.max_records,
            category=args.category,
        ):
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
                    f"[BIORXIV] Processed {raw_count} raw ({clean_count} clean, "
                    f"{rejected_count} rejected) | {rps:.1f} rec/s"
                )

        sharder.close()
        ledger.sync_to_central_catalog("biorxiv")

    except KeyboardInterrupt:
        print("\n[BIORXIV] Ingestion interrupted by operator. Finalizing open shards...")
        sharder.close()
        ledger.sync_to_central_catalog("biorxiv")

    total_time = time.time() - t0
    final_count = ledger.get_article_count(server=args.server)
    print("============================================================================")
    print(f"[BIORXIV] Ingestion Complete in {total_time:.1f}s")
    print(f"[BIORXIV] Raw items processed: {raw_count}")
    print(f"[BIORXIV] Clean records accepted: {clean_count}")
    print(f"[BIORXIV] Records rejected: {rejected_count}")
    print(f"[BIORXIV] Total articles in SQLite catalog: {final_count}")
    print("============================================================================")


if __name__ == "__main__":
    main()
