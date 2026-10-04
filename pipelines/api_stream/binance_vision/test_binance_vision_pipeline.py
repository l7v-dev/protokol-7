#!/usr/bin/env python3
"""
Unit and Integration Test Suite for Binance Vision Pipeline -- protokol-7
"""

import hashlib
import io
import os
import shutil
import tempfile
import unittest
import zipfile
import pyarrow as pa
import pyarrow.parquet as pq

from pipelines.api_stream.binance_vision.cleaner import (
    BinanceVisionCleaner,
    KLINE_PYARROW_SCHEMA,
    TRADE_PYARROW_SCHEMA,
    AGG_TRADE_PYARROW_SCHEMA,
)
from pipelines.api_stream.binance_vision.downloader import BinanceVisionDownloader
from pipelines.api_stream.binance_vision.ledger import BinanceVisionLedger
from pipelines.api_stream.binance_vision.packer import BinanceVisionParquetSharder
from pipelines.api_stream.binance_vision.orchestrator import BinanceVisionOrchestrator


class TestBinanceVisionPipeline(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_binance.sqlite")
        self.central_db = os.path.join(self.temp_dir, "test_central.sqlite")
        self.parquet_dir = os.path.join(self.temp_dir, "parquets")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _create_mock_zip(self, csv_name: str, csv_content: str) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(csv_name, csv_content)
        return buf.getvalue()

    def test_cleaner_klines(self):
        csv_data = (
            "1690848000000,29230.10,29400.00,29100.50,29350.20,1542.30,1690934399999,45123000.5,12450,750.2,21980000.1,0\n"
            "1690934400000,29350.20,29550.00,29200.00,29420.00,1200.50,1691020799999,35230000.2,9800,600.1,17600000.0,0\n"
        )
        zip_bytes = self._create_mock_zip("BTCUSDT-1d-2023-08.csv", csv_data)

        table = BinanceVisionCleaner.clean_zip_to_table(
            zip_bytes=zip_bytes,
            data_type="klines",
            symbol="BTCUSDT",
            market="spot",
            interval="1d",
            source_file="data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2023-08.zip",
        )

        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, KLINE_PYARROW_SCHEMA)
        self.assertEqual(table["symbol"][0].as_py(), "BTCUSDT")
        self.assertEqual(table["open"][0].as_py(), 29230.10)
        self.assertEqual(table["close"][1].as_py(), 29420.00)

    def test_cleaner_trades(self):
        csv_data = (
            "1001,29230.5,0.05,1461.525,1690848005000,true\n"
            "1002,29231.0,0.12,3507.720,1690848006000,false\n"
        )
        zip_bytes = self._create_mock_zip("BTCUSDT-trades-2023-08.csv", csv_data)

        table = BinanceVisionCleaner.clean_zip_to_table(
            zip_bytes=zip_bytes,
            data_type="trades",
            symbol="BTCUSDT",
            market="spot",
            source_file="mock.zip",
        )

        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, TRADE_PYARROW_SCHEMA)
        self.assertEqual(table["trade_id"][0].as_py(), 1001)
        self.assertEqual(table["is_buyer_maker"][0].as_py(), True)

    def test_cleaner_agg_trades(self):
        csv_data = (
            "5001,29230.5,0.25,1001,1003,1690848005000,true\n"
            "5002,29232.0,0.50,1004,1006,1690848007000,false\n"
        )
        zip_bytes = self._create_mock_zip("BTCUSDT-aggTrades-2023-08.csv", csv_data)

        table = BinanceVisionCleaner.clean_zip_to_table(
            zip_bytes=zip_bytes,
            data_type="aggTrades",
            symbol="BTCUSDT",
            market="spot",
            source_file="mock.zip",
        )

        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, AGG_TRADE_PYARROW_SCHEMA)
        self.assertEqual(table["agg_trade_id"][0].as_py(), 5001)

    def test_ledger_flow(self):
        ledger = BinanceVisionLedger(db_path=self.db_path, central_db_path=self.central_db)
        files = [
            {"key": "data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2023-08.zip", "size": 15000},
            {"key": "data/spot/monthly/klines/ETHUSDT/1d/ETHUSDT-1d-2023-08.zip", "size": 12000},
        ]
        inserted = ledger.index_files(files)
        self.assertEqual(inserted, 2)

        pending = ledger.get_pending_files(symbol="BTCUSDT")
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["symbol"], "BTCUSDT")

        # Mark sharded
        ledger.mark_file_sharded(
            file_key=pending[0]["file_key"],
            shard_name="binance_spot_klines_BTCUSDT_1d_0001.parquet",
            row_count=31,
            sha256="abcd1234ef",
        )

        stats = ledger.get_stats()
        self.assertEqual(stats["file_statuses"].get("sharded"), 1)
        self.assertEqual(stats["distinct_symbols"], 2)

    def test_sharder_write(self):
        sharder = BinanceVisionParquetSharder(output_dir=self.parquet_dir)
        csv_data = "1690848000000,29230.10,29400.00,29100.50,29350.20,1542.30,1690934399999,45123000.5,12450,750.2,21980000.1,0\n"
        zip_bytes = self._create_mock_zip("BTCUSDT-1d-2023-08.csv", csv_data)
        table = BinanceVisionCleaner.clean_zip_to_table(zip_bytes, "klines", "BTCUSDT", "spot", "1d", "file.zip")

        res = sharder.write_shard(table, market="spot", data_type="klines", symbol="BTCUSDT", interval="1d", shard_seq=1)
        self.assertTrue(os.path.exists(res["path"]))
        self.assertEqual(res["row_count"], 1)
        self.assertTrue(len(res["md5"]) == 32)

        # Read back parquet and verify
        read_table = pq.read_table(res["path"])
        self.assertEqual(read_table.num_rows, 1)

    def test_downloader_xml_parsing(self):
        sample_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <Name>data.binance.vision</Name>
            <Prefix>data/spot/monthly/klines/BTCUSDT/1d/</Prefix>
            <Contents>
                <Key>data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2023-08.zip</Key>
                <LastModified>2023-09-01T00:00:00.000Z</LastModified>
                <Size>12345</Size>
            </Contents>
            <Contents>
                <Key>data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2023-08.zip.CHECKSUM</Key>
                <LastModified>2023-09-01T00:00:00.000Z</LastModified>
                <Size>64</Size>
            </Contents>
            <IsTruncated>false</IsTruncated>
        </ListBucketResult>"""
        
        downloader = BinanceVisionDownloader()
        downloader._http_get = lambda url: sample_xml

        result = downloader.list_bucket("data/spot/monthly/klines/BTCUSDT/1d/")
        self.assertEqual(len(result["files"]), 2)
        self.assertEqual(result["files"][0]["key"], "data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2023-08.zip")
        self.assertEqual(result["files"][0]["size"], 12345)
        self.assertFalse(result["is_truncated"])

    def test_orchestrator_mocked_run(self):
        orchestrator = BinanceVisionOrchestrator(
            market="spot",
            data_type="klines",
            symbols=["BTCUSDT"],
            interval="1d",
            db_path=self.db_path,
            upload_drive=False,
            dry_run=True,
        )
        # Mock crawler to avoid network calls during test
        orchestrator.downloader.crawl_prefix = lambda prefix, file_suffix=".zip", max_files=None: [
            {"key": "data/spot/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2023-08.zip", "size": 15000}
        ]
        res = orchestrator.run(max_files=1)
        self.assertEqual(res["status"], "dry_run_complete")
        self.assertEqual(res["discovered"], 1)


if __name__ == "__main__":
    unittest.main()
