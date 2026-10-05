#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikisource Dump ETL Pipeline — protokol-7
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

from cleaner import clean_wikisource_text, stream_wikisource_articles
from downloader import resolve_dump_db_name, build_dump_urls
from packer import StreamingParquetSharder, WIKISOURCE_SCHEMA
from orchestrator import LedgerManager


class TestWikisourcePipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikisource_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        self.assertEqual(resolve_dump_db_name("la"), "lawikisource")
        self.assertEqual(resolve_dump_db_name("tr"), "trwikisource")
        self.assertEqual(resolve_dump_db_name("mul"), "sourceswiki")
        self.assertEqual(resolve_dump_db_name("enwikisource"), "enwikisource")

        dump_url, md5_url, filename = build_dump_urls("la")
        self.assertIn("lawikisource", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "lawikisource-latest-pages-articles.xml.bz2")

    def test_cleaner_verse_and_text_formatting(self):
        raw_wikitext = """
== Liber Primus ==
Gallia est omnis divisa in partes tres.
<poem>
Arma virumque cano, Troiae qui primus ab oris
Italiam, fato profugus, Laviniaque venit
litora...
</poem>
[[Kategori:Latince Eserler]]
[[File:Caesar.jpg|thumb|Julius Caesar]]
"""
        cleaned = clean_wikisource_text(raw_wikitext)
        self.assertIn("Liber Primus", cleaned)
        self.assertIn("Gallia est omnis divisa in partes tres.", cleaned)
        self.assertIn("Arma virumque cano", cleaned)
        self.assertNotIn("Kategori:", cleaned)
        self.assertNotIn("File:", cleaned)

    def test_stream_wikisource_articles_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <siteinfo>
    <sitename>Wikisource</sitename>
  </siteinfo>
  <page>
    <title>De Bello Gallico/Liber I</title>
    <ns>0</ns>
    <id>101</id>
    <revision>
      <id>201</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="180">
== Caput I ==
Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur.
      </text>
    </revision>
  </page>
  <page>
    <title>Disputatio:De Bello Gallico</title>
    <ns>1</ns>
    <id>102</id>
    <revision>
      <id>202</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="80">Disputatio de textu Caesaris.</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic_source.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikisource_articles(bz2_path, lang="la", min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 101)
        self.assertEqual(doc["title"], "De Bello Gallico/Liber I")
        self.assertIn("Gallia est omnis divisa", doc["text"])

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikisource",
            batch_size=2,
            snapshot_date="20260930",
        )
        sample_doc_1 = {
            "article_id": 1,
            "title": "Text 1",
            "lang": "la",
            "text": "Detailed content for classical text 1.",
            "raw_length": 100,
            "clean_length": 38,
            "url": "https://la.wikisource.org/wiki/Text_1",
            "timestamp": "2026-09-30T12:00:00Z",
        }
        sample_doc_2 = {
            "article_id": 2,
            "title": "Text 2",
            "lang": "la",
            "text": "Detailed content for classical text 2.",
            "raw_length": 110,
            "clean_length": 38,
            "url": "https://la.wikisource.org/wiki/Text_2",
            "timestamp": "2026-09-30T12:00:00Z",
        }
        sharder.add_article(sample_doc_1)
        sharder.add_article(sample_doc_2)
        shards = sharder.close()

        self.assertEqual(len(shards), 1)
        self.assertTrue(os.path.exists(shards[0]))

        table = pq.read_table(shards[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKISOURCE_SCHEMA.append(pa.field("pii_status", pa.string())))
        self.assertEqual(table.column("pii_status").to_pylist(), ["unchecked"] * table.num_rows)
        self.assertEqual(table["title"][0].as_py(), "Text 1")

    def test_ledger_manager_initialization(self):
        db_file = os.path.join(self.test_dir, "test_ledger.sqlite")
        ledger = LedgerManager(db_path=db_file)
        pending = ledger.get_pending()
        self.assertGreaterEqual(len(pending), 10)
        ledger.update_status(pending[0]["db_name"], "completed", total_articles=50)
        ledger.conn.close()


if __name__ == "__main__":
    unittest.main()
