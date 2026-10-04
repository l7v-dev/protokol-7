#!/usr/bin/env python3
"""
Unit tests for Aperta pipeline components (Cleaner, Sharder, Ledger, Downloader, DriveSync).
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import pyarrow.parquet as pq

from cleaner import ApertaCleaner
from downloader import ApertaDownloader
from drive_sync import ApertaDriveSync
from ledger import ApertaLedger
from packer import ApertaParquetSharder
from pdf_tar_packer import ApertaPdfTarSharder

SAMPLE_OAI_XML = b"""<?xml version='1.0' encoding='UTF-8'?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <responseDate>2026-10-04T18:36:29Z</responseDate>
  <request verb="ListRecords" metadataPrefix="oai_dc">https://aperta.ulakbim.gov.tr/oai2d</request>
  <ListRecords>
    <record>
      <header>
        <identifier>oai:aperta.ulakbim.gov.tr:241793</identifier>
        <datestamp>2022-10-18T15:00:16Z</datestamp>
        <setSpec>openaire_data</setSpec>
      </header>
      <metadata>
        <oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
          <dc:creator>Nurdan, Kuru</dc:creator>
          <dc:creator>Onur, Dereli</dc:creator>
          <dc:date>2022-10-18</dc:date>
          <dc:description>The files for protein O00476 have been obtained in terms of PHACT algorithm.</dc:description>
          <dc:identifier>https://doi.org/10.48623/aperta.241793</dc:identifier>
          <dc:identifier>oai:aperta.ulakbim.gov.tr:241793</dc:identifier>
          <dc:rights>info:eu-repo/semantics/openAccess</dc:rights>
          <dc:title>Protein id is O00476</dc:title>
          <dc:type>info:eu-repo/semantics/other</dc:type>
        </oai_dc:dc>
      </metadata>
    </record>
    <resumptionToken expirationDate="2026-10-04T18:38:41Z" cursor="0" completeListSize="91188">tok12345</resumptionToken>
  </ListRecords>
