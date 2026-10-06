#!/usr/bin/env python3
"""
Base Google Drive Synchronizer and Zero-Disk Eviction Engine -- protokol-7

Uploads compressed Parquet shards to Google Drive via resumable streaming,
verifies remote MD5 against local checksum, and ensures zero local disk residue.
"""

import hashlib
import os
import sys
import time
from threading import Lock, current_thread
from pipelines.shared.upload_queue import UploadQueue
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
DEFAULT_ROOT_FOLDER_ID = os.environ.get(
    "DRIVE_ROOT_FOLDER_ID", "1p9-IOwZwpdHCmcqq86Y-oAK5ttyZoQv1"
)

TOKEN_CANDIDATE_PATHS = [
    os.path.abspath("config/auth/gdrive-token.json"),
    os.path.abspath("token.json"),
    os.path.abspath("scripts/openalex_snapshot_pipeline/token.json"),
    os.path.abspath("scripts/openalex_pipeline/token.json"),
    os.path.abspath("scripts/wikisource_pipeline/token.json"),
]


def calculate_md5(path: str, chunk_size: int = 4 * 1024 * 1024) -> str:
    """Calculates hex MD5 of a local file."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        while blk := f.read(chunk_size):
            h.update(blk)
    return h.hexdigest().lower()


def find_token_path(custom_candidates: Optional[List[str]] = None) -> Optional[str]:
    """Finds first existing Google OAuth token path."""
    candidates = (custom_candidates or []) + TOKEN_CANDIDATE_PATHS
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


class BaseDriveSync:
    """
    Authenticated Google Drive synchronizer with resumable chunked upload,
    remote MD5 validation, and zero local disk residue.
    """

    def __init__(
        self,
        root_folder_id: str = DEFAULT_ROOT_FOLDER_ID,
        token_path: Optional[str] = None,
        dry_run: bool = False,
    ):
        self.root_folder_id = root_folder_id or DEFAULT_ROOT_FOLDER_ID
        self.dry_run = dry_run
        self.token_path = token_path or find_token_path()
        self.service = None
        self._async_lock = Lock()
        self._upload_queue = None
        self._upload_client = None
        self._folder_cache: Dict[str, str] = {}

        if not self.dry_run:
            self._init_service()

    def _init_service(self) -> None:
        if not GOOGLE_LIBS_AVAILABLE:
            raise RuntimeError(
                "Google API libraries not installed. Install google-api-python-client and google-auth."
            )
        if not self.token_path or not os.path.exists(self.token_path):
            raise FileNotFoundError(
                f"OAuth token not found. Checked: {TOKEN_CANDIDATE_PATHS}"
            )

        creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(self.token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())

        self.service = build("drive", "v3", credentials=creds, cache_discovery=False)
        print(f"[DRIVE] Authenticated successfully via {self.token_path}")

    def get_or_create_subfolder(self, folder_name: str, parent_id: Optional[str] = None) -> str:
        """Retrieves or creates a named folder inside the parent folder."""
        pid = parent_id or self.root_folder_id
        cache_key = f"{pid}/{folder_name}"
        if cache_key in self._folder_cache:
            return self._folder_cache[cache_key]

        if self.dry_run:
            mock_id = f"mock_folder_{folder_name}"
            self._folder_cache[cache_key] = mock_id
            return mock_id

        escaped = folder_name.replace("'", "\\'")
        query = (
            f"name='{escaped}' and '{pid}' in parents and "
            "mimeType='application/vnd.google-apps.folder' and trashed=false"
        )
        res = self.service.files().list(
            q=query, spaces="drive", fields="files(id, name)"
        ).execute()
        files = res.get("files", [])
        if files:
            folder_id = files[0]["id"]
        else:
            meta = {
                "name": folder_name,
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [pid],
            }
            created = self.service.files().create(body=meta, fields="id").execute()
            folder_id = created["id"]
            print(f"[DRIVE] Created remote folder: {folder_name} (ID: {folder_id})")

        self._folder_cache[cache_key] = folder_id
        return folder_id

    def upload_file(
        self,
        local_path: str,
        target_folder_id: Optional[str] = None,
        custom_filename: Optional[str] = None,
        chunk_size_mb: int = 64,
        max_retries: int = 5,
        purge_on_success: bool = True,
        verify_md5: bool = True,
    ) -> Dict[str, Any]:
        """
        Uploads local file via resumable streaming, verifies MD5, and deletes local file.
        """
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"File not found: {local_path}")

        filename = custom_filename or os.path.basename(local_path)
        byte_size = os.path.getsize(local_path)
        target_fid = target_folder_id or self.root_folder_id

        local_md5 = calculate_md5(local_path) if verify_md5 else None

        if self.dry_run:
            print(f"[DRIVE-DRY] Would upload {filename} ({byte_size / (1024**2):.2f} MB)")
            return {
                "file_id": f"dry_run_{filename}",
                "filename": filename,
                "byte_size": byte_size,
                "md5": local_md5 or "",
                "status": "dry_run",
            }

        file_metadata = {
            "name": filename,
            "parents": [target_fid],
        }
        chunk_bytes = chunk_size_mb * 1024 * 1024
        media = MediaFileUpload(
            local_path,
            mimetype="application/octet-stream",
            chunksize=chunk_bytes,
            resumable=True,
        )

        request = self.service.files().create(
            body=file_metadata, media_body=media, fields="id, name, size, md5Checksum"
        )

        response = None
        attempt = 0
        while response is None:
            try:
                status, response = request.next_chunk()
                if status:
                    progress = int(status.progress() * 100)
                    print(f"[DRIVE] Upload progress: {filename} {progress}%", end="\r")
            except Exception as e:
                attempt += 1
                if attempt > max_retries:
                    raise RuntimeError(f"Upload failed after {max_retries} retries: {e}")
                backoff = 2**attempt
                print(f"\n[DRIVE] Chunk upload error: {e}. Backing off {backoff}s...")
                time.sleep(backoff)

        remote_id = response.get("id")
        remote_md5 = (response.get("md5Checksum") or "").lower()

        if not remote_id or (verify_md5 and not remote_md5):
            raise ValueError("Drive upload lacks verification metadata")
        if verify_md5 and local_md5 and remote_md5:
            if local_md5 != remote_md5:
                raise ValueError(
                    f"MD5 mismatch for {filename}! Local: {local_md5}, Remote: {remote_md5}"
                )
            print(f"\n[DRIVE] Verified MD5 integrity: {remote_md5}")

        print(
            f"[DRIVE] Uploaded {filename} -> ID: {remote_id} "
            f"({byte_size / (1024**2):.2f} MB)"
        )

        if purge_on_success:
            try:
                os.remove(local_path)
                print(f"[DRIVE] Evicted local file (zero-disk residue): {local_path}")
            except OSError as e:
                print(f"[DRIVE] Warning: Failed to purge local file {local_path}: {e}")

        return {
            "file_id": remote_id,
            "filename": filename,
            "byte_size": byte_size,
            "md5": remote_md5 or (local_md5 or ""),
            "status": "uploaded",
        }


    def upload_async(self, local_path, target_folder_id=None, *, on_success=None, on_failure=None, purge_on_success=True):
        """Worker transport is separate; callback commits before local eviction."""
        from pipelines.shared.pipeline_runtime import current_stats
        if self._upload_queue is not None and current_thread() is self._upload_queue._thread:
            raise RuntimeError("Recursive upload admission is not supported")
        stats = current_stats()
        def upload():
            try:
                if self._upload_client is None:
                    self._upload_client = BaseDriveSync(self.root_folder_id, self.token_path, self.dry_run)
                result = self._upload_client.upload_file(local_path, target_folder_id=target_folder_id,
                                                        purge_on_success=False, verify_md5=True)
                if result.get('status') == 'dry_run':
                    return result
                if on_success:
                    on_success(result)
                if purge_on_success:
                    os.remove(local_path)
                if stats:
                    stats.inc('uploads_succeeded')
                    stats.inc('uploaded_bytes', result.get('byte_size', 0))
                return result
            except Exception as error:
                if stats:
                    stats.inc('uploads_failed')
                if on_failure:
                    try:
                        on_failure(error)
                    except Exception as callback_error:
                        error.add_note(f"Upload failure receipt failed: {type(callback_error).__name__}")
                raise
        with self._async_lock:
            if self._upload_queue is None:
                self._upload_queue = UploadQueue(capacity=4)
            future = self._upload_queue.submit(upload)
        if stats:
            stats.inc('uploads_queued')
        return future

    def close_uploads(self):
        if self._upload_queue is not None:
            self._upload_queue.close()
            if self._upload_client is not None and self._upload_client.service is not None:
                self._upload_client.service.close()
            self._upload_client = None
