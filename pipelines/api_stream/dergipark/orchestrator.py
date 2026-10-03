#!/usr/bin/env python3
"""
DergiPark Ingestion Pipeline Orchestrator CLI -- protokol-7

Executes continuous harvesting of TÜBİTAK ULAKBİM DergiPark open access articles,
cleans records into tabular LLM-ready format, stores metadata in ACID SQLite ledger,
packs them into Zstandard Parquet shards, and uploads to Google Drive with zero local disk residue.
"""

import argparse
import datetime
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from cleaner import DergiParkCleaner
from downloader import DergiParkDownloader
from drive_sync import DergiParkDriveSync
from ledger import DergiParkLedger
from packer import DergiParkParquetSharder


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    parser = argparse.ArgumentParser(description="TÜBİTAK ULAKBİM DergiPark Ingestion Pipeline")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Harvest full DergiPark repository continuously via high-speed OAI-PMH service",
    )
    parser.add_argument(
        "--set",
        default=None,
        help="Specific journal setSpec to harvest (e.g. journal ID or collection code)",
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
        "--from-date",
        default=None,
        help="OAI-PMH datestamp lower bound (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--until-date",
        default=None,
        help="OAI-PMH datestamp upper bound (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output-dir",
        default="data/parquets/dergipark",
        help="Local Parquet scratch directory",
    )
    parser.add_argument(
        "--db-path",
        default="data/catalogs/dergipark_catalog.sqlite",
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
    set_desc = f" (set: {args.set})" if args.set else " (all journals)"

    print("============================================================================", flush=True)
    print("[DERGIPARK] Starting TÜBİTAK ULAKBİM DergiPark Ingestion Pipeline", flush=True)
    print(f"[DERGIPARK] Mode: OAI-PMH Bulk Harvest{set_desc}", flush=True)
    print(f"[DERGIPARK] Target records: {max_recs if max_recs else 'UNLIMITED'} | Batch size: {args.batch_size}", flush=True)
    print(f"[DERGIPARK] Shard threshold: {args.shard_size_mb} MB | Max shard records: {args.max_shard_records}", flush=True)
    print(f"[DERGIPARK] SQLite Database: {args.db_path}", flush=True)
    print(f"[DERGIPARK] Local Scratch: {args.output_dir}", flush=True)
    print("============================================================================", flush=True)

    downloader = DergiParkDownloader()
    cleaner = DergiParkCleaner()
    ledger = DergiParkLedger(db_path=args.db_path)

    drive_sync = None
    if not args.no_drive:
        try:
            drive_sync = DergiParkDriveSync(dry_run=args.dry_run)
        except Exception as e:
            print(f"[DRIVE-WARN] Google Drive authentication unavailable: {e}", flush=True)
            print(f"[DRIVE-WARN] Falling back to local storage buffer mode in {args.output_dir}.", flush=True)
            print("[DRIVE-WARN] Run 'npm run auth:gdrive' to refresh Google Drive token and flush shards.", flush=True)

    if args.sync_shards:
        print("[DERGIPARK] Scanning for un-uploaded local shards...", flush=True)
        if not drive_sync:
            print("[ERROR] Cannot sync shards without active Google Drive authentication.", flush=True)
            sys.exit(1)
        uploaded_count = 0
        if os.path.exists(args.output_dir):
            for fname in sorted(os.listdir(args.output_dir)):
                if fname.endswith(".parquet"):
                    fpath = os.path.join(args.output_dir, fname)
                    print(f"[DRIVE-SYNC] Uploading {fname} to Drive...", flush=True)
                    res = drive_sync.sync_shard(fpath, purge_on_success=True)
                    fid = res.get("file_id") or ""
                    vmd5 = res.get("md5")
                    if fid:
                        ledger.mark_shard_uploaded(fname, drive_file_id=fid, verified_md5=vmd5)
                        uploaded_count += 1
            ledger.sync_to_central_catalog("dergipark")
        print(f"[DRIVE-SYNC] Flushed {uploaded_count} shards to Google Drive.", flush=True)
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
                    ledger.sync_to_central_catalog("dergipark")
            except Exception as e:
                print(f"[DRIVE-WARN] Shard upload deferred: {e}. Preserved locally at {shard_info['file_path']}", flush=True)

    start_part = ledger.get_next_part_index()
    sharder = DergiParkParquetSharder(
        output_dir=args.output_dir,
        filename_prefix="dergipark",
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

    record_stream = downloader.stream_records(
        set_spec=args.set,
        from_date=args.from_date,
        until_date=args.until_date,
        max_records=max_recs,
        resumption_token=args.resumption_token,
    )

    try:
        for raw_item in record_stream:
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
                    f"[DERGIPARK] Processed {raw_count} raw ({clean_count} clean, "
                    f"{rejected_count} rejected) | {rps:.1f} rec/s",
                    flush=True,
                )

        sharder.close()
        ledger.sync_to_central_catalog("dergipark")

    except KeyboardInterrupt:
        print("\n[DERGIPARK] Ingestion interrupted by operator. Finalizing open shards...", flush=True)
        sharder.close()
        ledger.sync_to_central_catalog("dergipark")

    total_time = time.time() - t0
    final_count = ledger.get_article_count()
    print("============================================================================", flush=True)
    print(f"[DERGIPARK] Ingestion Complete in {total_time:.1f}s", flush=True)
    print(f"[DERGIPARK] Raw items processed: {raw_count}", flush=True)
    print(f"[DERGIPARK] Clean records accepted: {clean_count}", flush=True)
    print(f"[DERGIPARK] Records rejected: {rejected_count}", flush=True)
    print(f"[DERGIPARK] Total articles in SQLite catalog: {final_count}", flush=True)
    print("============================================================================", flush=True)


if __name__ == "__main__":
    main()
