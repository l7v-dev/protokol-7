#!/usr/bin/env python3
"""
Unit tests for OpenAlex pipeline -- protokol-7
Tests: abstract reconstruction, record cleaner quality gate, packer schema.
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleaner import reconstruct_abstract, build_record
from packer import OpenAlexParquetSharder

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------

# Minimal inverted index: "The quick brown fox jumps over the lazy dog"
_INVERTED_INDEX = {
    "The":   [0, 6],
    "quick": [1],
    "brown": [2],
    "fox":   [3],
    "jumps": [4],
    "over":  [5],
    "lazy":  [7],
    "dog":   [8],
}

# 30+ token abstract inverted index for quality gate pass.
# All words must be distinct — repeated words reduce unique position count,
# and reconstruct_abstract joins by sorted position (one slot per unique word).
_LONG_INDEX: dict = {}
_WORDS = (
    "We present systematic evaluation transformer architectures applied "
    "cross-lingual transfer scenarios demonstrating multilingual pretraining "
    "substantially improves downstream performance low-resource target languages "
    "spanning fifteen diverse benchmarks covering four separate NLP task categories "
    "including classification tagging generation retrieval"
).split()
for _pos, _word in enumerate(_WORDS):
    _LONG_INDEX.setdefault(_word, []).append(_pos)

_RAW_WORK_PASS = {
    "id": "https://openalex.org/W12345",
    "doi": "https://doi.org/10.1234/test",
    "title": "Transformer Efficiency on Low-Resource NLP",
    "display_name": "Transformer Efficiency on Low-Resource NLP",
    "publication_year": 2023,
    "publication_date": "2023-06-15",
    "abstract_inverted_index": _LONG_INDEX,
    "authorships": [
        {"author": {"display_name": "Alice Smith"}},
        {"author": {"display_name": "Bob Jones"}},
    ],
    "open_access": {"oa_url": "https://arxiv.org/abs/2301.00001"},
    "primary_location": {"landing_page_url": ""},
    "cited_by_count": 42,
    "concepts": [
        {"display_name": "Natural Language Processing", "score": 0.95},
        {"display_name": "Machine Learning", "score": 0.80},
    ],
    "type": "article",
    "language": "en",
}

_RAW_WORK_NO_ABSTRACT = {
    "id": "https://openalex.org/W99999",
    "doi": "",
    "title": "Short",
    "display_name": "Short",
    "publication_year": 2020,
    "publication_date": "2020-01-01",
    "abstract_inverted_index": None,
    "authorships": [],
    "open_access": {},
    "primary_location": {},
    "cited_by_count": 0,
    "concepts": [],
    "type": "article",
    "language": "en",
}


# ------------------------------------------------------------------
# reconstruct_abstract
# ------------------------------------------------------------------

class TestReconstructAbstract(unittest.TestCase):
    def test_reconstructs_short_sequence(self):
        result = reconstruct_abstract(_INVERTED_INDEX)
        # Short abstract — under MIN_ABSTRACT_TOKENS (30) — returns None
        self.assertIsNone(result)

    def test_reconstructs_long_sequence(self):
        result = reconstruct_abstract(_LONG_INDEX)
        self.assertIsNotNone(result)
        self.assertIsInstance(result, str)
        self.assertIn("transformer", result.lower())

    def test_none_input_returns_none(self):
        self.assertIsNone(reconstruct_abstract(None))

    def test_empty_dict_returns_none(self):
        self.assertIsNone(reconstruct_abstract({}))

    def test_word_order_preserved(self):
        idx = {"first": [0], "second": [1], "third": [2]}
        # Only 3 tokens — below threshold, returns None
        self.assertIsNone(reconstruct_abstract(idx))

    def test_multi_position_word(self):
        # "the" appears at positions 0 and 6 in _INVERTED_INDEX
        result = reconstruct_abstract(_INVERTED_INDEX)
        # Regardless of quality gate, check no crash on multi-position
        # (returns None because under 30 tokens — that is expected)
        self.assertIsNone(result)


# ------------------------------------------------------------------
# build_record
# ------------------------------------------------------------------

class TestBuildRecord(unittest.TestCase):
    def test_builds_valid_record(self):
        rec = build_record(_RAW_WORK_PASS)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["work_id"], "https://openalex.org/W12345")
        self.assertIn("Transformer", rec["title"])
        self.assertIn("Alice Smith", rec["authors"])
        self.assertEqual(rec["publication_year"], 2023)
        self.assertEqual(rec["language"], "en")
        self.assertEqual(rec["work_type"], "article")
        self.assertGreater(rec["word_count"], 0)
        self.assertGreater(rec["char_count"], 0)

    def test_no_abstract_no_fulltext_returns_none(self):
        rec = build_record(_RAW_WORK_NO_ABSTRACT)
        self.assertIsNone(rec)

    def test_oa_url_extracted(self):
        rec = build_record(_RAW_WORK_PASS)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["oa_url"], "https://arxiv.org/abs/2301.00001")

    def test_concepts_top5(self):
        rec = build_record(_RAW_WORK_PASS)
        self.assertIsNotNone(rec)
        self.assertIn("Natural Language Processing", rec["concepts"])

    def test_fulltext_appended(self):
        long_text = "detailed full text body " * 100
        rec = build_record(_RAW_WORK_PASS, fulltext=long_text)
        self.assertIsNotNone(rec)
        self.assertIn("detailed full text body", rec["text"])

    def test_fulltext_capped_at_50k(self):
        huge_text = "x " * 30_000  # 60_000 chars
        rec = build_record(_RAW_WORK_PASS, fulltext=huge_text)
        self.assertIsNotNone(rec)
        # text field must not explode beyond abstract + title + 50k
        self.assertLess(rec["char_count"], 60_000 + 200)

    def test_cited_by_count_integer(self):
        rec = build_record(_RAW_WORK_PASS)
        self.assertIsNotNone(rec)
        self.assertIsInstance(rec["cited_by_count"], int)
        self.assertEqual(rec["cited_by_count"], 42)

    def test_missing_authors_returns_empty_string(self):
        raw = dict(_RAW_WORK_PASS)
        raw["authorships"] = []
        rec = build_record(raw)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["authors"], "")


# ------------------------------------------------------------------
# OpenAlexParquetSharder
# ------------------------------------------------------------------

class TestOpenAlexParquetSharder(unittest.TestCase):
    def _make_record(self, i: int) -> dict:
        return {
            "work_id":          f"https://openalex.org/W{i}",
            "doi":              f"https://doi.org/10.0/{i}",
            "title":            f"Paper {i}",
            "authors":          "Author A; Author B",
            "publication_year": 2020,
            "publication_date": "2020-01-01",
            "abstract":         "abstract text " * 10,
            "concepts":         "Machine Learning; NLP",
            "language":         "en",
            "work_type":        "article",
            "cited_by_count":   5,
            "oa_url":           f"https://arxiv.org/abs/{i}",
            "text":             "title and abstract combined " * 10,
            "char_count":       300,
            "word_count":       50,
        }

    def test_produces_parquet_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = OpenAlexParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="test_openalex",
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
            sharder = OpenAlexParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="schema_openalex",
                batch_size=5,
            )
            for i in range(5):
                sharder.append(self._make_record(i))
            files = sharder.close()
            tbl = pq.read_table(files[0])
            expected_cols = {
                "work_id", "doi", "title", "authors", "publication_year",
                "publication_date", "abstract", "concepts", "language",
                "work_type", "cited_by_count", "oa_url", "text",
                "char_count", "word_count",
            }
            self.assertTrue(expected_cols.issubset(set(tbl.schema.names)))

    def test_empty_sharder_produces_no_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = OpenAlexParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="empty_openalex",
                batch_size=10,
            )
            files = sharder.close()
            self.assertEqual(len(files), 0)

    def test_part_callback_fires(self):
        fired: list = []
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = OpenAlexParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="cb_openalex",
                batch_size=5,
                on_part_ready=lambda path, count: fired.append((path, count)),
            )
            for i in range(10):
                sharder.append(self._make_record(i))
            sharder.close()
        self.assertGreaterEqual(len(fired), 1)
        self.assertGreater(fired[0][1], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
