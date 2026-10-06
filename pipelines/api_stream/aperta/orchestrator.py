#!/usr/bin/env python3
"""
Aperta Ingestion Pipeline Orchestrator CLI -- protokol-7

Executes continuous harvesting of TUBITAK ULAKBIM Aperta records, cleans records
into LLM-ready tabular format, stores metadata in ACID SQLite ledger,
packs them into Zstandard Parquet shards, and uploads to Google Drive with
zero local disk residue.
"""

import argparse
import datetime
import os
import sys
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import report_producer_error, EvidenceWriteError, producer_run, record_output
from pipelines.shared.daemon_run import monitor_daemon, current_checkpoint
from pipelines.shared.pipeline_runtime import current_stopper
from pipelines.shared.shard_namespace import next_part_index

from cleaner import ApertaCleaner
from downloader import ApertaDownloader
from drive_sync import ApertaDriveSync
from ledger import ApertaLedger
from packer import ApertaParquetSharder


def log(msg: str, level: str = "INFO") -> None:
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] [{level}] [APERTA] {msg}", flush=True)


@producer_run("aperta")
def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    parser = argparse.ArgumentParser(description="TUBITAK ULAKBIM Aperta Ingestion Pipeline")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Harvest full repository continuously via high-speed OAI-PMH service",
    )
    parser.add_argument(
        "--method",
        choices=["oai", "rest"],
        default="oai",
        help="Harvest method: 'oai' for OAI-PMH streaming or 'rest' for Invenio search API (default: oai)",
    )
    parser.add_argument(
        "--metadata-prefix",
        default="marcxml",
        choices=["marcxml", "oai_dc"],
        help="OAI-PMH metadata format: 'marcxml' (includes file attachments) or 'oai_dc' (default: marcxml)",
    )
    parser.add_argument(
        "--query",
        default="*",
        help="Search query for REST method (default: * for all)",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=50000,
        help="Maximum records to fetch (set 0 for unlimited continuous harvest)",
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
        "--auto-resume",
        action="store_true",
        default=True,
        help="Automatically resume from last stored resumptionToken in SQLite",
    )
    parser.add_argument(
        "--output-dir",
        default="data/parquets/aperta",
        help="Local Parquet directory",
    )
    parser.add_argument(
        "--db-path",
        default="data/catalogs/aperta_catalog.sqlite",
        help="SQLite ledger path",
    )
    parser.add_argument(
        "--sync-drive",
        action="store_true",
        default=True,
        help="Upload shards to Google Drive (Aperta/) and evict local files",
    )
    parser.add_argument(
        "--no-sync-drive",
        dest="sync_drive",
        action="store_false",
        help="Do not upload shards to Google Drive",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate run without writing Parquets or database rows",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Display current repository stats from SQLite and exit",
    )
    parser.add_argument(
        "--flush-unsharded",
        action="store_true",
        help="Package any unsharded records currently in SQLite into Parquet shards and exit",
    )

    parser.add_argument("--async-upload", action="store_true", help="Queue closed shard uploads and drain before completion")
    from pipelines.shared.cli_validation import validate_cli
    args = validate_cli(parser, parser.parse_args())
    return run(args)


