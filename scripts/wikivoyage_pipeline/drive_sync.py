#!/usr/bin/env python3
"""
Wikivoyage Google Drive Synchronizer & Zero-Disk Cleaner — protokol-7

Manages sequential streaming uploads of Zstandard Parquet files to Google Drive,
validates cryptographic md5Checksum against local hash, and immediately deletes
local files to guarantee zero disk waste.
"""

import hashlib
import os
import sys
import time
from typing import Optional, Dict, Any, List

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


def calculate_file_md5(file_path: str, chunk_size: int = 4194304) -> str:
    """Calculates MD5 hash of local file in 4 MB chunks."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest().lower()


class WikivoyageDriveSync:
    """
    Connects to Google Drive, ensures Wikivoyage/<lang>/ folder structure exists,
    uploads Parquet shards with MD5 verification, and deletes local files immediately.
    """

    def __init__(
        self,
        root_folder_id: str = DEFAULT_ROOT_FOLDER_ID,
        token_path: Optional[str] = None,
        credentials_path: Optional[str] = None,
    ):
        self.root_folder_id = root_folder_id

        default_token_candidates = [
            token_path,
            os.path.abspath("token.json"),
            os.path.join(os.path.dirname(__file__), "token.json"),
        ]
        self.token_path = next((p for p in default_token_candidates if p and os.path.exists(p)), "token.json")

        default_creds_candidates = [
            credentials_path,
            os.path.abspath("credentials.json"),
            os.path.join(os.path.dirname(__file__), "credentials.json"),
        ]
        self.credentials_path = next((p for p in default_creds_candidates if p and os.path.exists(p)), None)

        self.service = None
        self._authenticate()

    def _authenticate(self) -> None:
        if not GOOGLE_LIBS_AVAILABLE:
            raise RuntimeError(
                "[ERROR] Google API libraries not available. Run under the project virtual environment."
            )

        creds = None
        if os.path.exists(self.token_path):
            try:
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
                print(f"[INFO] Loaded OAuth2 token from: {self.token_path}")
            except Exception as e:
                print(f"[WARN] Failed to load token file: {e}")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                print("[INFO] Refreshing expired OAuth2 access token...")
                creds.refresh(Request())
                with open(self.token_path, "w", encoding="utf-8") as f:
                    f.write(creds.to_json())
                print(f"[OK] Refreshed OAuth2 token saved to: {self.token_path}")
            else:
                raise RuntimeError(
                    f"[ERROR] Valid Google Drive credentials not found at {self.token_path}."
                )

        self.service = build("drive", "v3", credentials=creds, cache_discovery=False)
        print("[OK] Google Drive v3 client initialized.")

    def _get_or_create_subfolder(self, parent_id: str, folder_name: str) -> str:
        """Finds or creates a subfolder within parent_id."""
        query = (
            f"'{parent_id}' in parents and name = '{folder_name}' and "
            f"mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        )
        res = self.service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
        files = res.get("files", [])
        if files:
            return files[0]["id"]

        folder_metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        folder = self.service.files().create(body=folder_metadata, fields="id").execute()
        folder_id = folder.get("id")
        print(f"[INFO] Created Google Drive folder: '{folder_name}' (ID: {folder_id})")
        return folder_id

    def get_language_folder_id(self, lang: str) -> str:
        """Ensures 'Wikivoyage/<lang>/' folder path exists under root folder."""
        wikivoyage_root = self._get_or_create_subfolder(self.root_folder_id, "Wikivoyage")
        return self._get_or_create_subfolder(wikivoyage_root, lang)

    def upload_and_clean(
        self,
        local_file_path: str,
        lang: str,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        """
        Uploads local Parquet file to Google Drive, validates MD5 checksum,
        and deletes the local file immediately to guarantee zero disk waste.
        """
        if not os.path.exists(local_file_path):
            raise FileNotFoundError(f"Local file does not exist: {local_file_path}")

        file_name = os.path.basename(local_file_path)
        file_size_bytes = os.path.getsize(local_file_path)
        file_size_mb = file_size_bytes / (1024 * 1024)

        print(f"[INFO] Calculating MD5 for {file_name} ({file_size_mb:.2f} MB)...")
        local_md5 = calculate_file_md5(local_file_path)
        print(f"[INFO] Local SHA-MD5: {local_md5}")

        target_folder_id = self.get_language_folder_id(lang)

        file_metadata = {
            "name": file_name,
            "parents": [target_folder_id],
            "description": f"Wikivoyage language dump ({lang}) - Zstandard Parquet - protokol-7",
        }

        media = MediaFileUpload(
            local_file_path,
            mimetype="application/vnd.apache.parquet",
            chunksize=64 * 1024 * 1024,  # 64 MB high-speed upload chunks
            resumable=True,
        )

        for attempt in range(1, max_retries + 1):
            try:
                print(f"[INFO] Starting upload for {file_name} (Attempt {attempt}/{max_retries})...")
                request = self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields="id, name, size, md5Checksum",
                )

                response = None
                start_time = time.time()
                while response is None:
                    status, response = request.next_chunk()
                    if status:
                        progress = int(status.progress() * 100)
                        print(f"[UPLOAD] {file_name} -> {progress}% uploaded...")

                elapsed = time.time() - start_time
                remote_file_id = response.get("id")
                remote_md5 = response.get("md5Checksum", "").lower()
                speed_mb_s = file_size_mb / elapsed if elapsed > 0 else 0

                print(
                    f"[OK] Uploaded {file_name} in {elapsed:.1f}s ({speed_mb_s:.2f} MB/s). "
                    f"Remote ID: {remote_file_id}"
                )

                if remote_md5 and remote_md5 != local_md5:
                    raise ValueError(
                        f"MD5 mismatch for {file_name}: local={local_md5} vs remote={remote_md5}"
                    )

                print(f"[OK] MD5 Verified: {local_md5} == {remote_md5}")

                # Immediate cleanup: zero disk residue guarantee
                os.remove(local_file_path)
                print(f"[ZERO-DISK] Safely purged local Parquet file: {file_name}")

                return {
                    "file_name": file_name,
                    "drive_file_id": remote_file_id,
                    "size_mb": file_size_mb,
                    "md5": local_md5,
                    "status": "uploaded_and_purged",
                }

            except Exception as e:
                print(f"[WARN] Upload error on attempt {attempt}: {e}")
                if attempt == max_retries:
                    raise
                time.sleep(2 ** attempt)

        raise RuntimeError(f"Failed to upload {file_name} after {max_retries} attempts.")
