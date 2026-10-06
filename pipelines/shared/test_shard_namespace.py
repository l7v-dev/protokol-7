import tempfile
import unittest
from pathlib import Path

from pipelines.shared.shard_namespace import next_part_index


class ShardNamespaceTests(unittest.TestCase):
    def test_orphans_and_other_dates_are_reserved_without_touching_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            orphan = Path(directory) / "source_20261005_p00009.parquet"
            orphan.write_bytes(b"incomplete output retained")
            (Path(directory) / "source_20261006_p00003.tar.gz").touch()
            (Path(directory) / "other_20261006_p99999.parquet").touch()
            self.assertEqual(next_part_index(directory, "source", 1), 10)
            self.assertEqual(next_part_index(directory, "source", 20), 20)
            self.assertEqual(orphan.read_bytes(), b"incomplete output retained")

    def test_missing_directory_does_not_get_created(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing"
            self.assertEqual(next_part_index(missing, "source", 3), 3)
            self.assertFalse(missing.exists())
