#!/usr/bin/env python3
import argparse
import os
import sys
import time
from typing import Optional, Dict, Any

from downloader import download_file, fetch_expected_md5, verify_file_md5, find_fastest_wikimedia_mirror
from cleaner import stream_articles, stream_remote_articles
from packer import StreamingParquetSharder
from drive_queue import GoogleDriveSequentialSyncQueue
from metadata_db import MetadataDB


def parse_args():
    parser = argparse.ArgumentParser(
        description="Headless Wikipedia Dump -> Clean Text -> Parquet (ZSTD) -> Sequential Google Drive Sync"
    )
    parser.add_argument(
        "--lang",
        default="tr",
        help="Wikipedia language code (default: tr, e.g. az, uz, kk, en)",
    )
    parser.add_argument(
        "--dump-url",
        default=None,
        help="Wikimedia XML bz2 dump URL (auto-derived from --lang if omitted)",
    )
    parser.add_argument(
        "--md5-url",
        default=None,
        help="Wikimedia official md5sums.txt URL (auto-derived from --lang if omitted)",
    )
    parser.add_argument(
        "--dump-file",
        default=None,
        help="Local file path for downloaded dump (auto-derived from --lang if omitted)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory to store intermediate Parquet shards (auto-derived from --lang if omitted)",
    )
    parser.add_argument(
        "--max-part-gb",
        type=float,
        default=10.0,
        help="Maximum size per Parquet part in GB (default: 10.0 GB)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10000,
        help="Number of articles to buffer in RAM before flushing row group to disk (default: 10000)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit total articles processed (useful for testing)",
    )
    parser.add_argument(
        "--credentials",
        default=None,
        help="Path to Google credentials.json (OAuth) or service_account.json",
    )
    parser.add_argument(
        "--token",
        default="token.json",
        help="Path to save/load OAuth token",
    )
    parser.add_argument(
        "--folder-id",
        default=None,
        help="Google Drive Target Folder ID",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip downloading dump if file already exists locally",
    )
    parser.add_argument(
        "--clean-dump",
        action="store_true",
        help="Delete local raw XML bz2 dump after pipeline finishes",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate Google Drive sync and test hash validation/cleanup locally without external API",
    )
    parser.add_argument(
        "--in-flight",
        action="store_true",
        help="Zero-Raw In-Flight Streaming: Stream and clean remote bz2 directly to Parquet without downloading dump to disk",
    )
    parser.add_argument(
        "--fastest-mirror",
        action="store_true",
        help="Probe and select fastest Wikimedia mirror before downloading/streaming",
    )
    return parser.parse_args()


WIKIMEDIA_DBNAME_OVERRIDES = {
    "lzh": "zh_classicalwiki",
    "be-tarask": "be_x_oldwiki",
    "nan": "zh_min_nanwiki",
    "yue": "zh_yuewiki",
    "cbk-zam": "cbk_zamwiki",
    "map-bms": "map_bmswiki",
    "nds-nl": "nds_nlwiki",
    "roa-tara": "roa_tarawiki",
    "rup": "roa_rupwiki",
    "sgs": "bat_smgwiki",
    "vro": "fiu_vrowiki",
    "gsw": "alswiki",
}


