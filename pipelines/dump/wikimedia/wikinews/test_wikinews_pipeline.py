#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikinews Dump ETL Pipeline — protokol-7
"""

import bz2
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import pyarrow.parquet as pq

from cleaner import clean_wikinews_text, stream_wikinews_entries
from downloader import resolve_dump_db_name, build_dump_urls
from packer import StreamingParquetSharder, WIKINEWS_SCHEMA
from orchestrator import LedgerManager


class TestWikinewsPipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikinews_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        self.assertEqual(resolve_dump_db_name("tr"), "trwikinews")
        self.assertEqual(resolve_dump_db_name("en"), "enwikinews")
        self.assertEqual(resolve_dump_db_name("dewikinews"), "dewikinews")

        dump_url, md5_url, filename = build_dump_urls("tr")
        self.assertIn("trwikinews", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "trwikinews-latest-pages-articles.xml.bz2")

    def test_cleaner_journalism_formatting(self):
        raw_wikitext = """
== Breaking News ==
A major scientific discovery was announced today in Geneva.
{{source|url=https://example.com/news|title=Discovery Announced|pub=Reuters}}
For further background see [[Particle Physics]].
[[Category:Science News]]
"""
        cleaned = clean_wikinews_text(raw_wikitext)
        self.assertIn("## Breaking News", cleaned)
        self.assertIn("scientific discovery was announced today", cleaned)
        self.assertIn("Kaynak / Source: *Discovery Announced* — Reuters", cleaned)
        self.assertNotIn("Category:", cleaned)

    def test_stream_wikinews_entries_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <page>
    <title>Global Climate Summit Concludes</title>
    <ns>0</ns>
    <id>1101</id>
    <revision>
      <id>1201</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="180">
== Summary ==
Delegates from 195 nations reached an agreement on renewable energy transitions today.
      </text>
    </revision>
  </page>
  <page>
    <title>Talk:Climate Summit</title>
    <ns>1</ns>
    <id>1102</id>
    <revision>
      <id>1202</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="50">This is a talk page.</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic_news.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikinews_entries(bz2_path, lang="en", min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 1101)
        self.assertEqual(doc["title"], "Global Climate Summit Concludes")
        self.assertIn("Delegates from 195 nations", doc["text"])

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikinews",
            batch_size=2,
            snapshot_date="20260929",
        )
        sample_doc_1 = {
            "article_id": 1,
            "title": "News 1",
            "lang": "tr",
            "text": "Son dakika haber detaylari.",
            "raw_length": 100,
            "clean_length": 30,
            "url": "https://tr.wikinews.org/wiki/News_1",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sample_doc_2 = {
            "article_id": 2,
            "title": "News 2",
            "lang": "tr",
            "text": "Ekonomi haber bulteni.",
            "raw_length": 80,
            "clean_length": 20,
            "url": "https://tr.wikinews.org/wiki/News_2",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sharder.append(sample_doc_1)
        sharder.append(sample_doc_2)
        shards = sharder.close()

        self.assertEqual(len(shards), 1)
        self.assertTrue(os.path.exists(shards[0]))

        table = pq.read_table(shards[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKINEWS_SCHEMA)
        self.assertEqual(table["title"][0].as_py(), "News 1")

    def test_ledger_manager_initialization(self):
        db_file = os.path.join(self.test_dir, "test_ledger.sqlite")
        ledger = LedgerManager(db_path=db_file)
        pending = ledger.get_pending_languages()
        self.assertGreaterEqual(len(pending), 10)
        ledger.update_status(pending[0]["db_name"], "completed", total_entries=75)
        row = ledger.get_language(pending[0]["db_name"])
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["total_entries"], 75)
        ledger.close()


if __name__ == "__main__":
    unittest.main()
