#!/usr/bin/env python3
"""
Unit & Integration Tests for Wikiversity Dump ETL Pipeline — protokol-7
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

from cleaner import clean_wikiversity_text, stream_wikiversity_entries
from downloader import resolve_dump_db_name, build_dump_urls
from packer import StreamingParquetSharder, WIKIVERSITY_SCHEMA
from orchestrator import LedgerManager


class TestWikiversityPipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_wikiversity_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_downloader_url_resolution(self):
        self.assertEqual(resolve_dump_db_name("en"), "enwikiversity")
        self.assertEqual(resolve_dump_db_name("de"), "dewikiversity")
        self.assertEqual(resolve_dump_db_name("frwikiversity"), "frwikiversity")

        dump_url, md5_url, filename = build_dump_urls("en")
        self.assertIn("enwikiversity", dump_url)
        self.assertTrue(dump_url.endswith("-latest-pages-articles.xml.bz2"))
        self.assertEqual(filename, "enwikiversity-latest-pages-articles.xml.bz2")

    def test_cleaner_academic_block_preservation(self):
        raw_wikitext = """
== Course Syllabus ==
Welcome to Introduction to Quantum Mechanics.
<syntaxhighlight lang="python">
import numpy as np
psi = np.array([1, 0])
</syntaxhighlight>
For lecture materials see [[Physics Department]].
[[Category:Quantum Mechanics Courses]]
"""
        cleaned = clean_wikiversity_text(raw_wikitext)
        self.assertIn("```python", cleaned)
        self.assertIn("import numpy as np", cleaned)
        self.assertIn("```", cleaned)
        self.assertNotIn("<syntaxhighlight", cleaned)
        self.assertNotIn("Category:", cleaned)
        self.assertIn("## Course Syllabus", cleaned)

    def test_stream_wikiversity_entries_with_synthetic_bz2(self):
        synthetic_xml = """<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <page>
    <title>Quantum Mechanics/Lecture 1</title>
    <ns>0</ns>
    <id>701</id>
    <revision>
      <id>801</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="160">
== Overview ==
Quantum mechanics is a fundamental theory in physics that provides a description of physical properties.
      </text>
    </revision>
  </page>
  <page>
    <title>Talk:Quantum Mechanics</title>
    <ns>1</ns>
    <id>702</id>
    <revision>
      <id>802</id>
      <timestamp>2026-01-01T12:00:00Z</timestamp>
      <text bytes="60">This is a talk page for discussion.</text>
    </revision>
  </page>
</mediawiki>"""
        bz2_path = os.path.join(self.test_dir, "synthetic_versity.xml.bz2")
        with bz2.BZ2File(bz2_path, "wb") as f:
            f.write(synthetic_xml.encode("utf-8"))

        entries = list(stream_wikiversity_entries(bz2_path, lang="en", min_length=20))
        self.assertEqual(len(entries), 1)
        doc = entries[0]
        self.assertEqual(doc["article_id"], 701)
        self.assertEqual(doc["title"], "Quantum Mechanics/Lecture 1")
        self.assertIn("fundamental theory in physics", doc["text"])

    def test_parquet_sharder_packaging(self):
        sharder = StreamingParquetSharder(
            output_dir=self.test_dir,
            corpus_prefix="test_wikiversity",
            batch_size=2,
            snapshot_date="20260929",
        )
        sample_doc_1 = {
            "article_id": 1,
            "title": "Module 1",
            "lang": "en",
            "text": "Detailed content for module 1.",
            "raw_length": 100,
            "clean_length": 30,
            "url": "https://en.wikiversity.org/wiki/Module_1",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sample_doc_2 = {
            "article_id": 2,
            "title": "Module 2",
            "lang": "en",
            "text": "Detailed content for module 2.",
            "raw_length": 110,
            "clean_length": 30,
            "url": "https://en.wikiversity.org/wiki/Module_2",
            "timestamp": "2026-09-29T12:00:00Z",
        }
        sharder.append(sample_doc_1)
        sharder.append(sample_doc_2)
        shards = sharder.close()

        self.assertEqual(len(shards), 1)
        self.assertTrue(os.path.exists(shards[0]))

        table = pq.read_table(shards[0])
        self.assertEqual(table.num_rows, 2)
        self.assertEqual(table.schema, WIKIVERSITY_SCHEMA.append(pa.field("pii_status", pa.string())))
        self.assertEqual(table.column("pii_status").to_pylist(), ["unchecked"] * table.num_rows)
        self.assertEqual(table["title"][0].as_py(), "Module 1")

    def test_ledger_manager_initialization(self):
        db_file = os.path.join(self.test_dir, "test_ledger.sqlite")
        ledger = LedgerManager(db_path=db_file)
        pending = ledger.get_pending_languages()
        self.assertGreaterEqual(len(pending), 10)
        ledger.update_status(pending[0]["db_name"], "completed", total_entries=100)
        row = ledger.get_language(pending[0]["db_name"])
        self.assertEqual(row["status"], "completed")
        self.assertEqual(row["total_entries"], 100)
        ledger.close()


if __name__ == "__main__":
    unittest.main()
