#!/usr/bin/env python3
"""
DOAJ Google Drive Resumable Uploader -- protokol-7

Uploads Zstandard-compressed DOAJ Parquet shards into Google Drive folder 'DOAJ',
verifies remote MD5 checksum, and evicts local disk shards immediately.
"""

import os
import sys
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.drive_sync_base import DEFAULT_ROOT_FOLDER_ID, BaseDriveSync


class DoajDriveSync(BaseDriveSync):
    """
    Manages automated Google Drive uploads for DOAJ Parquet shards.
    """

    def __init__(
        self,
        root_folder_id: Optional[str] = None,
        subfolder_name: str = "DOAJ",
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

    def get_doaj_folder_id(self) -> str:
        if self._target_folder_id is None:
            self._target_folder_id = self.get_or_create_subfolder(
                self.subfolder_name, parent_id=self.root_folder_id
            )
        return self._target_folder_id

    def sync_shard(
        self,
        local_path: str,
        purge_on_success: bool = True,
    ) -> Dict[str, Any]:
        """Uploads a shard to Google Drive (DOAJ/) with MD5 validation and local file eviction."""
        folder_id = self.get_doaj_folder_id()
        return self.upload_file(
            local_path=local_path,
            target_folder_id=folder_id,
            purge_on_success=purge_on_success,
            verify_md5=True,
        )
