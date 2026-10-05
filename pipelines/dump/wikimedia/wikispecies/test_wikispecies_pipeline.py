#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikispecies Dump ETL Pipeline — protokol-7
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

from cleaner import clean_wikispecies_text, stream_wikispecies_entries
from downloader import build_dump_urls
from packer import StreamingParquetSharder, WIKISPECIES_SCHEMA
from orchestrator import LedgerManager


class TestWikispeciesPipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikispecies_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        dump_url, md5_url, filename = build_dump_urls()
        self.assertIn("specieswiki", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "specieswiki-latest-pages-articles.xml.bz2")

    def test_cleaner_taxonavigation_formatting(self):
        raw_wikitext = """
== Taxonavigation ==
{{regnum}} Animalia
{{phylum}} Chordata
{{classis}} Mammalia
{{ordo}} Carnivora
{{familia}} Felidae
{{genus}} Panthera
{{species}} Panthera leo

== Name ==
''Panthera leo'' (Linnaeus, 1758)

== Vernacular names ==
[en]: Lion
[tr]: Aslan
[de]: Löwe
"""
        cleaned = clean_wikispecies_text(raw_wikitext)
        self.assertIn("## Taxonavigation", cleaned)
        self.assertIn("Animalia", cleaned)
        self.assertIn("Panthera leo", cleaned)
        self.assertIn("[tr]: Aslan", cleaned)
        self.assertNotIn("{{regnum}}", cleaned)

    def test_stream_wikispecies_entries_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <page>
    <title>Panthera tigris</title>
    <ns>0</ns>
    <id>2001</id>
    <revision>
      <id>3001</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="180">
== Taxonavigation ==
Familia: Felidae
Genus: Panthera
Species: Panthera tigris
== Name ==
Panthera tigris (Linnaeus, 1758)
      </text>
    </revision>
  </page>
  <page>
    <title>Talk:Panthera tigris</title>
    <ns>1</ns>
    <id>2002</id>
    <revision>
      <id>3002</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="50">This is a talk page.</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic_species.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikispecies_entries(bz2_path, min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 2001)
        self.assertEqual(doc["title"], "Panthera tigris")
        self.assertIn("Panthera tigris (Linnaeus, 1758)", doc["text"])

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikispecies",
            batch_size=2,
            snapshot_date="20260929",
        )
        sample_doc_1 = {
            "article_id": 1,
            "title": "Panthera leo",
            "lang": "mul",
            "text": "Taxonavigation details.",
            "raw_length": 100,
            "clean_length": 30,
            "url": "https://species.wikimedia.org/wiki/Panthera_leo",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sample_doc_2 = {
            "article_id": 2,
            "title": "Panthera onca",
            "lang": "mul",
            "text": "Jaguar details.",
            "raw_length": 80,
            "clean_length": 20,
            "url": "https://species.wikimedia.org/wiki/Panthera_onca",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sharder.append(sample_doc_1)
        sharder.append(sample_doc_2)
        shards = sharder.close()

        self.assertEqual(len(shards), 1)
        self.assertTrue(os.path.exists(shards[0]))

        table = pq.read_table(shards[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKISPECIES_SCHEMA.append(pa.field("pii_status", pa.string())))
        self.assertEqual(table.column("pii_status").to_pylist(), ["unchecked"] * table.num_rows)
        self.assertEqual(table["title"][0].as_py(), "Panthera leo")

    def test_ledger_manager_initialization(self):
        db_file = os.path.join(self.test_dir, "test_ledger.sqlite")
        ledger = LedgerManager(db_path=db_file)
        row = ledger.get_record()
        self.assertIsNotNone(row)
        self.assertEqual(row["db_name"], "specieswiki")
        self.assertEqual(row["status"], "pending")
        ledger.update_status("specieswiki", "completed", total_entries=850000)
        row_updated = ledger.get_record()
        self.assertEqual(row_updated["status"], "completed")
        self.assertEqual(row_updated["total_entries"], 850000)
        ledger.close()


if __name__ == "__main__":
    unittest.main()
