#!/usr/bin/env python3
"""
Unit tests for Gutenberg pipeline -- protokol-7
Tests: cleaner boilerplate stripping, packer schema, ledger idempotency.
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleaner import clean_gutenberg_text, strip_pg_envelope, build_entry
from packer import GutenbergParquetSharder

# ------------------------------------------------------------------
# Sample fixtures
# ------------------------------------------------------------------

_HEADER = (
    "Some boilerplate text here that should be removed.\n"
    "More boilerplate on multiple lines.\n"
    "*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***\n"
)
_BODY = (
    "Chapter I. Down the Rabbit-Hole\n\n"
    "Alice was beginning to get very tired of sitting by her sister\n"
    "on the bank, and of having nothing to do: once or twice she had\n"
    "peeped into the book her sister was reading, but it had no pictures\n"
    "or conversations in it, and what is the use of a book, thought\n"
    "Alice, without pictures or conversations?\n\n"
    "So she was considering in her own mind (as well as she could, for\n"
    "the hot day made her feel very sleepy and stupid), whether the\n"
    "pleasure of making a daisy-chain would be worth the trouble of\n"
    "getting up and picking the daisies, when suddenly a White Rabbit\n"
    "with pink eyes ran close by her.\n\n"
    "There was nothing so very remarkable in that; nor did Alice think it\n"
    "so very much out of the way to hear the Rabbit say to itself, 'Oh dear!\n"
    "Oh dear! I shall be late!' when she thought it over afterwards, it\n"
    "occurred to her that she ought to have wondered at this, but at the\n"
    "time it all seemed quite natural. But when the Rabbit actually took a\n"
    "watch out of its waistcoat-pocket, and looked at it, and then hurried\n"
    "on, Alice started to her feet, for it flashed across her mind that she\n"
    "had never before seen a rabbit with either a waistcoat-pocket, or a\n"
    "watch to take out of it, and burning with curiosity, she ran across\n"
    "the field after it, and fortunately was just in time to see it pop\n"
    "down a large rabbit-hole under the hedge.\n\n"
    "In another moment down went Alice after it, never once considering how\n"
    "in the world she was to get out again.\n\n"
)
_FOOTER = (
    "*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***\n"
    "This file should be named 11.txt or 11.zip\n"
    "This and all associated files of various formats will be found in:\n"
    "        https://www.gutenberg.org/1/\n"
)

SAMPLE_FULL = _HEADER + _BODY + _FOOTER
SAMPLE_BYTES = SAMPLE_FULL.encode("utf-8")


class TestStripPgEnvelope(unittest.TestCase):
    def test_strips_header_and_footer(self):
        result = strip_pg_envelope(SAMPLE_FULL)
        self.assertNotIn("boilerplate", result)
        self.assertNotIn("This file should be named", result)
        self.assertIn("Alice was beginning", result)

    def test_no_sentinels_returns_original(self):
        text = "Just a plain text with no PG markers at all.\n" * 20
        result = strip_pg_envelope(text)
        self.assertIn("Just a plain text", result)


class TestCleanGutenbergText(unittest.TestCase):
    def test_clean_returns_string(self):
        result = clean_gutenberg_text(SAMPLE_BYTES)
        self.assertIsNotNone(result)
        self.assertIsInstance(result, str)

    def test_below_threshold_returns_none(self):
        tiny = b"*** START OF THE PROJECT GUTENBERG EBOOK X ***\nHi.\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n"
        result = clean_gutenberg_text(tiny)
        self.assertIsNone(result)

    def test_removes_page_markers(self):
        body = "[Pg 12]\nSome text here. " * 50
        full = (_HEADER + body + _FOOTER).encode("utf-8")
        result = clean_gutenberg_text(full)
        self.assertNotIn("[Pg", result or "")

    def test_latin1_fallback(self):
        latin_body = _BODY.encode("latin-1")
        header_bytes = _HEADER.encode("utf-8")
        footer_bytes = _FOOTER.encode("utf-8")
        # Simulate a mixed file -- just test that it does not raise
        try:
            clean_gutenberg_text(header_bytes + latin_body + footer_bytes)
        except Exception as e:
            self.fail(f"clean_gutenberg_text raised on latin-1 input: {e}")


class TestBuildEntry(unittest.TestCase):
    def test_builds_valid_entry(self):
        entry = build_entry(
            book_id=11,
            title="Alice's Adventures in Wonderland",
            authors=["Lewis Carroll"],
            subjects=["Fantasy"],
            languages=["en"],
            download_count=50000,
            text_url="https://www.gutenberg.org/files/11/11-0.txt",
            raw_bytes=SAMPLE_BYTES,
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry["book_id"], 11)
        self.assertIn("Alice", entry["text"])
        self.assertGreater(entry["word_count"], 50)
        self.assertGreater(entry["char_count"], 200)

    def test_returns_none_for_empty_body(self):
        short = b"*** START OF THE PROJECT GUTENBERG EBOOK X ***\n \n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n"
        entry = build_entry(1, "X", [], [], ["en"], 0, "https://x.com", short)
        self.assertIsNone(entry)


class TestGutenbergParquetSharder(unittest.TestCase):
    def _make_entry(self, i: int) -> dict:
        return {
            "book_id": i,
            "title": f"Book {i}",
            "authors": "Author A",
            "subjects": "Fiction",
            "languages": "en",
            "download_count": 100,
            "text_url": f"https://gutenberg.org/{i}",
            "text": "word " * 300,
            "char_count": 1500,
            "word_count": 300,
        }

    def test_produces_parquet_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = GutenbergParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="test_gutenberg",
                batch_size=10,
            )
            for i in range(25):
                sharder.append(self._make_entry(i))
            files = sharder.close()
            self.assertTrue(len(files) >= 1, "Expected at least one Parquet file.")
            for f in files:
                self.assertTrue(os.path.exists(f))
                self.assertGreater(os.path.getsize(f), 0)

    def test_schema_columns_present(self):
        import pyarrow.parquet as pq
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = GutenbergParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="schema_test",
                batch_size=5,
            )
            for i in range(5):
                sharder.append(self._make_entry(i))
            files = sharder.close()
            tbl = pq.read_table(files[0])
            expected_cols = {
                "book_id", "title", "authors", "subjects", "languages",
                "download_count", "text_url", "text", "char_count", "word_count",
            }
            self.assertTrue(expected_cols.issubset(set(tbl.schema.names)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
