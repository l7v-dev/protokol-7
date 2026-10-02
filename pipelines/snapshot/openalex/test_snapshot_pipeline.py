#!/usr/bin/env python3
"""
Unit Test Suite for OpenAlex Snapshot Pipeline -- protokol-7
"""

import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pyarrow.parquet as pq

from cleaner import build_clean_record, clean_text, reconstruct_abstract
from downloader import extract_works_partitions, s3_to_https_url
from ledger import SnapshotLedger
from packer import OA_CLEAN_SCHEMA, OpenAlexSnapshotSharder, compute_file_hashes


class TestCleaner(unittest.TestCase):
    def test_reconstruct_abstract(self):
        inv_index = {
            "Deep": [0],
            "learning": [1],
            "models": [2],
            "are": [3],
            "evaluated": [4],
            "rigorously.": [5],
        }
        res = reconstruct_abstract(inv_index)
        self.assertEqual(res, "Deep learning models are evaluated rigorously.")

        # Test JSON string format
        json_index = json.dumps(inv_index)
        res_json = reconstruct_abstract(json_index)
        self.assertEqual(res_json, "Deep learning models are evaluated rigorously.")

        # Test too short (< 5 tokens)
        short_index = {"Short": [0], "abstract": [1]}
        self.assertIsNone(reconstruct_abstract(short_index))

    def test_clean_text(self):
        raw = "   <p>Hello &amp; <b>World</b>!</p>\n\n\n\nNew   line   "
        cleaned = clean_text(raw)
        self.assertEqual(cleaned, "Hello & World!\n\nNew line")

    def test_build_clean_record_valid(self):
        raw_work = {
            "id": "https://openalex.org/W12345678",
            "doi": "https://doi.org/10.1234/test",
            "title": "Quantum Neural Computing in High-Energy Physics",
            "publication_year": 2024,
            "cited_by_count": 42,
            "is_retracted": False,
            "is_paratext": False,
            "authorships": [
                {"author": {"display_name": "Alice Smith"}},
                {"author": {"display_name": "Bob Jones"}},
            ],
            "primary_topic": {"display_name": "Quantum Computing"},
            "topics": [
                {"display_name": "Artificial Intelligence"},
                {"display_name": "Physics"},
            ],
            "open_access": {
                "is_oa": True,
                "oa_url": "https://arxiv.org/abs/2401.00000",
            },
            "abstract_inverted_index": {
                "We": [0],
                "propose": [1],
                "a": [2],
                "scalable": [3],
                "neural": [4],
                "architecture": [5],
                "for": [6],
                "high-energy": [7],
                "physics": [8],
                "simulations": [9],
                "demonstrating": [10],
                "significant": [11],
                "accuracy": [12],
                "improvements": [13],
                "over": [14],
                "baselines.": [15],
            },
        }

        clean = build_clean_record(raw_work)
        self.assertIsNotNone(clean)
        assert clean is not None
        self.assertEqual(clean["id"], "W12345678")
        self.assertEqual(clean["title"], "Quantum Neural Computing in High-Energy Physics")
        self.assertEqual(clean["year"], 2024)
        self.assertEqual(clean["citations"], 42)
        self.assertTrue(clean["is_oa"])
        self.assertEqual(clean["authors"], "Alice Smith, Bob Jones")
        self.assertIn("Quantum Computing", clean["topics"])
        self.assertIn("# Quantum Neural Computing in High-Energy Physics", clean["text"])
        self.assertIn("## Abstract\nWe propose a scalable neural architecture", clean["text"])

    def test_quality_gate_rejections(self):
        # Retracted work
        self.assertIsNone(
            build_clean_record({"title": "A Valid Title", "is_retracted": True})
        )
        # Paratext work
        self.assertIsNone(
            build_clean_record({"title": "Table of Contents", "is_paratext": True})
        )
        # Short / invalid title
        self.assertIsNone(
            build_clean_record({"title": "Hi", "is_retracted": False, "is_paratext": False})
        )


