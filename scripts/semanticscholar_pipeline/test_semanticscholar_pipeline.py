#!/usr/bin/env python3
"""
Unit tests for Semantic Scholar pipeline -- protokol-7
Tests: record cleaner quality gate, field extraction, packer schema.
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleaner import build_record, _clean
from packer import S2ParquetSharder

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------

_ABSTRACT_PASS = (
    "We present a systematic evaluation of transformer architectures "
    "on cross-lingual transfer learning tasks, demonstrating that "
    "multilingual pre-training significantly improves downstream "
    "performance on low-resource target languages across fifteen "
    "benchmarks spanning four NLP task categories."
)

_ABSTRACT_SHORT = "Too short."

_RAW_PAPER_PASS = {
    "paperId": "abc123def456",
    "title": "Cross-Lingual Transfer in Transformer Models",
    "abstract": _ABSTRACT_PASS,
    "externalIds": {
        "DOI": "10.1234/test.2023",
        "ArXiv": "2301.00042",
        "PubMed": "36789012",
    },
    "authors": [
        {"name": "Alice Smith"},
        {"name": "Bob Jones"},
        {"name": "Carol Wu"},
    ],
    "year": 2023,
    "publicationDate": "2023-04-10",
    "citationCount": 87,
    "referenceCount": 45,
    "isOpenAccess": True,
    "openAccessPdf": {"url": "https://arxiv.org/pdf/2301.00042"},
    "s2FieldsOfStudy": [
        {"category": "Computer Science"},
        {"category": "Linguistics"},
    ],
    "publicationTypes": ["JournalArticle"],
    "journal": {"name": "Transactions of the ACL"},
}

_RAW_PAPER_NO_ABSTRACT = {
    "paperId": "nope999",
    "title": "Empty Abstract Paper",
    "abstract": None,
    "externalIds": {},
    "authors": [],
    "year": 2022,
    "publicationDate": "2022-01-01",
    "citationCount": 0,
    "referenceCount": 0,
    "isOpenAccess": False,
    "openAccessPdf": None,
    "s2FieldsOfStudy": [],
    "publicationTypes": [],
    "journal": {},
}

_RAW_PAPER_SHORT_ABSTRACT = {
    "paperId": "short001",
    "title": "Short Abstract Paper",
    "abstract": _ABSTRACT_SHORT,
    "externalIds": {},
    "authors": [{"name": "X Y"}],
    "year": 2021,
    "publicationDate": "2021-03-01",
    "citationCount": 2,
    "referenceCount": 3,
    "isOpenAccess": False,
    "openAccessPdf": None,
    "s2FieldsOfStudy": [],
    "publicationTypes": [],
    "journal": {},
}


# ------------------------------------------------------------------
# _clean helper
# ------------------------------------------------------------------

class TestCleanHelper(unittest.TestCase):
    def test_collapses_multiple_spaces(self):
        result = _clean("word   word\t\tword")
        self.assertEqual(result, "word word word")

    def test_collapses_multiple_newlines(self):
        result = _clean("para1\n\n\n\npara2")
        self.assertEqual(result, "para1\n\npara2")

    def test_strips_leading_trailing(self):
        result = _clean("  hello world  ")
        self.assertEqual(result, "hello world")

    def test_empty_string(self):
        result = _clean("")
        self.assertEqual(result, "")


# ------------------------------------------------------------------
# build_record
# ------------------------------------------------------------------

class TestBuildRecord(unittest.TestCase):
    def test_builds_valid_record(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["paper_id"], "abc123def456")
        self.assertIn("Cross-Lingual", rec["title"])
        self.assertIn("Alice Smith", rec["authors"])
        self.assertEqual(rec["doi"], "10.1234/test.2023")
        self.assertEqual(rec["arxiv_id"], "2301.00042")
        self.assertEqual(rec["pubmed_id"], "36789012")

    def test_no_abstract_returns_none(self):
        rec = build_record(_RAW_PAPER_NO_ABSTRACT)
        self.assertIsNone(rec)

    def test_short_abstract_returns_none(self):
        rec = build_record(_RAW_PAPER_SHORT_ABSTRACT)
        self.assertIsNone(rec)

    def test_year_is_integer(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertIsInstance(rec["year"], int)
        self.assertEqual(rec["year"], 2023)

    def test_citation_count_integer(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertIsInstance(rec["citation_count"], int)
        self.assertEqual(rec["citation_count"], 87)

    def test_reference_count_integer(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertIsInstance(rec["reference_count"], int)
        self.assertEqual(rec["reference_count"], 45)

    def test_is_open_access_flag(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["is_open_access"], 1)

    def test_oa_pdf_url_extracted(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["oa_pdf_url"], "https://arxiv.org/pdf/2301.00042")

    def test_fields_of_study_extracted(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertIn("Computer Science", rec["fields_of_study"])

    def test_journal_extracted(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertIn("ACL", rec["journal"])

    def test_text_contains_title_and_abstract(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertIn("Cross-Lingual Transfer", rec["text"])
        self.assertIn("transformer architectures", rec["text"])

    def test_char_word_counts_positive(self):
        rec = build_record(_RAW_PAPER_PASS)
        self.assertIsNotNone(rec)
        self.assertGreater(rec["char_count"], 0)
        self.assertGreater(rec["word_count"], 0)

    def test_author_list_capped_at_10(self):
        raw = dict(_RAW_PAPER_PASS)
        raw["authors"] = [{"name": f"Author {i}"} for i in range(15)]
        rec = build_record(raw)
        self.assertIsNotNone(rec)
        # 10 authors joined by "; " → max 9 separators
        author_count = len(rec["authors"].split("; "))
        self.assertLessEqual(author_count, 10)

    def test_missing_oa_pdf_field_none_safe(self):
        raw = dict(_RAW_PAPER_PASS)
        raw["openAccessPdf"] = None
        rec = build_record(raw)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["oa_pdf_url"], "")

    def test_empty_external_ids(self):
        raw = dict(_RAW_PAPER_PASS)
        raw["externalIds"] = {}
        rec = build_record(raw)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["doi"], "")
        self.assertEqual(rec["arxiv_id"], "")
        self.assertEqual(rec["pubmed_id"], "")


# ------------------------------------------------------------------
# S2ParquetSharder
# ------------------------------------------------------------------

class TestS2ParquetSharder(unittest.TestCase):
    def _make_record(self, i: int) -> dict:
        return {
            "paper_id":          f"paper{i:05d}",
            "doi":               f"10.0/{i}",
            "arxiv_id":          f"2301.{i:05d}",
            "pubmed_id":         "",
            "title":             f"Research Paper {i}",
            "abstract":          "abstract content " * 10,
            "authors":           "Alice Smith; Bob Jones",
            "year":              2020,
            "publication_date":  "2020-01-01",
            "citation_count":    10,
            "reference_count":   5,
            "is_open_access":    1,
            "oa_pdf_url":        f"https://arxiv.org/pdf/{i}",
            "fields_of_study":   "Computer Science; Mathematics",
            "publication_types": "JournalArticle",
            "journal":           "Nature",
            "text":              "title and abstract combined " * 10,
            "char_count":        300,
            "word_count":        50,
        }

    def test_produces_parquet_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = S2ParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="test_s2",
                batch_size=10,
            )
            for i in range(25):
                sharder.append(self._make_record(i))
            files = sharder.close()
            self.assertGreaterEqual(len(files), 1, "Expected at least one Parquet file.")
            for f in files:
                self.assertTrue(os.path.exists(f))
                self.assertGreater(os.path.getsize(f), 0)

    def test_schema_columns_present(self):
        import pyarrow.parquet as pq
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = S2ParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="schema_s2",
                batch_size=5,
            )
            for i in range(5):
                sharder.append(self._make_record(i))
            files = sharder.close()
            tbl = pq.read_table(files[0])
            expected_cols = {
                "paper_id", "doi", "arxiv_id", "pubmed_id",
                "title", "abstract", "authors", "year",
                "publication_date", "citation_count", "reference_count",
                "is_open_access", "oa_pdf_url", "fields_of_study",
                "publication_types", "journal", "text",
                "char_count", "word_count",
            }
            self.assertTrue(expected_cols.issubset(set(tbl.schema.names)))

    def test_empty_sharder_produces_no_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = S2ParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="empty_s2",
                batch_size=10,
            )
            files = sharder.close()
            self.assertEqual(len(files), 0)

    def test_part_callback_fires(self):
        fired: list = []
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = S2ParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="cb_s2",
                batch_size=5,
                on_part_ready=lambda path, count: fired.append((path, count)),
            )
            for i in range(10):
                sharder.append(self._make_record(i))
            sharder.close()
        self.assertGreaterEqual(len(fired), 1)
        self.assertGreater(fired[0][1], 0)

    def test_is_open_access_stored_as_int8(self):
        import pyarrow.parquet as pq
        import pyarrow as pa
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = S2ParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="type_s2",
                batch_size=5,
            )
            for i in range(5):
                sharder.append(self._make_record(i))
            files = sharder.close()
            tbl = pq.read_table(files[0])
            field = tbl.schema.field("is_open_access")
            self.assertEqual(field.type, pa.int8())


if __name__ == "__main__":
    unittest.main(verbosity=2)
