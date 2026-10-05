import json
import math
import tempfile
import unittest
from pathlib import Path

from pipelines.shared.ledger_base import BaseLedger


class CursorTests(unittest.TestCase):
    def test_cursor_is_stream_scoped_and_survives_reopen(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "ledger.sqlite")
            central = str(Path(directory) / "untouched.sqlite")
            ledger = BaseLedger(path, central)
            self.assertIsNone(ledger.get_cursor("articles"))
            ledger.commit_cursor("articles", {"page": 3, "watermark": "Türkçe"})
            ledger.commit_cursor("files", "file-17")
            reopened = BaseLedger(path, central)
            self.assertEqual(reopened.get_cursor("articles"), {"page": 3, "watermark": "Türkçe"})
            self.assertEqual(reopened.get_cursor("files"), "file-17")
            self.assertFalse(Path(central).exists())

    def test_failed_serialization_preserves_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = BaseLedger(str(Path(directory) / "ledger.sqlite"))
            ledger.commit_cursor("articles", 10)
            for cursor in [math.nan, object()]:
                with self.assertRaises((ValueError, TypeError)):
                    ledger.commit_cursor("articles", cursor)
                self.assertEqual(ledger.get_cursor("articles"), 10)
            for stream in ["", " ", None]:
                with self.assertRaises(ValueError):
                    ledger.commit_cursor(stream, 11)
                with self.assertRaises(ValueError):
                    ledger.get_cursor(stream)


if __name__ == "__main__":
    unittest.main()
