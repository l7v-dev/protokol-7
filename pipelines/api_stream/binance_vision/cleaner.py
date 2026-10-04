#!/usr/bin/env python3
"""
Binance Vision In-Memory Data Extractor and Cleaner -- protokol-7

Unpacks in-memory ZIP archives containing raw Binance CSV dumps (klines, trades, aggTrades)
without leaving raw data residue on the filesystem, normalizes data types,
and converts records to structured PyArrow Tables.
"""

import csv
import io
import os
import sys
import zipfile
from typing import Any, Dict, List, Optional, Tuple
import pyarrow as pa

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

KLINE_PYARROW_SCHEMA = pa.schema([
    ("open_time", pa.int64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("volume", pa.float64()),
    ("close_time", pa.int64()),
    ("quote_asset_volume", pa.float64()),
    ("number_of_trades", pa.int64()),
    ("taker_buy_base_asset_volume", pa.float64()),
    ("taker_buy_quote_asset_volume", pa.float64()),
    ("symbol", pa.string()),
    ("market", pa.string()),
    ("interval", pa.string()),
    ("source_file", pa.string()),
])

TRADE_PYARROW_SCHEMA = pa.schema([
    ("trade_id", pa.int64()),
    ("price", pa.float64()),
    ("qty", pa.float64()),
    ("quote_qty", pa.float64()),
    ("time", pa.int64()),
    ("is_buyer_maker", pa.bool_()),
    ("symbol", pa.string()),
    ("market", pa.string()),
    ("source_file", pa.string()),
])

AGG_TRADE_PYARROW_SCHEMA = pa.schema([
    ("agg_trade_id", pa.int64()),
    ("price", pa.float64()),
    ("quantity", pa.float64()),
    ("first_trade_id", pa.int64()),
    ("last_trade_id", pa.int64()),
    ("transact_time", pa.int64()),
    ("is_buyer_maker", pa.bool_()),
    ("symbol", pa.string()),
    ("market", pa.string()),
    ("source_file", pa.string()),
])


class BinanceVisionCleaner:
    """
    Extracts and normalizes Binance Vision CSV data directly from in-memory ZIP streams.
    """

    @staticmethod
    def extract_csv_from_zip(zip_bytes: bytes) -> Tuple[str, str]:
        """
        Reads in-memory ZIP bytes and extracts the primary CSV content as text.
        Returns (csv_filename, csv_text).
        """
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            file_names = zf.namelist()
            csv_candidates = [n for n in file_names if n.endswith(".csv")]
            if not csv_candidates:
                raise ValueError("No CSV file discovered inside ZIP archive")
            csv_name = csv_candidates[0]
            with zf.open(csv_name) as f:
                csv_text = f.read().decode("utf-8", errors="replace")
                return csv_name, csv_text

    @classmethod
    def parse_klines_to_table(
        cls,
        csv_text: str,
        symbol: str,
        market: str = "spot",
        interval: str = "1d",
        source_file: str = "",
    ) -> pa.Table:
        """
        Parses Binance kline CSV rows into a typed PyArrow Table.
        """
        reader = csv.reader(io.StringIO(csv_text))
        rows: List[List[Any]] = []

        for row in reader:
            if not row or len(row) < 6:
                continue
            # Header check: skip if header row
            if row[0].strip().lower() in ("open_time", "open time", "time", "timestamp"):
                continue

            try:
                open_time = int(row[0].strip())
                open_val = float(row[1].strip())
                high_val = float(row[2].strip())
                low_val = float(row[3].strip())
                close_val = float(row[4].strip())
                volume_val = float(row[5].strip())

                close_time = int(row[6].strip()) if len(row) > 6 and row[6].strip() else open_time
                qav = float(row[7].strip()) if len(row) > 7 and row[7].strip() else 0.0
                trades = int(float(row[8].strip())) if len(row) > 8 and row[8].strip() else 0
                tbba = float(row[9].strip()) if len(row) > 9 and row[9].strip() else 0.0
                tbqa = float(row[10].strip()) if len(row) > 10 and row[10].strip() else 0.0

                rows.append([
                    open_time,
                    open_val,
                    high_val,
                    low_val,
                    close_val,
                    volume_val,
                    close_time,
                    qav,
                    trades,
                    tbba,
                    tbqa,
                    symbol,
                    market,
                    interval,
                    source_file,
                ])
            except (ValueError, IndexError):
                continue

        if not rows:
            # Return empty table with schema
            return pa.Table.from_batches([], schema=KLINE_PYARROW_SCHEMA)

        columns = list(zip(*rows))
        return pa.Table.from_arrays(
            [
                pa.array(columns[0], type=pa.int64()),
                pa.array(columns[1], type=pa.float64()),
                pa.array(columns[2], type=pa.float64()),
                pa.array(columns[3], type=pa.float64()),
                pa.array(columns[4], type=pa.float64()),
                pa.array(columns[5], type=pa.float64()),
                pa.array(columns[6], type=pa.int64()),
                pa.array(columns[7], type=pa.float64()),
                pa.array(columns[8], type=pa.int64()),
                pa.array(columns[9], type=pa.float64()),
                pa.array(columns[10], type=pa.float64()),
                pa.array(columns[11], type=pa.string()),
                pa.array(columns[12], type=pa.string()),
                pa.array(columns[13], type=pa.string()),
                pa.array(columns[14], type=pa.string()),
            ],
            schema=KLINE_PYARROW_SCHEMA,
        )

    @classmethod
    def parse_trades_to_table(
        cls,
        csv_text: str,
        symbol: str,
        market: str = "spot",
        source_file: str = "",
    ) -> pa.Table:
        """
        Parses Binance trades CSV rows into a typed PyArrow Table.
        """
        reader = csv.reader(io.StringIO(csv_text))
        rows: List[List[Any]] = []

        for row in reader:
            if not row or len(row) < 5:
                continue
            if row[0].strip().lower() in ("id", "trade_id", "trade id"):
                continue

            try:
                trade_id = int(row[0].strip())
                price = float(row[1].strip())
                qty = float(row[2].strip())
                quote_qty = float(row[3].strip())
                trade_time = int(row[4].strip())
                is_buyer_maker = row[5].strip().lower() in ("true", "1", "t") if len(row) > 5 else False

                rows.append([
                    trade_id,
                    price,
                    qty,
                    quote_qty,
                    trade_time,
                    is_buyer_maker,
                    symbol,
                    market,
                    source_file,
                ])
            except (ValueError, IndexError):
                continue

        if not rows:
            return pa.Table.from_batches([], schema=TRADE_PYARROW_SCHEMA)

        columns = list(zip(*rows))
        return pa.Table.from_arrays(
            [
                pa.array(columns[0], type=pa.int64()),
                pa.array(columns[1], type=pa.float64()),
                pa.array(columns[2], type=pa.float64()),
                pa.array(columns[3], type=pa.float64()),
                pa.array(columns[4], type=pa.int64()),
                pa.array(columns[5], type=pa.bool_()),
                pa.array(columns[6], type=pa.string()),
                pa.array(columns[7], type=pa.string()),
                pa.array(columns[8], type=pa.string()),
            ],
            schema=TRADE_PYARROW_SCHEMA,
        )

    @classmethod
    def parse_agg_trades_to_table(
        cls,
        csv_text: str,
        symbol: str,
        market: str = "spot",
        source_file: str = "",
    ) -> pa.Table:
        """
        Parses Binance aggTrades CSV rows into a typed PyArrow Table.
        """
        reader = csv.reader(io.StringIO(csv_text))
        rows: List[List[Any]] = []

        for row in reader:
            if not row or len(row) < 6:
                continue
            if row[0].strip().lower() in ("agg_trade_id", "agg trade id", "trade id", "id"):
                continue

            try:
                agg_trade_id = int(row[0].strip())
                price = float(row[1].strip())
                quantity = float(row[2].strip())
                first_trade_id = int(row[3].strip())
                last_trade_id = int(row[4].strip())
                transact_time = int(row[5].strip())
                is_buyer_maker = row[6].strip().lower() in ("true", "1", "t") if len(row) > 6 else False

                rows.append([
                    agg_trade_id,
                    price,
                    quantity,
                    first_trade_id,
                    last_trade_id,
                    transact_time,
                    is_buyer_maker,
                    symbol,
                    market,
                    source_file,
                ])
            except (ValueError, IndexError):
                continue

        if not rows:
            return pa.Table.from_batches([], schema=AGG_TRADE_PYARROW_SCHEMA)

        columns = list(zip(*rows))
        return pa.Table.from_arrays(
            [
                pa.array(columns[0], type=pa.int64()),
                pa.array(columns[1], type=pa.float64()),
                pa.array(columns[2], type=pa.float64()),
                pa.array(columns[3], type=pa.int64()),
                pa.array(columns[4], type=pa.int64()),
                pa.array(columns[5], type=pa.int64()),
                pa.array(columns[6], type=pa.bool_()),
                pa.array(columns[7], type=pa.string()),
                pa.array(columns[8], type=pa.string()),
                pa.array(columns[9], type=pa.string()),
            ],
            schema=AGG_TRADE_PYARROW_SCHEMA,
        )

    @classmethod
    def clean_zip_to_table(
        cls,
        zip_bytes: bytes,
        data_type: str,
        symbol: str,
        market: str = "spot",
        interval: str = "1d",
        source_file: str = "",
    ) -> pa.Table:
        """
        Directly converts in-memory ZIP file into a PyArrow Table without disk writes.
        """
        _, csv_text = cls.extract_csv_from_zip(zip_bytes)
        if data_type == "klines":
            return cls.parse_klines_to_table(csv_text, symbol=symbol, market=market, interval=interval, source_file=source_file)
        if data_type == "trades":
            return cls.parse_trades_to_table(csv_text, symbol=symbol, market=market, source_file=source_file)
        if data_type == "aggTrades":
            return cls.parse_agg_trades_to_table(csv_text, symbol=symbol, market=market, source_file=source_file)
        raise ValueError(f"Unsupported data_type: {data_type}. Must be klines, trades, or aggTrades.")
