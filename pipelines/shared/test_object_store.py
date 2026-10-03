#!/usr/bin/env python3
"""
Unit tests for ObjectStore Base and LocalObjectStore — protokol-7
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath("."))
from pipelines.shared.object_store_base import LocalObjectStore


class TestLocalObjectStore(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = LocalObjectStore(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_capabilities(self):
        caps = self.store.capabilities
        self.assertTrue(caps.ranged_read)
        self.assertTrue(caps.conditional_create)
        self.assertFalse(caps.multipart)

    def test_put_get_head(self):
        data = b"lakehouse test stream"
        ref = self.store.put("bronze/unit.txt", data)
        self.assertEqual(ref.key, "bronze/unit.txt")
        self.assertEqual(ref.bytes, len(data))

        read_data = self.store.get(ref)
        self.assertEqual(read_data, data)

        head_ref = self.store.head(ref)
        self.assertEqual(head_ref.sha256, ref.sha256)

    def test_ranged_read(self):
        data = b"0123456789"
        ref = self.store.put("bronze/range.txt", data)
        ranged = self.store.get(ref, start=2, end=6)
        self.assertEqual(ranged, b"2345")

    def test_idempotency(self):
        data = b"same content"
        ref1 = self.store.put("bronze/idempotent.txt", data)
        ref2 = self.store.put("bronze/idempotent.txt", data)
        self.assertEqual(ref1.sha256, ref2.sha256)

    def test_immutable_conflict(self):
        self.store.put("bronze/conflict.txt", b"original")
        with self.assertRaises(ValueError) as ctx:
            self.store.put("bronze/conflict.txt", b"different")
        self.assertIn("ImmutableConflict", str(ctx.exception))

    def test_path_traversal_guards(self):
        with self.assertRaises(ValueError):
            self.store.put("../escape.txt", b"bad")
        with self.assertRaises(ValueError):
            self.store.put("/absolute.txt", b"bad")
        with self.assertRaises(ValueError):
            self.store.put("bronze/../../escape.txt", b"bad")


if __name__ == "__main__":
    unittest.main()
