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
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterator, Dict, Any, Optional, List, Tuple

# Suppress BeautifulSoup XML-parsed-as-HTML noise; lxml handles both formats fine
try:
    from bs4 import XMLParsedAsHTMLWarning
    warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
except ImportError:
    pass


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


from contextvars import ContextVar
import contextvars
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import EvidenceWriteError, capture_bytes
_FULLTEXT_EVIDENCE = ContextVar("openalex_fulltext_evidence", default=None)

def _get(url: str, retries: int = 6) -> Dict[str, Any]:
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
                payload = resp.read()
                data = json.loads(payload.decode("utf-8"))
                evidence = capture_bytes(payload, "openalex", url)
                for record in data.get("results", []): record["_raw_evidence"] = evidence
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** attempt * 5
                print(f"[WARN] 429 rate-limit. Waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
            elif e.code in (500, 502, 503, 504):
                wait = 10 * attempt
                print(f"[WARN] HTTP {e.code} (attempt {attempt}/{retries}). Waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
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
    "best_oa_location",       # includes pdf_url + landing_page_url
])


def iter_works_cursor(
    filter_str: str = "is_oa:true",
    mailto: str = DEFAULT_MAILTO,
    start_cursor: str = "*",
) -> Iterator[Tuple[List[Dict[str, Any]], Optional[str]]]:
    """
    Yields (works, next_cursor) via cursor pagination.
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

        data = _get(url)
        works = data.get("results", [])
        meta = data.get("meta", {})
        next_cursor = meta.get("next_cursor")
        page_num += 1

        if not works:
            break

        yield works, next_cursor
        cursor = next_cursor

        time.sleep(REQUEST_DELAY)


import urllib.parse  # noqa: E402  (stdlib, always available)

# ---------------------------------------------------------------------------
# Full-text fetch: HTML-first, PDF fallback
# ---------------------------------------------------------------------------

MAX_FULLTEXT_BYTES = 10 * 1024 * 1024   # 10 MB cap per document
HTML_TIMEOUT       = 20                  # seconds — fail fast on slow servers
PDF_TIMEOUT        = 30                  # seconds — PDFs larger but same fail-fast policy
MIN_FULLTEXT_CHARS = 300                 # discard boilerplate-only fetches
FULLTEXT_WORKERS   = 64                  # parallel HTTP workers per page (200 works/page)


def _html_accept_types() -> dict:
    return {"Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"}


def _fetch_html_text(url: str) -> Optional[str]:
    """
    Downloads an HTML page and extracts main body text via BeautifulSoup.
    Returns plain text or None on failure.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None

    try:
        req = urllib.request.Request(
            url,
            headers={**{"User-Agent": USER_AGENT}, **_html_accept_types()},
        )
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=HTML_TIMEOUT) as resp:
            ct = resp.headers.get("Content-Type", "").lower()
            # Bail out immediately if server sends back a PDF
            if "pdf" in ct:
                return None
            if "html" not in ct and "xml" not in ct and "text" not in ct:
                return None
            raw = resp.read(MAX_FULLTEXT_BYTES + 1)
            if len(raw) > MAX_FULLTEXT_BYTES: return None
    except Exception:
        return None

    _FULLTEXT_EVIDENCE.set(capture_bytes(raw, "openalex", url))
    try:
        soup = BeautifulSoup(raw, "lxml")
    except Exception:
        try:
            soup = BeautifulSoup(raw, "html.parser")
        except EvidenceWriteError:
            raise
        except Exception:
            return None

    # Remove navigation, header/footer, scripts, styles
    for tag in soup.find_all(["script", "style", "nav", "header", "footer", "aside"]):
        tag.decompose()

    # Prefer article or main body if present
    body = soup.find("article") or soup.find("main") or soup.find("body") or soup
    text = body.get_text(separator="\n", strip=True)

    # Collapse excessive blank lines
    lines = [ln.strip() for ln in text.splitlines()]
    text  = "\n".join(ln for ln in lines if ln)

    return text if len(text) >= MIN_FULLTEXT_CHARS else None


def _fetch_pdf_text(url: str) -> Optional[str]:
    """
    Downloads a PDF and extracts plain text via pymupdf.
    Returns plain text or None on failure.
    """
    try:
        import pymupdf
    except ImportError:
        return None

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*"},
        )
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=PDF_TIMEOUT) as resp:
            ct = resp.headers.get("Content-Type", "").lower()
            # Only process PDF content
            if "pdf" not in ct and not url.lower().endswith(".pdf"):
                return None
            data = resp.read(MAX_FULLTEXT_BYTES + 1)
            if len(data) > MAX_FULLTEXT_BYTES: return None
    except Exception:
        return None

    _FULLTEXT_EVIDENCE.set(capture_bytes(data, "openalex", url))
    try:
        pymupdf.TOOLS.mupdf_display_errors(False)
        doc  = pymupdf.open(stream=data, filetype="pdf")
        pages: List[str] = []
        for page in doc:
            t = page.get_text("text")
            if t and t.strip():
                pages.append(t.strip())
        doc.close()
        text = "\n\n".join(pages)
        return text if len(text) >= MIN_FULLTEXT_CHARS else None
    except Exception:
        return None


def fetch_fulltext(raw: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    Attempts to fetch full text for an OpenAlex work dict.

    Strategy (in order):
      1. HTML landing page from best_oa_location.landing_page_url
      2. HTML landing page from primary_location.landing_page_url
      3. PDF from best_oa_location.pdf_url
      4. PDF from open_access.oa_url (if ends in .pdf)

    Returns:
      (text, source) — source is one of:
        "html_best_oa", "html_primary", "pdf_best_oa", "pdf_oa_url"
      or (None, None) if all attempts fail.
    """
    best_loc  = raw.get("best_oa_location") or {}
    prim_loc  = raw.get("primary_location") or {}
    oa_info   = raw.get("open_access") or {}

    html_urls = [
        (best_loc.get("landing_page_url"), "html_best_oa"),
        (prim_loc.get("landing_page_url"), "html_primary"),
    ]
    for url, source in html_urls:
        if not url:
            continue
        text = _fetch_html_text(url)
        if text:
            raw["_fulltext_evidence"] = _FULLTEXT_EVIDENCE.get()
            return text, source

    pdf_urls = [
        (best_loc.get("pdf_url"), "pdf_best_oa"),
    ]
    oa_url = oa_info.get("oa_url", "") or ""
    if oa_url.endswith(".pdf"):
        pdf_urls.append((oa_url, "pdf_oa_url"))

    for url, source in pdf_urls:
        if not url:
            continue
        text = _fetch_pdf_text(url)
        if text:
            raw["_fulltext_evidence"] = _FULLTEXT_EVIDENCE.get()
            return text, source

    return None, None


def fetch_fulltext_batch(
    works: List[Dict[str, Any]],
    workers: int = FULLTEXT_WORKERS,
) -> List[Tuple[Optional[str], Optional[str]]]:
    """
    Fetches full text for a batch of work dicts in parallel.

    Args:
      works:   list of raw OpenAlex work dicts (one API page = 200 items)
      workers: number of concurrent HTTP threads

    Returns:
      list of (text, source) tuples, same order and length as `works`.
      Items that failed fetch have (None, None).
    """
    results: List[Tuple[Optional[str], Optional[str]]] = [(None, None)] * len(works)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_idx = {
            pool.submit(contextvars.copy_context().run, fetch_fulltext, raw): idx
            for idx, raw in enumerate(works)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except EvidenceWriteError:
                raise
            except Exception:
                results[idx] = (None, None)

    return results

