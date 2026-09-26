#!/usr/bin/env python3
import os
import tempfile
import pytest

from metadata_db import MetadataDB


def test_metadata_db_lifecycle():
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = os.path.join(tmp_dir, "test_metadata.sqlite")
        db = MetadataDB(db_path)

        run_id = "test-run-001"
        db.start_run(
            run_id=run_id,
            language="tr",
            source_url="https://dumps.wikimedia.org/trwiki/latest.xml.bz2",
            source_md5="abc123def456",
            source_size_bytes=2500000000,
        )

        part_id = f"{run_id}-part-0"
        db.register_part(
            part_id=part_id,
            run_id=run_id,
            part_index=0,
            filename="trwiki-part-00000.parquet",
            record_count=10000,
            size_bytes=150000000,
            local_md5="1234567890abcdef1234567890abcdef",
        )

        db.start_part_sync(part_id, drive_folder_id="drive-folder-99")
        db.confirm_part_sync(
            part_id=part_id,
            drive_file_id="drive-file-123",
            drive_md5="1234567890abcdef1234567890abcdef",
            local_deleted=True,
        )

        db.update_run_stats(
            run_id=run_id,
            scanned=12000,
            clean=10000,
            redirects=1500,
            short=500,
            uncompressed_bytes=500000000,
            compressed_bytes=150000000,
            estimated_tokens=75000000,
            parts=1,
        )
        db.complete_run(run_id)

        manifest_file = os.path.join(tmp_dir, "manifest.json")
        manifest = db.export_manifest(run_id, output_path=manifest_file)

        assert manifest["run_id"] == run_id
        assert manifest["statistics"]["total_clean_articles"] == 10000
        assert manifest["statistics"]["compression_ratio"] == 3.33
        assert len(manifest["shards"]) == 1
        assert manifest["shards"][0]["checksums"]["local_md5"] == "1234567890abcdef1234567890abcdef"
        assert manifest["shards"][0]["drive"]["sync_status"] == "VERIFIED"
        assert manifest["shards"][0]["drive"]["local_deleted"] is True
        assert os.path.exists(manifest_file)
