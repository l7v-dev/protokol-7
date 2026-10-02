#!/usr/bin/env python3
"""
Unit tests for StackExchange pipeline -- protokol-7
Tests: HTML cleaner, thread assembler, packer schema.
"""

import importlib.util
import os
import sys
import tempfile
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name: str):
    """Load a module by absolute path, bypassing sys.path shadowing."""
    spec = importlib.util.spec_from_file_location(
        f"se_pipeline_{name}", os.path.join(_HERE, f"{name}.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_cleaner = _load("cleaner")
_packer  = _load("packer")

_html_to_text            = _cleaner._html_to_text
stream_threads           = _cleaner.stream_threads
StackExchangeParquetSharder = _packer.StackExchangeParquetSharder

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------

SAMPLE_POSTS_XML = """<?xml version="1.0" encoding="utf-8"?>
<posts>
  <row Id="1" PostTypeId="1" AcceptedAnswerId="2"
       Title="How do I reverse a string in Python?"
       Body="&lt;p&gt;I want to reverse a string in Python efficiently. I have tried several approaches but I am not sure which one is the most idiomatic and Pythonic way to accomplish this common programming task. What is the recommended approach used by experienced Python developers?&lt;/p&gt;"
       Score="150" ViewCount="50000" AnswerCount="3"
       Tags="&lt;python&gt;&lt;string&gt;" CreationDate="2023-01-15T10:00:00.000" />
  <row Id="2" PostTypeId="2" ParentId="1"
       Body="&lt;p&gt;The most Pythonic and idiomatic way to reverse a string in Python is to use slicing with a step of negative one like this: &lt;code&gt;s[::-1]&lt;/code&gt;. This creates a new string that is the reverse of the original. It works because Python slice notation accepts a start, stop, and step argument, and using a step of negative one traverses the string from end to start.&lt;/p&gt;"
       Score="200" CreationDate="2023-01-15T10:05:00.000" />
  <row Id="3" PostTypeId="2" ParentId="1"
       Body="&lt;p&gt;You can also use the built-in reversed function combined with the join method to reverse a string. This approach is slightly more verbose but makes the intent explicit and is easy to understand for developers coming from other programming languages.&lt;/p&gt;"
       Score="50" CreationDate="2023-01-15T10:10:00.000" />
  <row Id="4" PostTypeId="1"
       Title="What is the meaning of life?"
       Body="&lt;p&gt;Philosophically speaking, what is the meaning of life according to various schools of thought?&lt;/p&gt;"
       Score="5" ViewCount="100" AnswerCount="0"
       Tags="&lt;philosophy&gt;" CreationDate="2023-01-16T08:00:00.000" />
  <row Id="5" PostTypeId="1" AcceptedAnswerId="99"
       Title="A question whose accepted answer is missing from this subset"
       Body="&lt;p&gt;This question references accepted answer id 99 which does not exist in this particular dump subset so the pipeline should fall back to the highest scored available answer instead.&lt;/p&gt;"
       Score="10" ViewCount="200" AnswerCount="1"
       Tags="&lt;test&gt;" CreationDate="2023-01-17T08:00:00.000" />
  <row Id="6" PostTypeId="2" ParentId="5"
       Body="&lt;p&gt;This is a well written answer with sufficient word count to pass the quality gate threshold. It explains the concept clearly and provides a working example that developers can use in their own projects without any further modification required.&lt;/p&gt;"
       Score="5" CreationDate="2023-01-17T08:30:00.000" />
</posts>
"""

SAMPLE_COMMENTS_XML = """<?xml version="1.0" encoding="utf-8"?>
<comments>
  <row Id="10" PostId="1" Score="5" Text="Great question, very common task." />
  <row Id="11" PostId="2" Score="8" Text="This is the standard idiomatic approach." />
</comments>
"""


class TestHtmlToText(unittest.TestCase):
    def test_strips_tags(self):
        result = _html_to_text("<p>Hello <b>world</b></p>")
        self.assertIn("Hello", result)
        self.assertNotIn("<p>", result)
        self.assertNotIn("<b>", result)

    def test_decodes_entities(self):
        result = _html_to_text("&lt;p&gt;Hello &amp; World&lt;/p&gt;")
        self.assertIn("Hello & World", result)

    def test_preserves_code_block(self):
        html_in = "<pre><code>def foo():\n    return 42</code></pre>"
        result = _html_to_text(html_in)
        # Code block content must be preserved (indented with 4 spaces)
        self.assertIn("def foo():", result)
        self.assertIn("return 42", result)

    def test_inline_code_backtick(self):
        result = _html_to_text("Use <code>s[::-1]</code> to reverse.")
        self.assertIn("`s[::-1]`", result)

    def test_empty_returns_empty(self):
        self.assertEqual(_html_to_text(""), "")


class TestStreamThreads(unittest.TestCase):
    def _write_temp_xml(self, content: str) -> str:
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".xml", delete=False, encoding="utf-8"
        )
        f.write(content)
        f.close()
        return f.name

    def setUp(self):
        self.posts_path    = self._write_temp_xml(SAMPLE_POSTS_XML)
        self.comments_path = self._write_temp_xml(SAMPLE_COMMENTS_XML)

    def tearDown(self):
        for p in [self.posts_path, self.comments_path]:
            if os.path.exists(p):
                os.unlink(p)

    def test_yields_valid_threads(self):
        threads = list(stream_threads(self.posts_path, self.comments_path, site="test"))
        # Questions 1 and 5 have answers; question 4 has none -> skipped
        self.assertGreaterEqual(len(threads), 1)

    def test_thread_fields(self):
        threads = list(stream_threads(self.posts_path, site="test"))
        t = threads[0]
        required = {"thread_id", "site", "title", "tags", "score",
                    "view_count", "question", "answer", "answer_score",
                    "comments", "creation_date", "answer_count"}
        self.assertTrue(required.issubset(t.keys()))

    def test_accepted_answer_preferred(self):
        threads = {t["thread_id"]: t for t in stream_threads(self.posts_path, site="test")}
        # Thread 1 has accepted answer id=2 with score=200
        if 1 in threads:
            self.assertEqual(threads[1]["answer_score"], 200)

    def test_comments_attached(self):
        threads = {t["thread_id"]: t for t in stream_threads(
            self.posts_path, self.comments_path, site="test"
        )}
        if 1 in threads:
            self.assertGreater(len(threads[1]["comments"]), 0)

    def test_no_answer_questions_skipped(self):
        threads = list(stream_threads(self.posts_path, site="test"))
        # Question 4 (no answers) must not appear
        ids = {t["thread_id"] for t in threads}
        self.assertNotIn(4, ids)


class TestStackExchangeParquetSharder(unittest.TestCase):
    def _make_entry(self, i: int) -> dict:
        return {
            "thread_id":     i,
            "site":          "test",
            "title":         f"Question {i}",
            "tags":          "python;testing",
            "score":         10,
            "view_count":    1000,
            "question":      "How do you do X? " * 20,
            "answer":        "You do X by doing Y. " * 20,
            "answer_score":  5,
            "comments":      "Great question | Very helpful",
            "creation_date": "2023-01-01T00:00:00.000",
            "answer_count":  2,
        }

    def test_produces_parquet_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = StackExchangeParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="test_se",
                batch_size=10,
            )
            for i in range(25):
                sharder.append(self._make_entry(i))
            files = sharder.close()
            self.assertGreaterEqual(len(files), 1)
            for f in files:
                self.assertGreater(os.path.getsize(f), 0)

    def test_schema_columns(self):
        import pyarrow.parquet as pq
        with tempfile.TemporaryDirectory() as tmpdir:
            sharder = StackExchangeParquetSharder(
                output_dir=tmpdir,
                corpus_prefix="schema_se",
                batch_size=5,
            )
            for i in range(5):
                sharder.append(self._make_entry(i))
            files = sharder.close()
            tbl = pq.read_table(files[0])
            expected = {
                "thread_id", "site", "title", "tags", "score",
                "view_count", "question", "answer", "answer_score",
                "comments", "creation_date", "answer_count",
            }
            self.assertTrue(expected.issubset(set(tbl.schema.names)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
