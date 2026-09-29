#!/usr/bin/env python3
"""
Wiktionary Google Drive Synchronizer & Zero-Disk Cleaner — protokol-7

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
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False

SCOPES = ["https://www.googleapis.com/auth/drive"]
DEFAULT_ROOT_FOLDER_ID = "1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL"


def calculate_file_md5(file_path: str, chunk_size: int = 1048576) -> str:
    """Calculates MD5 hash of local file in 1 MB chunks."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest().lower()


class WiktionaryDriveSync:
    """
    Connects to Google Drive, ensures Wiktionary/<lang>/ folder structure exists,
    uploads Parquet shards with MD5 verification, and deletes local files immediately.
    """

    def __init__(
        self,
        root_folder_id: str = DEFAULT_ROOT_FOLDER_ID,
        token_path: Optional[str] = None,
        credentials_path: Optional[str] = None,
    ):
        self.root_folder_id = root_folder_id

        # Search for existing active token
        default_token_candidates = [
            token_path,
            os.path.abspath("token.json"),
            os.path.join(os.path.dirname(__file__), "token.json"),
            os.path.abspath("trash/wikipedia_pipeline/token.json"),
        ]
        self.token_path = next((p for p in default_token_candidates if p and os.path.exists(p)), "token.json")

        default_creds_candidates = [
            credentials_path,
            os.path.abspath("credentials.json"),
            os.path.join(os.path.dirname(__file__), "credentials.json"),
            os.path.abspath("trash/wikipedia_pipeline/credentials.json"),
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

        self.service = build("drive", "v3", credentials=creds)

    def _get_or_create_subfolder(self, parent_id: str, folder_name: str) -> str:
        """Finds or creates a subfolder under parent_id."""
        query = (
            f"mimeType = 'application/vnd.google-apps.folder' and "
            f"name = '{folder_name}' and '{parent_id}' in parents and trashed = false"
        )
        resp = self.service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
        files = resp.get("files", [])

        if files:
            return files[0]["id"]

        folder_metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        folder = self.service.files().create(body=folder_metadata, fields="id").execute()
        created_id = folder.get("id")
        print(f"[DRIVE] Created folder: {folder_name} (ID: {created_id})")
        return created_id

    def resolve_destination_folder(self, lang: str) -> str:
        """Ensures 'Wiktionary/<lang>' directory structure exists under root folder."""
        wiktionary_root_id = self._get_or_create_subfolder(self.root_folder_id, "Wiktionary")
        lang_folder_id = self._get_or_create_subfolder(wiktionary_root_id, lang)
        return lang_folder_id

    def upload_file_and_cleanup(
        self,
        local_path: str,
        lang: str,
        max_retries: int = 5,
    ) -> Dict[str, Any]:
        """
        Uploads file to Google Drive, verifies cryptographic MD5 checksum,
        and IMMEDIATELY deletes the local file to guarantee zero disk waste.
        """
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")

        file_size_bytes = os.path.getsize(local_path)
        file_size_mb = file_size_bytes / (1024 * 1024)
        filename = os.path.basename(local_path)

        local_md5 = calculate_file_md5(local_path)
        dest_folder_id = self.resolve_destination_folder(lang)

        print(f"[DRIVE SYNC] Starting upload: {filename} ({file_size_mb:.2f} MB, MD5: {local_md5})")

        media = MediaFileUpload(
            local_path,
            mimetype="application/octet-stream",
            resumable=True,
            chunksize=10 * 1024 * 1024,  # 10 MB chunks
        )

        file_metadata = {
            "name": filename,
            "parents": [dest_folder_id],
        }

        request = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, size, md5Checksum",
        )

        response = None
        retries = 0
        start_time = time.time()

        while response is None:
            try:
                status, response = request.next_chunk()
                if status:
                    progress_pct = int(status.progress() * 100)
                    speed_mb = (file_size_mb * (progress_pct / 100)) / max(0.1, time.time() - start_time)
                    print(f"[DRIVE UPLOAD] {filename} -> {progress_pct}% ({speed_mb:.2f} MB/s)")
            except Exception as e:
                retries += 1
                if retries > max_retries:
                    raise RuntimeError(f"[ERROR] Max upload retries reached for {filename}: {e}")
                wait_time = retries * 3
                print(f"[WARN] Upload error ({e}), retrying in {wait_time}s...")
                time.sleep(wait_time)

        drive_file_id = response.get("id")
        drive_md5 = response.get("md5Checksum", "").lower()
        elapsed = time.time() - start_time

        if drive_md5 != local_md5:
            raise ValueError(
                f"[SECURITY ERROR] MD5 mismatch for {filename}! Local: {local_md5}, Drive: {drive_md5}"
            )

        print(
            f"[VERIFIED] Upload complete in {elapsed:.1f}s: {filename} "
            f"(Drive ID: {drive_file_id}, MD5 Check: PASS)"
        )

        # ZERO DISK RESIDUE: Delete local parquet immediately after confirmed upload
        try:
            os.remove(local_path)
            print(f"[CLEANUP] Deleted local file: {local_path} (Freed: {file_size_mb:.2f} MB)")
        except Exception as e:
            print(f"[WARN] Failed to delete local file {local_path}: {e}")

        return {
            "drive_file_id": drive_file_id,
            "filename": filename,
            "size_bytes": file_size_bytes,
            "md5": drive_md5,
            "elapsed_seconds": elapsed,
        }
