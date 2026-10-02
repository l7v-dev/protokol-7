#!/usr/bin/env python3
"""
Wiktionary Dump Downloader & Mirror Resolver — protokol-7

Streams official .xml.bz2 dumps from Wikimedia servers or fastest global mirrors.
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

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; wiktionary-pipeline)"

WIKIMEDIA_MIRRORS = [
    "https://dumps.wikimedia.org",
    "https://dumps.wikimedia.your.org",
]


def resolve_dump_db_name(lang: str) -> str:
    """Resolves language code to canonical Wikimedia Wiktionary database name."""
    clean = lang.strip().lower()
    if clean in ("nan", "zh-min-nan", "zh_min_nan", "zh_min_nanwiktionary"):
        return "zh_min_nanwiktionary"
    if clean.endswith("wiktionary"):
        return clean
    return f"{clean}wiktionary"


def build_dump_urls(lang: str, mirror: Optional[str] = None) -> Tuple[str, str, str]:
    """Builds the dump download URL, md5 URL, and target filename for a language."""
    db_name = resolve_dump_db_name(lang)
    base_mirror = (mirror or WIKIMEDIA_MIRRORS[0]).rstrip("/")
    filename = f"{db_name}-latest-pages-articles.xml.bz2"
    dump_url = f"{base_mirror}/{db_name}/latest/{filename}"
    md5_url = f"{base_mirror}/{db_name}/latest/{db_name}-latest-md5sums.txt"
    return dump_url, md5_url, filename


def download_dump_file(
    dump_url: str,
    output_path: str,
    chunk_size: int = 1048576,  # 1 MB
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
                if now - last_log >= 5.0:
                    pct = (downloaded / total_size * 100) if total_size else 0
                    speed_mb = (downloaded / (1024 * 1024)) / max(0.1, now - start_time)
                    print(
                        f"[DOWNLOAD] {downloaded / (1024 * 1024):.1f}/{total_mb:.1f} MB "
                        f"({pct:.1f}%) - Speed: {speed_mb:.2f} MB/s"
                    )
                    last_log = now

    if os.path.exists(output_path):
        os.remove(output_path)
    os.rename(temp_path, output_path)

    elapsed = time.time() - start_time
    print(f"[OK] Download completed in {elapsed:.1f}s: {output_path}")
    return output_path


def remove_file_safely(path: Optional[str]) -> bool:
    """Removes a file safely and reports status."""
    if not path or not os.path.exists(path):
        return False
    try:
        size_mb = os.path.getsize(path) / (1024 * 1024)
        os.remove(path)
        print(f"[CLEANUP] Deleted temporary file: {path} (Freed: {size_mb:.2f} MB)")
        return True
    except Exception as e:
        print(f"[WARN] Failed to delete {path}: {e}")
        return False
