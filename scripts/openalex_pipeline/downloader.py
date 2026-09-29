#!/usr/bin/env python3
"""
OpenAlex Bulk Downloader -- protokol-7

OpenAlex provides two bulk access methods:
  1. Snapshot (S3): full dataset as gzipped JSONL shards, ~300 GB.
     https://docs.openalex.org/download-all-data/openalex-snapshot
  2. API cursor pagination: works endpoint with cursor=* iteration,
     200 results/page, polite 10 req/s rate limit.

This pipeline uses METHOD 2 (API cursor) by default because:
  - No AWS credentials required.
  - Filters supported: open_access=true, year range, concept.
  - Targets only Open Access works with full text or rich abstract.

METHOD 1 (snapshot) is also supported via --snapshot-dir for orgs
that have already synced the snapshot locally.

Polite API usage: mailto param required per OpenAlex ToS.
"""

import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error
from typing import Iterator, Dict, Any, Optional, List

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

USER_AGENT   = "protokol-7/1.0 (+https://github.com/protokol-7; openalex-pipeline)"
API_BASE     = "https://api.openalex.org/works"
# Polite pool: add your e-mail to get 10 req/s instead of 5 req/s
DEFAULT_MAILTO = os.environ.get("OPENALEX_MAILTO", "data@protokol-7.example")
PAGE_SIZE    = 200     # max allowed
REQUEST_DELAY = 0.12  # ~8 req/s, safely under 10 req/s polite limit


def _get(url: str, retries: int = 4) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** attempt * 5
                print(f"[WARN] 429 rate-limit. Waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
            elif e.code == 503:
                time.sleep(10 * attempt)
            else:
                raise
        except Exception as e:
            if attempt == retries:
                raise
            time.sleep(5 * attempt)
    raise RuntimeError(f"Failed to fetch {url} after {retries} attempts.")


def build_filter_string(
    only_oa: bool = True,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    concept_id: Optional[str] = None,
) -> str:
    """Builds OpenAlex filter string for /works endpoint."""
    parts: List[str] = []
    if only_oa:
        parts.append("is_oa:true")
    if year_from and year_to:
        parts.append(f"publication_year:{year_from}-{year_to}")
    elif year_from:
        parts.append(f"publication_year:>{year_from - 1}")
    elif year_to:
        parts.append(f"publication_year:<{year_to + 1}")
    if concept_id:
        parts.append(f"concepts.id:{concept_id}")
    return ",".join(parts) if parts else "is_oa:true"


# Fields to retrieve — minimise payload, include what matters for LLM text
SELECT_FIELDS = ",".join([
    "id", "doi", "title", "display_name",
    "publication_year", "publication_date",
    "abstract_inverted_index",
    "authorships",
    "primary_location",
    "open_access",
    "cited_by_count",
    "concepts",
    "type",
    "language",
])


def iter_works_cursor(
    filter_str: str = "is_oa:true",
    mailto: str = DEFAULT_MAILTO,
    start_cursor: str = "*",
) -> Iterator[List[Dict[str, Any]]]:
    """
    Yields pages (list of raw work dicts) via cursor pagination.
    Cursor is '*' for first page; subsequent cursors come from meta.next_cursor.
    """
    cursor = start_cursor
    page_num = 0

    while cursor:
        url = (
            f"{API_BASE}"
            f"?filter={urllib.parse.quote(filter_str)}"
            f"&select={SELECT_FIELDS}"
            f"&per_page={PAGE_SIZE}"
            f"&cursor={urllib.parse.quote(cursor)}"
            f"&mailto={urllib.parse.quote(mailto)}"
        )

        data   = _get(url)
        works  = data.get("results", [])
        meta   = data.get("meta", {})
        cursor = meta.get("next_cursor")  # None when exhausted
        page_num += 1

        if not works:
            break

        yield works

        time.sleep(REQUEST_DELAY)


# Lazy import — avoid crashing on missing module at import time
def _urllib_parse():
    import urllib.parse
    return urllib.parse

import urllib.parse  # noqa: E402  (stdlib, always available)


def fetch_oa_fulltext(oa_url: str, timeout: int = 60, max_bytes: int = 5 * 1024 * 1024) -> Optional[str]:
    """
    Attempts to download a plain-text or HTML full text from an OA URL.
    Returns stripped text or None on failure.
    """
    try:
        req = urllib.request.Request(
            oa_url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain,*/*"}
        )
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
            ct = resp.headers.get("Content-Type", "")
            # Only accept text responses; skip PDFs (binary, needs OCR)
            if "pdf" in ct.lower():
                return None
            raw = resp.read(max_bytes)
            try:
                return raw.decode("utf-8", errors="replace")
            except Exception:
                return None
    except Exception:
        return None
