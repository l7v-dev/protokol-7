#!/usr/bin/env python3
"""
Unit tests for shared pipeline components -- BaseCleaner, BaseParquetSharder, BaseLedger, BaseDriveSync.
"""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pyarrow as pa
import pyarrow.parquet as pq

from pipelines.shared.cleaner_base import (
    BaseCleaner,
    clean_text,
    reconstruct_inverted_index,
)
from pipelines.shared.drive_sync_base import BaseDriveSync, calculate_md5
from pipelines.shared.ledger_base import BaseLedger
from pipelines.shared.sharder_base import BaseParquetSharder, compute_file_hashes


class TestCleanerBase(unittest.TestCase):
    def test_clean_text_strips_html_and_entities(self):
        raw = "<h1>Title &amp; Subtitle</h1><p>First paragraph.\n\n\nSecond paragraph.</p>"
        cleaned = clean_text(raw)
        self.assertIn("Title & Subtitle", cleaned)
        self.assertNotIn("<h1>", cleaned)
        self.assertIn("First paragraph.\n\nSecond paragraph.", cleaned)

    def test_clean_text_handles_control_chars(self):
        raw = "Hello\x00World\x08!"
        cleaned = clean_text(raw)
        self.assertEqual(cleaned, "Hello World!")

    def test_reconstruct_inverted_index_dict(self):
        index = {"The": [0], "quick": [1], "brown": [2], "fox": [3], "jumps": [4]}
        reconstructed = reconstruct_inverted_index(index, min_tokens=3)
        self.assertEqual(reconstructed, "The quick brown fox jumps")

    def test_reconstruct_inverted_index_min_tokens(self):
        index = {"Short": [0], "text": [1]}
        reconstructed = reconstruct_inverted_index(index, min_tokens=5)
        self.assertIsNone(reconstructed)

    def test_base_cleaner_paratext(self):
        cleaner = BaseCleaner()
        self.assertTrue(cleaner.is_paratext("Journal Volume 42 Table of Contents"))
        self.assertFalse(cleaner.is_paratext("Quantum Computation and Algorithmic Information"))

    def test_base_cleaner_retracted(self):
        cleaner = BaseCleaner()
        self.assertTrue(cleaner.is_retracted({"is_retracted": True}))
        self.assertFalse(cleaner.is_retracted({"is_retracted": False}))


class TestSharderBase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.schema = pa.schema([
            ("id", pa.string()),
            ("title", pa.string()),
            ("val", pa.int32()),
        ])

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_sharder_creates_valid_parquet(self):
        completed = []
        sharder = BaseParquetSharder(
            output_dir=self.temp_dir,
            schema=self.schema,
            filename_prefix="test_part",
            batch_size=5,
            on_shard_completed=lambda info: completed.append(info),
        )

        for i in range(12):
            sharder.add_record({"id": f"id_{i}", "title": f"Title {i}", "val": i * 10})

        shards = sharder.close()
        self.assertEqual(len(shards), 1)
        self.assertEqual(shards[0]["record_count"], 12)
        self.assertTrue(os.path.exists(shards[0]["file_path"]))
        self.assertGreater(shards[0]["byte_size"], 0)
        self.assertTrue(shards[0]["sha256"])
        self.assertTrue(shards[0]["md5"])

        # Validate with pyarrow
        table = pq.read_table(shards[0]["file_path"])
        self.assertEqual(table.num_rows, 12)
        self.assertEqual(table.column_names, ["id", "title", "val", "pii_status"])
        self.assertEqual(table.column("pii_status").to_pylist(), ["unchecked"] * 12)


class TestLedgerBase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_ledger.sqlite")
        self.central_path = os.path.join(self.temp_dir, "catalog.sqlite")

        # Create dummy central catalog
        conn = BaseLedger(self.db_path)._get_conn(self.central_path)
        with conn as c:
            c.execute("""
                CREATE TABLE dataset_shards (
                    shard_id TEXT PRIMARY KEY,
                    dataset_name TEXT,
                    shard_index INTEGER,
                    byte_size INTEGER,
                    record_count INTEGER,
                    sha256_checksum TEXT,
                    storage_uri TEXT,
                    created_at TEXT
                );
            """)
            c.commit()

        self.ledger = BaseLedger(self.db_path, central_db_path=self.central_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_ledger_flow(self):
        self.ledger.register_item("part_001", {"info": "chunk 1"})
        self.ledger.mark_item_completed("part_001", record_count=100)

        self.ledger.register_shard(
            shard_name="test_p00000.parquet",
            part_index=0,
            record_count=100,
            byte_size=10240,
            sha256="abc123sha",
            md5="abc123md5",
        )
        self.ledger.mark_shard_uploaded(
            shard_name="test_p00000.parquet",
            drive_file_id="drive_file_999",
            verified_md5="abc123md5",
        )

        stats = self.ledger.get_stats()
        self.assertEqual(stats["total_shards"], 1)
        self.assertEqual(stats["uploaded_shards"], 1)
        self.assertEqual(stats["total_records"], 100)
        self.assertEqual(stats["completed_items"], 1)

        synced = self.ledger.sync_to_central_catalog("test_corpus")
        self.assertEqual(synced, 1)


class TestDriveSyncBase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.temp_dir, "sample.bin")
        with open(self.test_file, "wb") as f:
            f.write(b"protokol-7 drive sync test data" * 100)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_dry_run_preserves_file_despite_purge_request(self):
        sync = BaseDriveSync(dry_run=True)
        res = sync.upload_file(self.test_file, purge_on_success=True)
        self.assertEqual(res["status"], "dry_run")
        self.assertTrue(os.path.exists(self.test_file))
        with open(self.test_file, 'rb') as retained:
            self.assertEqual(retained.read(), b"protokol-7 drive sync test data" * 100)


if __name__ == "__main__":
    unittest.main()
