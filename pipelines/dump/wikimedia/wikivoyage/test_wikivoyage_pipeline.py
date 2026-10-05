#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikivoyage Dump ETL Pipeline — protokol-7
"""

import bz2
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import pyarrow as pa
import pyarrow.parquet as pq

from cleaner import clean_wikivoyage_text, stream_wikivoyage_entries
from downloader import resolve_dump_db_name, build_dump_urls
from packer import StreamingParquetSharder, WIKIVOYAGE_SCHEMA
from orchestrator import LedgerManager


class TestWikivoyagePipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikivoyage_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        self.assertEqual(resolve_dump_db_name("tr"), "trwikivoyage")
        self.assertEqual(resolve_dump_db_name("en"), "enwikivoyage")
        self.assertEqual(resolve_dump_db_name("dewikivoyage"), "dewikivoyage")

        dump_url, md5_url, filename = build_dump_urls("tr")
        self.assertIn("trwikivoyage", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "trwikivoyage-latest-pages-articles.xml.bz2")

    def test_cleaner_travel_listing_formatting(self):
        raw_wikitext = """
== See ==
Welcome to Istanbul.
{{see|name=Hagia Sophia|address=Sultanahmet|content=Historic Byzantine cathedral transformed into a mosque.}}
{{eat|name=Tarihi Sultanahmet Koftecisi|address=Divanyolu Caddesi|content=Famous traditional Turkish meatballs.}}
For more details see [[Blue Mosque]].
[[Category:Istanbul]]
"""
        cleaned = clean_wikivoyage_text(raw_wikitext)
        self.assertIn("**Hagia Sophia**", cleaned)
        self.assertIn("(Sultanahmet)", cleaned)
        self.assertIn("Historic Byzantine cathedral", cleaned)
        self.assertIn("**Tarihi Sultanahmet Koftecisi**", cleaned)
        self.assertIn("Famous traditional Turkish meatballs", cleaned)
        self.assertNotIn("Category:", cleaned)
        self.assertIn("## See", cleaned)

    def test_stream_wikivoyage_entries_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <page>
    <title>Istanbul</title>
    <ns>0</ns>
    <id>901</id>
    <revision>
      <id>1001</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="170">
== Understand ==
Istanbul is Turkey's most populous city and its cultural, economic and historic center.
      </text>
    </revision>
  </page>
  <page>
    <title>Talk:Istanbul</title>
    <ns>1</ns>
    <id>902</id>
    <revision>
      <id>1002</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="50">This is a talk page.</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic_voyage.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikivoyage_entries(bz2_path, lang="en", min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 901)
        self.assertEqual(doc["title"], "Istanbul")
        self.assertIn("cultural, economic and historic center", doc["text"])

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikivoyage",
            batch_size=2,
            snapshot_date="20260929",
        )
        sample_doc_1 = {
            "article_id": 1,
            "title": "Istanbul",
            "lang": "tr",
            "text": "Tarihi ve turistik bilgiler.",
            "raw_length": 100,
            "clean_length": 30,
            "url": "https://tr.wikivoyage.org/wiki/Istanbul",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sample_doc_2 = {
            "article_id": 2,
            "title": "Ankara",
            "lang": "tr",
            "text": "Baskent rehberi.",
            "raw_length": 80,
            "clean_length": 20,
            "url": "https://tr.wikivoyage.org/wiki/Ankara",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sharder.append(sample_doc_1)
        sharder.append(sample_doc_2)
        shards = sharder.close()

        self.assertEqual(len(shards), 1)
        self.assertTrue(os.path.exists(shards[0]))

        table = pq.read_table(shards[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKIVOYAGE_SCHEMA.append(pa.field("pii_status", pa.string())))
        self.assertEqual(table.column("pii_status").to_pylist(), ["unchecked"] * table.num_rows)
        self.assertEqual(table["title"][0].as_py(), "Istanbul")

    def test_ledger_manager_initialization(self):
        db_file = os.path.join(self.test_dir, "test_ledger.sqlite")
        ledger = LedgerManager(db_path=db_file)
        pending = ledger.get_pending_languages()
        self.assertGreaterEqual(len(pending), 10)
        ledger.update_status(pending[0]["db_name"], "completed", total_entries=50)
        row = ledger.get_language(pending[0]["db_name"])
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["total_entries"], 50)
        ledger.close()


if __name__ == "__main__":
    unittest.main()
