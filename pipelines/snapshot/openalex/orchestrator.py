#!/usr/bin/env python3
"""
OpenAlex S3 Snapshot Pipeline Orchestrator -- protokol-7

Executes end-to-end processing of OpenAlex official AWS S3 Parquet snapshot:
1. Fetches manifest and loads partition queue
2. Streams raw partitions with zero-disk buffering
3. Applies strict LLM quality gate (paratext, retractions, inverted-index abstract)
4. Packs into enterprise-named Zstd Parquet shards (oa_w_YYYYMMDD_p00000.parquet)
5. Uploads directly to Google Drive (OpenAlex/Snapshots/), validates MD5
6. Zero local disk residue: immediately purges each shard upon verified upload
7. Maintains transactional SQLite ledger and Protokol-7 central catalog sync
"""

import argparse
import os
import signal
import sys
import time
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import report_producer_error, producer_run, EvidenceWriteError, capture_path
from cleaner import process_partition_file
from downloader import (
    cleanup_partition,
    download_partition,
    extract_works_partitions,
    fetch_manifest,
)
from drive_sync import OpenAlexDriveSync
from ledger import SnapshotLedger
from packer import OpenAlexSnapshotSharder

DEFAULT_SCRATCH_DIR = "data/temp_openalex_snapshot"
DEFAULT_MANIFEST_CACHE = "data/temp_openalex_snapshot/manifest.json"


def print_status(ledger: SnapshotLedger) -> None:
    stats = ledger.get_summary_stats()
    print("=" * 64)
    print("OPENALEX SNAPSHOT PIPELINE STATUS")
    print("=" * 64)
    print(f"Total S3 Partitions:      {stats['total_partitions']:,}")
    print(f"Completed Partitions:     {stats['completed_partitions']:,}")
    print(f"In-Progress Partitions:   {stats['in_progress_partitions']:,}")
    print(f"Failed Partitions:        {stats['failed_partitions']:,}")
    print(f"Cleaned Works Count:      {stats['total_cleaned_records']:,}")
    print(f"Output Shards Generated:  {stats['total_shards']:,}")
    print(f"Drive Verified Shards:    {stats['verified_shards']:,}")
    print(f"Total Shard Volume:       {stats['total_shard_mb']:.2f} MB")
    print("=" * 64)


