#!/usr/bin/env python3
"""
Binance Vision Google Drive Resumable Uploader -- protokol-7

Uploads Zstandard-compressed Binance Parquet shards into Google Drive folder 'Binance',
verifies remote MD5 checksum, and evicts local disk shards immediately (zero disk residue).
"""

import os
import sys
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.drive_sync_base import DEFAULT_ROOT_FOLDER_ID, BaseDriveSync


class BinanceVisionDriveSync(BaseDriveSync):
    """
    Manages automated Google Drive uploads for Binance Vision Parquet shards.
    """

    def __init__(
        self,
        root_folder_id: Optional[str] = None,
        subfolder_name: str = "Binance",
        token_path: Optional[str] = None,
        dry_run: bool = False,
    ):
        super().__init__(
            root_folder_id=root_folder_id or DEFAULT_ROOT_FOLDER_ID,
            token_path=token_path,
            dry_run=dry_run,
        )
        self.subfolder_name = subfolder_name
        self._target_folder_id: Optional[str] = None

    def get_binance_folder_id(self) -> str:
        if self._target_folder_id is None:
            self._target_folder_id = self.get_or_create_subfolder(
                self.subfolder_name, parent_id=self.root_folder_id
            )
        return self._target_folder_id

    def sync_shard(
        self,
        local_path: str,
        purge_on_success: bool = True,
        subfolder_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Uploads a shard to Google Drive (Binance/ or custom subfolder)
        with MD5 validation and immediate local file eviction.
        """
        if subfolder_name:
            folder_id = self.get_or_create_subfolder(subfolder_name, parent_id=self.get_binance_folder_id())
        else:
            folder_id = self.get_binance_folder_id()

        return self.upload_file(
            local_path=local_path,
            target_folder_id=folder_id,
            purge_on_success=purge_on_success,
        )
