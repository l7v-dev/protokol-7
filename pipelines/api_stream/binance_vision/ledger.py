#!/usr/bin/env python3
"""
Binance Vision Relational SQLite Ledger and Catalog Registry -- protokol-7

Maintains transactional ACID tracking of discovered S3 dataset files,
processing stages, row counts, output Parquet shards, and dual-sync
with the central Protokol-7 catalog (data/catalog.sqlite).
"""

import datetime
import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.ledger_base import BaseLedger

DEFAULT_BINANCE_DB = "data/catalogs/binance_catalog.sqlite"
DEFAULT_CENTRAL_DB = "data/catalog.sqlite"


class BinanceVisionLedger(BaseLedger):
    """
    ACID transactional SQLite ledger with WAL mode for Binance Vision datasets.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_BINANCE_DB,
        central_db_path: str = DEFAULT_CENTRAL_DB,
    ):
        super().__init__(db_path=db_path, central_db_path=central_db_path)
        self._init_binance_tables()

    def _init_binance_tables(self) -> None:
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS binance_files (
                    file_key TEXT PRIMARY KEY,
                    market TEXT,
                    data_type TEXT,
                    symbol TEXT,
                    interval TEXT,
                    period_type TEXT,
                    file_name TEXT,
                    file_size INTEGER DEFAULT 0,
                    sha256 TEXT,
                    row_count INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'downloaded', 'extracted', 'sharded', 'uploaded', 'failed')),
                    shard_name TEXT,
                    drive_file_id TEXT,
                    error_message TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS binance_partitions (
                    partition_id TEXT PRIMARY KEY,
                    market TEXT,
                    data_type TEXT,
                    symbol TEXT,
                    interval TEXT,
                    period_type TEXT,
                    total_files INTEGER DEFAULT 0,
                    processed_files INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
                    updated_at TEXT
                );
            """)

            cur.execute("CREATE INDEX IF NOT EXISTS idx_binance_files_status ON binance_files(status);")

            cur.execute("CREATE INDEX IF NOT EXISTS idx_binance_files_symbol ON binance_files(symbol, market, data_type);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_binance_files_shard ON binance_files(shard_name);")
            conn.commit()

    def index_files(self, files: List[Dict[str, Any]]) -> int:
        """
        Idempotently inserts or ignores discovered S3 files into the catalog.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        inserted = 0

        with self._get_conn() as conn:
            cur = conn.cursor()
            for f in files:
                file_key = f.get("key", "")
                if not file_key:
                    continue

                # Parse file key tokens: e.g. data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2026-08.zip
                parts = file_key.split("/")
                market = parts[1] if len(parts) > 1 else "unknown"
                period_type = parts[2] if len(parts) > 2 else "unknown"
                data_type = parts[3] if len(parts) > 3 else "unknown"
                symbol = parts[4] if len(parts) > 4 else "unknown"
                interval = parts[5] if len(parts) > 5 and data_type == "klines" else ""
                file_name = parts[-1]

                cur.execute(
                    """
                    INSERT INTO binance_files (
                        file_key, market, data_type, symbol, interval, period_type,
                        file_name, file_size, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                    ON CONFLICT(file_key) DO UPDATE SET
                        file_size = excluded.file_size,
                        updated_at = excluded.updated_at
                    WHERE binance_files.status = 'pending';
                    """,
                    (
                        file_key,
                        market,
                        data_type,
                        symbol,
                        interval,
                        period_type,
                        file_name,
                        f.get("size", 0),
                        now,
                        now,
                    ),
                )
                if cur.rowcount > 0:
                    inserted += 1

            conn.commit()
        return inserted

    def get_pending_files(
        self,
        market: Optional[str] = None,
        data_type: Optional[str] = None,
        symbol: Optional[str] = None,
        interval: Optional[str] = None,
        period_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves pending files for download and processing.
        """
        query = "SELECT * FROM binance_files WHERE status IN ('pending', 'downloaded')"
        params: List[Any] = []

        if market:
            query += " AND market = ?"
            params.append(market)
        if data_type:
            query += " AND data_type = ?"
            params.append(data_type)
        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)
        if interval:
            query += " AND interval = ?"
            params.append(interval)
        if period_type:
            query += " AND period_type = ?"
            params.append(period_type)

        query += " ORDER BY file_key ASC LIMIT ?"
        params.append(limit)

        with self._get_conn() as conn:
            conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
            cur = conn.cursor()
            cur.execute(query, params)
            return cur.fetchall()

    def mark_file_sharded(
        self,
        file_key: str,
        shard_name: str,
        row_count: int,
        sha256: str = "",
    ) -> None:
        """
        Marks file as sharded into a local Parquet shard.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE binance_files
                SET status = 'sharded',
                    shard_name = ?,
                    row_count = ?,
                    sha256 = CASE WHEN ? != '' THEN ? ELSE sha256 END,
                    updated_at = ?
                WHERE file_key = ?;
                """,
                (shard_name, row_count, sha256, sha256, now, file_key),
            )
            conn.commit()

    def mark_file_uploaded(self, file_key: str, drive_file_id: str) -> None:
        """
        Marks file as successfully uploaded to Google Drive.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE binance_files
                SET status = 'uploaded',
                    drive_file_id = ?,
                    updated_at = ?
                WHERE file_key = ?;
                """,
                (drive_file_id, now, file_key),
            )
            conn.commit()

    def mark_file_failed(self, file_key: str, error_message: str) -> None:
        """
        Marks file as failed with error details.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE binance_files
                SET status = 'failed',
                    error_message = ?,
                    updated_at = ?
                WHERE file_key = ?;
                """,
                (error_message, now, file_key),
            )
            conn.commit()

    def record_shard(
        self,
        shard_name: str,
        path: str,
        row_count: int,
        size_bytes: int,
        md5_checksum: str,
        part_index: int = 1,
    ) -> None:
        """
        Records a newly generated local Parquet shard using BaseLedger schema.
        """
        self.register_shard(
            shard_name=shard_name,
            part_index=part_index,
            record_count=row_count,
            byte_size=size_bytes,
            sha256="",
            md5=md5_checksum,
        )

    def record_shard_upload(
        self,
        shard_name: str,
        drive_file_id: str,
    ) -> None:
        """
        Marks shard as uploaded to Google Drive and evicted from local disk.
        """
        self.mark_shard_uploaded(shard_name=shard_name, drive_file_id=drive_file_id)

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_conn() as conn:
            cur = conn.cursor()
            # Update all associated files
            cur.execute(
                """
                UPDATE binance_files
                SET status = 'uploaded',
                    drive_file_id = ?,
                    updated_at = ?
                WHERE shard_name = ?;
                """,
                (drive_file_id, now, shard_name),
            )
            conn.commit()

        # Dual-sync to central catalog
        self._sync_central_dataset(
            name=f"binance_{shard_name}",
            category="financial_timeseries",
            record_count=0,
            file_path=f"gdrive://Binance/{shard_name}",
            file_size=0,
        )

    def get_stats(self) -> Dict[str, Any]:
        """
        Returns status counts, symbol distribution, and shard totals.
        """
        with self._get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT status, count(*) FROM binance_files GROUP BY status;
            """)
            status_counts = dict(cur.fetchall())

            cur.execute("""
                SELECT count(DISTINCT symbol), count(DISTINCT market), count(DISTINCT data_type), sum(row_count)
                FROM binance_files;
            """)
            symbols, markets, data_types, total_rows = cur.fetchone()

            cur.execute("""
                SELECT count(*), sum(record_count), sum(byte_size)
                FROM shards;
            """)
            total_shards, shard_rows, total_bytes = cur.fetchone()

            return {
                "file_statuses": status_counts,
                "distinct_symbols": symbols or 0,
                "distinct_markets": markets or 0,
                "distinct_data_types": data_types or 0,
                "total_rows": total_rows or 0,
                "total_shards": total_shards or 0,
                "shard_rows": shard_rows or 0,
                "total_shard_bytes": total_bytes or 0,
            }

