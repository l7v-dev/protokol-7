#!/usr/bin/env python3
"""
DergiPark Ingestion Pipeline Orchestrator CLI -- protokol-7

Executes continuous harvesting of TÜBİTAK ULAKBİM DergiPark open access articles,
cleans records into tabular LLM-ready format, stores metadata in ACID SQLite ledger,
packs them into Zstandard Parquet shards, and uploads to Google Drive with zero local disk residue.

Supports auto-partitioned multi-year windowing to harvest the full 800K+ repository.
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
from partitioner import DergiParkPartitioner


def print_status_report(ledger: DergiParkLedger) -> None:
    """Displays current ingestion and partition statistics."""
    article_count = ledger.get_article_count()
    partitions = ledger.get_partitions()

    print("============================================================================", flush=True)
    print("[DERGIPARK] Repository Status Report", flush=True)
    print(f"[DERGIPARK] Total articles indexed in SQLite catalog: {article_count:,}", flush=True)
    print(f"[DERGIPARK] Total registered partitions: {len(partitions)}", flush=True)
    print("============================================================================", flush=True)

    if not partitions:
        print("No partitioned harvest runs registered yet. Run with --auto-partition.", flush=True)
        return

    completed_parts = [p for p in partitions if p.get("status") == "completed"]
    running_parts = [p for p in partitions if p.get("status") == "running"]
    pending_parts = [p for p in partitions if p.get("status") == "pending"]
    failed_parts = [p for p in partitions if p.get("status") == "failed"]

    print(
        f"Summary: {len(completed_parts)} completed, {len(running_parts)} running, "
        f"{len(pending_parts)} pending, {len(failed_parts)} failed.",
        flush=True,
    )
    print("-" * 80, flush=True)
    print(f"{'Partition ID':<35} {'Status':<10} {'Clean':<8} {'New':<8} {'Started At'}", flush=True)
    print("-" * 80, flush=True)

    for p in partitions:
        pid = p["partition_id"]
        st = p.get("status", "unknown")
        cl = p.get("clean_count", 0)
        nw = p.get("new_count", 0)
        sa = (p.get("started_at") or "")[:19]
        print(f"{pid:<35} {st:<10} {cl:<8} {nw:<8} {sa}", flush=True)

    print("=" * 80, flush=True)


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
        "--auto-partition",
        action="store_true",
        help="Execute auto-partitioned multi-year harvest to access the full 800K+ repository",
    )
    parser.add_argument(
        "--start-year",
        type=int,
        default=1970,
        help="Start year for partitioned harvest (default: 1970)",
    )
    parser.add_argument(
        "--end-year",
        type=int,
        default=None,
        help="End year for partitioned harvest (default: current year)",
    )
    parser.add_argument(
        "--partition-mode",
        choices=["auto", "year", "half_year"],
        default="auto",
        help="Partition date window mode (default: auto)",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print partition and catalog status report and exit",
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

    ledger = DergiParkLedger(db_path=args.db_path)

    if args.status:
        print_status_report(ledger)
        return

    downloader = DergiParkDownloader()
    cleaner = DergiParkCleaner()

    max_recs = None if args.max_records == 0 else args.max_records
    set_desc = f" (set: {args.set})" if args.set else " (all journals)"

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

    # Determine partition schedule
    is_partitioned = args.auto_partition or (args.all and not args.from_date and not args.until_date and not args.resumption_token)

    if is_partitioned:
        partition_list = DergiParkPartitioner.generate_date_partitions(
            start_year=args.start_year,
            end_year=args.end_year,
            mode=args.partition_mode,
        )
        mode_desc = f"Auto-Partitioned ({len(partition_list)} windows, {args.start_year}..{args.end_year or 'present'})"
    else:
        partition_list = [{
            "partition_id": "dp_manual_query",
            "from_date": args.from_date,
            "until_date": args.until_date,
            "set_spec": args.set,
            "label": "Manual Query",
        }]
        mode_desc = f"Single Query{set_desc}"

    print("============================================================================", flush=True)
    print("[DERGIPARK] Starting TÜBİTAK ULAKBİM DergiPark Ingestion Pipeline", flush=True)
    print(f"[DERGIPARK] Mode: {mode_desc}", flush=True)
    print(f"[DERGIPARK] Target records: {max_recs if max_recs else 'UNLIMITED'} | Batch size: {args.batch_size}", flush=True)
    print(f"[DERGIPARK] Shard threshold: {args.shard_size_mb} MB | Max shard records: {args.max_shard_records}", flush=True)
    print(f"[DERGIPARK] SQLite Database: {args.db_path}", flush=True)
    print(f"[DERGIPARK] Local Scratch: {args.output_dir}", flush=True)
    print("============================================================================", flush=True)

    # Load existing IDs into memory to prevent writing duplicate articles to Parquet shards
    existing_ids = ledger.load_existing_ids()
    print(f"[DERGIPARK] In-memory deduplication index ready: {len(existing_ids):,} existing records.", flush=True)

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
    total_raw = 0
    total_clean = 0
    total_new = 0
    total_dup = 0
    total_rejected = 0

    try:
        for idx, p_info in enumerate(partition_list, start=1):
            part_id = p_info["partition_id"]
            from_d = p_info.get("from_date")
            until_d = p_info.get("until_date")
            set_s = p_info.get("set_spec") or args.set
            label = p_info.get("label", part_id)

            if is_partitioned:
                p_rec = ledger.init_partition(part_id, from_date=from_d, until_date=until_d, set_spec=set_s)
                if p_rec.get("status") == "completed":
                    print(f"[DERGIPARK] Partition [{idx}/{len(partition_list)}] '{label}' already completed ({p_rec.get('clean_count', 0)} recs). Skipping.", flush=True)
                    continue

                resumption_tok = p_rec.get("resumption_token")
                ledger.start_partition(part_id)
                print(f"[DERGIPARK] Partition [{idx}/{len(partition_list)}] '{label}' ({from_d}..{until_d}) started.", flush=True)
            else:
                resumption_tok = args.resumption_token

            part_raw = 0
            part_clean = 0
            part_new = 0
            part_dup = 0
            reached_limit = False
            last_token = resumption_tok

            def on_token_update(token_val):
                nonlocal last_token
                last_token = token_val
                if is_partitioned:
                    ledger.update_partition_progress(
                        partition_id=part_id,
                        resumption_token=token_val,
                        raw_count=part_raw,
                        clean_count=part_clean,
                        new_count=part_new,
                    )

            record_stream = downloader.stream_records(
                set_spec=set_s,
                from_date=from_d,
                until_date=until_d,
                max_records=max_recs - total_clean if max_recs else None,
                resumption_token=resumption_tok,
                on_token_update=on_token_update,
            )

            for raw_item in record_stream:
                part_raw += 1
                total_raw += 1

                cleaned = cleaner.clean_record(raw_item)
                if not cleaned:
                    total_rejected += 1
                    continue

                part_clean += 1
                total_clean += 1

                is_new = cleaned["id"] not in existing_ids
                ledger.index_article(cleaned)

                if is_new:
                    existing_ids.add(cleaned["id"])
                    sharder.add_record(cleaned)
                    part_new += 1
                    total_new += 1
                else:
                    part_dup += 1
                    total_dup += 1

                if total_raw % 100 == 0:
                    elapsed = time.time() - t0
                    rps = total_raw / elapsed if elapsed > 0 else 0
                    print(
                        f"[DERGIPARK] Processed {total_raw} raw ({total_clean} clean, "
                        f"{total_new} new, {total_dup} existing) | {rps:.1f} rec/s",
                        flush=True,
                    )

                if max_recs and total_clean >= max_recs:
                    reached_limit = True
                    break

            if is_partitioned:
                if reached_limit:
                    ledger.update_partition_progress(
                        partition_id=part_id,
                        resumption_token=last_token,
                        raw_count=part_raw,
                        clean_count=part_clean,
                        new_count=part_new,
                    )
                    print(
                        f"[DERGIPARK] Partition [{idx}/{len(partition_list)}] '{label}' paused at max-records limit: "
                        f"{part_clean} clean ({part_new} new, {part_dup} existing).",
                        flush=True,
                    )
                else:
                    ledger.complete_partition(
                        partition_id=part_id,
                        raw_count=part_raw,
                        clean_count=part_clean,
                        new_count=part_new,
                    )
                    print(
                        f"[DERGIPARK] Partition [{idx}/{len(partition_list)}] '{label}' finished: "
                        f"{part_clean} clean ({part_new} new, {part_dup} existing).",
                        flush=True,
                    )

            if max_recs and total_clean >= max_recs:
                print(f"[DERGIPARK] Reached target max records limit ({max_recs}). Stopping.", flush=True)
                break

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
    print(f"[DERGIPARK] Total raw items processed: {total_raw}", flush=True)
    print(f"[DERGIPARK] Total clean records accepted: {total_clean}", flush=True)
    print(f"[DERGIPARK] New articles sharded: {total_new}", flush=True)
    print(f"[DERGIPARK] Existing articles deduplicated: {total_dup}", flush=True)
    print(f"[DERGIPARK] Total articles in SQLite catalog: {final_count:,}", flush=True)
    print("============================================================================", flush=True)


if __name__ == "__main__":
    main()
