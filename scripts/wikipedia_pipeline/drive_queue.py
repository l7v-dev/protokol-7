import hashlib
import os
import re
import sys
import time
import urllib.parse
from typing import Optional, Dict, Any, List

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google.oauth2 import service_account
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False

SCOPES = ["https://www.googleapis.com/auth/drive"]


def calculate_file_md5(file_path: str, chunk_size: int = 1048576) -> str:
    """Calculates MD5 hash of a local file in chunks."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def extract_folder_id_from_url_or_id(input_value: Optional[str]) -> Optional[str]:
    """Extracts folder ID whether the user provides a raw ID or full Google Drive URL."""
    if not input_value:
        return None
    val = input_value.strip()
    # Matches https://drive.google.com/drive/folders/ID or /drive/u/0/folders/ID
    match = re.search(r"folders/([a-zA-Z0-9_-]+)", val)
    if match:
        return match.group(1)
    # If it's a direct ID without slashes
    if "/" not in val and "?" not in val:
        return val
    return val


class GoogleDriveSequentialSyncQueue:
    """
    Strictly sequential (concurrency=1) FIFO queue for uploading Parquet parts
    to Google Drive, validating md5Checksum against the local hash,
    and removing local files only upon confirmed verification.
    """

    def __init__(
        self,
        credentials_path: Optional[str] = None,
        token_path: str = "token.json",
        folder_id: Optional[str] = None,
        lang: str = "tr",
        dry_run: bool = False,
    ):
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.folder_id = extract_folder_id_from_url_or_id(folder_id) or "1s7Xs0U7ql9tEHT1WuQC7AdStWFys6TUL"
        self.lang = lang
        self.dry_run = dry_run
        self.data_folder_id: Optional[str] = None
        self.metadata_folder_id: Optional[str] = None

        if not self.dry_run:
            self._authenticate()
            base_id = self.folder_id or "root"
            self.data_folder_id = self._ensure_subfolder(base_id, f"{self.lang}/data")
            self.metadata_folder_id = self._ensure_subfolder(base_id, f"{self.lang}/metadata")
            print(f"[OK] Google Drive data folder ready: {self.data_folder_id}")
            print(f"[OK] Google Drive metadata folder ready: {self.metadata_folder_id}")
        else:
            self.data_folder_id = "dry-run-data-folder"
            self.metadata_folder_id = "dry-run-metadata-folder"

    def _authenticate(self) -> None:
        """Authenticates with Google Drive using Service Account or OAuth2."""
        if not GOOGLE_LIBS_AVAILABLE:
            raise RuntimeError(
                "[ERROR] Google API libraries not installed. Run 'uv pip install google-api-python-client google-auth-oauthlib'."
            )

        creds = None

        # Fallback candidate paths for credentials if not specified or missing
        if not self.credentials_path or not os.path.exists(self.credentials_path):
            dir_path = os.path.dirname(os.path.abspath(__file__))
            candidates = [
                os.path.join(dir_path, "credentials.json"),
                "credentials.json",
                os.path.join(dir_path, "service_account.json"),
                "service_account.json",
                os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
            ]
            for candidate in candidates:
                if candidate and os.path.exists(candidate):
                    self.credentials_path = candidate
                    break

        # 1. Check Service Account Key
        if self.credentials_path and os.path.exists(self.credentials_path):
            with open(self.credentials_path, "r", encoding="utf-8") as f:
                content = f.read()
                if '"type": "service_account"' in content:
                    print(
                        f"[INFO] Authenticating using Service Account: {self.credentials_path}"
                    )
                    creds = (
                        service_account.Credentials.from_service_account_file(
                            self.credentials_path, scopes=SCOPES
                        )
                    )
                    self.service = build("drive", "v3", credentials=creds)
                    return

        # 2. Check Existing OAuth2 Token
        if os.path.exists(self.token_path):
            print(f"[INFO] Loading saved OAuth2 token from: {self.token_path}")
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)

        # 3. Refresh or Run Browser / Link Flow
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                print("[INFO] Refreshing expired OAuth2 access token...")
                creds.refresh(Request())
            else:
                if not self.credentials_path or not os.path.exists(
                    self.credentials_path
                ):
                    raise FileNotFoundError(
                        f"[ERROR] OAuth credentials file not found: {self.credentials_path}.\n"
                        "Google Cloud Console'dan bir credentials.json indirin veya dosya yolunu belirtin."
                    )
                print("[INFO] Initializing OAuth2 authorization flow...")
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path,
                    SCOPES,
                    redirect_uri="urn:ietf:wg:oauth:2.0:oob",
                )

                try:
                    # Try local browser first if desktop environment is active
                    if "DISPLAY" in os.environ:
                        flow_local = InstalledAppFlow.from_client_secrets_file(
                            self.credentials_path, SCOPES
                        )
                        creds = flow_local.run_local_server(port=0, open_browser=True)
                    else:
                        raise RuntimeError("Headless environment")
                except Exception:
                    # Headless / Remote link flow: prints URL to terminal, user opens link on phone/remote browser
                    flow_remote = InstalledAppFlow.from_client_secrets_file(
                        self.credentials_path,
                        SCOPES,
                        redirect_uri="http://localhost:8085/",
                    )
                    auth_url, _ = flow_remote.authorization_url(
                        prompt="consent", access_type="offline"
                    )
                    print("\n" + "=" * 70)
                    print("[AUTH LINK] Cep telefonunuzdan veya tarayıcınızdan şu linke gidin:")
                    print(auth_url)
                    print("=" * 70)
                    print("[INFO] Hesabınızı seçip izin verin.")
                    print("[INFO] Yönlendirilen boş sayfanın adres çubuğundaki URL'yi veya 'code=' değerini yapıştırın.")
                    print("=" * 70 + "\n")

                    raw_code = input("[AUTH] Onay kodunu veya yönlendirilen URL'yi buraya yapıştırın: ").strip()
                    auth_code = raw_code
                    if "code=" in raw_code:
                        parsed = urllib.parse.urlparse(raw_code)
                        extracted = urllib.parse.parse_qs(parsed.query).get("code")
                        if extracted:
                            auth_code = extracted[0]

                    flow_remote.fetch_token(code=auth_code)
                    creds = flow_remote.credentials

            # Persist token for future headless runs
            with open(self.token_path, "w", encoding="utf-8") as token_file:
                token_file.write(creds.to_json())
            print(f"[OK] OAuth2 token saved to: {self.token_path}")

        self.service = build("drive", "v3", credentials=creds)

    def _ensure_subfolder(self, parent_id: str, folder_path: str) -> str:
        """Ensures nested subfolder hierarchy exists under parent_id in Google Drive."""
        parts = folder_path.strip("/").split("/")
        current_parent = parent_id

        for part in parts:
            query = (
                f"mimeType = 'application/vnd.google-apps.folder' and "
                f"name = '{part}' and '{current_parent}' in parents and trashed = false"
            )
            response = (
                self.service.files()
                .list(q=query, spaces="drive", fields="files(id, name)")
                .execute()
            )
            files = response.get("files", [])

            if files:
                current_parent = files[0]["id"]
            else:
                folder_metadata = {
                    "name": part,
                    "mimeType": "application/vnd.google-apps.folder",
                    "parents": [current_parent],
                }
                folder = (
                    self.service.files()
                    .create(body=folder_metadata, fields="id")
                    .execute()
                )
                current_parent = folder.get("id")
                print(f"[INFO] Created Google Drive subfolder '{part}' (id: {current_parent})")

        return current_parent

    def upload_and_verify(
        self,
        local_filepath: str,
        target_folder_id: Optional[str] = None,
        max_retries: int = 3,
    ) -> bool:
        """
        Uploads a single file to Google Drive, validates its MD5 checksum,
        and deletes the local file ONLY IF verification passes.
        """
        if not os.path.exists(local_filepath):
            print(
                f"[ERROR] File does not exist for upload: {local_filepath}",
                file=sys.stderr,
            )
            return False

        destination_folder = target_folder_id or self.data_folder_id
        filename = os.path.basename(local_filepath)
        file_size_mb = os.path.getsize(local_filepath) / (1024 * 1024)

        print(
            f"\n[INFO] [QUEUE] Processing: {filename} ({file_size_mb:.2f} MB)..."
        )

        # 1. Compute local MD5
        local_md5 = calculate_file_md5(local_filepath)
        print(f"[INFO] Local MD5: {local_md5}")

        if self.dry_run:
            print(
                f"[DRY-RUN] Simulated upload and hash verification for {filename}."
            )
            print(f"[DRY-RUN] Verified match: {local_md5} == {local_md5}")
            print(f"[INFO] [DRY-RUN] File preserved on disk (real upload pending): {local_filepath}")
            return True

        # 2. Resumable Upload Loop with Retry
        for attempt in range(1, max_retries + 1):
            try:
                print(
                    f"[INFO] Uploading to Google Drive (Attempt {attempt}/{max_retries})..."
                )
                file_metadata = {
                    "name": filename,
                    "parents": [destination_folder] if destination_folder else [],
                }
                mimetype = (
                    "application/json"
                    if filename.endswith(".json")
                    else "application/vnd.apache.parquet"
                )
                media = MediaFileUpload(
                    local_filepath,
                    mimetype=mimetype,
                    resumable=True,
                    chunksize=5 * 1024 * 1024,
                )

                request = self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields="id, name, md5Checksum, size",
                )

                response = None
                while response is None:
                    status, response = request.next_chunk()
                    if status:
                        progress = int(status.progress() * 100)
                        print(
                            f"[UPLOAD] {filename}: {progress}% completed",
                            end="\r",
                            flush=True,
                        )

                print(f"\n[OK] Upload finished. Drive File ID: {response.get('id')}")

                # 3. Compare MD5 Hash
                drive_md5 = (response.get("md5Checksum") or "").lower()
                print(f"[INFO] Drive MD5 : {drive_md5}")
                print(f"[INFO] Local MD5 : {local_md5}")

                if drive_md5 == local_md5:
                    print(
                        f"[OK] Hash verification SUCCESSFUL for {filename}. Drive and local checksums match."
                    )
                    # 4. Safe deletion of local file
                    os.remove(local_filepath)
                    print(
                        f"[OK] Local file safely deleted from disk: {local_filepath}"
                    )
                    return True
                else:
                    print(
                        f"[ERROR] HASH MISMATCH! Local: {local_md5}, Drive: {drive_md5}. File NOT deleted.",
                        file=sys.stderr,
                    )
                    # Delete the corrupted remote file
                    remote_id = response.get("id")
                    if remote_id:
                        self.service.files().delete(fileId=remote_id).execute()
                        print(
                            f"[WARN] Deleted corrupted remote file ID: {remote_id}"
                        )

            except Exception as e:
                print(
                    f"[ERROR] Upload attempt {attempt} failed: {e}",
                    file=sys.stderr,
                )
                time.sleep(2 * attempt)

        print(
            f"[CRITICAL] All upload attempts failed for {filename}. Local file preserved.",
            file=sys.stderr,
        )
        return False
