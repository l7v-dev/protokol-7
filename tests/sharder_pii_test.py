import tempfile
import unittest

import pyarrow as pa
import pyarrow.parquet as pq
from pipelines.shared.sharder_base import BaseParquetSharder
from pipelines.shared.pii_status import with_pii_table
from pipelines.dump.gutenberg.packer import GutenbergParquetSharder


class PiiShardTests(unittest.TestCase):
    def test_legacy_writer_preserves_reviewed_status_and_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            writer = GutenbergParquetSharder(directory)
            writer.append({"book_id": 1, "pii_status": "redacted"})
            writer.append({"book_id": 2})
            path = writer.close()[0]
            self.assertEqual(pq.read_table(path).column("pii_status").to_pylist(), ["redacted", "unchecked"])

    def test_legacy_table_rejects_invalid_and_null_status(self):
        for value in [None, "assumed-clear"]:
            with self.assertRaises(ValueError):
                with_pii_table(pa.table({"text": ["fixture"]}), [{"pii_status": value}])
        table = pa.table({"text": ["fixture"], "pii_status": ["clear"]})
        self.assertEqual(with_pii_table(table).column("pii_status").to_pylist(), ["clear"])

    def test_status_column_preserves_reviewed_and_unknown_records(self):
        with tempfile.TemporaryDirectory() as directory:
            sharder = BaseParquetSharder(directory, pa.schema([("text", pa.string())]), batch_size=10)
            original = {"text": "fixture"}
            sharder.add_record(original)
            sharder.add_record({"text": "fixture 2", "pii_status": "quarantined"})
            shard = sharder.close_shard()
            self.assertEqual(pq.read_table(shard["file_path"]).column("pii_status").to_pylist(), ["unchecked", "quarantined"])
            self.assertNotIn("pii_status", original)

    def test_invalid_status_and_wrong_column_type_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            sharder = BaseParquetSharder(directory, pa.schema([("text", pa.string())]))
            with self.assertRaises(ValueError):
                sharder.add_record({"text": "fixture", "pii_status": "assumed-clear"})
            self.assertFalse(sharder.buffer)
            with self.assertRaises(ValueError):
                BaseParquetSharder(directory, pa.schema([("pii_status", pa.bool_())]))


if __name__ == "__main__":
    unittest.main()