class TestDownloader(unittest.TestCase):
    def test_s3_to_https_url(self):
        s3_url = "s3://openalex/data/parquet/works/updated_date=2026-09-23/part_0000.parquet"
        https_url = s3_to_https_url(s3_url)
        self.assertEqual(
            https_url,
            "https://openalex.s3.amazonaws.com/data/parquet/works/updated_date=2026-09-23/part_0000.parquet",
        )

    def test_extract_works_partitions(self):
        sample_manifest = {
            "date": "2026-09-23",
            "entities": [
                {
                    "entity": "works",
                    "files": [
                        {
                            "url": "s3://openalex/data/parquet/works/part_0000.parquet",
                            "meta": {"content_length": 1000, "record_count": 50},
                        },
                        {
                            "url": "s3://openalex/data/parquet/works/part_0001.parquet",
                            "meta": {"content_length": 2000, "record_count": 80},
                        },
                    ],
                }
            ],
        }
        partitions = extract_works_partitions(sample_manifest)
        self.assertEqual(len(partitions), 2)
        self.assertEqual(partitions[0]["index"], 0)
        self.assertEqual(partitions[0]["content_length"], 1000)
        self.assertEqual(partitions[1]["record_count"], 80)


class TestPacker(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_sharder_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_sharder_write_and_rotate(self):
        completed_shards = []

        def callback(shard_info):
            completed_shards.append(shard_info)

        # Use very small max_part_bytes to test rotation
        sharder = OpenAlexSnapshotSharder(
            output_dir=self.test_dir,
            snapshot_date="20260930",
            max_part_bytes=5000,
            batch_size=10,
            on_shard_completed=callback,
        )

        sample_record = {
            "id": "W999",
            "doi": "10.123/xyz",
            "title": "A Great Scientific Discovery",
            "year": 2025,
            "authors": "Jane Doe",
            "topics": "AI; Science",
            "is_oa": True,
            "oa_url": "https://example.com/paper.pdf",
            "citations": 10,
            "text": "Full text of scientific discovery...",
            "char_count": 35,
            "word_count": 5,
        }

        # Write enough records to trigger rotation
        for _ in range(25):
            sharder.append(sample_record)

        sharder.close()

        self.assertGreaterEqual(len(completed_shards), 1)
        first_shard = completed_shards[0]
        self.assertTrue(first_shard["filename"].startswith("oa_w_20260930_p"))
        self.assertTrue(first_shard["filename"].endswith(".parquet"))
        self.assertIn("sha256", first_shard)
        self.assertIn("md5", first_shard)
        self.assertTrue(os.path.exists(first_shard["path"]))

        # Verify Parquet content
        table = pq.read_table(first_shard["path"])
        self.assertEqual(table.schema, OA_CLEAN_SCHEMA)
        self.assertGreater(table.num_rows, 0)


class TestLedger(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_ledger_")
        self.db_path = os.path.join(self.test_dir, "test_catalog.sqlite")
        self.central_db = os.path.join(self.test_dir, "catalog.sqlite")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_ledger_lifecycle(self):
        ledger = SnapshotLedger(db_path=self.db_path, central_db_path=self.central_db)

        partitions = [
            {"index": 0, "s3_url": "s3://openalex/part0.parquet", "content_length": 500, "record_count": 20},
            {"index": 1, "s3_url": "s3://openalex/part1.parquet", "content_length": 800, "record_count": 35},
        ]
        inserted = ledger.register_manifest(partitions, "2026-09-23")
        self.assertEqual(inserted, 2)

        pending = ledger.get_pending_partitions()
        self.assertEqual(len(pending), 2)

        # Mark first partition started and completed
        ledger.mark_partition_started("s3://openalex/part0.parquet")
        ledger.mark_partition_completed("s3://openalex/part0.parquet", cleaned_records=18)

        pending_after = ledger.get_pending_partitions()
        self.assertEqual(len(pending_after), 1)
        self.assertEqual(pending_after[0]["s3_url"], "s3://openalex/part1.parquet")

        # Record shard
        shard_info = {
            "filename": "oa_w_20260923_p00000.parquet",
            "part_index": 0,
            "record_count": 18,
            "size_bytes": 10240,
            "size_mb": 0.01,
            "sha256": "abc123sha256",
            "md5": "def456md5",
        }
        ledger.record_shard_created(shard_info)
        ledger.record_shard_verified("oa_w_20260923_p00000.parquet", "drive_id_999", shard_info)

        stats = ledger.get_summary_stats()
        self.assertEqual(stats["completed_partitions"], 1)
        self.assertEqual(stats["total_cleaned_records"], 18)
        self.assertEqual(stats["verified_shards"], 1)


if __name__ == "__main__":
    unittest.main()
