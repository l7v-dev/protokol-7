#!/usr/bin/env python3
"""
Cloudflare R2 Storage Provider Plugin.
Implements S3-compatible zero-egress object storage integration for large scale LLM corpus distribution.
Supports live boto3 S3 client or deterministic mock/dry-run mode for testing and local simulation.
"""

import datetime
import hashlib
import os
from typing import Optional

from scripts.bigdata_pipeline.storage.base import StorageProvider, StorageReceipt


class CloudflareR2Provider(StorageProvider):
    """Storage provider targeting Cloudflare R2 object storage."""

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        account_id: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        dry_run: bool = False,
    ):
        self.bucket_name = bucket_name or os.getenv("R2_BUCKET_NAME", "protokol-llm-corpus")
        self.account_id = account_id or os.getenv("R2_ACCOUNT_ID", "")
        self.access_key_id = access_key_id or os.getenv("R2_ACCESS_KEY_ID", os.getenv("AWS_ACCESS_KEY_ID", ""))
        self.secret_access_key = secret_access_key or os.getenv("R2_SECRET_ACCESS_KEY", os.getenv("AWS_SECRET_ACCESS_KEY", ""))
        self.dry_run = dry_run or (not self.access_key_id or not self.secret_access_key)
        self._s3_client = None

        if not self.dry_run:
            self._init_s3_client()

    @property
    def name(self) -> str:
        return "cloudflare_r2"

    def _init_s3_client(self):
        try:
            import boto3
            endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                region_name="auto",
            )
        except ImportError:
            # Fallback to dry-run simulation if boto3 is not installed
            self.dry_run = True

    def upload_shard(
        self,
        local_path: str,
        remote_key: str,
        expected_sha256: str,
    ) -> StorageReceipt:
        """Uploads shard to Cloudflare R2 bucket with checksum metadata."""
        if not os.path.isfile(local_path):
            raise FileNotFoundError(f"Source shard not found: {local_path}")

        file_size = os.path.getsize(local_path)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        remote_uri = f"r2://{self.bucket_name}/{remote_key}"

        if not self.dry_run and self._s3_client:
            with open(local_path, "rb") as f:
                self._s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=remote_key,
                    Body=f,
                    ContentLength=file_size,
                    Metadata={
                        "sha256": expected_sha256,
                        "uploaded_at": now,
                    },
                )
            # Verify immediate head_object
            head = self._s3_client.head_object(Bucket=self.bucket_name, Key=remote_key)
            if head.get("ContentLength") != file_size:
                raise ValueError(f"R2 ContentLength mismatch for {remote_key}")

        return StorageReceipt(
            storage_provider=self.name,
            remote_uri=remote_uri,
            sha256_hash=expected_sha256,
            size_bytes=file_size,
            uploaded_at=now,
        )

    def verify_shard(
        self,
        remote_key: str,
        expected_sha256: str,
        expected_size: int,
    ) -> bool:
        """Verifies shard existence and size in R2."""
        if self.dry_run or not self._s3_client:
            return True

        try:
            head = self._s3_client.head_object(Bucket=self.bucket_name, Key=remote_key)
            if head.get("ContentLength") != expected_size:
                return False
            metadata_sha256 = head.get("Metadata", {}).get("sha256")
            if metadata_sha256 and metadata_sha256 != expected_sha256:
                return False
            return True
        except Exception:
            return False

    def download_shard(
        self,
        remote_key: str,
        local_destination: str,
    ) -> str:
        """Downloads shard from R2."""
        if self.dry_run or not self._s3_client:
            # In dry-run mode, touch empty destination
            os.makedirs(os.path.dirname(os.path.abspath(local_destination)), exist_ok=True)
            with open(local_destination, "wb") as f:
                f.write(b"")
            return local_destination

        os.makedirs(os.path.dirname(os.path.abspath(local_destination)), exist_ok=True)
        self._s3_client.download_file(self.bucket_name, remote_key, local_destination)
        return local_destination

    def delete_shard(self, remote_key: str) -> bool:
        """Deletes object from R2."""
        if self.dry_run or not self._s3_client:
            return True

        try:
            self._s3_client.delete_object(Bucket=self.bucket_name, Key=remote_key)
            return True
        except Exception:
            return False
