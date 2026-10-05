#!/usr/bin/env python3
"""
Binance Vision High-Throughput Orchestrator -- protokol-7

Coordinates S3 catalog discovery, streaming in-memory ZIP processing, SHA-256 verification,
Zstandard Parquet sharding, and Google Drive syncing with zero local residue (purge on success).
"""

import argparse
import os
import sys
import time
from typing import Any, Dict, List, Optional
import pyarrow as pa

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.api_stream.binance_vision.cleaner import BinanceVisionCleaner
from pipelines.api_stream.binance_vision.downloader import BinanceVisionDownloader
from pipelines.api_stream.binance_vision.drive_sync import BinanceVisionDriveSync
from pipelines.api_stream.binance_vision.ledger import BinanceVisionLedger
from pipelines.api_stream.binance_vision.packer import BinanceVisionParquetSharder


class BinanceVisionOrchestrator:
    """
    End-to-end streaming ingestion pipeline orchestrator for Binance Vision public data.
    """

    def __init__(
        self,
        market: str = "spot",
        data_type: str = "klines",
        period_type: str = "monthly",
        symbols: Optional[List[str]] = None,
        interval: str = "1d",
        db_path: Optional[str] = None,
        upload_drive: bool = True,
        purge_local: bool = True,
        dry_run: bool = False,
    ):
        self.market = market
        self.data_type = data_type
        self.period_type = period_type
        self.interval = interval
        self.upload_drive = upload_drive
        self.purge_local = purge_local
        self.dry_run = dry_run

        self.downloader = BinanceVisionDownloader()
        self.cleaner = BinanceVisionCleaner()
        self.ledger = BinanceVisionLedger(db_path=db_path) if db_path else BinanceVisionLedger()
        self.sharder = BinanceVisionParquetSharder()
        self.drive_sync = BinanceVisionDriveSync(dry_run=dry_run) if upload_drive else None

        self.all_symbols = False
        if symbols and any(s in ("ALL", "*") for s in symbols):
            self.all_symbols = True
            print(f"[*] Discovering ALL available symbols for market={self.market}, type={self.data_type} from S3...")
            self.symbols = self.downloader.list_symbols(
                market=self.market,
                period_type=self.period_type,
                data_type=self.data_type,
            )
            print(f"[*] Discovered {len(self.symbols)} available symbols.")
        else:
            self.symbols = [s.strip().upper() for s in (symbols or ["BTCUSDT"]) if s.strip()]

    def build_s3_prefix(self, symbol: str) -> str:
        """
        Constructs the S3 directory prefix for the given parameters.
        Example: data/spot/monthly/klines/BTCUSDT/1d/
        """
        market_path = self.market.replace("_", "/")
        if self.data_type == "klines":
            if self.interval == "all" or not self.interval:
                return f"data/{market_path}/{self.period_type}/{self.data_type}/{symbol}/"
            return f"data/{market_path}/{self.period_type}/{self.data_type}/{symbol}/{self.interval}/"
        return f"data/{market_path}/{self.period_type}/{self.data_type}/{symbol}/"

    def discover_files_for_symbol(self, symbol: str, max_files: Optional[int] = None) -> int:
        """
        Scans S3 bucket for matching ZIP files of a symbol and indexes them in the ledger.
        """
        prefix = self.build_s3_prefix(symbol)
        print(f"[*] Discovering S3 objects under prefix: {prefix}")
        discovered: List[Dict[str, Any]] = []

        for item in self.downloader.crawl_prefix(prefix=prefix, file_suffix=".zip", max_files=max_files):
            discovered.append(item)

        inserted = self.ledger.index_files(discovered)
        print(f"[*] Discovered {len(discovered)} files for {symbol} ({inserted} newly indexed).")
        return len(discovered)

    def run(self, max_files: int = 0) -> Dict[str, Any]:
        """
        Executes end-to-end ingestion: discovery, in-memory extraction, sharding, and Drive sync.
        """
        print(f"[*] Starting Binance Vision Ingestion: market={self.market}, type={self.data_type}, symbols={self.symbols}")

        total_discovered = 0
        for symbol in self.symbols:
            count = self.discover_files_for_symbol(symbol, max_files=max_files if max_files > 0 else None)
            total_discovered += count

        if self.dry_run:
            print("[*] Dry-run enabled. Skipping download and conversion.")
            return {"status": "dry_run_complete", "discovered": total_discovered}

        processed_count = 0
        total_rows = 0
        seq = int(time.time()) % 100000

        while True:
            # Query pending files batch
            batch_limit = 500 if max_files == 0 else min(500, max_files - processed_count)
            if batch_limit <= 0:
                break

            pending = self.ledger.get_pending_files(
                market=self.market,
                data_type=self.data_type,
                limit=batch_limit,
            )

            if not pending:
                print("[*] No further pending files to process.")
                break

            print(f"[*] Processing batch of {len(pending)} pending files (overall processed: {processed_count})...")

            for file_meta in pending:
                file_key = file_meta["file_key"]
                symbol = file_meta["symbol"]
                interval = file_meta["interval"]

            try:
                print(f"[>] Downloading & verifying: {file_key} ...")
                zip_bytes, sha256_hash, is_valid = self.downloader.download_and_verify(file_key, verify_checksum=True)

                if not is_valid:
                    print(f"[!] Checksum mismatch for {file_key}! Skipping.")
                    self.ledger.mark_file_failed(file_key, "SHA-256 checksum verification failed")
                    continue

                # In-memory CSV extraction and PyArrow table conversion (zero disk residue)
                table = self.cleaner.clean_zip_to_table(
                    zip_bytes=zip_bytes,
                    data_type=self.data_type,
                    symbol=symbol,
                    market=self.market,
                    interval=interval,
                    source_file=file_key,
                )

                if table.num_rows == 0:
                    print(f"[-] Empty data in {file_key}, marking completed.")
                    self.ledger.mark_file_sharded(file_key, shard_name="", row_count=0, sha256=sha256_hash)
                    continue

                seq += 1
                shard_res = self.sharder.write_shard(
                    table=table,
                    market=self.market,
                    data_type=self.data_type,
                    symbol=symbol,
                    interval=interval,
                    shard_seq=seq,
                )

                shard_name = shard_res["shard_name"]
                shard_path = shard_res["path"]
                rows = shard_res["row_count"]
                total_rows += rows

                self.ledger.record_shard(
                    shard_name=shard_name,
                    path=shard_path,
                    row_count=rows,
                    size_bytes=shard_res["size_bytes"],
                    md5_checksum=shard_res["md5"],
                )
                self.ledger.mark_file_sharded(file_key, shard_name=shard_name, row_count=rows, sha256=sha256_hash)
                print(f"[+] Sharded {rows} rows into {shard_name} (Zstd level 6).")

                # Sync to Google Drive if configured
                if self.upload_drive and self.drive_sync:
                    drive_subfolder = f"Binance/{self.market}/{self.data_type}"
                    upload_res = self.drive_sync.sync_shard(
                        local_path=shard_path,
                        purge_on_success=self.purge_local,
                        subfolder_name=drive_subfolder,
                    )
                    drive_id = upload_res.get("file_id", "synced")
                    self.ledger.record_shard_upload(shard_name, drive_file_id=drive_id)
                    print(f"[^] Shard {shard_name} uploaded to Drive (ID: {drive_id}). Local evicted: {self.purge_local}.")

                processed_count += 1

            except Exception as exc:
                print(f"[!] Error processing {file_key}: {exc}")
                self.ledger.mark_file_failed(file_key, str(exc))

        stats = self.ledger.get_stats()
        print(f"[*] Ingestion run finished. Processed: {processed_count}, Total Rows: {total_rows}")
        return {
            "processed": processed_count,
            "total_rows": total_rows,
            "stats": stats,
        }


