#!/usr/bin/env python3
"""
DergiPark Full-Text PDF Extraction Orchestrator CLI -- protokol-7

Fetches open-access academic article PDFs from TÜBİTAK ULAKBİM DergiPark,
resolves landing page URLs to direct article-file download streams,
extracts full text with PyMuPDF, and formats text into LLM-ready markdown.

Streams extracted articles into Zstandard-compressed Parquet shards and
syncs completed shards to Google Drive with zero local disk residue.
"""

import argparse
import concurrent.futures
import datetime
import os
import sys
import threading
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from drive_sync import DergiParkDriveSync
from fulltext_packer import DergiParkFulltextSharder
from ledger import DergiParkLedger
from pdf_extractor import DergiParkPdfExtractor, ThreadSafeRateLimiter


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
        default=4,
        help="Number of concurrent worker threads (default: 4)",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=0.35,
        help="Minimum seconds between requests across all workers (default: 0.35s)",
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
        help="Flush un-uploaded local fulltext shards to Google Drive and exit",
    )
    args = parser.parse_args()

    ledger = DergiParkLedger(db_path=args.db_path)

    if args.status:
        print_status_report(ledger)
        return

    drive_sync = None
    if not args.no_drive:
        try:
            drive_sync = DergiParkDriveSync(subfolder_name="DergiPark", dry_run=args.dry_run)
        except Exception as e:
            print(f"[DRIVE-WARN] Google Drive authentication unavailable: {e}", flush=True)
            print(f"[DRIVE-WARN] Falling back to local storage buffer mode in {args.output_dir}.", flush=True)
            print("[DRIVE-WARN] Run 'npm run auth:gdrive' to refresh Google Drive token and flush shards.", flush=True)

    if args.sync_shards:
        print("[DERGIPARK-FULLTEXT] Scanning for un-uploaded local fulltext shards...", flush=True)
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
            ledger.sync_to_central_catalog("dergipark_fulltext")
        print(f"[DRIVE-SYNC] Flushed {uploaded_count} fulltext shards to Google Drive.", flush=True)
        return

    # Shard completion callback
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
                    f"[DRIVE-WARN] Shard upload deferred: {e}. Preserved locally at {shard_info['file_path']}",
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

    rate_limiter = ThreadSafeRateLimiter(min_interval=args.rate_limit)
    extractor = DergiParkPdfExtractor(rate_limiter=rate_limiter)

    max_target = args.max_articles if args.max_articles > 0 else None
    max_desc = f"{max_target:,}" if max_target else "UNLIMITED"

    print("============================================================================", flush=True)
    print("[DERGIPARK-FULLTEXT] Starting TÜBİTAK ULAKBİM DergiPark Full-Text Extraction", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Target articles: {max_desc} | Batch size: {args.batch_size}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Workers: {args.workers} | Rate limit: {args.rate_limit}s/req", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Shard threshold: {args.shard_size_mb} MB | Max shard entries: {args.max_shard_records}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Starting shard index: p{start_part:05d}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] SQLite Database: {args.db_path}", flush=True)
    print(f"[DERGIPARK-FULLTEXT] Local Scratch: {args.output_dir}", flush=True)
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

    try:
        while True:
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
                            )
                            total_extracted += 1
                            total_chars += c_cnt
                            total_pages += p_cnt
                        else:
                            ledger.mark_pdf_failed(
                                article_id=art_id,
                                status=status,
                                pdf_url=res.get("pdf_url"),
                            )
                            total_failed += 1

                    if total_processed % 10 == 0 or total_processed == max_target:
                        elapsed = time.time() - t0
                        speed = total_processed / elapsed if elapsed > 0 else 0
                        print(
                            f"[DERGIPARK-FULLTEXT] Processed {total_processed} articles "
                            f"({total_extracted} extracted, {total_failed} non-extractable) | "
                            f"{speed:.1f} art/s | Current Shard: {sharder.current_shard_name}",
                            flush=True,
                        )

            if max_target and total_processed >= max_target:
                print(f"[DERGIPARK-FULLTEXT] Reached target limit ({max_target}). Stopping.", flush=True)
                break

        sharder.close()
        ledger.sync_to_central_catalog("dergipark_fulltext")

    except KeyboardInterrupt:
        print("\n[DERGIPARK-FULLTEXT] Process interrupted by operator. Finalizing open shards...", flush=True)
        sharder.close()
        ledger.sync_to_central_catalog("dergipark_fulltext")

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
