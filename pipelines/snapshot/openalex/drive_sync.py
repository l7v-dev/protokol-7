#!/usr/bin/env python3
"""
OpenAlex Google Drive Synchronizer & Zero-Disk Cleaner -- protokol-7

Uploads Zstandard-compressed Parquet shards to Google Drive (OpenAlex/Snapshots/),
verifies remote MD5 against local checksum, and immediately purges local files.
"""

import hashlib
import os
import sys
import time
from typing import Any, Dict, List, Optional

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False

SCOPES = ["https://www.googleapis.com/auth/drive"]
DEFAULT_ROOT_FOLDER_ID = "1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL"

_TOKEN_CANDIDATES = [
    os.path.abspath("token.json"),
    os.path.join(os.path.dirname(__file__), "token.json"),
    os.path.abspath("scripts/openalex_pipeline/token.json"),
    os.path.abspath("scripts/wikisource_pipeline/token.json"),
]


def _find_token() -> Optional[str]:
    for path in _TOKEN_CANDIDATES:
        if path and os.path.exists(path):
            return path
    return None


def calculate_md5(path: str, chunk_size: int = 4 * 1024 * 1024) -> str:
    """Calculates hex MD5 of a local file."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        while blk := f.read(chunk_size):
            h.update(blk)
    return h.hexdigest().lower()


class OpenAlexDriveSync:
    """
    Handles authenticated uploads to Google Drive with automated subfolder resolution,
    resumable chunk streaming, remote MD5 validation, and zero local disk residue.
    """

    def __init__(
        self,
        root_folder_id: str = DEFAULT_ROOT_FOLDER_ID,
        token_path: Optional[str] = None,
        subfolder_name: str = "Snapshots",
    ):
        self.root_folder_id = root_folder_id
        self.token_path = token_path or _find_token() or "token.json"
        self.subfolder_name = subfolder_name
        self.service = None
        self._target_folder_id: Optional[str] = None
        self._authenticate()

    def _authenticate(self) -> None:
        if not GOOGLE_LIBS_AVAILABLE:
            raise RuntimeError("Google API client libraries are not installed.")

        creds: Optional[Credentials] = None
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            print(f"[DRIVE SYNC] Loaded OAuth2 token: {self.token_path}")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                with open(self.token_path, "w") as f:
                    f.write(creds.to_json())
                print("[DRIVE SYNC] OAuth2 token refreshed successfully.")
            else:
                raise RuntimeError(
                    f"Valid OAuth2 token not found at {self.token_path}."
                )

        self.service = build("drive", "v3", credentials=creds, cache_discovery=False)
        print("[DRIVE SYNC] Google Drive v3 client initialized.")

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
        print(f"[DRIVE SYNC] Created folder '{name}' (ID: {fid}) in parent {parent_id}")
        return fid

    def _ensure_target_folder(self) -> str:
        if self._target_folder_id is not None:
            return self._target_folder_id

        # 1. Ensure OpenAlex root folder under root_folder_id
        oa_parent_id = self._get_or_create_folder(self.root_folder_id, "OpenAlex")

        # 2. Ensure subfolder (e.g. Snapshots) under OpenAlex
        if self.subfolder_name:
            self._target_folder_id = self._get_or_create_folder(
                oa_parent_id, self.subfolder_name
            )
        else:
            self._target_folder_id = oa_parent_id

        return self._target_folder_id

    def upload_and_clean(
        self,
        local_path: str,
        expected_md5: Optional[str] = None,
        max_retries: int = 4,
        chunk_size: int = 64 * 1024 * 1024,
    ) -> Dict[str, Any]:
        """
        Uploads local shard via resumable stream, verifies MD5, deletes local file,
        and returns file metadata dict.
        """
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local shard not found: {local_path}")

        filename = os.path.basename(local_path)
        size_bytes = os.path.getsize(local_path)
        size_mb = size_bytes / (1024 * 1024)

        local_md5 = expected_md5 or calculate_md5(local_path)
        folder_id = self._ensure_target_folder()

        print(
            f"[DRIVE SYNC] Starting upload: {filename} "
            f"({size_mb:.2f} MB, MD5: {local_md5})"
        )

        file_metadata = {
            "name": filename,
            "parents": [folder_id],
            "description": "OpenAlex Works S3 Parquet Snapshot Clean LLM Corpus -- protokol-7",
        }

        media = MediaFileUpload(
            local_path,
            mimetype="application/vnd.apache.parquet",
            chunksize=chunk_size,
            resumable=True,
        )

        for attempt in range(1, max_retries + 1):
            try:
                t0 = time.time()
                request = self.service.files().create(
                    body=file_metadata, media_body=media, fields="id,md5Checksum,webViewLink"
                )

                response = None
                prev_pct = -1
                while response is None:
                    status, response = request.next_chunk()
                    if status:
                        pct = int(status.progress() * 100)
                        if pct >= prev_pct + 10:
                            elapsed = max(0.1, time.time() - t0)
                            uploaded_mb = size_mb * status.progress()
                            speed = uploaded_mb / elapsed
                            print(
                                f"[DRIVE UPLOAD] {filename} -> {pct}% "
                                f"({uploaded_mb:.1f}/{size_mb:.1f} MB, {speed:.2f} MB/s)"
                            )
                            prev_pct = pct

                remote_md5 = (response.get("md5Checksum") or "").lower()
                if remote_md5 and remote_md5 != local_md5:
                    raise ValueError(
                        f"MD5 mismatch for {filename}: local={local_md5}, remote={remote_md5}"
                    )

                drive_file_id = response["id"]
                elapsed_total = max(0.1, time.time() - t0)
                avg_speed = size_mb / elapsed_total

                print(
                    f"[DRIVE VERIFIED] {filename} uploaded successfully! "
                    f"Drive ID: {drive_file_id} | MD5 PASS | {avg_speed:.2f} MB/s"
                )

                # Zero local disk residue
                os.remove(local_path)
                print(f"[CLEANUP] Deleted local shard: {local_path} (Freed: {size_mb:.2f} MB)")

                return {
                    "success": True,
                    "filename": filename,
                    "drive_file_id": drive_file_id,
                    "web_view_link": response.get("webViewLink", ""),
                    "size_bytes": size_bytes,
                    "size_mb": size_mb,
                    "md5": local_md5,
                }

            except Exception as err:
                print(
                    f"[WARN] Upload attempt {attempt} failed for {filename}: {err}",
                    file=sys.stderr,
                )
                if attempt == max_retries:
                    raise RuntimeError(
                        f"Drive upload failed after {max_retries} attempts for {filename}: {err}"
                    )
                time.sleep(4 * attempt)

        raise RuntimeError("Unexpected upload loop exit.")
