#!/usr/bin/env python3
"""
Unit tests for bioRxiv & medRxiv pipeline components (Cleaner, Sharder, Ledger, Downloader, DriveSync).
"""

import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import pyarrow.parquet as pq

from cleaner import BiorxivCleaner
from downloader import BiorxivDownloader
from drive_sync import BiorxivDriveSync
from ledger import BiorxivLedger
from packer import BiorxivSharder

SAMPLE_RAW_BIORXIV = {
    "doi": "10.1101/2026.01.01.697424",
    "title": "Single-nucleus transcriptomics reveals convergent effects of THC exposure on nucleus accumbens",
    "authors": "Smith, J. A.; Doe, M. K.",
    "author_corresponding": "Smith, J. A.",
    "author_corresponding_institution": "Department of Neurobiology, Stanford University",
    "date": "2026-01-01",
    "version": "1",
    "type": "new results",
    "license": "cc_by_nc_nd",
    "category": "neuroscience",
    "abstract": "Adolescence represents a critical window of neurodevelopment vulnerable to cannabinoid exposure. Here we performed single-nucleus RNA sequencing across 45,000 cells.",
    "published": "na",
    "server": "biorxiv",
}

SAMPLE_RAW_MEDRXIV = {
    "doi": "10.1101/2026.02.15.26300123",
    "title": "Phase 2 randomized evaluation of oral kinase inhibitors in refractory rheumatoid arthritis",
    "authors": "Johnson, R. L.; Williams, P. T.",
    "author_corresponding": "Johnson, R. L.",
    "author_corresponding_institution": "Division of Rheumatology, Johns Hopkins University",
    "date": "2026-02-15",
    "version": "2",
    "type": "clinical trial",
    "license": "cc_by",
    "category": "rheumatology",
    "abstract": "We conducted a double-blind, placebo-controlled clinical trial assessing efficacy and safety endpoints in 350 patients with active rheumatoid arthritis.",
    "published": "10.1016/j.clinther.2026.05.001",
    "server": "medrxiv",
}


class TestBiorxivCleaner(unittest.TestCase):
    def setUp(self):
        self.cleaner = BiorxivCleaner(min_char_count=30, min_word_count=5)

    def test_clean_biorxiv_record(self):
        cleaned = self.cleaner.clean_record(SAMPLE_RAW_BIORXIV)
        self.assertIsNotNone(cleaned)
        self.assertEqual(cleaned["doi"], "10.1101/2026.01.01.697424")
        self.assertEqual(cleaned["server"], "biorxiv")
        self.assertEqual(cleaned["category"], "neuroscience")
        self.assertEqual(cleaned["pub_year"], 2026)
        self.assertEqual(cleaned["version"], 1)
        self.assertEqual(cleaned["institution"], "Department of Neurobiology, Stanford University")
        self.assertIn("# Single-nucleus transcriptomics", cleaned["text"])
        self.assertIn("## Abstract", cleaned["text"])
        self.assertGreater(cleaned["char_count"], 100)

    def test_clean_medrxiv_record(self):
        cleaned = self.cleaner.clean_record(SAMPLE_RAW_MEDRXIV)
        self.assertIsNotNone(cleaned)
        self.assertEqual(cleaned["doi"], "10.1101/2026.02.15.26300123")
        self.assertEqual(cleaned["server"], "medrxiv")
        self.assertEqual(cleaned["category"], "rheumatology")
        self.assertEqual(cleaned["pub_year"], 2026)
        self.assertEqual(cleaned["version"], 2)
        self.assertEqual(cleaned["published_doi"], "10.1016/j.clinther.2026.05.001")
        self.assertIn("Phase 2 randomized evaluation", cleaned["text"])

    def test_reject_missing_doi_or_abstract(self):
        # Missing DOI
        bad_rec = dict(SAMPLE_RAW_BIORXIV)
        bad_rec["doi"] = ""
        self.assertIsNone(self.cleaner.clean_record(bad_rec))

        # Paratext title
        bad_rec2 = dict(SAMPLE_RAW_BIORXIV)
        bad_rec2["title"] = "Table of Contents"
        self.assertIsNone(self.cleaner.clean_record(bad_rec2))

        # Too short abstract
        bad_rec3 = dict(SAMPLE_RAW_BIORXIV)
        bad_rec3["abstract"] = "Too short."
        self.assertIsNone(self.cleaner.clean_record(bad_rec3))


