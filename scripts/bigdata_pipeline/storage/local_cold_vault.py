#!/usr/bin/env python3
"""
Local Cold Vault Storage Provider.
Implements offline/removable HDD/SSD cold storage protocol conforming to
docs/protokol-cold-vault-mimari-sartnamesi.md with atomic copy and SHA256SUMS ledger.
"""

import datetime
import os
import shutil
from typing import Optional

from scripts.bigdata_pipeline.storage.base import StorageProvider, StorageReceipt


class LocalColdVaultProvider(StorageProvider):
    """Storage provider targeting on-premise / removable cold storage volumes."""

    def __init__(self, volume_root: str = "data/cold_vault/VOL-001"):
        self.volume_root = os.path.abspath(volume_root)
        self.datasets_dir = os.path.join(self.volume_root, "datasets")
        self.checksums_dir = os.path.join(self.volume_root, "checksums")
        self._init_volume_structure()

    @property
    def name(self) -> str:
        return "local_cold_vault"

    def _init_volume_structure(self) -> None:
        """Ensures the cold vault directory layout exists."""
        os.makedirs(self.datasets_dir, exist_ok=True)
        os.makedirs(self.checksums_dir, exist_ok=True)
        volume_meta = os.path.join(self.volume_root, "volume.json")
        if not os.path.exists(volume_meta):
            with open(volume_meta, "w", encoding="utf-8") as f:
                f.write(f'{{"volume_label": "{os.path.basename(self.volume_root)}", "created_at": "{datetime.datetime.now(datetime.timezone.utc).isoformat()}"}}\n')

    def upload_shard(
        self,
        local_path: str,
        remote_key: str,
        expected_sha256: str,
    ) -> StorageReceipt:
        """
        Copies shard to cold vault volume and cryptographically verifies the copy.
        remote_key is formatted as: {dataset_id}/{shard_filename}
        """
        if not os.path.isfile(local_path):
            raise FileNotFoundError(f"Source shard not found: {local_path}")

        dest_path = os.path.join(self.datasets_dir, remote_key)
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)

        # Atomic copy: write to temp file on same volume first, then atomic rename
        temp_dest = dest_path + ".tmp"
        shutil.copyfile(local_path, temp_dest)
        os.replace(temp_dest, dest_path)

        # Immediate readback and hash verification
        actual_size = os.path.getsize(dest_path)
        actual_hash = self.compute_sha256(dest_path)

        if actual_hash != expected_sha256:
            # Corruption detected during write: purge corrupted copy immediately
            if os.path.exists(dest_path):
                os.unlink(dest_path)
            raise ValueError(
                f"Cold vault integrity verification failed for {remote_key}: "
                f"expected {expected_sha256}, got {actual_hash}"
            )

        # Append to volume checksum ledger
        sha256sums_path = os.path.join(self.checksums_dir, "SHA256SUMS")
        with open(sha256sums_path, "a", encoding="utf-8") as f:
            f.write(f"{actual_hash}  datasets/{remote_key}\n")

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return StorageReceipt(
            storage_provider=self.name,
            remote_uri=f"file://{dest_path}",
            sha256_hash=actual_hash,
            size_bytes=actual_size,
            uploaded_at=now,
        )

    def verify_shard(
        self,
        remote_key: str,
        expected_sha256: str,
        expected_size: int,
    ) -> bool:
        """Verifies integrity of a shard already residing on the cold vault volume."""
        dest_path = os.path.join(self.datasets_dir, remote_key)
        if not os.path.isfile(dest_path):
            return False

        if os.path.getsize(dest_path) != expected_size:
            return False

        return self.compute_sha256(dest_path) == expected_sha256

    def download_shard(
        self,
        remote_key: str,
        local_destination: str,
    ) -> str:
        """Copies shard from cold vault to destination."""
        source_path = os.path.join(self.datasets_dir, remote_key)
        if not os.path.isfile(source_path):
            raise FileNotFoundError(f"Shard not found on cold vault: {source_path}")

        os.makedirs(os.path.dirname(os.path.abspath(local_destination)), exist_ok=True)
        shutil.copyfile(source_path, local_destination)
        return local_destination

    def delete_shard(self, remote_key: str) -> bool:
        """Removes a shard from the cold vault volume."""
        target_path = os.path.join(self.datasets_dir, remote_key)
        if os.path.isfile(target_path):
            os.unlink(target_path)
            return True
        return False
