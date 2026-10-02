#!/usr/bin/env python3
"""
Semantic Scholar Bulk Downloader -- protokol-7

Semantic Scholar provides two bulk access paths:

  1. S2 Academic Graph API (graph.semanticscholar.org/graph/v1/paper/search)
     Bulk search with offset pagination. 100 results/page.
     No auth needed for basic fields; API key unlocks higher rate limits.
     Rate limit: 100 req/min unauthenticated, 1 req/s authenticated.

  2. S2ORC Dataset (bulk JSONL gz shards, ~1.3 TB full)
     Requires AWS credentials via SemanticScholar dataset API.
     Access: https://api.semanticscholar.org/datasets/v1/release/

This pipeline uses METHOD 1 (Graph API) for broad LLM corpus collection:
  - Fields: title, abstract, authors, year, citationCount, isOpenAccess, openAccessPdf
  - Sorted by citationCount descending to get highest-quality papers first.
  - API key via S2_API_KEY env var (optional, increases rate limit 10x).

For organisations with S2ORC access, METHOD 2 (dataset bulk download)
can be enabled via --use-bulk-api flag (requires separate credentials).
"""

import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Iterator, Dict, Any, Optional, List

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

USER_AGENT   = "protokol-7/1.0 (+https://github.com/protokol-7; semanticscholar-pipeline)"
GRAPH_API    = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
DATASET_API  = "https://api.semanticscholar.org/datasets/v1"
PAGE_SIZE    = 500   # max for bulk endpoint
S2_API_KEY   = os.environ.get("S2_API_KEY", "")

# Fields that provide rich text content for LLM training
PAPER_FIELDS = ",".join([
    "paperId", "externalIds", "title", "abstract",
    "authors", "year", "publicationDate",
    "citationCount", "referenceCount",
    "isOpenAccess", "openAccessPdf",
    "fieldsOfStudy", "s2FieldsOfStudy",
    "publicationTypes", "journal",
])

# Minimum citation count filter (0 = all, higher = quality filter)
DEFAULT_MIN_CITATIONS = 0


def _headers() -> Dict[str, str]:
    h = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    if S2_API_KEY:
        h["x-api-key"] = S2_API_KEY
    return h


def _request_delay() -> float:
    """Returns seconds to wait between requests based on API key availability."""
    return 1.1 if not S2_API_KEY else 0.12


def _get(url: str, retries: int = 5) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=_headers())
    delay = _request_delay()
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** attempt * 10
                print(f"[WARN] 429 rate-limit. Waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
            elif e.code in (503, 502, 500):
                time.sleep(15 * attempt)
            else:
                raise
        except Exception:
            if attempt == retries:
                raise
            time.sleep(5 * attempt)
    raise RuntimeError(f"Failed after {retries} retries: {url}")


def iter_papers_bulk(
    query: str = "",
    fields_of_study: Optional[str] = None,
    year_range: Optional[str] = None,   # e.g. "2015-2024"
    min_citations: int = DEFAULT_MIN_CITATIONS,
    start_token: Optional[str] = None,
) -> Iterator[List[Dict[str, Any]]]:
    """
    Generator yielding pages of raw paper dicts from the S2 bulk search endpoint.
    Uses token-based cursor pagination (S2 v1 bulk endpoint).

    Args:
        query:           free-text search (empty = all papers matching filters)
        fields_of_study: comma-separated S2 field e.g. "Computer Science,Mathematics"
        year_range:      "YYYY-YYYY" string
        min_citations:   minimum citation count
        start_token:     resume token (from previous run's last 'token' value)
    """
    token = start_token
    delay = _request_delay()

    while True:
        params: Dict[str, str] = {
            "fields": PAPER_FIELDS,
            "limit":  str(PAGE_SIZE),
        }
        if query:
            params["query"] = query
        if fields_of_study:
            params["fieldsOfStudy"] = fields_of_study
        if year_range:
            params["year"] = year_range
        if min_citations > 0:
            params["minCitationCount"] = str(min_citations)
        if token:
            params["token"] = token

        url = f"{GRAPH_API}?{urllib.parse.urlencode(params)}"
        data  = _get(url)
        papers = data.get("data", [])
        token  = data.get("token")  # None when exhausted

        if not papers:
            break

        yield papers

        if not token:
            break

        time.sleep(delay)


def fetch_pdf_text(pdf_url: str, timeout: int = 90, max_bytes: int = 8 * 1024 * 1024) -> Optional[str]:
    """
    Attempts to download PDF content as raw bytes for text extraction.
    Returns None — PDF binary processing requires pdfminer/pypdf2, handled in cleaner.
    Placeholder: PDF extraction is skipped; abstract is the primary text source.
    """
    return None  # Disabled: PDFs are binary and require separate OCR/extraction stage
