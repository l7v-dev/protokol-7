#!/usr/bin/env python3
"""
Storage Provider Plugin Abstraction for Big Data LLM Corpus.
Defines contracts for local cold disks, Cloudflare R2, and S3-compatible backends.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
import datetime
import hashlib
import os
from typing import Optional


@dataclass
class StorageReceipt:
    """Receipt returned after a successful shard upload and verification."""

    storage_provider: str
    remote_uri: str
    sha256_hash: str
    size_bytes: int
    uploaded_at: str


class StorageProvider(ABC):
    """Abstract base class for storage plugin providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier of the storage provider."""
        pass

    @abstractmethod
    def upload_shard(
        self,
        local_path: str,
        remote_key: str,
        expected_sha256: str,
    ) -> StorageReceipt:
        """
        Uploads a Parquet shard to the storage destination.
        Must verify data integrity before returning receipt.
        """
        pass

    @abstractmethod
    def verify_shard(
        self,
        remote_key: str,
        expected_sha256: str,
        expected_size: int,
    ) -> bool:
        """Verifies that the remote shard exists and its checksum and size match exactly."""
        pass

    @abstractmethod
    def download_shard(
        self,
        remote_key: str,
        local_destination: str,
    ) -> str:
        """Downloads a remote shard to local disk and returns local path."""
        pass

    @abstractmethod
    def delete_shard(self, remote_key: str) -> bool:
        """Deletes a shard from remote storage."""
        pass

    @staticmethod
    def compute_sha256(filepath: str, block_size: int = 1024 * 1024) -> str:
        """Standard SHA-256 calculator."""
        h = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(block_size):
                h.update(chunk)
        return h.hexdigest()
