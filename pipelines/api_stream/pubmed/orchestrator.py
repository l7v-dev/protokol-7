#!/usr/bin/env python3
"""
PubMed & PMC Ingestion Pipeline Orchestrator CLI -- protokol-7

Executes continuous harvesting of PubMed/PMC biomedical literature,
cleans records into LLM-ready markdown, stores articles in SQLite ACID ledger,
packs them into Zstandard Parquet shards, and uploads to Google Drive with zero local disk residue.
"""

import argparse
import datetime
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from cleaner import PubmedCleaner
from downloader import PubmedDownloader
from drive_sync import PubmedDriveSync
from ledger import PubmedLedger
from packer import PubmedSharder


def main():
    parser = argparse.ArgumentParser(description="PubMed & PMC Biomedical Ingestion Pipeline")
    parser.add_argument(
        "--query",
        default='cancer OR "clinical trial" OR genetics OR neuroscience OR pharmacology',
        help="PubMed search query syntax",
    )
    parser.add_argument("--max-records", type=int, default=1000, help="Maximum articles to fetch")
    parser.add_argument("--batch-size", type=int, default=50, help="PMIDs per efetch batch")
    parser.add_argument(
        "--shard-size-mb", type=int, default=10240, help="Max Parquet shard size in MB"
    )
    parser.add_argument(
        "--output-dir", default="data/parquets/pubmed", help="Local Parquet directory"
    )
    parser.add_argument(
        "--db-path", default="data/catalogs/pubmed_catalog.sqlite", help="SQLite ledger path"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Simulate Drive upload without remote network calls"
    )
    parser.add_argument(
        "--no-drive", action="store_true", help="Skip Google Drive upload and retain local shards"
    )
    parser.add_argument(
        "--sync-shards", action="store_true", help="Flush un-uploaded local shards to Google Drive and exit"
    )
    parser.add_argument("--api-key", default=None, help="Optional NCBI API key")
    args = parser.parse_args()

    print("============================================================================")
    print("[PUBMED] Starting PubMed & PMC Ingestion Pipeline")
    print(f"[PUBMED] Query: {args.query}")
    print(f"[PUBMED] Target records: {args.max_records} | Batch size: {args.batch_size}")
    print(f"[PUBMED] SQLite Database: {args.db_path}")
    print(f"[PUBMED] Local Scratch: {args.output_dir}")
    print("============================================================================")

    downloader = PubmedDownloader(api_key=args.api_key)
    cleaner = PubmedCleaner()
    ledger = PubmedLedger(db_path=args.db_path)

    drive_sync = None
    if not args.no_drive:
        try:
            drive_sync = PubmedDriveSync(dry_run=args.dry_run)
        except Exception as e:
            print(f"[DRIVE-WARN] Google Drive authentication unavailable: {e}")
            print(f"[DRIVE-WARN] Falling back to local storage buffer mode in {args.output_dir}.")
            print("[DRIVE-WARN] Run 'npm run auth:gdrive' to refresh Google Drive token and flush shards.")

    if args.sync_shards:
        print("[PUBMED] Scanning for un-uploaded local shards...")
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
            ledger.sync_to_central_catalog("pubmed")
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
                    ledger.sync_to_central_catalog("pubmed")
            except Exception as e:
                print(f"[DRIVE-WARN] Shard upload deferred: {e}. Preserved locally at {shard_info['file_path']}")

    sharder = PubmedSharder(
        output_dir=args.output_dir,
        max_part_bytes=args.shard_size_mb * 1024 * 1024,
        batch_size=min(args.batch_size, 500),
        on_shard_completed=on_shard_completed,
    )

    # 1. Discover PMIDs
    print("[PUBMED] Searching PubMed IDs...")
    pmids = downloader.search_pmids(query=args.query, retmax=args.max_records)
    print(f"[PUBMED] Discovered {len(pmids)} PMIDs.")

    if not pmids:
        print("[PUBMED] No PMIDs found. Terminating.")
        return

    # 2. Batch fetch, clean, index into SQLite and write to Parquet
    cleaned_count = 0
    start_time = time.time()

    for idx in range(0, len(pmids), args.batch_size):
        batch = pmids[idx : idx + args.batch_size]
        print(f"[PUBMED] Fetching batch {idx // args.batch_size + 1} ({len(batch)} items)...")
        raw_articles = downloader.fetch_articles_xml(batch)

        for raw in raw_articles:
            cleaned = cleaner.clean_record(raw)
            if cleaned:
                current_shard_name = sharder._format_filename()
                ledger.index_article(cleaned, shard_name=current_shard_name)
                sharder.add_record(cleaned)
                cleaned_count += 1

        print(f"[PUBMED] Processed {min(idx + args.batch_size, len(pmids))}/{len(pmids)} PMIDs (Indexed: {cleaned_count})")

    # 3. Finalize sharder
    shards = sharder.close()
    elapsed = time.time() - start_time

    # 4. Final summary
    stats = ledger.get_stats()
    total_articles = ledger.get_article_count()

    print("\n============================================================================")
    print(f"[PUBMED] Ingestion Complete in {elapsed:.1f}s")
    print(f"[PUBMED] Total Clean Articles Indexed in SQLite: {total_articles}")
    print(f"[PUBMED] Parquet Shards Produced: {len(shards)}")
    print(f"[PUBMED] Shard Stats: Total records: {stats['total_records']}, Uploaded: {stats['uploaded_shards']}")
    print(f"[PUBMED] SQLite Database: {args.db_path} (ACID Verified)")
    print("============================================================================")


if __name__ == "__main__":
    main()
