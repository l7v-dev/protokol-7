#!/usr/bin/env python3
"""
Aperta Raw PDF and Asset Streaming Archive Packer -- protokol-7

Packages downloaded Aperta article and dataset binaries (PDF, TAR, ZIP) into
WebDataset/Cold Vault TAR.GZ shards, computes SHA-256 and MD5 checksums,
and enables automated Google Drive upload with zero local disk residue.

Supports tolerant multi-GB sharding (10 GB - 50 GB, max 51 GB) with
dynamic disk headroom safety guard to prevent file fragmentation.
"""

import datetime
import io
import os
import shutil
import sys
import tarfile
from typing import Any, Callable, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.sharder_base import compute_file_hashes


class ApertaPdfTarSharder:
    """
    Streaming TAR.GZ archive packer for Aperta raw PDF and asset files.
    Enforces tolerant multi-GB sharding (10 GB .. 51 GB) and disk headroom safety guard.
    """

    def __init__(
        self,
        output_dir: str = "data/raw_archives/aperta/pdfs",
        filename_prefix: str = "aperta_raw_pdfs",
        snapshot_date: Optional[str] = None,
        target_gb: float = 10.0,
        max_gb: float = 51.0,
        min_free_disk_gb: float = 25.0,
        max_part_entries: Optional[int] = None,
        target_bytes: Optional[int] = None,
        start_part_idx: int = 0,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.output_dir = output_dir
        self.filename_prefix = filename_prefix
        self.snapshot_date = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.target_bytes = target_bytes if target_bytes is not None else int(target_gb * 1024 * 1024 * 1024)
        self.max_bytes = int(max_gb * 1024 * 1024 * 1024)
        self.min_free_disk_bytes = int(min_free_disk_gb * 1024 * 1024 * 1024)
        self.max_part_entries = max_part_entries
        self.part_idx = start_part_idx
        self.on_shard_completed = on_shard_completed

        self.part_entries = 0
        self.total_entries = 0
        self.part_uncompressed_bytes = 0
        self._tar: Optional[tarfile.TarFile] = None
        self._current_path: Optional[str] = None

        os.makedirs(self.output_dir, exist_ok=True)

    @property
    def current_shard_name(self) -> str:
        return f"{self.filename_prefix}_{self.snapshot_date}_p{self.part_idx:05d}.tar.gz"

    def _open_shard(self) -> None:
        filename = self.current_shard_name
        self._current_path = os.path.join(self.output_dir, filename)
        self.part_entries = 0
        self.part_uncompressed_bytes = 0
        self._tar = tarfile.open(self._current_path, mode="w:gz")
        target_gb_val = self.target_bytes / (1024**3)
        print(f"[TAR-SHARDER] Opened new PDF archive shard: {filename} (target: {target_gb_val:.1f} GB)", flush=True)

    def append_file(self, filename: str, file_bytes: bytes) -> str:
        """
        Adds a single PDF/asset binary stream into the current TAR.GZ shard.
        Returns the filename of the shard that received the asset.
        """
        if not file_bytes:
            return ""

        if self._tar is None:
            self._open_shard()

        shard_name = self.current_shard_name

        clean_name = str(filename).strip().replace(":", "_").lstrip("/")
        if not clean_name:
            clean_name = f"aperta_file_{self.total_entries:06d}.pdf"

        tarinfo = tarfile.TarInfo(name=clean_name)
        tarinfo.size = len(file_bytes)
        tarinfo.mtime = int(datetime.datetime.now().timestamp())

        self._tar.addfile(tarinfo, io.BytesIO(file_bytes))
        self.part_entries += 1
        self.total_entries += 1
        self.part_uncompressed_bytes += len(file_bytes)

        # Check rotation thresholds:
        should_rotate = False
        if self.part_uncompressed_bytes >= self.target_bytes:
            should_rotate = True
        elif self.max_part_entries and self.part_entries >= self.max_part_entries:
            should_rotate = True
        else:
            try:
                free_disk = shutil.disk_usage(self.output_dir).free
                if free_disk < self.min_free_disk_bytes:
                    print(
                        f"[TAR-SHARDER] Disk headroom warning: Free space {free_disk / (1024**3):.1f} GB < "
                        f"{self.min_free_disk_bytes / (1024**3):.1f} GB threshold. Rotating shard early to evict to Drive.",
                        flush=True,
                    )
                    should_rotate = True
            except Exception:
                pass

        if should_rotate:
            self.close_shard()

        return shard_name

    def close_shard(self) -> Optional[Dict[str, Any]]:
        """Finalizes current TAR.GZ shard and executes completion callback."""
        if self._tar is None or self._current_path is None or self.part_entries == 0:
            if self._tar:
                self._tar.close()
                self._tar = None
            return None

        self._tar.close()
        self._tar = None

        file_path = self._current_path
        shard_name = os.path.basename(file_path)
        byte_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

        hashes = compute_file_hashes(file_path) if byte_size > 0 else {"sha256": "", "md5": ""}

        shard_info = {
            "shard_name": shard_name,
            "file_path": file_path,
            "part_index": self.part_idx,
            "record_count": self.part_entries,
            "byte_size": byte_size,
            "sha256": hashes["sha256"],
            "md5": hashes["md5"],
        }

        print(
            f"[TAR-SHARDER] Shard completed: {shard_name} "
            f"({self.part_entries} files, {byte_size / (1024**2):.2f} MB, "
            f"sha256={hashes['sha256'][:12]}...)",
            flush=True,
        )

        if self.on_shard_completed:
            self.on_shard_completed(shard_info)

        self.part_idx += 1
        self._current_path = None
        self.part_entries = 0
        self.part_uncompressed_bytes = 0
        return shard_info

    def close(self) -> None:
        """Closes any open shard."""
        self.close_shard()
