#!/usr/bin/env python3
"""
Master Orchestrator for Big Data LLM Data Pipelines.
Connects ingestion sources, normalization/cleaning, streaming Parquet packaging,
pluggable storage providers (Cold Vault / R2 / S3), and verification-gated raw data purge.
"""

import argparse
import datetime
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Dict, Any, Optional

# Ensure repository root is on sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import report_producer_error, EvidenceWriteError, producer_run, capture_path, record_output
from scripts.corpus_pipeline.cleaner import TextNormalizer, QualityFilter, estimate_token_count
from scripts.corpus_pipeline.metadata_catalog import MetadataCatalog, get_utc_iso_now
from scripts.corpus_pipeline.packer import StreamingParquetPacker
from scripts.corpus_pipeline.storage import get_storage_provider
from scripts.corpus_pipeline.verifier import VerificationGatekeeper, VerificationError


class BigDataPipelineOrchestrator:
    """End-to-end pipeline orchestrator managing data processing lifecycle."""

    def __init__(
        self,
        catalog_db: str = "data/bigdata_catalog.sqlite",
        staging_dir: str = "data/staging",
    ):
        self.catalog = MetadataCatalog(db_path=catalog_db)
        self.staging_dir = os.path.abspath(staging_dir)
        os.makedirs(self.staging_dir, exist_ok=True)

    def process_raw_file(
        self,
        dataset_id: str,
        name: str,
        source_platform: str,
        license_group: str,
        raw_filepath: str,
        storage_provider_name: str = "local_cold_vault",
        storage_kwargs: Optional[Dict[str, Any]] = None,
        shard_size_mb: int = 512,
        purge_raw: bool = True,
        min_chars: int = 100,
        min_words: int = 20,
    ) -> Dict[str, Any]:
        """
        Executes end-to-end processing of a raw data batch:
        Ingest -> Clean/Filter -> Pack Parquet -> Upload to Storage -> Verify -> Purge Raw.
        """
        if not os.path.isfile(raw_filepath):
            raise FileNotFoundError(f"Raw source file does not exist: {raw_filepath}")

        # 1. Register Dataset
        self.catalog.register_dataset(
            dataset_id=dataset_id,
            name=name,
            source_platform=source_platform,
            license_group=license_group,
        )

        # 2. Initialize Run
        run_id = f"run-{dataset_id}-{uuid.uuid4().hex[:8]}"
        self.catalog.start_run(
            run_id=run_id,
            dataset_id=dataset_id,
            target_storage_provider=storage_provider_name,
        )

        storage_kwargs = storage_kwargs or {}
        storage_provider = get_storage_provider(storage_provider_name, **storage_kwargs)
        gatekeeper = VerificationGatekeeper(catalog=self.catalog, storage_provider=storage_provider)

        quality_filter = QualityFilter(min_chars=min_chars, min_words=min_words)
        packer = StreamingParquetPacker(
            output_dir=os.path.join(self.staging_dir, run_id),
            dataset_id=dataset_id,
            run_id=run_id,
            max_shard_bytes=shard_size_mb * 1024 * 1024,
        )

        self.catalog.update_run_status(run_id, "CLEANING")

        total_raw = 0
        total_clean = 0
        total_rejected = 0
        total_uncompressed_bytes = 0

        try:
            raw_evidence = capture_path(raw_filepath, source_platform, Path(raw_filepath).resolve().as_uri())

            # 3. Stream & Process Raw File (Supporting JSONL or Plain Text lines)
            with open(raw_filepath, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line_str = line.strip()
                    if not line_str:
                        continue

                    total_raw += 1
                    raw_doc_text = ""
                    title = ""
                    doc_id = ""

                    # Attempt JSON parse
                    if line_str.startswith("{") and line_str.endswith("}"):
                        try:
                            doc_obj = json.loads(line_str)
                            raw_doc_text = doc_obj.get("text", "") or doc_obj.get("content", "")
                            title = doc_obj.get("title", "")
                            doc_id = str(doc_obj.get("id", "")) or str(doc_obj.get("doc_id", ""))
                        except json.JSONDecodeError:
                            raw_doc_text = line_str
                    else:
                        raw_doc_text = line_str

                    if not doc_id:
                        doc_id = f"{dataset_id}-{total_raw:08d}"

                    # Normalize
                    clean_text = TextNormalizer.normalize(raw_doc_text)
                    total_uncompressed_bytes += len(clean_text.encode("utf-8"))

                    # Quality Filter
                    passed, reason = quality_filter.evaluate(clean_text)
                    if not passed:
                        total_rejected += 1
                        continue

                    total_clean += 1
                    record_output({"id": doc_id, "text": clean_text, "title": title}, raw_evidence)
                    packer.write_record(
                        doc_id=doc_id,
                        text=clean_text,
                        title=title,
                        source=source_platform,
                        license_group=license_group,
                    )

            # 4. Finalize Packaging
            self.catalog.update_run_status(run_id, "PACKING")
            completed_shards = packer.finish()

            total_compressed_bytes = sum(s.size_bytes for s in completed_shards)
            total_tokens = sum(s.estimated_tokens for s in completed_shards)

            # 5. Storage Upload and Verification
            self.catalog.update_run_status(run_id, "VERIFYING")

            for shard in completed_shards:
                # Register shard
                self.catalog.register_shard(
                    shard_id=shard.shard_id,
                    run_id=run_id,
                    shard_index=shard.shard_index,
                    filename=shard.filename,
                    storage_uri=Path(shard.filepath).resolve().as_uri(),
                    record_count=shard.record_count,
                    size_bytes=shard.size_bytes,
                    sha256_hash=shard.sha256_hash,
                    blake3_hash=shard.blake3_hash,
                    row_group_count=shard.row_group_count,
                    char_count=shard.char_count,
                    word_count=shard.word_count,
                    estimated_tokens=shard.estimated_tokens,
                )

                # Upload to storage provider
                remote_key = f"{dataset_id}/{shard.filename}"
                receipt = storage_provider.upload_shard(
                    local_path=shard.filepath,
                    remote_key=remote_key,
                    expected_sha256=shard.sha256_hash,
                )

                # Register storage replica
                replica_id = f"replica-{shard.shard_id}-{storage_provider.name}"
                self.catalog.register_replica(
                    replica_id=replica_id,
                    shard_id=shard.shard_id,
                    storage_provider=storage_provider.name,
                    remote_uri=receipt.remote_uri,
                    remote_sha256_hash=receipt.sha256_hash,
                    remote_size_bytes=receipt.size_bytes,
                    sync_status="VERIFIED",
                )

                # 6. Verification Gatekeeper & Purge
                gatekeeper.verify_and_purge_shard(
                    shard=shard,
                    run_id=run_id,
                    expected_records=shard.record_count,
                    raw_source_path=raw_filepath,
                    remote_key=remote_key,
                    allow_purge=purge_raw,
                )

            # 7. Update Run Statistics & Complete
            raw_is_purged = 1 if (purge_raw and not os.path.exists(raw_filepath)) else 0
            self.catalog.update_run_stats(
                run_id=run_id,
                total_raw_documents=total_raw,
                total_clean_documents=total_clean,
                total_rejected_documents=total_rejected,
                total_uncompressed_bytes=total_uncompressed_bytes,
                total_compressed_bytes=total_compressed_bytes,
                total_estimated_tokens=total_tokens,
                total_shards=len(completed_shards),
                raw_data_purged=raw_is_purged,
            )
            self.catalog.update_run_status(run_id, "COMPLETED")

            # 8. Export Dataset Manifest
            manifest_path = os.path.join(self.staging_dir, f"{dataset_id}-manifest.json")
            self.catalog.export_dataset_manifest(dataset_id, manifest_path)

            return {
                "run_id": run_id,
                "dataset_id": dataset_id,
                "status": "COMPLETED",
                "total_raw": total_raw,
                "total_clean": total_clean,
                "total_rejected": total_rejected,
                "total_shards": len(completed_shards),
                "total_tokens": total_tokens,
                "raw_purged": bool(raw_is_purged),
                "manifest_path": manifest_path,
            }

        except EvidenceWriteError as error:
            try:
                self.catalog.update_run_status(run_id, "FAILED", error_message=str(error))
            except Exception:
                pass  # Preserve the original evidence fault if the catalog is unavailable.
            raise

        except Exception as e:

            report_producer_error(e)
            self.catalog.update_run_status(run_id, "FAILED", error_message=str(e))
            raise


@producer_run("corpus_pipeline")
def main():
    parser = argparse.ArgumentParser(description="Big Data LLM Processing & Zero-Raw Purge Pipeline")
    parser.add_argument("--dataset-id", required=True, help="Unique dataset identifier (e.g. arxiv-2026)")
    parser.add_argument("--name", default="LLM Corpus Dataset", help="Human readable dataset title")
    parser.add_argument("--source", default="web", help="Platform name (wikipedia, arxiv, pubmed, web)")
    parser.add_argument("--license", default="permissive_commercial", choices=[
        "permissive_commercial", "non_commercial_research", "public_domain", "restricted"
    ], help="License segregation tier")
    parser.add_argument("--raw-file", required=True, help="Path to input raw JSONL or text file")
    parser.add_argument("--storage", default="local_cold_vault", choices=["local_cold_vault", "cloudflare_r2"])
    parser.add_argument("--shard-size-mb", type=int, default=512, help="Parquet chunk size in MB (default: 512)")
    parser.add_argument("--no-purge", action="store_true", help="Do not purge raw file after verification")

    args = parser.parse_args()

    orchestrator = BigDataPipelineOrchestrator()
    result = orchestrator.process_raw_file(
        dataset_id=args.dataset_id,
        name=args.name,
        source_platform=args.source,
        license_group=args.license,
        raw_filepath=args.raw_file,
        storage_provider_name=args.storage,
        shard_size_mb=args.shard_size_mb,
        purge_raw=not args.no_purge,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
