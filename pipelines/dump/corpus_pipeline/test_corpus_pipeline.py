#!/usr/bin/env python3
"""
Comprehensive Unit & Integration Test Suite for Big Data LLM Pipeline.
Verifies metadata catalog, pluggable storage, cleaners, packers, and
CRITICALLY: verifies that raw data is safely purged ONLY when 100% verified,
and strictly preserved if any verification check fails.
"""

import json
import os
import shutil
import tempfile
import unittest
import sys

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import pyarrow.parquet as pq

from scripts.corpus_pipeline.cleaner import TextNormalizer, QualityFilter, estimate_token_count
from scripts.corpus_pipeline.metadata_catalog import MetadataCatalog
from scripts.corpus_pipeline.orchestrator import BigDataPipelineOrchestrator
from scripts.corpus_pipeline.packer import StreamingParquetPacker
from scripts.corpus_pipeline.storage.cloudflare_r2 import CloudflareR2Provider
from scripts.corpus_pipeline.storage.local_cold_vault import LocalColdVaultProvider
from scripts.corpus_pipeline.verifier import VerificationGatekeeper, VerificationError


class TestBigDataPipeline(unittest.TestCase):
    """Test suite covering the entire Big Data LLM corpus pipeline."""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="bigdata_test_")
        self.catalog_db = os.path.join(self.test_dir, "catalog.sqlite")
        self.catalog = MetadataCatalog(db_path=self.catalog_db)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_metadata_catalog_lifecycle(self):
        """Tests dataset registration, run lifecycle, shard tracking, and manifest export."""
        self.catalog.register_dataset(
            dataset_id="test-arxiv-cs",
            name="arXiv Computer Science",
            source_platform="arxiv",
            license_group="permissive_commercial",
            default_language="en",
        )
        ds = self.catalog.get_dataset("test-arxiv-cs")
        self.assertIsNotNone(ds)
        self.assertEqual(ds["source_platform"], "arxiv")

        run_id = "run-001"
        self.catalog.start_run(run_id, "test-arxiv-cs", "local_cold_vault")
        run = self.catalog.get_run(run_id)
        self.assertEqual(run["status"], "INITIALIZING")

        self.catalog.update_run_status(run_id, "CLEANING")
        self.assertEqual(self.catalog.get_run(run_id)["status"], "CLEANING")

        shard_id = "shard-001"
        self.catalog.register_shard(
            shard_id=shard_id,
            run_id=run_id,
            shard_index=1,
            filename="part-00001.parquet",
            record_count=100,
            size_bytes=50000,
            sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            estimated_tokens=25000,
        )
        shard = self.catalog.get_shard(shard_id)
        self.assertIsNotNone(shard)
        self.assertEqual(shard["record_count"], 100)

        manifest_file = os.path.join(self.test_dir, "manifest.json")
        self.catalog.export_dataset_manifest("test-arxiv-cs", manifest_file)
        self.assertTrue(os.path.isfile(manifest_file))
        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
        self.assertEqual(manifest_data["dataset"]["dataset_id"], "test-arxiv-cs")
        self.assertEqual(manifest_data["total_records"], 100)

    def test_local_cold_vault_provider(self):
        """Tests local Btrfs/POSIX cold vault storage provider copying and checksum verification."""
        vault_root = os.path.join(self.test_dir, "cold_vault_vol1")
        provider = LocalColdVaultProvider(volume_root=vault_root)
        self.assertEqual(provider.name, "local_cold_vault")

        # Create dummy shard
        sample_file = os.path.join(self.test_dir, "sample.parquet")
        content = b"PAR1DummyParquetDataForTesting12345678"
        with open(sample_file, "wb") as f:
            f.write(content)

        expected_hash = provider.compute_sha256(sample_file)
        remote_key = "arxiv/sample.parquet"

        # Upload & verify
        receipt = provider.upload_shard(sample_file, remote_key, expected_hash)
        self.assertEqual(receipt.storage_provider, "local_cold_vault")
        self.assertEqual(receipt.sha256_hash, expected_hash)
        self.assertTrue(provider.verify_shard(remote_key, expected_hash, len(content)))

        # Download
        dest_download = os.path.join(self.test_dir, "downloaded.parquet")
        provider.download_shard(remote_key, dest_download)
        self.assertTrue(os.path.isfile(dest_download))
        self.assertEqual(provider.compute_sha256(dest_download), expected_hash)

    def test_cleaner_and_quality_heuristics(self):
        """Tests text normalization and Gopher/FineWeb heuristic quality filtering."""
        raw_dirty = "Title with &amp; entity \x00\x07 and zero-width\u200bspace   and multiple    spaces.\n\n\n\nNew paragraph."
        clean = TextNormalizer.normalize(raw_dirty)
        self.assertNotIn("\x00", clean)
        self.assertNotIn("\u200b", clean)
        self.assertIn("&", clean)
        self.assertNotIn("&amp;", clean)
        self.assertNotIn("\n\n\n", clean)

        # Quality filter: short text rejection
        qf = QualityFilter(min_chars=50, min_words=10)
        passed, reason = qf.evaluate("Too short.")
        self.assertFalse(passed)
        self.assertIn("too_short_chars", reason)

        # Quality filter: high quality text
        good_text = (
            "Distributed systems require fault tolerance and consensus mechanisms. "
            "In modern enterprise architectures, data lakes decouple storage from compute layers, "
            "allowing independent scaling of ingestion workers and analytical query engines."
        )
        passed, reason = qf.evaluate(good_text)
        self.assertTrue(passed)
        self.assertIsNone(reason)

    def test_streaming_parquet_packer(self):
        """Tests Parquet sharder row group flushing, metadata schema, and compression."""
        packer_out = os.path.join(self.test_dir, "packer_out")
        packer = StreamingParquetPacker(
            output_dir=packer_out,
            dataset_id="ds-test",
            run_id="run-test",
            max_shard_bytes=2048,  # Small threshold to test sharding
            row_group_size=2,
        )

        for i in range(5):
            packer.write_record(
                doc_id=f"doc-{i}",
                text=f"This is sample document number {i} containing sufficient text to test packaging.",
                title=f"Title {i}",
                source="test",
                domain="example.org",
            )

        shards = packer.finish()
        self.assertGreaterEqual(len(shards), 1)

        # Verify first shard is a readable Parquet file
        first_shard = shards[0]
        self.assertTrue(os.path.isfile(first_shard.filepath))
        pf = pq.ParquetFile(first_shard.filepath)
        self.assertEqual(pf.metadata.num_rows, first_shard.record_count)
        self.assertIn("doc_id", pf.schema_arrow.names)
        self.assertIn("text", pf.schema_arrow.names)

    def test_verification_gatekeeper_success_purges_raw(self):
        """CRITICAL: Verifies that when all 4 checks pass, raw data is safely purged from disk."""
        vault_root = os.path.join(self.test_dir, "vault_purge_test")
        storage = LocalColdVaultProvider(volume_root=vault_root)
        gatekeeper = VerificationGatekeeper(catalog=self.catalog, storage_provider=storage)

        # Create temporary raw source file
        raw_source = os.path.join(self.test_dir, "temp_raw_data.jsonl")
        with open(raw_source, "w", encoding="utf-8") as f:
            f.write('{"text": "Sample valid raw document for zero-raw test"}\n')
        self.assertTrue(os.path.isfile(raw_source))

        # Pack into Parquet
        packer_out = os.path.join(self.test_dir, "shards_out")
        packer = StreamingParquetPacker(
            output_dir=packer_out,
            dataset_id="ds-purge",
            run_id="run-purge",
        )
        packer.write_record(
            doc_id="doc-1",
            text="Sample valid raw document for zero-raw test",
            title="Doc 1",
            source="test",
        )
        shards = packer.finish()
        shard = shards[0]

        # Upload to storage
        remote_key = f"{shard.filename}"
        storage.upload_shard(shard.filepath, remote_key, shard.sha256_hash)

        # Register run and shard in catalog
        self.catalog.register_dataset("ds-purge", "Purge Test", "test", "permissive_commercial")
        self.catalog.start_run("run-purge", "ds-purge", storage.name)
        self.catalog.register_shard(
            shard_id=shard.shard_id,
            run_id="run-purge",
            shard_index=1,
            filename=shard.filename,
            record_count=shard.record_count,
            size_bytes=shard.size_bytes,
            sha256_hash=shard.sha256_hash,
        )

        # Execute Gatekeeper
        result = gatekeeper.verify_and_purge_shard(
            shard=shard,
            run_id="run-purge",
            expected_records=shard.record_count,
            raw_source_path=raw_source,
            allow_purge=True,
        )

        self.assertTrue(result.verification_passed)
        self.assertTrue(result.record_count_matches)
        self.assertTrue(result.parquet_readable)
        self.assertTrue(result.checksum_matches)
        self.assertTrue(result.raw_purged)

        # ASSERT: Raw file is strictly gone from local disk
        self.assertFalse(os.path.exists(raw_source))

        # ASSERT: Audit ledger records raw_purged = 1
        audit = self.catalog.get_audit_record(f"audit-{shard.shard_id}")
        self.assertIsNotNone(audit)
        self.assertEqual(audit["raw_purged"], 1)
        self.assertEqual(audit["verification_passed"], 1)

    def test_verification_gatekeeper_failure_strictly_preserves_raw(self):
        """CRITICAL SAFETY TEST: Verifies that if verification fails, raw data is NEVER deleted."""
        vault_root = os.path.join(self.test_dir, "vault_fail_test")
        storage = LocalColdVaultProvider(volume_root=vault_root)
        gatekeeper = VerificationGatekeeper(catalog=self.catalog, storage_provider=storage)

        # Create raw source file
        raw_source = os.path.join(self.test_dir, "precious_raw_data.jsonl")
        with open(raw_source, "w", encoding="utf-8") as f:
            f.write('{"text": "Critical uncompressed data that must not be lost"}\n')
        self.assertTrue(os.path.isfile(raw_source))

        # Pack into Parquet
        packer_out = os.path.join(self.test_dir, "shards_fail_out")
        packer = StreamingParquetPacker(
            output_dir=packer_out,
            dataset_id="ds-fail",
            run_id="run-fail",
        )
        packer.write_record(doc_id="d1", text="Data", title="T1", source="test")
        shards = packer.finish()
        shard = shards[0]

        # DO NOT upload shard to storage (simulating storage sync failure or checksum mismatch)

        self.catalog.register_dataset("ds-fail", "Fail Test", "test", "permissive_commercial")
        self.catalog.start_run("run-fail", "ds-fail", storage.name)
        self.catalog.register_shard(
            shard_id=shard.shard_id,
            run_id="run-fail",
            shard_index=1,
            filename=shard.filename,
            record_count=shard.record_count,
            size_bytes=shard.size_bytes,
            sha256_hash=shard.sha256_hash,
        )

        # Gatekeeper MUST raise VerificationError
        with self.assertRaises(VerificationError):
            gatekeeper.verify_and_purge_shard(
                shard=shard,
                run_id="run-fail",
                expected_records=shard.record_count,
                raw_source_path=raw_source,
                allow_purge=True,
            )

        # CRITICAL ASSERTION: Raw data MUST still exist on disk!
        self.assertTrue(os.path.isfile(raw_source))

        # Check audit ledger records failure
        audit = self.catalog.get_audit_record(f"audit-{shard.shard_id}")
        self.assertIsNotNone(audit)
        self.assertEqual(audit["verification_passed"], 0)
        self.assertEqual(audit["raw_purged"], 0)

    def test_end_to_end_orchestrator(self):
        """Tests complete end-to-end flow through BigDataPipelineOrchestrator."""
        raw_input = os.path.join(self.test_dir, "raw_batch.jsonl")
        with open(raw_input, "w", encoding="utf-8") as f:
            for i in range(10):
                doc = {
                    "id": f"arxiv-{i}",
                    "title": f"Paper {i} on Deep Learning",
                    "text": (
                        f"This is research publication {i}. Deep learning architectures such as transformers "
                        f"rely on self-attention mechanisms to learn rich semantic representations from large datasets."
                    ),
                }
                f.write(json.dumps(doc) + "\n")

        vault_root = os.path.join(self.test_dir, "orchestrator_vault")
        orchestrator = BigDataPipelineOrchestrator(
            catalog_db=os.path.join(self.test_dir, "orch_catalog.sqlite"),
            staging_dir=os.path.join(self.test_dir, "orch_staging"),
        )

        result = orchestrator.process_raw_file(
            dataset_id="arxiv-e2e",
            name="arXiv End to End",
            source_platform="arxiv",
            license_group="permissive_commercial",
            raw_filepath=raw_input,
            storage_provider_name="local_cold_vault",
            storage_kwargs={"volume_root": vault_root},
            shard_size_mb=10,
            purge_raw=True,
            min_chars=50,
            min_words=10,
        )

        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(result["total_raw"], 10)
        self.assertEqual(result["total_clean"], 10)
        self.assertEqual(result["total_rejected"], 0)
        self.assertTrue(result["raw_purged"])
        self.assertFalse(os.path.exists(raw_input))
        self.assertTrue(os.path.isfile(result["manifest_path"]))

    def test_advanced_backend_stack(self):
        """Tests tiktoken exact tokenization, Lingua language detection, BLAKE3 hashing, and DuckDB SQL."""
        from scripts.corpus_pipeline.cleaner import LanguageIdentifier
        from scripts.corpus_pipeline.metadata_catalog import compute_file_blake3
        import duckdb

        # 1. Test Language Detection
        from scripts.corpus_pipeline.cleaner import _LINGUA_DETECTOR
        tr_text = "Büyük Dil Modelleri eğitimi için yüksek kaliteli, temiz ve manipüle edilmemiş Türkçe veri gereklidir."
        en_text = "Large Language Models require high quality, clean, and unmanipulated pre-training datasets."
        tr_lang, tr_conf = LanguageIdentifier.detect(tr_text)
        en_lang, en_conf = LanguageIdentifier.detect(en_text)

        if _LINGUA_DETECTOR is not None:
            self.assertEqual(tr_lang, "tr")
            self.assertGreater(tr_conf, 0.7)
            self.assertEqual(en_lang, "en")
            self.assertGreater(en_conf, 0.7)
        else:
            self.assertEqual(tr_lang, "und")
            self.assertEqual(en_lang, "und")

        # 2. Test tiktoken token count
        tokens = estimate_token_count(en_text)
        self.assertGreater(tokens, 5)

        # 3. Test PII masking
        pii_raw = "Geliştirici iletişim: test.user@example.com ve telefon: +90 555 123 4567."
        pii_clean = TextNormalizer.normalize(pii_raw, mask_pii=True)
        self.assertIn("[EMAIL_REDACTED]", pii_clean)
        self.assertIn("[PHONE_REDACTED]", pii_clean)
        self.assertNotIn("test.user@example.com", pii_clean)

        # 4. Test BLAKE3 hash
        sample_path = os.path.join(self.test_dir, "blake3_sample.bin")
        with open(sample_path, "wb") as f:
            f.write(b"BLAKE3 high speed cryptographic hashing test data")
        b3_hash = compute_file_blake3(sample_path)
        if b3_hash is not None:
            self.assertEqual(len(b3_hash), 64)

        # 5. Test DuckDB querying Parquet
        parquet_sample = os.path.join(self.test_dir, "duckdb_sample.parquet")
        packer = StreamingParquetPacker(output_dir=self.test_dir, dataset_id="ds-duck", run_id="run-duck")
        packer.write_record(doc_id="d1", text=en_text, title="T1", source="arxiv")
        shards = packer.finish()

        con = duckdb.connect()
        query_res = con.execute(f"SELECT count(*), max(ref_token_count) FROM '{shards[0].filepath}'").fetchone()
        self.assertEqual(query_res[0], 1)
        self.assertGreater(query_res[1], 0)


if __name__ == "__main__":
    unittest.main()

