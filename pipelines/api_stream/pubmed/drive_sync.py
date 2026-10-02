#!/usr/bin/env python3
"""
PubMed Google Drive Synchronizer and Zero-Disk Eviction Engine -- protokol-7

Uploads Zstandard-compressed Parquet shards to Google Drive under PubMed/,
validates remote MD5 checksum, and purges local disk files upon verification.
"""

import os
import sys
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.drive_sync_base import BaseDriveSync


class PubmedDriveSync(BaseDriveSync):
    """
    Authenticated Google Drive synchronizer for PubMed Parquet shards.
    """

    def __init__(
        self,
        root_folder_id: Optional[str] = None,
        subfolder_name: str = "PubMed",
        dry_run: bool = False,
    ):
        super().__init__(
            root_folder_id=root_folder_id or "1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL",
            dry_run=dry_run,
        )
        self.subfolder_name = subfolder_name
        self._target_folder_id: Optional[str] = None

    def get_pubmed_folder_id(self) -> str:
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
        """Uploads a shard to Google Drive (PubMed/) with MD5 validation and local file eviction."""
        folder_id = self.get_pubmed_folder_id()
        return self.upload_file(
            local_path=local_path,
            target_folder_id=folder_id,
            purge_on_success=purge_on_success,
            verify_md5=True,
        )
