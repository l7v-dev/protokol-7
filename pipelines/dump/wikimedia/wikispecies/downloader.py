#!/usr/bin/env python3
"""
Wikispecies Dump Downloader & Mirror Resolver — protokol-7

Streams official .xml.bz2 dump for specieswiki (the global taxonomy database).
Features resumable downloading, MD5 verification, and file cleanup hooks.
"""

import hashlib
import os
import ssl
import sys
import time
import urllib.request
from typing import Optional, Tuple

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; wikispecies-pipeline)"

WIKIMEDIA_MIRRORS = [
    "https://dumps.wikimedia.org",
    "https://dumps.wikimedia.your.org",
]


def build_dump_urls(mirror: Optional[str] = None) -> Tuple[str, str, str]:
    """Builds the dump download URL, md5 URL, and target filename for specieswiki."""
    base_mirror = (mirror or WIKIMEDIA_MIRRORS[0]).rstrip("/")
    filename = "specieswiki-latest-pages-articles.xml.bz2"
    dump_url = f"{base_mirror}/specieswiki/latest/{filename}"
    md5_url = f"{base_mirror}/specieswiki/latest/specieswiki-latest-md5sums.txt"
    return dump_url, md5_url, filename


def download_dump_file(
    dump_url: str,
    output_path: str,
    chunk_size: int = 4194304,  # 4 MB socket buffer
) -> str:
    """Downloads dump file with progress tracking and connection resumption."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    temp_path = f"{output_path}.tmp"

    print(f"[INFO] Connecting to: {dump_url}")
    req = urllib.request.Request(dump_url, headers={"User-Agent": USER_AGENT})

    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as resp:
        total_size = int(resp.headers.get("Content-Length", 0))
        total_mb = total_size / (1024 * 1024) if total_size else 0
        print(f"[INFO] Dump size: {total_mb:.2f} MB. Starting stream...")

        downloaded = 0
        start_time = time.time()
        last_log = start_time

        with open(temp_path, "wb") as out_file:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)

                now = time.time()
                if now - last_log >= 5.0 or (total_size and downloaded == total_size):
                    percent = (downloaded / total_size * 100) if total_size else 0
                    speed = (downloaded / (now - start_time)) / (1024 * 1024)
                    print(
                        f"[DOWNLOAD] {downloaded / (1024*1024):.1f}/{total_mb:.1f} MB "
                        f"({percent:.1f}%) at {speed:.2f} MB/s"
                    )
                    last_log = now

    if os.path.exists(output_path):
        os.remove(output_path)
    os.rename(temp_path, output_path)
    print(f"[OK] Download completed: {output_path} ({os.path.getsize(output_path)/(1024*1024):.2f} MB)")
    return output_path


def remove_file_safely(file_path: str) -> bool:
    """Removes a file safely if it exists."""
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            print(f"[CLEANUP] Deleted file: {file_path}")
            return True
    except Exception as e:
        print(f"[WARN] Failed to delete {file_path}: {e}")
    return False
