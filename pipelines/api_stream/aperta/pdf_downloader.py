#!/usr/bin/env python3
"""
Aperta Raw PDF and Asset Downloader & Cold Vault Archiver -- protokol-7

Fetches pending PDF/binary assets queued in SQLite (aperta_files),
streams them into WebDataset/Cold Vault TAR.GZ shards (10 GB - 50 GB),
verifies hashes, and uploads the archives to Google Drive (Aperta/Raw_Archives/)
ensuring zero local disk residue while strictly preserving all raw PDFs.
"""

import argparse
import datetime
import os
import ssl
import shutil
import tempfile
import sys
import threading
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.producer_provenance import report_producer_error, enabled, producer_run, stage_archive_raw, flush_archive_raw
from pipelines.shared.safe_http import urlopen
from pipelines.shared.retry_policy import RetryPolicy
from pipelines.shared.daemon_run import monitor_daemon
from pipelines.shared.pipeline_runtime import current_stopper
from pipelines.shared.cloudflare_detector import reject_challenge

from drive_sync import ApertaDriveSync
from ledger import ApertaLedger
from pdf_tar_packer import ApertaPdfTarSharder, archive_member_name

DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Tubitak Ulakbim Aperta Asset Ingestion Engine; mailto:l7v-dev@protokol.local)"


def log(msg: str, level: str = "INFO") -> None:
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] [{level}] [APERTA-PDF] {msg}", flush=True)