class TestBiorxivSharder(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.cleaner = BiorxivCleaner(min_char_count=30, min_word_count=5)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_sharder_pack_and_hash(self):
        completed_shards = []

        def on_complete(info):
            completed_shards.append(info)

        sharder = BiorxivSharder(
            output_dir=self.test_dir,
            filename_prefix="bx",
            batch_size=2,
            max_part_bytes=100 * 1024 * 1024,
            on_shard_completed=on_complete,
        )

        rec1 = self.cleaner.clean_record(SAMPLE_RAW_BIORXIV)
        rec2 = self.cleaner.clean_record(SAMPLE_RAW_MEDRXIV)

        sharder.add_record(rec1)
        sharder.add_record(rec2)
        sharder.close()

        self.assertEqual(len(completed_shards), 1)
        shard = completed_shards[0]
        self.assertTrue(shard["shard_name"].startswith("bx_"))
        self.assertTrue(shard["shard_name"].endswith(".parquet"))
        self.assertEqual(shard["record_count"], 2)
        self.assertEqual(len(shard["sha256"]), 64)
        self.assertEqual(len(shard["md5"]), 32)
        self.assertTrue(os.path.exists(shard["file_path"]))

        # Verify Parquet file can be read and schema matches
        table = pq.read_table(shard["file_path"])
        self.assertEqual(table.num_rows, 2)
        self.assertIn("doi", table.column_names)
        self.assertIn("category", table.column_names)
        self.assertIn("text", table.column_names)


class TestBiorxivLedger(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_biorxiv.sqlite")
        self.central_db = os.path.join(self.test_dir, "test_central.sqlite")
        self.ledger = BiorxivLedger(db_path=self.db_path, central_db_path=self.central_db)
        self.cleaner = BiorxivCleaner(min_char_count=30, min_word_count=5)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_ledger_indexing_and_categories(self):
        rec1 = self.cleaner.clean_record(SAMPLE_RAW_BIORXIV)
        rec2 = self.cleaner.clean_record(SAMPLE_RAW_MEDRXIV)

        self.ledger.index_article(rec1, shard_name="bx_shard_0.parquet")
        self.ledger.index_article(rec2, shard_name="bx_shard_0.parquet")

        self.assertEqual(self.ledger.get_article_count(), 2)
        self.assertEqual(self.ledger.get_article_count(server="biorxiv"), 1)
        self.assertEqual(self.ledger.get_article_count(server="medrxiv"), 1)

        art1 = self.ledger.get_article("10.1101/2026.01.01.697424")
        self.assertIsNotNone(art1)
        self.assertEqual(art1["category"], "neuroscience")
        self.assertEqual(art1["shard_name"], "bx_shard_0.parquet")

        stats = self.ledger.get_category_stats()
        self.assertEqual(len(stats), 2)
        cats = {s["category"]: s["article_count"] for s in stats}
        self.assertEqual(cats.get("neuroscience"), 1)
        self.assertEqual(cats.get("rheumatology"), 1)

        # Register and mark shard uploaded
        self.ledger.register_shard(
            shard_name="bx_shard_0.parquet",
            part_index=0,
            record_count=2,
            byte_size=1234,
            sha256="a" * 64,
            md5="b" * 32,
        )
        self.ledger.mark_shard_uploaded(
            shard_name="bx_shard_0.parquet",
            drive_file_id="drive_id_123",
            verified_md5="b" * 32,
        )
        self.ledger.sync_to_central_catalog("biorxiv")


class TestBiorxivDownloader(unittest.TestCase):
    def setUp(self):
        self.downloader = BiorxivDownloader(min_interval=0.0)

    @patch.object(BiorxivDownloader, "_fetch_url")
    def test_fetch_page_url_construction(self, mock_fetch):
        mock_fetch.return_value = b"""{
            "messages": [{"status": "ok", "count": 1, "total": "100"}],
            "collection": [{"doi": "10.1101/test", "title": "Test Paper", "abstract": "Test abstract"}]
        }"""

        res = self.downloader.fetch_page(
            server="biorxiv",
            interval="2026-01-01/2026-01-02",
            cursor=0,
            category="neuroscience",
        )
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["total"], 100)
        self.assertEqual(len(res["collection"]), 1)

        called_url = mock_fetch.call_args[0][0]
        self.assertIn("api.biorxiv.org/details/biorxiv/2026-01-01/2026-01-02/0/json", called_url)
        self.assertIn("category=neuroscience", called_url)

    @patch.object(BiorxivDownloader, "_fetch_url")
    def test_fetch_by_doi(self, mock_fetch):
        mock_fetch.return_value = b"""{
            "collection": [
                {"doi": "10.1101/2026.01.01.697424", "version": "1"},
                {"doi": "10.1101/2026.01.01.697424", "version": "2"}
            ]
        }"""
        versions = self.downloader.fetch_by_doi("10.1101/2026.01.01.697424", server="biorxiv")
        self.assertEqual(len(versions), 2)
        called_url = mock_fetch.call_args[0][0]
        self.assertIn("api.biorxiv.org/details/biorxiv/10.1101/2026.01.01.697424", called_url)


class TestBiorxivDriveSync(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.test_dir, "sample.parquet")
        with open(self.test_file, "wb") as f:
            f.write(b"SAMPLE PARQUET CONTENT")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_drive_sync_dry_run(self):
        sync = BiorxivDriveSync(dry_run=True)
        res = sync.sync_shard(self.test_file, purge_on_success=True)
        self.assertEqual(res["status"], "dry_run")
        self.assertTrue(res["file_id"].startswith("dry_run_"))
        self.assertEqual(len(res["md5"]), 32)
        # Dry-run must preserve the source bytes even when purge is requested.
        self.assertTrue(os.path.exists(self.test_file))
        with open(self.test_file, "rb") as original:
            self.assertEqual(original.read(), b"SAMPLE PARQUET CONTENT")


if __name__ == "__main__":
    unittest.main()