def print_status() -> None:
    ledger = BinanceVisionLedger()
    stats = ledger.get_stats()
    print("=" * 60)
    print("BINANCE VISION CATALOG STATUS")
    print("=" * 60)
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Binance Vision Public Data Ingestion Orchestrator")
    parser.add_argument("--market", default="spot", choices=["spot", "futures_um", "futures_cm"], help="Market type")
    parser.add_argument("--type", dest="data_type", default="klines", choices=["klines", "trades", "aggTrades"], help="Data type")
    parser.add_argument("--period", dest="period_type", default="monthly", choices=["monthly", "daily"], help="Period granularity")
    parser.add_argument("--symbols", default="BTCUSDT", help="Comma-separated symbols, or 'ALL' for every symbol on S3")
    parser.add_argument("--all", action="store_true", help="Harvest all available symbols across the market")
    parser.add_argument("--interval", default="1d", help="Kline interval (e.g. 1d, 1h, 15m, 1m, or 'all')")
    parser.add_argument("--max-files", type=int, default=0, help="Max files to process (0 = all)")
    parser.add_argument("--no-drive", action="store_true", help="Disable Google Drive upload")
    parser.add_argument("--keep-local", action="store_true", help="Keep local Parquet files (do not purge)")
    parser.add_argument("--dry-run", action="store_true", help="Discover S3 keys without downloading")
    parser.add_argument("--status", action="store_true", help="Print ledger statistics and exit")

    args = parser.parse_args()

    if args.status:
        print_status()
        return

    if args.all:
        symbol_list = ["ALL"]
    else:
        symbol_list = [s.strip() for s in args.symbols.split(",") if s.strip()]

    orchestrator = BinanceVisionOrchestrator(
        market=args.market,
        data_type=args.data_type,
        period_type=args.period_type,
        symbols=symbol_list,
        interval=args.interval,
        upload_drive=not args.no_drive,
        purge_local=not args.keep_local,
        dry_run=args.dry_run,
    )

    orchestrator.run(max_files=args.max_files)


if __name__ == "__main__":
    main()