</OAI-PMH>"""

SAMPLE_REST_RECORD = {
    "id": 241793,
    "doi": "10.48623/aperta.241793",
    "created": "2022-10-18T15:00:16Z",
    "metadata": {
        "title": "Protein id is O00476 Dataset",
        "publication_date": "2022-10-18",
        "description": "Comprehensive protein sequence dataset for evolutionary mutations analysis.",
        "creators": [{"name": "Nurdan Kuru", "affiliation": "Bilkent University"}],
        "resource_type": {"type": "dataset", "title": "Dataset"},
        "language": "eng",
        "keywords": ["bioinformatics", "protein", "mutations"],
        "custom": {
            "aperta:science_branches": [
                {"title": {"tr": "Biyoinformatik ve Genetik", "en": "Bioinformatics and Genetics"}}
            ]
        },
        "license": "CC-BY-4.0"
    },
    "files": [
        {
            "id": "file-abc-123",
            "key": "protein_seqs.tar.gz",
            "size": 1048576,
            "checksum": "md5:1234567890abcdef1234567890abcdef",
            "links": {
                "self": "https://aperta.ulakbim.gov.tr/api/records/241793/files/protein_seqs.tar.gz/content"
            }
        }
    ]
}


class TestApertaDownloader(unittest.TestCase):
    def setUp(self):
        self.downloader = ApertaDownloader(min_interval=0.0)

    def test_parse_oai_xml(self):
        records, next_token, cursor, total = self.downloader._parse_oai_xml(SAMPLE_OAI_XML)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "241793")
        self.assertEqual(records[0]["oai_identifier"], "oai:aperta.ulakbim.gov.tr:241793")
        self.assertEqual(next_token, "tok12345")
        self.assertEqual(cursor, 0)
        self.assertEqual(total, 91188)
        self.assertIn("Nurdan, Kuru", records[0]["dc"]["creator"])
        self.assertEqual(records[0]["dc"]["title"], ["Protein id is O00476"])

    @patch.object(ApertaDownloader, "_fetch_url")
    def test_fetch_oai_page(self, mock_fetch):
        mock_fetch.return_value = SAMPLE_OAI_XML
        records, next_token, cursor, total = self.downloader.fetch_oai_page()
        self.assertEqual(len(records), 1)
        self.assertEqual(next_token, "tok12345")

    @patch.object(ApertaDownloader, "_fetch_url")
    def test_search_rest(self, mock_fetch):
        mock_fetch.return_value = json.dumps({"hits": {"total": 1, "hits": [SAMPLE_REST_RECORD]}}).encode("utf-8")
        res = self.downloader.search_rest(query="protein")
        self.assertEqual(res["hits"]["total"], 1)
        self.assertEqual(len(res["hits"]["hits"]), 1)


class TestApertaCleaner(unittest.TestCase):
    def setUp(self):
        self.cleaner = ApertaCleaner()

    def test_clean_oai_record(self):
        downloader = ApertaDownloader()
        records, _, _, _ = downloader._parse_oai_xml(SAMPLE_OAI_XML)
        cleaned = self.cleaner.clean_record(records[0])
        self.assertIsNotNone(cleaned)
        self.assertEqual(cleaned["id"], "241793")
        self.assertEqual(cleaned["doi"], "10.48623/aperta.241793")
        self.assertEqual(cleaned["title"], "Protein id is O00476")
        self.assertIn("Nurdan, Kuru", cleaned["creators"])
        self.assertGreater(cleaned["char_count"], 20)
        self.assertGreater(cleaned["word_count"], 3)

    def test_clean_rest_record(self):
        cleaned = self.cleaner.clean_record(SAMPLE_REST_RECORD)
        self.assertIsNotNone(cleaned)
        self.assertEqual(cleaned["id"], "241793")
        self.assertEqual(cleaned["title"], "Protein id is O00476 Dataset")
        self.assertEqual(cleaned["resource_type"], "dataset")
        self.assertEqual(cleaned["file_count"], 1)
        self.assertEqual(cleaned["total_file_size"], 1048576)
        self.assertIn("Bioinformatics and Genetics", cleaned["subjects"])
        self.assertIn("protein_seqs.tar.gz", cleaned["files_json"])

    def test_filter_paratext(self):
        invalid_item = {
            "id": "111",
            "metadata": {
                "title": "Table of Contents",
                "description": "Editorial board"
            }
        }
        self.assertIsNone(self.cleaner.clean_record(invalid_item))


class TestApertaLedger(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_aperta.sqlite")
        self.ledger = ApertaLedger(db_path=self.db_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_upsert_and_retrieve_stats(self):
        cleaner = ApertaCleaner()
        record = cleaner.clean_record(SAMPLE_REST_RECORD)
        self.assertIsNotNone(record)

        inserted = self.ledger.upsert_records([record])
        self.assertEqual(inserted, 1)

        stats = self.ledger.get_stats()
        self.assertEqual(stats["total_records"], 1)
        self.assertEqual(stats["indexed_records"], 1)
        self.assertEqual(stats["total_files"], 1)
        self.assertEqual(stats["total_bytes"], 1048576)

    def test_resumption_token_checkpoint(self):
        self.ledger.save_resumption_token("tok_checkpoint_999", cursor=500, total=91188)
        info = self.ledger.get_resumption_token()
        self.assertIsNotNone(info)
        self.assertEqual(info["token"], "tok_checkpoint_999")
        self.assertEqual(info["cursor"], 500)
        self.assertEqual(info["total"], 91188)

    def test_sharding_lifecycle(self):
        cleaner = ApertaCleaner()
        record = cleaner.clean_record(SAMPLE_REST_RECORD)
        self.ledger.upsert_records([record])

        unsharded = self.ledger.get_unsharded_records()
        self.assertEqual(len(unsharded), 1)

        self.ledger.mark_sharded([record["id"]], "aperta_part_000000.parquet")
        stats = self.ledger.get_stats()
        self.assertEqual(stats["sharded_records"], 1)
        self.assertEqual(stats["indexed_records"], 0)


class TestApertaSharder(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.sharder = ApertaParquetSharder(
            output_dir=self.temp_dir,
            max_part_bytes=10 * 1024 * 1024,
            max_part_entries=100,
            batch_size=10,
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_write_parquet_shard(self):
        cleaner = ApertaCleaner()
        rec = cleaner.clean_record(SAMPLE_REST_RECORD)

        for _ in range(5):
            self.sharder.append_record(rec)

        sealed_shards = self.sharder.close()
        self.assertEqual(len(sealed_shards), 1)
        shard_path = sealed_shards[0]["file_path"]
        self.assertTrue(os.path.exists(shard_path))

        table = pq.read_table(shard_path)
        self.assertEqual(len(table), 5)
        self.assertIn("doi", table.column_names)
        self.assertIn("files_json", table.column_names)


class TestApertaPdfArchiver(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.tar_sharder = ApertaPdfTarSharder(
            output_dir=self.temp_dir,
            target_gb=0.001,
            max_gb=0.01,
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_tar_archive_creation(self):
        sample_pdf_bytes = b"%PDF-1.4 sample pdf binary stream for testing"
        shard_name = self.tar_sharder.append_file("241793_article.pdf", sample_pdf_bytes)
        self.assertTrue(shard_name.endswith(".tar.gz"))

        shard_info = self.tar_sharder.close_shard()
        self.assertIsNotNone(shard_info)
        self.assertEqual(shard_info["record_count"], 1)
        self.assertTrue(os.path.exists(shard_info["file_path"]))
        self.assertGreater(len(shard_info["sha256"]), 10)
        self.assertGreater(len(shard_info["md5"]), 10)

        # Verify tar content
        import tarfile
        with tarfile.open(shard_info["file_path"], "r:gz") as tar:
            members = tar.getmembers()
            self.assertEqual(len(members), 1)
            self.assertEqual(members[0].name, "241793_article.pdf")
            self.assertEqual(members[0].size, len(sample_pdf_bytes))


if __name__ == "__main__":
    unittest.main()