class ApertaPdfDownloader:
    """
    Worker for downloading pending Aperta assets and archiving them to TAR.GZ shards.
    """

    def __init__(
        self,
        db_path: str = "data/catalogs/aperta_catalog.sqlite",
        output_dir: str = "data/raw_archives/aperta/pdfs",
        local_copy_dir: Optional[str] = None,
        target_gb: float = 10.0,
        max_gb: float = 51.0,
        min_free_disk_gb: float = 25.0,
        rate_limit_interval: float = 1.0,
        timeout: int = 45,
        max_retries: int = 5,
        sync_drive: bool = True,
        dry_run: bool = False,
    ):
        self.db_path = db_path
        self.output_dir = output_dir
        self.local_copy_dir = local_copy_dir
        self.rate_limit_interval = rate_limit_interval
        self.timeout = timeout
        self.max_retries = max_retries
        self.sync_drive = sync_drive
        self.dry_run = dry_run

        self.ledger = ApertaLedger(db_path=self.db_path)
        self.ledger.recover_unsealed_assets()
        self.drive_sync = ApertaDriveSync() if self.sync_drive and not self.dry_run else None

        self._lock = threading.Lock()
        self._last_request_time = 0.0

        try:
            import certifi
            self._ssl_context = ssl.create_default_context(cafile=certifi.where())
        except Exception:
            self._ssl_context = ssl.create_default_context()

        if self.local_copy_dir:
            os.makedirs(self.local_copy_dir, exist_ok=True)

        # Setup TAR sharder
        self.sharder = ApertaPdfTarSharder(
            output_dir=self.output_dir,
            target_gb=target_gb,
            max_gb=max_gb,
            min_free_disk_gb=min_free_disk_gb,
            start_part_idx=self.ledger.get_next_part_index(),
            on_shard_completed=self._on_shard_completed,
        )

    def _wait_for_rate_limit(self) -> None:
        with self._lock:
            elapsed = time.time() - self._last_request_time
            if elapsed < self.rate_limit_interval:
                time.sleep(self.rate_limit_interval - elapsed)
            self._last_request_time = time.time()

    def _on_shard_completed(self, shard_info: Dict[str, Any]) -> None:
        shard_path = shard_info["file_path"]
        shard_name = shard_info["shard_name"]
        rec_count = shard_info["record_count"]
        byte_sz = shard_info["byte_size"]
        log(f"Sealed PDF Archive Shard: {shard_name} ({rec_count} files, {byte_sz / (1024*1024):.2f} MB)")

        if not self.dry_run:
            self.ledger.register_shard(
                shard_name=shard_name,
                part_index=shard_info["part_index"],
                record_count=rec_count,
                byte_size=byte_sz,
                sha256=shard_info["sha256"],
                md5=shard_info["md5"],
            )
            self.ledger.mark_archive_sealed(shard_name)

            if self.drive_sync:
                try:
                    log(f"Syncing TAR.GZ archive to Google Drive (Aperta/Raw_Archives/): {shard_name}...")
                    upload_res = self.drive_sync.sync_shard(
                        shard_path,
                        purge_on_success=True,
                        subfolder_name="Raw_Archives",
                    )
                    if upload_res.get("file_id"):
                        self.ledger.mark_shard_uploaded(
                            shard_name=shard_name,
                            drive_file_id=upload_res["file_id"],
                            verified_md5=upload_res.get("md5"),
                        )
                        log(f"TAR.GZ archive uploaded & verified: {shard_name} (Drive ID: {upload_res['file_id']})")
                except Exception as ex:
                    report_producer_error(ex)
                    log(f"Drive upload failed for {shard_name}: {ex}", level="WARN")

        flush_archive_raw(self.ledger, self.output_dir)

    def download_file_bytes(self, url: str) -> Optional[bytes]:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "*/*",
        }
        def fetch():
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urlopen(req, timeout=self.timeout, context=self._ssl_context) as resp:
                    payload = resp.read(16 * 1024 * 1024 + 1)
                    if len(payload) > 16 * 1024 * 1024:
                        raise ValueError("Use disk streaming for assets larger than 16 MiB")
                    reject_challenge(payload)
                    return payload
            except urllib.error.HTTPError as error:
                error.close()
                raise

        try:
            return RetryPolicy(interval=2.0, max_attempts=self.max_retries).execute(fetch, sleep=time.sleep)
        except Exception as error:
            report_producer_error(error)
            log(f"Asset download failed: {type(error).__name__}", level="WARN")
            return None

    def download_file_to(self, url: str, destination: str) -> bool:
        """Download with bounded memory; retry attempts truncate only the owned file."""
        def fetch():
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers={"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"})
            try:
                with urlopen(req, timeout=self.timeout, context=self._ssl_context) as response:
                    declared = response.headers.get("Content-Length")
                    expected = int(declared) if declared is not None else None
                    if expected is not None and (expected < 0 or expected > self.sharder.max_bytes):
                        raise ValueError("Asset exceeds archive size limit")
                    total = 0
                    prefix = bytearray()
                    with open(destination, "wb") as output:
                        while chunk := response.read(1024 * 1024):
                            total += len(chunk)
                            if total > self.sharder.max_bytes:
                                raise ValueError("Asset exceeds archive size limit")
                            if shutil.disk_usage(self.output_dir).free < self.sharder.min_free_disk_bytes + len(chunk):
                                raise OSError("Insufficient asset staging disk reserve")
                            if len(prefix) < 65536:
                                prefix.extend(chunk[:65536 - len(prefix)])
                                reject_challenge(bytes(prefix))
                            output.write(chunk)
                    if expected is not None and total != expected:
                        raise ValueError("Incomplete asset response")
                    return total > 0
            except urllib.error.HTTPError as error:
                error.close()
                raise
        try:
            return RetryPolicy(interval=2.0, max_attempts=self.max_retries).execute(fetch, sleep=time.sleep)
        except (OSError, MemoryError) as error:
            # Local resource failures must not turn healthy source rows into failed rows.
            from pipelines.shared.error_classifier import is_retriable
            if isinstance(error, MemoryError) or not is_retriable(error) and not isinstance(error, (urllib.error.URLError, ssl.SSLError)):
                raise
            report_producer_error(error)
            log(f"Asset download failed: {type(error).__name__}", level="WARN")
            return False
        except Exception as error:
            report_producer_error(error)
            log(f"Asset download failed: {type(error).__name__}", level="WARN")
            return False

    @monitor_daemon("aperta-assets", interrupt_on_parent_loss=False)
    def process_pending_files(self, batch_size: int = 50, max_files: int = 0, continuous: bool = False, idle_sleep: float = 15.0) -> int:
        """
        Polls pending files from SQLite, downloads each, archives into TAR.GZ,
        and marks status='archived'. If continuous is True, sleeps and polls repeatedly.
        """
        flush_archive_raw(self.ledger, self.output_dir)
        total_processed = 0
        stopper = current_stopper()

        try:
            while True:
                if stopper and stopper.should_stop()[0]:
                    break
                with self.ledger._get_conn() as conn:
                    cur = conn.cursor()
                    limit_chunk = batch_size if continuous else (max_files if max_files > 0 else 50000)
                    cur.execute(
                        """
                        SELECT file_id, record_id, key, size, download_url
                        FROM aperta_files
                        WHERE status = 'pending'
                        ORDER BY created_at ASC
                        LIMIT ?
                        """,
                        (limit_chunk,),
                    )
                    pending_files = [dict(r) for r in cur.fetchall()]

                if not pending_files:
                    if continuous:
                        time.sleep(idle_sleep)
                        continue
                    else:
                        log(f"No pending files found to process.")
                        break

                log(f"Found {len(pending_files)} pending files to download in current batch.")

                for file_meta in pending_files:
                    if stopper and stopper.should_stop()[0]:
                        break
                    f_id = file_meta["file_id"]
                    rec_id = file_meta["record_id"]
                    key = file_meta["key"]
                    url = file_meta["download_url"]

                    if not url:
                        url = f"https://aperta.ulakbim.gov.tr/api/records/{rec_id}/files/{key}/content"

                    log(f"Downloading [{rec_id}] {key} ({url})...")
                    with tempfile.TemporaryDirectory(prefix="aperta-download-", dir=self.output_dir) as staging:
                        path = os.path.join(staging, "payload")
                        downloaded = self.download_file_to(url, path)
                        if downloaded:
                            size = os.path.getsize(path)
                            self.sharder.prepare_file(size)
                            if self.local_copy_dir:
                                local_name = os.path.basename(f"{rec_id}_{key}")
                                shutil.copyfile(path, os.path.join(self.local_copy_dir, local_name))
                            receiving_shard = self.sharder.current_shard_name
                            member = archive_member_name(f"{rec_id}_{key}")
                            stage_archive_raw(self.ledger, receiving_shard, path, "aperta", url, member, file_id=f_id)
                            if not enabled():
                                with self.ledger._get_conn() as conn, conn:
                                    conn.execute("UPDATE aperta_files SET status='downloaded',archive_shard_name=? WHERE file_id=?", (receiving_shard,f_id))
                            try:
                                shard_name = self.sharder.append_path(f"{rec_id}_{key}", path)
                            except BaseException:
                                with self.ledger._get_conn() as conn:
                                    with conn:
                                        sealed = conn.execute("SELECT 1 FROM shards WHERE shard_name=?", (receiving_shard,)).fetchone()
                                        if not sealed:
                                            if enabled():
                                                conn.execute("DELETE FROM raw_archive_outbox WHERE shard_name=? AND member=?", (receiving_shard, member))
                                            conn.execute("UPDATE aperta_files SET status='pending',archive_shard_name=NULL WHERE file_id=?", (f_id,))
                                raise
                            flush_archive_raw(self.ledger, self.output_dir)
                            log(f"Appended {key} ({size} bytes) into {shard_name}; awaiting archive seal")
                        else:
                            with self.ledger._get_conn() as conn:
                                with conn:
                                    conn.execute("UPDATE aperta_files SET status='failed' WHERE file_id=?", (f_id,))
                            log(f"Failed to fetch {key}, marked failed", level="WARN")

                    total_processed += 1
                    if stopper:
                        stopper.record_processed()
                        if not downloaded:
                            stopper.record_error()
                    if 0 < max_files <= total_processed:
                        break

                if 0 < max_files <= total_processed:
                    break

        except KeyboardInterrupt:
            log("Asset processing interrupted; closing active archive", level="WARN")
        finally:
            self.sharder.close()

        log(f"Finished processing. Total processed: {total_processed}")
        return total_processed