@monitor_daemon('aperta', enabled=lambda args: not (args.status or args.flush_unsharded))
def run(args):

    ledger = ApertaLedger(db_path=args.db_path)
    checkpoint = current_checkpoint(f"aperta:{os.path.abspath(args.db_path)}:{args.metadata_prefix}:oai") if args.method == 'oai' and not args.dry_run and not (args.status or args.flush_unsharded) else None

    if args.status:
        stats = ledger.get_stats()
        print("\n=== TUBITAK ULAKBIM Aperta Repository Status ===")
        print(f"Total Records in Ledger: {stats['total_records']:,}")
        print(f"Indexed (Unsharded):     {stats['indexed_records']:,}")
        print(f"Sharded into Parquet:    {stats['sharded_records']:,}")
        print(f"Total Attached Files:    {stats['total_files']:,} ({stats['total_bytes'] / (1024**3):.2f} GB)")
        print(f"Parquet Shards Sealed:   {stats['total_shards']} ({stats['shard_bytes'] / (1024**2):.2f} MB)")
        print(f"Last OAI Cursor:         {stats['harvest_cursor']:,} / {stats['harvest_total']:,}")
        print(f"Resumption Token:        {stats['resumption_token'] or 'None (Clean Start)'}")
        print("================================================\n")
        return

    cleaner = ApertaCleaner()
    downloader = ApertaDownloader()

    # Setup Drive Sync
    drive_sync = None
    if args.sync_drive and not args.dry_run:
        drive_sync = ApertaDriveSync()

    # Track sharded records for ledger callback
    active_batch_ids: List[str] = []

    def on_shard_sealed(shard_info: Dict[str, Any]) -> None:
        shard_path = shard_info.get("file_path") or shard_info.get("local_path")
        shard_name = shard_info["shard_name"]
        rec_count = shard_info["record_count"]
        byte_sz = shard_info["byte_size"]
        log(f"Sealed Parquet Shard: {shard_name} ({rec_count} records, {byte_sz / (1024*1024):.2f} MB)")

        if not args.dry_run:
            ledger.register_shard(
                shard_name=shard_name,
                part_index=shard_info["part_index"],
                record_count=rec_count,
                byte_size=byte_sz,
                sha256=shard_info["sha256"],
                md5=shard_info["md5"],
            )
            if active_batch_ids:
                ledger.mark_sharded(active_batch_ids, shard_name)
                active_batch_ids.clear()

            if drive_sync and getattr(args, "async_upload", False):
                def uploaded(result):
                    ledger.mark_shard_uploaded(shard_name, result["file_id"], result["md5"])
                def failed(error):
                    ledger.mark_shard_failed(shard_name)
                    log(f"Queued upload deferred: {type(error).__name__}", level="WARN")
                drive_sync.upload_async(shard_path, drive_sync.get_aperta_folder_id(),
                                        on_success=uploaded, on_failure=failed)
            elif drive_sync:
                try:
                    log(f"Syncing shard to Google Drive (Aperta/): {shard_name}...")
                    upload_res = drive_sync.sync_shard(shard_path, purge_on_success=True)
                    if upload_res.get("file_id"):
                        ledger.mark_shard_uploaded(
                            shard_name=shard_name,
                            drive_file_id=upload_res["file_id"],
                            verified_md5=upload_res.get("md5"),
                        )
                        log(f"Shard uploaded & verified: {shard_name} (Drive ID: {upload_res['file_id']})")
                except EvidenceWriteError:
                    raise
                except Exception as ex:
                    report_producer_error(ex)
                    log(f"Drive upload failed for {shard_name}: {ex}", level="WARN")

    sharder = ApertaParquetSharder(
        output_dir=args.output_dir,
        max_part_bytes=args.shard_size_mb * 1024 * 1024,
        max_part_entries=args.max_shard_records,
        batch_size=args.batch_size,
        start_part_idx=next_part_index(args.output_dir, 'aperta', ledger.get_next_part_index()),
        on_shard_completed=on_shard_sealed,
    )

    if args.flush_unsharded:
        log("Flushing unsharded records from ledger into Parquet...")
        unsharded = ledger.get_unsharded_records(limit=args.max_records or 100000)
        log(f"Found {len(unsharded)} unsharded records.")
        for r in unsharded:
            active_batch_ids.append(str(r["id"]))
            sharder.append_record(r)
        sealed = sharder.close()
        log(f"Flush completed. Sealed {len(sealed)} shards.")
        return

    # Determine starting token for OAI
    if checkpoint:
        while True:
            recovered = ledger.get_unsharded_records(limit=min(max(args.max_shard_records or 50000, 1), 50000))
            if not recovered:
                break
            for record in recovered:
                active_batch_ids.append(str(record['id']))
                sharder.append_record(record)
            sharder.close_shard()
    token = args.resumption_token
    if checkpoint and token is None:
        token = (checkpoint.state['state_payload'].get('cursor') or {}).get('oai_token')
    if not token and args.auto_resume:
        token_info = ledger.get_resumption_token()
        if token_info and token_info.get("token"):
            token = token_info["token"]
            log(f"Resuming harvest from SQLite checkpoint: cursor {token_info['cursor']:,} / {token_info['total']:,}")

    log(f"Starting Aperta harvest. Method={args.method.upper()}, MaxRecords={args.max_records or 'unlimited'}")

    records_processed = 0
    records_indexed = 0
    start_time = time.time()
    snapshot_finished = False
    stopper = current_stopper()
    try:
        if args.method == "oai":
            current_token = token
            while True:
                if stopper and stopper.should_stop()[0]:
                    break
                try:
                    records, next_token, cursor, total = downloader.fetch_oai_page(
                        resumption_token=current_token,
                        metadata_prefix=args.metadata_prefix,
                    )
                except EvidenceWriteError:
                    raise
                except Exception as ex:
                    report_producer_error(ex)
                    if "422" in str(ex) and current_token:
                        log(f"Resumption token expired or invalid (HTTP 422). Resetting checkpoint to restart clean.", level="WARN")
                        ledger.save_resumption_token(None, cursor=0, total=0)
                        current_token = None
                        time.sleep(2.0)
                        continue
                    raise

                if not records:
                    log("No records returned from OAI-PMH endpoint.")
                    break


                batch_cleaned: List[Dict[str, Any]] = []
                for raw_rec in records:
                    cleaned = cleaner.clean_record(raw_rec)
                    records_processed += 1
                    if cleaned:
                        batch_cleaned.append(cleaned)
                    elif stopper:
                        stopper.record_error()

                if batch_cleaned and not args.dry_run:
                    ledger.upsert_records(batch_cleaned)
                    records_indexed += len(batch_cleaned)
                    for r in batch_cleaned:
                        active_batch_ids.append(str(r["id"]))
                        record_output(r, getattr(downloader, "raw_evidence", None))
                        sharder.append_record(r)

                if stopper:
                    stopper.record_processed(len(records))
                if not args.dry_run:
                    ledger.save_resumption_token(next_token, cursor=cursor, total=total)
                    if checkpoint:
                        checkpoint.advance({'oai_token': next_token, 'records': cursor,
                                            'total': total})

                elapsed = time.time() - start_time
                rate = records_processed / elapsed if elapsed > 0 else 0
                log(f"Harvested {records_processed:,} records (indexed: {records_indexed:,}, cursor: {cursor:,}/{total:,}, rate: {rate:.1f} rec/s)")

                if 0 < args.max_records <= records_processed:
                    log(f"Reached max records limit ({args.max_records}). Stopping harvest.")
                    break

                if not next_token:
                    log("Reached end of OAI-PMH repository (no further resumptionToken).")
                    snapshot_finished = True
                    break

                current_token = next_token

        elif args.method == "rest":
            page = 1
            page_size = min(100, args.batch_size)
            while True:
                if stopper and stopper.should_stop()[0]:
                    break
                res = downloader.search_rest(query=args.query, page=page, size=page_size)
                hits_obj = res.get("hits", {})
                hits = hits_obj.get("hits", [])
                total = hits_obj.get("total", 0)

                if not hits:
                    log("No hits returned from REST search.")
                    break

                batch_cleaned = []
                for raw_hit in hits:
                    cleaned = cleaner.clean_record(raw_hit)
                    records_processed += 1
                    if cleaned:
                        batch_cleaned.append(cleaned)
                    elif stopper:
                        stopper.record_error()

                if batch_cleaned and not args.dry_run:
                    ledger.upsert_records(batch_cleaned)
                    records_indexed += len(batch_cleaned)
                    for r in batch_cleaned:
                        active_batch_ids.append(str(r["id"]))
                        record_output(r, getattr(downloader, "raw_evidence", None))
                        sharder.append_record(r)

                if stopper:
                    stopper.record_processed(len(hits))
                elapsed = time.time() - start_time
                rate = records_processed / elapsed if elapsed > 0 else 0
                log(f"REST page {page}: processed {records_processed:,} records (total hits: {total:,}, rate: {rate:.1f} rec/s)")

                if 0 < args.max_records <= records_processed:
                    break

                if page * page_size >= total or page >= 1000:
                    break
                page += 1

    except KeyboardInterrupt:
        log("Harvest interrupted by user signal. Finalizing...", level="WARN")
    finally:
        if not args.dry_run:
            final_shards = sharder.close()
            if final_shards:
                log(f"Closed final {len(final_shards)} Parquet shards.")
            if drive_sync and getattr(args, "async_upload", False):
                drive_sync.close_uploads()
            if checkpoint and snapshot_finished:
                checkpoint.complete()
        elapsed = time.time() - start_time
        log(f"Aperta pipeline finished. Total records: {records_processed:,}, Indexed: {records_indexed:,}, Elapsed: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