def run_pipeline(
    max_part_gb: float = 10.0,
    max_partitions: Optional[int] = None,
    dry_run: bool = False,
    scratch_dir: str = DEFAULT_SCRATCH_DIR,
    force_manifest: bool = False,
    batch_size: int = 10_000,
    require_abstract: bool = True,
    min_abstract_words: int = 15,
) -> None:
    raw_dir = os.path.join(scratch_dir, "raw")
    shards_dir = os.path.join(scratch_dir, "shards")
    manifest_cache = os.path.join(scratch_dir, "manifest.json")
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(shards_dir, exist_ok=True)

    ledger = SnapshotLedger()
    drive_sync: Optional[OpenAlexDriveSync] = None

    if not dry_run:
        print("[ORCHESTRATOR] Initializing Google Drive sync client...")
        try:
            drive_sync = OpenAlexDriveSync()
        except Exception as err:
            report_producer_error(err)
            print(f"[ERROR] Failed to initialize Google Drive: {err}", file=sys.stderr)
            print("[INFO] Run with --dry-run to test locally without Google Drive.", file=sys.stderr)
            sys.exit(1)

    # 1. Fetch manifest and register partitions
    print("[ORCHESTRATOR] Reading OpenAlex snapshot manifest...")
    manifest = fetch_manifest(cache_path=manifest_cache, force_refresh=force_manifest)
    manifest_date = manifest.get("date", "unknown")
    works_partitions = extract_works_partitions(manifest)
    ledger.register_manifest(works_partitions, manifest_date)

    # 2. Get pending queue
    pending = ledger.get_pending_partitions(limit=max_partitions)
    if not pending:
        print("[ORCHESTRATOR] All S3 partitions are already completed. Nothing to do.")
        print_status(ledger)
        return

    print(
        f"[ORCHESTRATOR] Queue ready: {len(pending):,} partition(s) selected "
        f"(Shard Ceiling: {max_part_gb:.1f} GB, Dry-Run: {dry_run})"
    )

    # 3. Setup Sharder and Upload Callback
    max_part_bytes = int(max_part_gb * 1024**3)
    start_part_idx = ledger.get_next_shard_index()

    stop_requested = False

    def handle_signal(sig, frame):
        nonlocal stop_requested
        print("\n[ORCHESTRATOR] Interruption signal received. Gracefully finishing current shard...")
        stop_requested = True

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    def on_shard_completed_handler(shard_info: Dict[str, Any]) -> None:
        ledger.record_shard_created(shard_info)
        shard_path = shard_info["path"]
        shard_name = shard_info["filename"]

        if dry_run or drive_sync is None:
            print(f"[DRY-RUN] Shard generated locally: {shard_name} ({shard_info['size_mb']:.2f} MB)")
            return

        print(f"[ORCHESTRATOR] Uploading {shard_name} to Google Drive...")
        upload_res = drive_sync.upload_and_clean(
            shard_path, expected_md5=shard_info["md5"]
        )
        ledger.record_shard_verified(
            shard_name, upload_res["drive_file_id"], shard_info=shard_info
        )
        print(f"[ORCHESTRATOR] Shard {shard_name} uploaded and verified in Google Drive.")

    sharder = OpenAlexSnapshotSharder(
        output_dir=shards_dir,
        snapshot_date=manifest_date.replace("-", ""),
        max_part_bytes=max_part_bytes,
        batch_size=batch_size,
        start_part_idx=start_part_idx,
        on_shard_completed=on_shard_completed_handler,
    )

    # 4. Processing Loop
    total_cleaned_in_run = 0
    t_pipeline_start = time.time()

    for idx, p in enumerate(pending, 1):
        if stop_requested:
            print("[ORCHESTRATOR] Stopping processing loop as requested.")
            break

        s3_url = p["s3_url"]
        part_idx = p["partition_index"]
        target_raw = os.path.join(raw_dir, f"part_{part_idx:05d}.parquet")

        print(
            f"\n[ORCHESTRATOR] [{idx}/{len(pending)}] Processing partition #{part_idx}: {s3_url}"
        )
        ledger.mark_partition_started(s3_url)

        try:
            # Download partition
            download_partition(p, target_raw)
            raw_evidence = capture_path(target_raw, "openalex-snapshot", p["s3_url"])

            # Clean and feed to sharder
            t0 = time.time()
            clean_count = process_partition_file(
                target_raw,
                sharder,
                raw_evidence=raw_evidence,
                batch_size=batch_size,
                require_abstract=require_abstract,
                min_abstract_words=min_abstract_words,
            )
            elapsed_clean = max(0.01, time.time() - t0)

            total_cleaned_in_run += clean_count
            print(
                f"[ORCHESTRATOR] Partition #{part_idx} processed: {clean_count:,} clean works "
                f"({clean_count / elapsed_clean:.1f} works/sec)"
            )

            # Mark complete
            ledger.mark_partition_completed(s3_url, clean_count)

        except EvidenceWriteError:
            raise
        except Exception as err:
            report_producer_error(err)
            print(f"[ERROR] Failed partition #{part_idx} ({s3_url}): {err}", file=sys.stderr)
            ledger.mark_partition_failed(s3_url, str(err))

        finally:
            # Zero-disk residue: purge raw partition immediately
            cleanup_partition(target_raw)

    # 5. Flush and close final shard
    print("\n[ORCHESTRATOR] Closing sharder and flushing final records...")
    sharder.close()

    total_time = max(0.1, time.time() - t_pipeline_start)
    print(
        f"\n[ORCHESTRATOR] Run finished in {total_time:.1f}s. "
        f"Total clean works this run: {total_cleaned_in_run:,}"
    )
    print_status(ledger)


@producer_run("openalex-snapshot")
def main() -> None:
    parser = argparse.ArgumentParser(
        description="OpenAlex S3 Snapshot Pipeline -- protokol-7"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all pending partitions in the manifest",
    )
    parser.add_argument(
        "--max-partitions",
        type=int,
        default=None,
        help="Maximum number of partitions to process in this run",
    )
    parser.add_argument(
        "--max-part-gb",
        type=float,
        default=10.0,
        help="Maximum shard size in GB before rotating (default: 10.0)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process without uploading to Google Drive",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Display pipeline progress and statistics, then exit",
    )
    parser.add_argument(
        "--scratch-dir",
        type=str,
        default=DEFAULT_SCRATCH_DIR,
        help=f"Local scratch directory (default: {DEFAULT_SCRATCH_DIR})",
    )
    parser.add_argument(
        "--force-manifest",
        action="store_true",
        help="Force re-download of snapshot manifest.json",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10_000,
        help="In-memory batch size for streaming Parquet writes (default: 10000)",
    )
    parser.add_argument(
        "--include-abstract-less",
        action="store_true",
        help="Include works that have no abstract (default: False, require abstract)",
    )
    parser.add_argument(
        "--min-abstract-words",
        type=int,
        default=15,
        help="Minimum words in abstract to accept (default: 15)",
    )

    args = parser.parse_args()

    ledger = SnapshotLedger()
    if args.status:
        print_status(ledger)
        return

    max_parts = None if args.all else (args.max_partitions or 5)
    run_pipeline(
        max_part_gb=args.max_part_gb,
        max_partitions=max_parts,
        dry_run=args.dry_run,
        scratch_dir=args.scratch_dir,
        force_manifest=args.force_manifest,
        batch_size=args.batch_size,
        require_abstract=not args.include_abstract_less,
        min_abstract_words=args.min_abstract_words,
    )


if __name__ == "__main__":
    main()
