#!/usr/bin/env python3
"""
DergiPark Full-Text PDF Extraction Orchestrator CLI -- protokol-7

Fetches open-access academic article PDFs from TÜBİTAK ULAKBİM DergiPark,
resolves landing page URLs to direct article-file download streams,
extracts full text with PyMuPDF, and formats text into LLM-ready markdown.

Packages extracted articles into Zstandard-compressed Parquet shards,
packages original raw PDF binaries into WebDataset/Cold Vault TAR.GZ shards,
and streams completed shards to Google Drive with zero local disk residue.
"""

import argparse
import concurrent.futures
import datetime
import os
import signal
import sys
import threading
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from drive_sync import DergiParkDriveSync
from fulltext_packer import DergiParkFulltextSharder
from ledger import DergiParkLedger
from pdf_extractor import DergiParkPdfExtractor, ThreadSafeRateLimiter
from pdf_tar_packer import DergiParkPdfTarSharder


def print_status_report(ledger: DergiParkLedger) -> None:
    """Displays current PDF extraction statistics from SQLite catalog."""
    total_articles = ledger.get_article_count()
    stats = ledger.get_pdf_stats()

    print("============================================================================", flush=True)
    print("[DERGIPARK-FULLTEXT] Extraction Status Report", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Total articles in SQLite catalog: {total_articles:,}", flush=True)
    print("============================================================================", flush=True)

    extracted = stats.get("extracted", 0)
    pending = stats.get("pending", 0)
    failed = stats.get("failed", 0)
    scanned = stats.get("scanned_or_sparse", 0)
    too_large = stats.get("too_large", 0)
    no_url = stats.get("no_url", 0)

    print(f"{'Status':<25} {'Count':<12} {'Percentage'}", flush=True)
    print("-" * 55, flush=True)
    for st, count in sorted(stats.items(), key=lambda x: x[1], reverse=True):
        pct = (count / total_articles * 100) if total_articles > 0 else 0
        print(f"{st:<25} {count:<12,} {pct:6.2f}%", flush=True)
    print("=" * 55, flush=True)
    print(
        f"Summary: {extracted:,} extracted, {pending:,} pending, "
        f"{failed + scanned + too_large + no_url:,} non-extractable / failed.",
        flush=True,
    )
    print("=" * 55, flush=True)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    parser = argparse.ArgumentParser(
        description="TÜBİTAK ULAKBİM DergiPark Full-Text PDF Extraction Orchestrator"
    )
    parser.add_argument(
        "--max-articles",
        type=int,
        default=0,
        help="Maximum articles to extract (default: 0 for unlimited / until queue is empty)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of pending articles to fetch from SQLite per batch (default: 50)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=2,
        help="Number of concurrent worker threads (default: 2)",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=1.15,
        help="Minimum seconds between requests across all workers (default: 1.15s)",
    )
    parser.add_argument(
        "--shard-size-mb",
        type=int,
        default=512,
        help="Max Parquet shard size in MB before rotation (default: 512)",
    )
    parser.add_argument(
        "--max-shard-records",
        type=int,
        default=2000,
        help="Max full-text articles per Parquet shard before rotation (default: 2000)",
    )
    parser.add_argument(
        "--output-dir",
        default="data/parquets/dergipark/fulltext",
        help="Local Parquet scratch directory (default: data/parquets/dergipark/fulltext)",
    )
    parser.add_argument(
        "--no-archive-pdfs",
        action="store_true",
        help="Disable archiving raw PDF binaries to TAR.GZ shards",
    )
    parser.add_argument(
        "--pdf-archive-dir",
        default="data/raw_archives/dergipark/pdfs",
        help="Local scratch directory for raw PDF TAR.GZ shards",
    )
    parser.add_argument(
        "--pdf-archive-gb",
        type=float,
        default=10.0,
        help="Target size in GB for raw PDF TAR.GZ archive shards (default: 10.0, tolerant range 10.0 - 50.0)",
    )
    parser.add_argument(
        "--max-pdf-archive-gb",
        type=float,
        default=51.0,
        help="Maximum tolerant boundary in GB before hard shard rotation (default: 51.0)",
    )
    parser.add_argument(
        "--min-free-disk-gb",
        type=float,
        default=25.0,
        help="Local disk headroom safety guard in GB before early flush/eviction (default: 25.0)",
    )
    parser.add_argument(
        "--max-pdf-archive-records",
        type=int,
        default=None,
        help="Optional max PDF entries per shard before rotation (default: None, unconstrained)",
    )
    parser.add_argument(
        "--max-pdf-archive-mb",
        type=int,
        default=None,
        help="Deprecated: Max uncompressed MB per raw PDF TAR.GZ shard before rotation",
    )
    parser.add_argument(
        "--db-path",
        default="data/catalogs/dergipark_catalog.sqlite",
        help="SQLite ledger path",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print PDF extraction status report and exit",
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
        help="Flush un-uploaded local fulltext shards and PDF archives to Google Drive and exit",
    )
    args = parser.parse_args()

    ledger = DergiParkLedger(db_path=args.db_path)

    if args.status:
        print_status_report(ledger)
        return

    drive_sync = None
    pdf_drive_folder_id = None
    if not args.no_drive:
        try:
            drive_sync = DergiParkDriveSync(subfolder_name="DergiPark", dry_run=args.dry_run)
            dergipark_root_fid = drive_sync.get_dergipark_folder_id()
            pdf_drive_folder_id = drive_sync.get_or_create_subfolder("pdfs", parent_id=dergipark_root_fid)
        except Exception as e:
            print(f"[DRIVE-WARN] Google Drive authentication unavailable: {e}", flush=True)
            print(f"[DRIVE-WARN] Falling back to local storage buffer mode.", flush=True)
            print("[DRIVE-WARN] Run 'npm run auth:gdrive' to refresh Google Drive token and flush shards.", flush=True)

    if args.sync_shards:
        print("[DERGIPARK-FULLTEXT] Scanning for un-uploaded local fulltext and PDF shards...", flush=True)
        if not drive_sync:
            print("[ERROR] Cannot sync shards without active Google Drive authentication.", flush=True)
            sys.exit(1)
        uploaded_count = 0

        # 1. Sync Parquet shards
        if os.path.exists(args.output_dir):
            for fname in sorted(os.listdir(args.output_dir)):
                if fname.endswith(".parquet"):
                    fpath = os.path.join(args.output_dir, fname)
                    print(f"[DRIVE-SYNC] Uploading Parquet {fname} to Drive...", flush=True)
                    res = drive_sync.sync_shard(fpath, purge_on_success=True)
                    fid = res.get("file_id") or ""
                    vmd5 = res.get("md5")
                    if fid:
                        ledger.mark_shard_uploaded(fname, drive_file_id=fid, verified_md5=vmd5)
                        uploaded_count += 1
            ledger.sync_to_central_catalog("dergipark_fulltext")

        # 2. Sync PDF TAR archives
        if os.path.exists(args.pdf_archive_dir) and pdf_drive_folder_id:
            for fname in sorted(os.listdir(args.pdf_archive_dir)):
                if fname.endswith(".tar.gz") or fname.endswith(".tar"):
                    fpath = os.path.join(args.pdf_archive_dir, fname)
                    print(f"[DRIVE-SYNC] Uploading PDF archive {fname} to Drive (pdfs/)...", flush=True)
                    res = drive_sync.upload_file(
                        local_path=fpath,
                        target_folder_id=pdf_drive_folder_id,
                        purge_on_success=True,
                        verify_md5=True,
                    )
                    fid = res.get("file_id") or ""
                    vmd5 = res.get("md5")
                    if fid:
                        ledger.mark_shard_uploaded(fname, drive_file_id=fid, verified_md5=vmd5)
                        uploaded_count += 1
            ledger.sync_to_central_catalog("dergipark_raw_pdfs")

        print(f"[DRIVE-SYNC] Flushed {uploaded_count} total shards to Google Drive.", flush=True)
        return

    # Shard completion callback for Parquet full-text
    def on_shard_completed(shard_info: Dict[str, Any]) -> None:
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
                    ledger.sync_to_central_catalog("dergipark_fulltext")
            except Exception as e:
                print(
                    f"[DRIVE-WARN] Parquet shard upload deferred: {e}. Preserved locally at {shard_info['file_path']}",
                    flush=True,
                )

    # Shard completion callback for raw PDF TAR archives
    def on_pdf_shard_completed(shard_info: Dict[str, Any]) -> None:
        ledger.register_shard(
            shard_name=shard_info["shard_name"],
            part_index=shard_info["part_index"],
            record_count=shard_info["record_count"],
            byte_size=shard_info["byte_size"],
            sha256=shard_info["sha256"],
            md5=shard_info["md5"],
        )
        if drive_sync and pdf_drive_folder_id:
            try:
                sync_res = drive_sync.upload_file(
                    local_path=shard_info["file_path"],
                    target_folder_id=pdf_drive_folder_id,
                    purge_on_success=True,
                    verify_md5=True,
                )
                file_id = sync_res.get("file_id") or ""
                verified_md5 = sync_res.get("md5")
                if file_id:
                    ledger.mark_shard_uploaded(
                        shard_name=shard_info["shard_name"],
                        drive_file_id=file_id,
                        verified_md5=verified_md5,
                    )
                    ledger.sync_to_central_catalog("dergipark_raw_pdfs")
            except Exception as e:
                print(
                    f"[DRIVE-WARN] PDF archive upload deferred: {e}. Preserved locally at {shard_info['file_path']}",
                    flush=True,
                )

    start_part = ledger.get_next_fulltext_part_index()
    sharder = DergiParkFulltextSharder(
        output_dir=args.output_dir,
        filename_prefix="dergipark_fulltext",
        max_part_bytes=args.shard_size_mb * 1024 * 1024,
        max_part_entries=args.max_shard_records,
        batch_size=min(args.batch_size, 500),
        start_part_idx=start_part,
        on_shard_completed=on_shard_completed,
    )

    target_pdf_gb = args.pdf_archive_gb
    if args.max_pdf_archive_mb is not None and args.max_pdf_archive_mb > 0:
        target_pdf_gb = args.max_pdf_archive_mb / 1024.0

    pdf_tar_sharder = None
    if not args.no_archive_pdfs:
        start_archive_part = ledger.get_next_pdf_archive_part_index()
        pdf_tar_sharder = DergiParkPdfTarSharder(
            output_dir=args.pdf_archive_dir,
            filename_prefix="dergipark_raw_pdfs",
            target_gb=target_pdf_gb,
            max_gb=args.max_pdf_archive_gb,
            min_free_disk_gb=args.min_free_disk_gb,
            max_part_entries=args.max_pdf_archive_records,
            start_part_idx=start_archive_part,
            on_shard_completed=on_pdf_shard_completed,
        )

    rate_limiter = ThreadSafeRateLimiter(min_interval=args.rate_limit)
    extractor = DergiParkPdfExtractor(rate_limiter=rate_limiter)

    max_target = args.max_articles if args.max_articles > 0 else None
    max_desc = f"{max_target:,}" if max_target else "UNLIMITED"

    print("============================================================================", flush=True)
    print("[DERGIPARK-FULLTEXT] Starting TÜBİTAK ULAKBİM DergiPark Full-Text Extraction", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Target articles: {max_desc} | Batch size: {args.batch_size}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Workers: {args.workers} | Rate limit: {args.rate_limit}s/req", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Parquet Shard: {args.shard_size_mb} MB | Max entries: {args.max_shard_records}", flush=True)
    if pdf_tar_sharder:
        rec_desc = f"{args.max_pdf_archive_records}" if args.max_pdf_archive_records else "None (Size-driven)"
        print(f"[DERGIPARK-FULLTEXT] PDF Archive: target {target_pdf_gb:.1f} GB (max {args.max_pdf_archive_gb:.1f} GB, min free disk: {args.min_free_disk_gb:.1f} GB, max entries: {rec_desc})", flush=True)
        print(f"[DERGIPARK-FULLTEXT] PDF Archive Directory: {args.pdf_archive_dir}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Starting shard index: p{start_part:05d}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] SQLite Database: {args.db_path}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Parquet Scratch: {args.output_dir}", flush=True)
    print("============================================================================", flush=True)

    t0 = time.time()
    total_processed = 0
    total_extracted = 0
    total_failed = 0
    total_chars = 0
    total_pages = 0

    write_lock = threading.Lock()

    def process_item(item: Dict[str, Any]) -> Dict[str, Any]:
        return extractor.process_article(item)

    shutdown_requested = False

    def handle_signal(sig, frame):
        nonlocal shutdown_requested
        sig_name = "SIGTERM" if sig == signal.SIGTERM else "SIGINT"
        print(f"\n[DERGIPARK-FULLTEXT] Received {sig_name}. Gracefully completing batch and closing shards...", flush=True)
        shutdown_requested = True

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        while True:
            if shutdown_requested:
                print("[DERGIPARK-FULLTEXT] Shutdown requested. Halting article loop...", flush=True)
                break

            remaining = (max_target - total_processed) if max_target else args.batch_size
            if remaining <= 0:
                break

            current_batch_limit = min(args.batch_size, remaining)
            batch = ledger.get_pending_pdf_articles(limit=current_batch_limit)
            if not batch:
                print("[DERGIPARK-FULLTEXT] No more pending articles found in catalog.", flush=True)
                break

            with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
                future_to_article = {executor.submit(process_item, art): art for art in batch}

                for future in concurrent.futures.as_completed(future_to_article):
                    orig_art = future_to_article[future]
                    try:
                        res = future.result()
                    except Exception as exc:
                        res = {
                            "id": orig_art.get("id"),
                            "status": "failed",
                            "error": str(exc),
                        }

                    total_processed += 1
                    status = res.get("status", "failed")
                    art_id = res.get("id") or orig_art.get("id")

                    with write_lock:
                        if status == "extracted":
                            current_shard = sharder.current_shard_name
                            sharder.append_article_fulltext(res)

                            archive_name = None
                            if pdf_tar_sharder and res.get("pdf_bytes"):
                                archive_name = pdf_tar_sharder.append_pdf(art_id, res["pdf_bytes"])

                            p_cnt = res.get("page_count", 0)
                            c_cnt = res.get("char_count", 0)
                            w_cnt = res.get("word_count", 0)
                            pdf_u = res.get("pdf_url") or ""

                            ledger.mark_pdf_extracted(
                                article_id=art_id,
                                pdf_url=pdf_u,
                                page_count=p_cnt,
                                char_count=c_cnt,
                                word_count=w_cnt,
                                shard_name=current_shard,
                                archive_name=archive_name,
                            )
                            total_extracted += 1
                            total_chars += c_cnt
                            total_pages += p_cnt
                        else:
                            err_msg = str(res.get("error") or "")
                            status_str = str(status or "")
                            # Rate limits and server busy timeouts are transient (retry later)
                            is_transient = "429" in err_msg or "429" in status_str or "503" in err_msg or "timed out" in err_msg
                            if not is_transient:
                                fail_reason = status if status not in ("failed", None, "") else (err_msg or "failed")
                                ledger.mark_pdf_failed(
                                    article_id=art_id,
                                    status=fail_reason,
                                    pdf_url=res.get("pdf_url"),
                                )
                                total_failed += 1
                            else:
                                if "429" in err_msg or "429" in status_str:
                                    print(f"[DERGIPARK-RATE] Received HTTP 429 rate limit. Cooling down 6s...", flush=True)
                                    time.sleep(6.0)


                    if total_processed % 10 == 0 or total_processed == max_target:
                        elapsed = time.time() - t0
                        speed = total_processed / elapsed if elapsed > 0 else 0
                        archive_str = f" | Archive: {pdf_tar_sharder.current_shard_name}" if pdf_tar_sharder else ""
                        print(
                            f"[DERGIPARK-FULLTEXT] Processed {total_processed} articles "
                            f"({total_extracted} extracted, {total_failed} non-extractable) | "
                            f"{speed:.1f} art/s | Current Shard: {sharder.current_shard_name}{archive_str}",
                            flush=True,
                        )

            if max_target and total_processed >= max_target:
                print(f"[DERGIPARK-FULLTEXT] Reached target limit ({max_target}). Stopping.", flush=True)
                break

    except KeyboardInterrupt:
        print("\n[DERGIPARK-FULLTEXT] Process interrupted by operator.", flush=True)
    finally:
        print("[DERGIPARK-FULLTEXT] Finalizing active shards and syncing central catalog...", flush=True)
        sharder.close()
        if pdf_tar_sharder:
            pdf_tar_sharder.close()
        ledger.sync_to_central_catalog("dergipark_fulltext")
        if pdf_tar_sharder:
            ledger.sync_to_central_catalog("dergipark_raw_pdfs")

    total_time = time.time() - t0
    print("============================================================================", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Extraction Session Complete in {total_time:.1f}s", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Total articles processed: {total_processed:,}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Successfully extracted: {total_extracted:,}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Non-extractable / Failed: {total_failed:,}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Total pages extracted: {total_pages:,}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Total characters: {total_chars:,}", flush=True)
    print("============================================================================", flush=True)


if __name__ == "__main__":
    main()
