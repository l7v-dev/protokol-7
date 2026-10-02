#!/usr/bin/env python3
"""
Unit tests for PubMed & PMC pipeline components (Cleaner, Sharder, Ledger, Downloader).
"""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import pyarrow.parquet as pq

from cleaner import PubmedCleaner
from downloader import PubmedDownloader
from ledger import PubmedLedger
from packer import PubmedSharder

SAMPLE_PUBMED_XML = b"""<?xml version="1.0"?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2024//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_240101.dtd">
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE">
      <PMID Version="1">38123456</PMID>
      <Article PubModel="Print-Electronic">
        <Journal>
          <JournalIssue CitedMedium="Internet">
            <PubDate>
              <Year>2024</Year>
              <Month>Jan</Month>
            </PubDate>
          </JournalIssue>
          <Title>Nature Medicine</Title>
        </Journal>
        <ArticleTitle>Deep learning for multimodal molecular profiling in oncology.</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Precision oncology requires accurate integration of genomic and pathological modalities.</AbstractText>
          <AbstractText Label="METHODS">We evaluated deep neural networks on 10,000 pan-cancer patient cohorts.</AbstractText>
          <AbstractText Label="RESULTS">The multimodal model improved therapeutic response prediction by 24% over unimodal baselines.</AbstractText>
          <AbstractText Label="CONCLUSIONS">Multimodal foundation models represent a viable approach for clinical decision support.</AbstractText>
        </Abstract>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Smith</LastName>
            <ForeName>John A</ForeName>
          </Author>
          <Author ValidYN="Y">
            <LastName>Doe</LastName>
            <ForeName>Jane B</ForeName>
          </Author>
        </AuthorList>
      </Article>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName MajorTopicYN="Y">Neoplasms</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName MajorTopicYN="N">Deep Learning</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">38123456</ArticleId>
        <ArticleId IdType="doi">10.1038/s41591-024-00123-x</ArticleId>
        <ArticleId IdType="pmc">PMC10800000</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>
"""


class TestPubmedPipeline(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.cleaner = PubmedCleaner()
        self.downloader = PubmedDownloader()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_xml_parsing(self):
        articles = self.downloader._parse_pubmed_xml(SAMPLE_PUBMED_XML)
        self.assertEqual(len(articles), 1)
        art = articles[0]
        self.assertEqual(art["pmid"], "38123456")
        self.assertEqual(art["doi"], "10.1038/s41591-024-00123-x")
        self.assertEqual(art["pmcid"], "PMC10800000")
        self.assertIn("Deep learning for multimodal molecular profiling", art["title"])
        self.assertEqual(art["journal"], "Nature Medicine")
        self.assertEqual(art["pub_year"], 2024)
        self.assertIn("Smith John A", art["authors"])
        self.assertIn("BACKGROUND: Precision oncology", art["abstract"])
        self.assertEqual(len(art["mesh_terms"]), 2)
        self.assertEqual(art["mesh_terms"][0]["name"], "Neoplasms")
        self.assertTrue(art["mesh_terms"][0]["is_major"])

    def test_cleaner_record_synthesis(self):
        articles = self.downloader._parse_pubmed_xml(SAMPLE_PUBMED_XML)
        cleaned = self.cleaner.clean_record(articles[0])
        self.assertIsNotNone(cleaned)
        self.assertEqual(cleaned["pmid"], "38123456")
        self.assertEqual(cleaned["pmcid"], "PMC10800000")
        self.assertIn("# Deep learning for multimodal molecular profiling", cleaned["text"])
        self.assertIn("**MeSH:** Neoplasms*", cleaned["text"])
        self.assertIn("## Abstract", cleaned["text"])
        self.assertGreater(cleaned["char_count"], 100)
        self.assertGreater(cleaned["word_count"], 20)

    def test_cleaner_rejects_paratext(self):
        paratext_raw = {
            "pmid": "12345",
            "title": "Table of Contents - January 2024",
            "abstract": "List of articles and issue information.",
        }
        res = self.cleaner.clean_record(paratext_raw)
        self.assertIsNone(res)

    def test_cleaner_rejects_empty_body(self):
        empty_raw = {
            "pmid": "99999",
            "title": "A Real Study Title But No Abstract",
            "abstract": "",
            "text": "",
        }
        res = self.cleaner.clean_record(empty_raw)
        self.assertIsNone(res)

    def test_sharder_and_parquet_generation(self):
        articles = self.downloader._parse_pubmed_xml(SAMPLE_PUBMED_XML)
        cleaned = self.cleaner.clean_record(articles[0])

        completed_shards = []
        sharder = PubmedSharder(
            output_dir=self.temp_dir,
            filename_prefix="test_pm",
            batch_size=2,
            on_shard_completed=lambda info: completed_shards.append(info),
        )

        sharder.add_record(cleaned)
        shards = sharder.close()

        self.assertEqual(len(shards), 1)
        self.assertEqual(shards[0]["record_count"], 1)
        self.assertTrue(os.path.exists(shards[0]["file_path"]))
        self.assertTrue(shards[0]["sha256"])
        self.assertTrue(shards[0]["md5"])

        # Validate with PyArrow
        table = pq.read_table(shards[0]["file_path"])
        self.assertEqual(table.num_rows, 1)
        self.assertIn("pmid", table.column_names)
        self.assertIn("mesh_terms", table.column_names)
        self.assertEqual(table["pmid"][0].as_py(), "38123456")

    def test_ledger_persistence(self):
        db_path = os.path.join(self.temp_dir, "test_pm_ledger.sqlite")
        central_path = os.path.join(self.temp_dir, "catalog.sqlite")

        # Mock central catalog
        with PubmedLedger(db_path)._get_conn(central_path) as c:
            c.execute("""
                CREATE TABLE dataset_shards (
                    shard_id TEXT PRIMARY KEY,
                    dataset_name TEXT,
                    shard_index INTEGER,
                    byte_size INTEGER,
                    record_count INTEGER,
                    sha256_checksum TEXT,
                    storage_uri TEXT,
                    created_at TEXT
                );
            """)
            c.commit()

        ledger = PubmedLedger(db_path=db_path, central_db_path=central_path)

        articles = self.downloader._parse_pubmed_xml(SAMPLE_PUBMED_XML)
        cleaned = self.cleaner.clean_record(articles[0])

        ledger.index_article(cleaned, shard_name="pm_part00000.parquet")
        self.assertEqual(ledger.get_article_count(), 1)

        saved = ledger.get_article("38123456")
        self.assertIsNotNone(saved)
        self.assertEqual(saved["doi"], "10.1038/s41591-024-00123-x")
        self.assertEqual(len(saved["mesh_headings"]), 2)

        ledger.register_shard(
            shard_name="pm_part00000.parquet",
            part_index=0,
            record_count=1,
            byte_size=2048,
            sha256="fake_sha256",
            md5="fake_md5",
        )
        ledger.mark_shard_uploaded(
            shard_name="pm_part00000.parquet",
            drive_file_id="drive_pm_123",
            verified_md5="fake_md5",
        )

        synced = ledger.sync_to_central_catalog("pubmed")
        self.assertEqual(synced, 1)


if __name__ == "__main__":
    unittest.main()