@producer_run("aperta-assets")
def main():
    parser = argparse.ArgumentParser(description="Aperta Raw PDF and Multi-Format Asset Archiver")
    parser.add_argument("--db-path", default="data/catalogs/aperta_catalog.sqlite", help="SQLite database path")
    parser.add_argument("--output-dir", default="data/raw_archives/aperta/pdfs", help="Archive output directory")
    parser.add_argument("--keep-local-copy", default=None, help="Directory to save a permanent local copy of files")
    parser.add_argument("--target-gb", type=float, default=10.0, help="Target TAR.GZ shard size in GB (default: 10.0)")
    parser.add_argument("--max-gb", type=float, default=51.0, help="Max TAR.GZ shard size in GB (default: 51.0)")
    parser.add_argument("--min-free-disk-gb", type=float, default=25.0, help="Min free disk space in GB before flush")
    parser.add_argument("--rate-limit", type=float, default=1.0, help="Rate limit seconds between downloads")
    parser.add_argument("--max-files", type=int, default=0, help="Max files to process (0 for all)")
    parser.add_argument("--continuous", action="store_true", help="Run continuously polling for newly harvested files")
    parser.add_argument("--no-sync-drive", dest="sync_drive", action="store_false", help="Disable Drive upload")
    parser.add_argument("--dry-run", action="store_true", help="Simulate run without writing files")

    from pipelines.shared.cli_validation import validate_cli
    args = validate_cli(parser, parser.parse_args())

    downloader = ApertaPdfDownloader(
        db_path=args.db_path,
        output_dir=args.output_dir,
        local_copy_dir=args.keep_local_copy,
        target_gb=args.target_gb,
        max_gb=args.max_gb,
        min_free_disk_gb=args.min_free_disk_gb,
        rate_limit_interval=args.rate_limit,
        sync_drive=args.sync_drive,
        dry_run=args.dry_run,
    )

    downloader.process_pending_files(
        max_files=args.max_files,
        continuous=args.continuous,
    )



if __name__ == "__main__":
    main()
