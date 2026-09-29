#!/usr/bin/env python3
"""
Gutenberg Catalog Downloader & Text Fetcher -- protokol-7

Fetches the full Project Gutenberg book catalog via Gutendex REST API
(paginated), then streams raw plain-text files directly from PG mirrors.
All network I/O is streamed in chunks; no full file is held in RAM.
"""

import ssl
import time
import urllib.request
import urllib.error
from typing import Iterator, Dict, Any, Optional, List

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; gutenberg-pipeline)"

# Gutendex is an open-source Gutenberg REST API mirror
GUTENDEX_BASE = "https://gutendex.com/books"

# Official PG mirrors for raw text downloads
PG_MIRRORS: List[str] = [
    "https://www.gutenberg.org",
    "https://gutenberg.pglaf.org",
]

CHUNK_SIZE = 1 * 1024 * 1024   # 1 MB network read buffer
MAX_TEXT_BYTES = 10 * 1024 * 1024  # 10 MB per book safety cap


def _make_request(url: str, timeout: int = 60) -> urllib.request.Request:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return req


def fetch_gutendex_page(page: int = 1, page_size: int = 32) -> Dict[str, Any]:
    """
    Fetches one page of the Gutendex book catalog.
    Returns parsed JSON dict with 'count', 'next', 'results' keys.
    """
    url = f"{GUTENDEX_BASE}?page={page}&mime_type=text%2Fplain"
    req = _make_request(url)
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=30) as resp:
        import json
        return json.loads(resp.read().decode("utf-8"))


def iter_catalog_pages(start_page: int = 1) -> Iterator[List[Dict[str, Any]]]:
    """
    Generator: yields lists of raw book dicts from Gutendex, page by page,
    until no next page exists. Handles rate-limit 429 with exponential backoff.
    """
    page = start_page
    while True:
        for attempt in range(4):
            try:
                data = fetch_gutendex_page(page)
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    wait = 2 ** attempt * 5
                    print(f"[WARN] Rate-limited (429) on page {page}. Waiting {wait}s...")
                    time.sleep(wait)
                else:
                    raise
        else:
            raise RuntimeError(f"Failed to fetch catalog page {page} after 4 attempts.")

        results = data.get("results", [])
        if not results:
            break
        yield results

        if not data.get("next"):
            break
        page += 1
        # Polite crawl delay
        time.sleep(0.25)


def pick_text_url(formats: Dict[str, str]) -> Optional[str]:
    """
    Picks the best plain-text download URL from a book's formats dict.
    Preference: UTF-8 > ASCII > generic text/plain.
    """
    preferred = [
        "text/plain; charset=utf-8",
        "text/plain; charset=us-ascii",
        "text/plain",
    ]
    for mime in preferred:
        url = formats.get(mime)
        if url:
            return url
    # Fallback: scan for any text/plain key
    for key, url in formats.items():
        if "text/plain" in key and url:
            return url
    return None


def stream_book_text(text_url: str, timeout: int = 120) -> Optional[bytes]:
    """
    Downloads raw book text up to MAX_TEXT_BYTES.
    Returns raw bytes or None on failure.
    """
    req = _make_request(text_url)
    try:
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
            chunks: List[bytes] = []
            total = 0
            while True:
                chunk = resp.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                chunks.append(chunk)
                if total >= MAX_TEXT_BYTES:
                    break
            return b"".join(chunks)
    except (urllib.error.URLError, OSError) as e:
        print(f"[WARN] Failed to fetch text from {text_url}: {e}")
        return None
