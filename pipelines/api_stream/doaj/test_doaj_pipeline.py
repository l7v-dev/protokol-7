#!/usr/bin/env python3
"""
Unit tests for DOAJ pipeline components (Cleaner, Sharder, Ledger, Downloader, DriveSync).
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

from cleaner import DoajCleaner
from downloader import DoajDownloader
from drive_sync import DoajDriveSync
from ledger import DoajLedger
from packer import DoajParquetSharder

SAMPLE_RAW_DOAJ = {
    "id": "doaj-article-123456",
    "created_date": "2026-03-15T10:00:00Z",
    "bibjson": {
        "title": "Quantum machine learning applications in molecular chemistry",
        "abstract": "We explore quantum machine learning architectures for variational ground-state energy estimation of small molecules, showing polynomial quantum advantage.",
        "identifier": [
            {"type": "doi", "id": "10.1234/qml.2026.001"},
            {"type": "pissn", "id": "1234-5678"},
            {"type": "eissn", "id": "8765-4321"}
        ],
        "journal": {
            "title": "Journal of Quantum Algorithms",
            "publisher": "Open Science Publishing",
            "language": ["EN"],
            "issns": ["1234-5678", "8765-4321"]
        },
        "year": "2026",
        "author": [
            {"name": "Alice Turing", "affiliation": "Department of Physics, Oxford University"},
            {"name": "Bob von Neumann", "affiliation": "Institute for Advanced Study, Princeton"}
        ],
        "keywords": ["quantum computing", "machine learning", "molecular modeling"],
        "subject": [
            {"scheme": "LCC", "term": "Physics", "code": "QC"},
            {"scheme": "LCC", "term": "Computer software", "code": "QA76.75-76.765"}
        ],
        "link": [
            {"type": "fulltext", "url": "https://example.org/articles/qml.2026.001.pdf"}
        ]
    }
}


class TestDoajCleaner(unittest.TestCase):
    def setUp(self):
        self.cleaner = DoajCleaner(min_title_len=5, min_abstract_len=10)

    def test_clean_doaj_record(self):
        cleaned = self.cleaner.clean_record(SAMPLE_RAW_DOAJ)
        self.assertIsNotNone(cleaned)
        self.assertEqual(cleaned["id"], "doaj-article-123456")
        self.assertEqual(cleaned["doi"], "10.1234/qml.2026.001")
        self.assertEqual(cleaned["title"], "Quantum machine learning applications in molecular chemistry")
        self.assertEqual(cleaned["journal"], "Journal of Quantum Algorithms")
        self.assertEqual(cleaned["publisher"], "Open Science Publishing")
        self.assertEqual(cleaned["year"], 2026)
        self.assertIn("1234-5678", cleaned["issn"])
        self.assertIn("8765-4321", cleaned["issn"])
        self.assertEqual(cleaned["language"], "EN")
        self.assertIn("Alice Turing", cleaned["authors"])
        self.assertIn("Bob von Neumann", cleaned["authors"])
        self.assertIn("Oxford University", cleaned["affiliations"])
        self.assertIn("quantum computing", cleaned["keywords"])
        self.assertIn("Physics", cleaned["subjects"])
        self.assertEqual(cleaned["fulltext_url"], "https://example.org/articles/qml.2026.001.pdf")
        self.assertGreater(cleaned["char_count"], 100)
        self.assertGreater(cleaned["word_count"], 20)

    def test_reject_invalid_record(self):
        # Empty dict
        self.assertIsNone(self.cleaner.clean_record({}))

        # Missing id
        bad_rec = dict(SAMPLE_RAW_DOAJ)
        bad_rec["id"] = ""
        self.assertIsNone(self.cleaner.clean_record(bad_rec))

        # Too short title
        bad_rec2 = {
            "id": "item-2",
            "bibjson": {"title": "Tiny", "abstract": "Some abstract that is long enough."}
        }
        self.assertIsNone(self.cleaner.clean_record(bad_rec2))


class TestDoajSharder(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.cleaner = DoajCleaner()

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_sharder_pack_and_hash(self):
        completed_shards = []

        def on_complete(info):
            completed_shards.append(info)

        sharder = DoajParquetSharder(
            output_dir=self.test_dir,
            filename_prefix="doaj",
            batch_size=2,
            max_part_bytes=50 * 1024 * 1024,
            on_shard_completed=on_complete,
        )

        rec1 = self.cleaner.clean_record(SAMPLE_RAW_DOAJ)
        rec2 = dict(rec1)
        rec2["id"] = "doaj-article-789012"
        rec2["doi"] = "10.1234/qml.2026.002"

        sharder.add_record(rec1)
        sharder.add_record(rec2)
        sharder.close()

        self.assertEqual(len(completed_shards), 1)
        shard = completed_shards[0]
        self.assertTrue(shard["shard_name"].startswith("doaj_"))
        self.assertTrue(shard["shard_name"].endswith(".parquet"))
        self.assertEqual(shard["record_count"], 2)
        self.assertEqual(len(shard["sha256"]), 64)
        self.assertEqual(len(shard["md5"]), 32)
        self.assertTrue(os.path.exists(shard["file_path"]))

        # Verify Parquet content
        table = pq.read_table(shard["file_path"])
        self.assertEqual(table.num_rows, 2)
        self.assertIn("id", table.column_names)
        self.assertIn("doi", table.column_names)
        self.assertIn("journal", table.column_names)
        self.assertIn("subjects", table.column_names)


class TestDoajLedger(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.test_dir, "test_doaj.sqlite")
        self.central_db = os.path.join(self.test_dir, "test_central.sqlite")
        self.ledger = DoajLedger(db_path=self.db_path, central_db_path=self.central_db)
        self.cleaner = DoajCleaner()

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_ledger_indexing_and_queries(self):
        rec1 = self.cleaner.clean_record(SAMPLE_RAW_DOAJ)
        self.ledger.index_article(rec1, shard_name="doaj_shard_0.parquet")

        self.assertEqual(self.ledger.get_article_count(), 1)
        art = self.ledger.get_article("doaj-article-123456")
        self.assertIsNotNone(art)
        self.assertEqual(art["doi"], "10.1234/qml.2026.001")
        self.assertEqual(art["journal"], "Journal of Quantum Algorithms")
        self.assertEqual(art["shard_name"], "doaj_shard_0.parquet")

        art_doi = self.ledger.get_article_by_doi("10.1234/qml.2026.001")
        self.assertIsNotNone(art_doi)
        self.assertEqual(art_doi["id"], "doaj-article-123456")

        stats = self.ledger.get_subject_stats()
        self.assertGreaterEqual(len(stats), 1)

        # Shard registration and upload
        self.ledger.register_shard(
            shard_name="doaj_shard_0.parquet",
            part_index=0,
            record_count=1,
            byte_size=512,
            sha256="c" * 64,
            md5="d" * 32,
        )
        self.ledger.mark_shard_uploaded(
            shard_name="doaj_shard_0.parquet",
            drive_file_id="drive_file_doaj_123",
            verified_md5="d" * 32,
        )
        self.ledger.sync_to_central_catalog("doaj")


class TestDoajDownloader(unittest.TestCase):
    def setUp(self):
        self.downloader = DoajDownloader(min_interval=0.0)

    @patch.object(DoajDownloader, "_fetch_json")
    def test_search_articles(self, mock_fetch):
        mock_fetch.return_value = {
            "total": 1,
            "page": 1,
            "pageSize": 50,
            "results": [SAMPLE_RAW_DOAJ]
        }
        res = self.downloader.search_articles(query="quantum chemistry", page=1, page_size=50)
        self.assertEqual(res["total"], 1)
        self.assertEqual(len(res["results"]), 1)
        self.assertEqual(res["results"][0]["id"], "doaj-article-123456")

    @patch.object(DoajDownloader, "_fetch_json")
    def test_search_journals(self, mock_fetch):
        mock_fetch.return_value = {
            "total": 1,
            "page": 1,
            "pageSize": 50,
            "results": [{"id": "journal-1", "bibjson": {"title": "Quantum Journal"}}]
        }
        res = self.downloader.search_journals(query="quantum")
        self.assertEqual(res["total"], 1)

    @patch.object(DoajDownloader, "_fetch_json")
    def test_get_article(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_RAW_DOAJ
        art = self.downloader.get_article("doaj-article-123456")
        self.assertEqual(art["id"], "doaj-article-123456")


class TestDoajDriveSync(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.test_file = os.path.join(self.test_dir, "sample.parquet")
        with open(self.test_file, "wb") as f:
            f.write(b"SAMPLE DOAJ PARQUET CONTENT")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_drive_sync_dry_run(self):
        sync = DoajDriveSync(dry_run=True)
        res = sync.sync_shard(self.test_file, purge_on_success=True)
        self.assertEqual(res["status"], "dry_run")
        self.assertTrue(res["file_id"].startswith("dry_run_"))
        self.assertEqual(len(res["md5"]), 32)
        self.assertFalse(os.path.exists(self.test_file))


if __name__ == "__main__":
    unittest.main()
