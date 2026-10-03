#!/usr/bin/env python3
"""
DergiPark Raw PDF Streaming Archive Packer -- protokol-7

Packages downloaded article PDF binaries into WebDataset/Cold Vault TAR.GZ shards,
computes SHA-256 and MD5 checksums, and enables automated Google Drive upload
with zero local disk residue.
"""

import datetime
import io
import os
import sys
import tarfile
from typing import Any, Callable, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.sharder_base import compute_file_hashes


class DergiParkPdfTarSharder:
    """
    Streaming TAR.GZ archive packer for DergiPark raw PDF files.
    """

    def __init__(
        self,
        output_dir: str = "data/raw_archives/dergipark/pdfs",
        filename_prefix: str = "dergipark_raw_pdfs",
        snapshot_date: Optional[str] = None,
        max_part_bytes: int = 512 * 1024 * 1024,
        max_part_entries: int = 500,
        start_part_idx: int = 0,
        on_shard_completed: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.output_dir = output_dir
        self.filename_prefix = filename_prefix
        self.snapshot_date = snapshot_date or datetime.date.today().strftime("%Y%m%d")
        self.max_part_bytes = max_part_bytes
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
        print(f"[TAR-SHARDER] Opened new PDF archive shard: {filename}", flush=True)

    def append_pdf(self, article_id: str, pdf_bytes: bytes) -> str:
        """
        Adds a single PDF binary stream into the current TAR.GZ shard.
        Returns the filename of the shard that received the PDF.
        """
        if not pdf_bytes:
            return ""

        if self._tar is None:
            self._open_shard()

        shard_name = self.current_shard_name

        clean_name = str(article_id).strip().replace("/", "_").replace(":", "_")
        if not clean_name.endswith(".pdf"):
            clean_name = f"{clean_name}.pdf"

        tarinfo = tarfile.TarInfo(name=clean_name)
        tarinfo.size = len(pdf_bytes)
        tarinfo.mtime = int(datetime.datetime.now().timestamp())

        self._tar.addfile(tarinfo, io.BytesIO(pdf_bytes))
        self.part_entries += 1
        self.total_entries += 1
        self.part_uncompressed_bytes += len(pdf_bytes)

        # Check rotation thresholds
        if self.part_entries >= self.max_part_entries or self.part_uncompressed_bytes >= self.max_part_bytes:
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
            f"({self.part_entries} PDFs, {byte_size / (1024**2):.2f} MB, "
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
