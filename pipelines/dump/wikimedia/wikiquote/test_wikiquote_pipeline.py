#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikiquote Dump ETL Pipeline — protokol-7
"""

import bz2
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import pyarrow.parquet as pq

from cleaner import clean_wikiquote_text, count_quotes_in_text, stream_wikiquote_entries
from downloader import resolve_dump_db_name, build_dump_urls
from packer import StreamingParquetSharder, WIKIQUOTE_SCHEMA
from orchestrator import LedgerManager


class TestWikiquotePipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikiquote_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        self.assertEqual(resolve_dump_db_name("tr"), "trwikiquote")
        self.assertEqual(resolve_dump_db_name("en"), "enwikiquote")
        self.assertEqual(resolve_dump_db_name("lawikiquote"), "lawikiquote")

        dump_url, md5_url, filename = build_dump_urls("tr")
        self.assertIn("trwikiquote", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "trwikiquote-latest-pages-articles.xml.bz2")
        self.assertTrue(md5_url.endswith("-latest-md5sums.txt"))

    def test_cleaner_text_transformation(self):
        raw_wikitext = """
<!-- Gizli yorum -->
{{Alıntı kutusu|içerik=Deneme}}
== Sözleri ==
* '''Hayatta en hakiki mürşit ilimdir.'''<ref>Kaynak: Hakimiyet-i Milliye</ref>
** Türk milleti çalışkandır.
{| class="wikitable"
|-
| Tablo hücresi
|}
[[Kategori:Türk düşünürler]]
[[Mustafa Kemal Atatürk|Atatürk]] der ki: [[Dosya:Resim.jpg]]
[https://example.com/kaynak Dış bağlantı metni]
"""
        cleaned = clean_wikiquote_text(raw_wikitext)
        self.assertNotIn("Gizli yorum", cleaned)
        self.assertNotIn("<ref>", cleaned)
        self.assertNotIn("Kategori:", cleaned)
        self.assertNotIn("Dosya:", cleaned)
        self.assertNotIn("Tablo hücresi", cleaned)
        self.assertIn("**Hayatta en hakiki mürşit ilimdir.**", cleaned)
        self.assertIn("- **Hayatta en hakiki mürşit ilimdir.**", cleaned)
        self.assertIn("- Türk milleti çalışkandır.", cleaned)
        self.assertIn("Atatürk der ki:", cleaned)
        self.assertIn("Dış bağlantı metni", cleaned)

        quote_count = count_quotes_in_text(cleaned)
        self.assertGreaterEqual(quote_count, 2)

    def test_stream_wikiquote_entries_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <page>
    <title>Socrates</title>
    <ns>0</ns>
    <id>101</id>
    <revision>
      <id>201</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="200">
== Quotes ==
* An unexamined life is not worth living.
* I know that I know nothing.
      </text>
    </revision>
  </page>
  <page>
    <title>Talk:Socrates</title>
    <ns>1</ns>
    <id>102</id>
    <revision>
      <id>202</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="50">Should be ignored (talk page).</text>
    </revision>
  </page>
  <page>
    <title>Redirect Page</title>
    <ns>0</ns>
    <id>103</id>
    <redirect title="Socrates" />
    <revision>
      <id>203</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="20">#REDIRECT [[Socrates]]</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikiquote_entries(bz2_path, lang="en", min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 101)
        self.assertEqual(doc["title"], "Socrates")
        self.assertEqual(doc["lang"], "en")
        self.assertIn("An unexamined life is not worth living", doc["text"])
        self.assertGreaterEqual(doc["quotes_count"], 2)

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikiquote",
            batch_size=2,
        )
        sample_doc = {
            "article_id": 555,
            "title": "Aristoteles",
            "lang": "tr",
            "text": "- Bilgelik, merakla başlar.",
            "quotes_count": 1,
            "raw_length": 50,
            "clean_length": 25,
            "url": "https://tr.wikiquote.org/wiki/Aristoteles",
            "timestamp": "2026-09-29T00:00:00Z",
        }
        sharder.append(sample_doc)
        sharder.append(sample_doc)
        parquet_files = sharder.close()

        self.assertEqual(len(parquet_files), 1)
        self.assertTrue(os.path.exists(parquet_files[0]))

        table = pq.read_table(parquet_files[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKIQUOTE_SCHEMA)
        self.assertEqual(table.column("title")[0].as_py(), "Aristoteles")

    def test_ledger_manager_sqlite(self):
        db_path = os.path.join(self.test_dir, "test_catalog.sqlite")
        ledger = LedgerManager(db_path=db_path)

        tr_row = ledger.get_language("tr")
        self.assertIsNotNone(tr_row)
        self.assertEqual(tr_row["status"], "pending")

        ledger.update_status("trwikiquote", "completed", total_entries=1500, parquet_size_mb=4.5)
        updated = ledger.get_language("tr")
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["total_entries"], 1500)
        self.assertAlmostEqual(updated["parquet_size_mb"], 4.5)
        ledger.close()


if __name__ == "__main__":
    unittest.main()
