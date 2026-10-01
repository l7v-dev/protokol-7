#!/usr/bin/env python3
"""
StackExchange Archive Downloader -- protokol-7

Downloads official Stack Exchange data dumps from archive.org.
The Internet Archive hosts the full SE dump as individual 7z files,
one per site (e.g. stackoverflow.com.7z, math.stackexchange.com.7z).

Dump index page: https://archive.org/details/stackexchange

Each 7z archive contains several XML files:
  Posts.xml, Comments.xml, Users.xml, Tags.xml, Votes.xml, ...

We only need Posts.xml (questions + answers) and Comments.xml.
7z extraction is done via the `py7zr` library (pure Python).
"""

import os
import ssl
import sys
import time
import urllib.request
import urllib.error
from typing import Optional, Tuple

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; stackexchange-pipeline)"

# archive.org direct download base
ARCHIVE_BASE = "https://archive.org/download/stackexchange"

CHUNK_SIZE = 4 * 1024 * 1024   # 4 MB


import shutil
import subprocess

def build_dump_url(slug: str, site: Optional[str] = None) -> str:
    """
    Returns the archive.org 7z dump URL for the given site slug or domain.
    Examples:
      'askubuntu', 'askubuntu.com'          -> .../stackexchange/askubuntu.com.7z
      'superuser', 'superuser.com'          -> .../stackexchange/superuser.com.7z
      'math', 'math.stackexchange.com'      -> .../stackexchange/math.stackexchange.com.7z
      'mathoverflow.net'                    -> .../stackexchange/mathoverflow.net.7z
    """
    if site and site.endswith((".com", ".net", ".org")):
        filename = f"{site}.7z"
    elif slug in ("superuser", "serverfault", "askubuntu"):
        filename = f"{slug}.com.7z"
    elif "." in slug:
        filename = f"{slug}.7z"
    else:
        filename = f"{slug}.stackexchange.com.7z"
    return f"{ARCHIVE_BASE}/{filename}"



def download_7z(
    url: str,
    dest_path: str,
    timeout: int = 120,
) -> Tuple[str, float]:
    """
    Streams a 7z file from archive.org to dest_path with progress logging.
    Returns (dest_path, size_mb).
    Raises urllib.error.HTTPError on 404 / non-200.
    """
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    tmp_path = dest_path + ".tmp"

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    print(f"[INFO] Connecting: {url}")

    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
        total_bytes = int(resp.headers.get("Content-Length", 0))
        total_mb    = total_bytes / 1024**2 if total_bytes else 0
        print(f"[INFO] File size: {total_mb:.1f} MB. Streaming...")

        downloaded = 0
        t0         = time.time()
        last_log   = t0

        with open(tmp_path, "wb") as out:
            while True:
                chunk = resp.read(CHUNK_SIZE)
                if not chunk:
                    break
                out.write(chunk)
                downloaded += len(chunk)
                now = time.time()
                if now - last_log >= 10.0:
                    pct   = downloaded / total_bytes * 100 if total_bytes else 0
                    speed = downloaded / 1024**2 / max(0.1, now - t0)
                    print(
                        f"[DOWNLOAD] {downloaded/1024**2:.1f}/{total_mb:.1f} MB "
                        f"({pct:.1f}%) - {speed:.2f} MB/s"
                    )
                    last_log = now

    if os.path.exists(dest_path):
        os.remove(dest_path)
    os.rename(tmp_path, dest_path)

    elapsed  = time.time() - t0
    size_mb  = os.path.getsize(dest_path) / 1024**2
    print(f"[OK] Downloaded {size_mb:.1f} MB in {elapsed:.1f}s -> {dest_path}")
    return dest_path, size_mb


def extract_xml_files(
    archive_path: str,
    dest_dir: str,
    target_files: Tuple[str, ...] = ("Posts.xml", "Comments.xml"),
) -> dict:
    """
    Extracts only the needed XML files from a 7z archive.
    Uses native system 7z/7za if available (much faster and lower memory),
    falling back to py7zr.
    Returns dict mapping xml_name -> extracted_path.
    """
    os.makedirs(dest_dir, exist_ok=True)
    extracted: dict = {}

    print(f"[INFO] Extracting {target_files} from {os.path.basename(archive_path)}...")

    # Fast path: native 7z binary
    seven_zip = shutil.which("7z") or shutil.which("7za") or shutil.which("7zr")
    if seven_zip:
        try:
            cmd = [seven_zip, "e", "-y", f"-o{dest_dir}", archive_path, *target_files]
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0:
                for name in target_files:
                    path = os.path.join(dest_dir, name)
                    if os.path.exists(path):
                        size_mb = os.path.getsize(path) / 1024**2
                        print(f"[OK] Extracted (native 7z): {name} ({size_mb:.1f} MB)")
                        extracted[name] = path
                if extracted:
                    return extracted
        except Exception as e:
            print(f"[WARN] Native 7z extraction failed ({e}), falling back to py7zr...", file=sys.stderr)

    # Fallback path: py7zr
    try:
        import py7zr
    except ImportError:
        raise ImportError(
            "py7zr or system 7z is required for 7z extraction. "
            "Install with: pip install py7zr or install p7zip"
        )

    with py7zr.SevenZipFile(archive_path, mode="r") as archive:
        all_names = archive.getnames()
        to_extract = [n for n in all_names if n in target_files]
        if not to_extract:
            print(f"[WARN] None of {target_files} found in archive. Contents: {all_names[:10]}", file=sys.stderr)
            return extracted
        archive.extract(path=dest_dir, targets=to_extract)

    for name in to_extract:
        path = os.path.join(dest_dir, name)
        if os.path.exists(path):
            size_mb = os.path.getsize(path) / 1024**2
            print(f"[OK] Extracted (py7zr): {name} ({size_mb:.1f} MB)")
            extracted[name] = path

    return extracted


def remove_safely(path: Optional[str]) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
            print(f"[CLEANUP] Deleted: {path}")
        except OSError as e:
            print(f"[WARN] Could not delete {path}: {e}", file=sys.stderr)