def execute_pipeline(
    lang: str = "tr",
    dump_url: Optional[str] = None,
    md5_url: Optional[str] = None,
    dump_file: Optional[str] = None,
    output_dir: Optional[str] = None,
    max_part_gb: float = 10.0,
    batch_size: int = 10000,
    limit: Optional[int] = None,
    credentials: Optional[str] = None,
    token: str = "token.json",
    folder_id: Optional[str] = None,
    skip_download: bool = False,
    clean_dump: bool = False,
    dry_run: bool = False,
    in_flight: bool = False,
    fastest_mirror: bool = False,
) -> Dict[str, Any]:
    """Programmatic entry point for executing Wikipedia LLM extraction on any language."""
    start_time = time.time()

    # Auto-derive URLs and paths from language code
    dbname = WIKIMEDIA_DBNAME_OVERRIDES.get(lang, f"{lang}wiki")
    dump_url = dump_url or f"https://dumps.wikimedia.org/{dbname}/latest/{dbname}-latest-pages-articles.xml.bz2"
    md5_url = md5_url or f"https://dumps.wikimedia.org/{dbname}/latest/{dbname}-latest-md5sums.txt"
    dump_file = dump_file or f"scratch/{dbname}-latest-pages-articles.xml.bz2"
    output_dir = output_dir or f"data/{lang}wiki_parquet"
    max_part_bytes = int(max_part_gb * 1024 * 1024 * 1024)

    if fastest_mirror:
        print("\n[MIRROR] Probing Wikimedia mirrors for lowest latency...")
        dump_url = find_fastest_wikimedia_mirror(dump_url)

    print("=" * 60)
    print(f"WIKIPEDIA LLM DATASET PIPELINE: [{lang.upper()}]")
    print("=" * 60)
    print(f"Language         : {lang}")
    print(f"Dump URL         : {dump_url}")
    print(f"In-Flight Mode   : {in_flight} (Zero-Raw Disk)")
    print(f"Output Directory : {output_dir}")
    print(f"Max Part Size    : {max_part_gb} GB ({max_part_bytes} bytes)")
    print(f"RAM Batch Size   : {batch_size} articles")
    print(f"Dry Run Mode     : {dry_run}")
    print(f"Skip Download    : {skip_download}")
    print("=" * 60)

    # 1. Download & Verify Dump (or In-Flight Mode)
    os.makedirs(os.path.dirname(os.path.abspath(dump_file)), exist_ok=True)
    expected_md5 = None
    target_name = os.path.basename(dump_url)
    expected_md5 = fetch_expected_md5(md5_url, target_name)

    dump_size = 0
    if not in_flight:
        if not os.path.exists(dump_file) or not skip_download:
            print("\n[PHASE 1] Downloading raw Wikimedia dump with in-flight MD5 verification...")
            dump_file = download_file(dump_url, dump_file, expected_md5=expected_md5)
        else:
            print(f"\n[PHASE 1] Using existing local dump file: {dump_file}")
            if expected_md5:
                verify_file_md5(dump_file, expected_md5)
        dump_size = os.path.getsize(dump_file) if os.path.exists(dump_file) else 0
    else:
        print("\n[PHASE 1] [IN-FLIGHT] Zero-raw streaming active. Bypassing disk download.")

    # 2. Initialize Metadata DB & Run Record
    print("\n[PHASE 2] Initializing Metadata Database (SQLite)...")
    db_path = os.path.join(output_dir, "wikipedia_metadata.sqlite")
    db = MetadataDB(db_path)
    run_id = f"{lang}wiki-{time.strftime('%Y%m%d-%H%M%S')}"
    dump_size = os.path.getsize(dump_file) if os.path.exists(dump_file) else 0

    db.start_run(
        run_id=run_id,
        language=lang,
        source_url=dump_url,
        source_md5=expected_md5,
        source_size_bytes=dump_size,
    )
    db.update_run_status(run_id, "PARSING")

    # 3. Resolve Credentials & Initialize Drive Sync Queue
    creds_path = credentials
    if not creds_path:
        for candidate in ["credentials.json", "service_account.json", "scripts/wikipedia_pipeline/credentials.json"]:
            if os.path.exists(candidate):
                creds_path = candidate
                print(f"[INFO] Auto-detected Google credentials file: {candidate}")
                break

    token_path = token
    if not os.path.exists(token_path):
        for candidate in ["token.json", "scripts/wikipedia_pipeline/token.json"]:
            if os.path.exists(candidate):
                token_path = candidate
                print(f"[INFO] Auto-detected Google token file: {candidate}")
                break

    has_credentials = (creds_path and os.path.exists(creds_path)) or os.path.exists(token_path)
    drive_sync_active = not dry_run and has_credentials

    if not has_credentials and not dry_run:
        print("\n" + "=" * 70)
        print("[BILGI] Google Drive yetkilendirme dosyası (credentials.json) henüz tespit edilmedi.")
        print("[RESILIENT MODE] İşlem durdurulmayacak; Wikipedia temizlenecek, 10 GB Parquet")
        print("                 oluşturulup yerel diskte ve SQLite veritabanında güvenle saklanacaktır.")
        print("[SENKRONİZASYON] Drive bağlantısı yapıldığında kuyruk otomatik yüklenecektir.")
        print("=" * 70 + "\n")

    print("\n[PHASE 3] Initializing Sequential Google Drive Sync Queue...")
    queue = GoogleDriveSequentialSyncQueue(
        credentials_path=creds_path,
        token_path=token_path,
        folder_id=folder_id,
        lang=lang,
        dry_run=(not drive_sync_active),
    )

    part_counter = 0

    def on_part_ready(part_filepath: str, article_count: int) -> None:
        nonlocal part_counter
        part_idx = part_counter
        part_counter += 1

        part_id = f"{run_id}-part-{part_idx:05d}"
        file_size = os.path.getsize(part_filepath)
        from downloader import calculate_md5
        local_md5 = calculate_md5(part_filepath)

        # Register part in metadata DB
        db.register_part(
            part_id=part_id,
            run_id=run_id,
            part_index=part_idx,
            filename=os.path.basename(part_filepath),
            record_count=article_count,
            size_bytes=file_size,
            local_md5=local_md5,
        )
        db.start_part_sync(part_id, drive_folder_id=queue.data_folder_id)

        print(
            f"\n[QUEUE] Part ready for sync ({article_count} articles): {part_filepath}"
        )
        success = queue.upload_and_verify(part_filepath, target_folder_id=queue.data_folder_id)
        if not success:
            db.fail_part_sync(part_id, "Checksum verification or upload failure")
            db.complete_run(run_id, error_message=f"Failed to sync part {part_filepath}")
            print(
                f"[CRITICAL] Failed to sync part {part_filepath}. Stopping pipeline.",
                file=sys.stderr,
            )
            raise RuntimeError(f"Sync failed for {part_filepath}")

        # Confirm verified and deleted in DB
        db.confirm_part_sync(
            part_id=part_id,
            drive_file_id="synced",
            drive_md5=local_md5,
            local_deleted=drive_sync_active,
        )

    snapshot_date = time.strftime("%Y%m%d")

    # 4. Stream, Clean, Shard and Sequentially Sync
    print(f"\n[PHASE 4] Streaming XML, Cleaning Wikitext, and Sharding Parquet [{lang.upper()}]...")
    local_data_dir = os.path.join(output_dir, "data")
    local_meta_dir = os.path.join(output_dir, "metadata")
    os.makedirs(local_data_dir, exist_ok=True)
    os.makedirs(local_meta_dir, exist_ok=True)

    sharder = StreamingParquetSharder(
        output_dir=local_data_dir,
        corpus_prefix=f"{lang}wiki",
        snapshot_date=snapshot_date,
        max_part_bytes=max_part_bytes,
        batch_size=batch_size,
        compression="zstd",
        compression_level=6,
        on_part_ready=on_part_ready,
    )

    processed_count = 0
    total_uncompressed = 0
    article_stream = (
        stream_remote_articles(dump_url, expected_md5=expected_md5, lang=lang)
        if in_flight
        else stream_articles(dump_file, lang=lang)
    )
    for article in article_stream:
        sharder.add_article(article)
        processed_count += 1
        total_uncompressed += len(article["text"].encode("utf-8"))

        if processed_count % 10000 == 0:
            print(f"[{lang.upper()}] Processed {processed_count} clean articles...")

        if limit and processed_count >= limit:
            print(f"[INFO] Reached requested limit of {limit} articles.")
            break

    # Finalize last part
    sharder.close()

    # 5. Finalize Metadata DB & Export Manifest
    db.update_run_stats(
        run_id=run_id,
        scanned=processed_count,
        clean=processed_count,
        redirects=0,
        short=0,
        uncompressed_bytes=total_uncompressed,
        compressed_bytes=0,
        estimated_tokens=int(total_uncompressed / 3.5),
        parts=part_counter,
    )
    db.complete_run(run_id)

    manifest_path = os.path.join(local_meta_dir, f"{lang}wiki_{snapshot_date}_manifest.json")
    manifest = db.export_manifest(run_id, output_path=manifest_path)

    # Sync manifest to Drive metadata folder
    print("\n[PHASE 5] Syncing dataset manifest to Drive metadata folder...")
    queue.upload_and_verify(manifest_path, target_folder_id=queue.metadata_folder_id)

    # 6. Cleanup of Raw Dump to preserve local disk
    if clean_dump and os.path.exists(dump_file):
        print(f"[INFO] Removing raw dump file to preserve disk space: {dump_file}")
        os.remove(dump_file)

    elapsed_min = (time.time() - start_time) / 60.0
    print("\n" + "=" * 60)
    print(f"PIPELINE COMPLETED SUCCESSFULLY: [{lang.upper()}]")
    print(f"Run ID                   : {run_id}")
    print(f"Total Clean Articles     : {processed_count}")
    print(f"Manifest Generated       : {manifest_path}")
    print(f"Total Execution Time     : {elapsed_min:.2f} minutes")
    print("=" * 60)

    return {
        "lang": lang,
        "run_id": run_id,
        "articles": processed_count,
        "manifest_path": manifest_path,
        "elapsed_min": elapsed_min,
    }


def main():
    args = parse_args()
    execute_pipeline(**vars(args))


if __name__ == "__main__":
    main()
