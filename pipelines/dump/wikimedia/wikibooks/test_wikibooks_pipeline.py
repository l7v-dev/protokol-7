#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikibooks Dump ETL Pipeline — protokol-7
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

from cleaner import clean_wikibooks_text, stream_wikibooks_entries
from downloader import resolve_dump_db_name, build_dump_urls
from packer import StreamingParquetSharder, WIKIBOOKS_SCHEMA
from orchestrator import LedgerManager


class TestWikibooksPipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikibooks_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        self.assertEqual(resolve_dump_db_name("tr"), "trwikibooks")
        self.assertEqual(resolve_dump_db_name("en"), "enwikibooks")
        self.assertEqual(resolve_dump_db_name("dewikibooks"), "dewikibooks")

        dump_url, md5_url, filename = build_dump_urls("tr")
        self.assertIn("trwikibooks", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "trwikibooks-latest-pages-articles.xml.bz2")

    def test_cleaner_code_block_preservation(self):
        raw_wikitext = """
== Giriş ==
Bu kitap Python programlamayı öğretir.
<syntaxhighlight lang="python">
def hello():
    print("Merhaba Dünya")
</syntaxhighlight>
Daha fazla bilgi için [[Python]] sayfasına bakınız.
[[Kategori:Python Dersleri]]
"""
        cleaned = clean_wikibooks_text(raw_wikitext)
        self.assertIn("```python", cleaned)
        self.assertIn('print("Merhaba Dünya")', cleaned)
        self.assertIn("```", cleaned)
        self.assertNotIn("<syntaxhighlight", cleaned)
        self.assertNotIn("Kategori:", cleaned)
        self.assertIn("## Giriş", cleaned)

    def test_stream_wikibooks_entries_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <page>
    <title>Python Programlama/Giriş</title>
    <ns>0</ns>
    <id>501</id>
    <revision>
      <id>601</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="150">
== Bölüm 1 ==
Python modern ve dinamik bir programlama dilidir.
      </text>
    </revision>
  </page>
  <page>
    <title>Tartışma:Python</title>
    <ns>1</ns>
    <id>502</id>
    <revision>
      <id>602</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="50">Bu bir tartışma sayfasıdır.</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic_books.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikibooks_entries(bz2_path, lang="tr", min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 501)
        self.assertEqual(doc["title"], "Python Programlama/Giriş")
        self.assertIn("Python modern ve dinamik bir programlama dilidir", doc["text"])

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikibooks",
            batch_size=2,
        )
        sample_doc = {
            "article_id": 999,
            "title": "Veri Yapıları",
            "lang": "tr",
            "text": "## Ağaçlar\nİkili arama ağacı veri yapısı.",
            "raw_length": 60,
            "clean_length": 45,
            "url": "https://tr.wikibooks.org/wiki/Veri_Yap%C4%B1lar%C4%B1",
            "timestamp": "2026-09-29T00:00:00Z",
        }
        sharder.append(sample_doc)
        sharder.append(sample_doc)
        parquet_files = sharder.close()

        self.assertEqual(len(parquet_files), 1)
        table = pq.read_table(parquet_files[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKIBOOKS_SCHEMA.append(pa.field("pii_status", pa.string())))
        self.assertEqual(table.column("pii_status").to_pylist(), ["unchecked"] * table.num_rows)

    def test_ledger_manager_sqlite(self):
        db_path = os.path.join(self.test_dir, "test_books_catalog.sqlite")
        ledger = LedgerManager(db_path=db_path)

        tr_row = ledger.get_language("tr")
        self.assertIsNotNone(tr_row)
        self.assertEqual(tr_row["status"], "pending")

        ledger.update_status("trwikibooks", "completed", total_entries=3400, parquet_size_mb=12.5)
        updated = ledger.get_language("tr")
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["total_entries"], 3400)
        ledger.close()


if __name__ == "__main__":
    unittest.main()
