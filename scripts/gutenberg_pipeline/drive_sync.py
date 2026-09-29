#!/usr/bin/env python3
"""
Gutenberg Google Drive Synchroniser & Zero-Disk Cleaner -- protokol-7

Uploads Zstandard Parquet shards to Google Drive under a
'Gutenberg/' top-level folder, verifies MD5, and immediately
deletes local files to guarantee zero disk residue.
"""

import hashlib
import os
import sys
import time
from typing import Dict, Any, Optional

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False

SCOPES = ["https://www.googleapis.com/auth/drive"]
# Shared Drive root folder (same as other pipelines in this project)
DEFAULT_ROOT_FOLDER_ID = "1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL"

_TOKEN_CANDIDATES = [
    os.path.abspath("token.json"),
    os.path.join(os.path.dirname(__file__), "token.json"),
]
_CREDS_CANDIDATES = [
    os.path.abspath("credentials.json"),
    os.path.join(os.path.dirname(__file__), "credentials.json"),
]


def _find_file(candidates):
    return next((p for p in candidates if p and os.path.exists(p)), None)


def _md5(path: str, chunk: int = 4 * 1024 * 1024) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while blk := f.read(chunk):
            h.update(blk)
    return h.hexdigest().lower()


class GutenbergDriveSync:
    """
    Manages Google Drive uploads for Gutenberg Parquet shards.
    Creates a 'Gutenberg/' folder under the shared root.
    """

    def __init__(
        self,
        root_folder_id: str = DEFAULT_ROOT_FOLDER_ID,
        token_path: Optional[str] = None,
        credentials_path: Optional[str] = None,
    ):
        self.root_folder_id = root_folder_id
        self.token_path = token_path or _find_file(_TOKEN_CANDIDATES) or "token.json"
        self.creds_path = credentials_path or _find_file(_CREDS_CANDIDATES)
        self.service = None
        self._gutenberg_folder_id: Optional[str] = None
        self._authenticate()

    def _authenticate(self) -> None:
        if not GOOGLE_LIBS_AVAILABLE:
            raise RuntimeError("Google API libraries not installed.")

        creds: Optional[Credentials] = None
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            print(f"[INFO] Loaded OAuth2 token: {self.token_path}")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(self.token_path, "w") as f:
                    f.write(creds.to_json())
                print("[OK] OAuth2 token refreshed.")
            else:
                raise RuntimeError(f"Valid token not found at {self.token_path}.")

        self.service = build("drive", "v3", credentials=creds, cache_discovery=False)
        print("[OK] Google Drive v3 client ready.")

    def _get_or_create_folder(self, parent_id: str, name: str) -> str:
        q = (
            f"'{parent_id}' in parents and name = '{name}' "
            f"and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        )
        res = self.service.files().list(q=q, spaces="drive", fields="files(id)").execute()
        files = res.get("files", [])
        if files:
            return files[0]["id"]
        meta = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        f = self.service.files().create(body=meta, fields="id").execute()
        fid = f["id"]
        print(f"[INFO] Created Drive folder: '{name}' (ID: {fid})")
        return fid

    def _ensure_gutenberg_folder(self) -> str:
        if self._gutenberg_folder_id is None:
            self._gutenberg_folder_id = self._get_or_create_folder(
                self.root_folder_id, "Gutenberg"
            )
        return self._gutenberg_folder_id

    def upload_and_clean(
        self,
        local_path: str,
        max_retries: int = 3,
        subfolder: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Uploads local Parquet or TAR.GZ file to Drive/Gutenberg/ (or subfolder),
        verifies MD5, deletes local file. Returns result dict.
        """
        if not os.path.exists(local_path):
            raise FileNotFoundError(local_path)

        fname     = os.path.basename(local_path)
        size_mb   = os.path.getsize(local_path) / 1024**2
        local_md5 = _md5(local_path)
        parent_id = self._ensure_gutenberg_folder()
        if subfolder:
            parent_id = self._get_or_create_folder(parent_id, subfolder)

        print(f"[DRIVE SYNC] Uploading: {fname} ({size_mb:.2f} MB, MD5: {local_md5})")

        is_tar = fname.endswith(".tar.gz") or fname.endswith(".tar")
        mime = "application/gzip" if is_tar else "application/vnd.apache.parquet"
        desc = (
            "Project Gutenberg illustrations and images -- TAR.GZ shard -- protokol-7"
            if is_tar else
            "Project Gutenberg clean text corpus -- Zstd Parquet -- protokol-7"
        )

        meta = {
            "name": fname,
            "parents": [parent_id],
            "description": desc,
        }
        media = MediaFileUpload(
            local_path,
            mimetype=mime,
            chunksize=64 * 1024 * 1024,
            resumable=True,
        )


        for attempt in range(1, max_retries + 1):
            try:
                t0 = time.time()
                req = self.service.files().create(
                    body=meta,
                    media_body=media,
                    fields="id,md5Checksum,webViewLink",
                )
                response = None
                prev_pct = -1
                while response is None:
                    status, response = req.next_chunk()
                    if status:
                        pct = int(status.progress() * 100)
                        if pct >= prev_pct + 10:
                            speed = (size_mb * status.progress()) / max(0.1, time.time() - t0)
                            print(f"[DRIVE UPLOAD] {fname} -> {pct}% ({speed:.2f} MB/s)")
                            prev_pct = pct

                remote_md5 = (response.get("md5Checksum") or "").lower()
                if remote_md5 and remote_md5 != local_md5:
                    raise ValueError(f"MD5 mismatch: local={local_md5} remote={remote_md5}")

                elapsed = time.time() - t0
                drive_id = response["id"]
                print(
                    f"[VERIFIED] Upload complete in {elapsed:.1f}s: {fname} "
                    f"(Drive ID: {drive_id}, MD5 Check: PASS)"
                )

                # Zero disk residue
                os.remove(local_path)
                print(f"[CLEANUP] Deleted local file: {local_path} (Freed: {size_mb:.2f} MB)")

                return {
                    "success": True,
                    "drive_file_id": drive_id,
                    "file_name": fname,
                    "md5": local_md5,
                    "size_mb": size_mb,
                    "link": response.get("webViewLink"),
                }

            except Exception as err:
                print(f"[WARN] Upload attempt {attempt} failed: {err}", file=sys.stderr)
                if attempt == max_retries:
                    raise RuntimeError(f"Drive upload failed after {max_retries} attempts: {err}")
                time.sleep(3 * attempt)

        raise RuntimeError("Unexpected upload failure.")
