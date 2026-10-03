#!/usr/bin/env python3
"""
DergiPark Full-Text PDF Extractor -- protokol-7

Fetches open-access academic article PDFs from TÜBİTAK ULAKBİM DergiPark,
resolves landing page URLs to direct article-file download streams,
extracts full text with PyMuPDF, and formats text into LLM-ready markdown.
"""

import os
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL_CONTEXT = ssl.create_default_context()

try:
    import pymupdf
    _PYMUPDF_AVAILABLE = True
except ImportError:
    _PYMUPDF_AVAILABLE = False

DEFAULT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (protokol-7 DergiPark Research Ingestion)"
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB
PDF_TIMEOUT = 35                  # seconds
MIN_EXTRACT_CHARS = 100           # minimum text length to qualify as successful extraction


class ThreadSafeRateLimiter:
    """
    Coordinates polite request pacing across concurrent worker threads.
    """

    def __init__(self, min_interval: float = 0.35):
        self.min_interval = min_interval
        self._lock = threading.Lock()
        self._last_time = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.time()
            elapsed = now - self._last_time
            if elapsed < self.min_interval:
                time.sleep(self.min_interval - elapsed)
            self._last_time = time.time()


class DergiParkPdfExtractor:
    """
    High-speed PDF resolver and text extractor for DergiPark articles.
    """

    def __init__(
        self,
        user_agent: str = DEFAULT_USER_AGENT,
        timeout: int = PDF_TIMEOUT,
        max_bytes: int = MAX_PDF_BYTES,
        min_interval: float = 0.35,
        rate_limiter: Optional[Any] = None,
    ):
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_bytes = max_bytes
        self.min_interval = min_interval
        self.rate_limiter = rate_limiter
        self._last_request_time = 0.0

    def _wait_for_rate_limit(self) -> None:
        if self.rate_limiter is not None:
            self.rate_limiter.wait()
            return
        elapsed = time.time() - self._last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_time = time.time()

    def resolve_pdf_url(self, landing_url: str) -> Optional[str]:
        """
        Resolves a DergiPark landing page URL or DOI link to direct PDF download link.
        """
        if not landing_url:
            return None

        clean_url = landing_url.strip()

        # If already a direct download link
        if "/download/article-file/" in clean_url or clean_url.endswith(".pdf"):
            return clean_url

        req = urllib.request.Request(
            clean_url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

        for attempt in range(1, 4):
            self._wait_for_rate_limit()
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=_SSL_CONTEXT) as resp:
                    html = resp.read().decode("utf-8", errors="ignore")

                    # Match canonical DergiPark download button pattern
                    match = re.search(r'href=[\'"]([^\'"]*download/article-file[^\'"]*)[\'"]', html)
                    if match:
                        rel_path = match.group(1).strip()
                        return urllib.parse.urljoin("https://dergipark.org.tr", rel_path)
                    return None

            except urllib.error.HTTPError as he:
                if he.code in (429, 503) and attempt < 3:
                    time.sleep(3.0 * attempt)
                    continue
                return None
            except Exception:
                if attempt < 3:
                    time.sleep(1.5 * attempt)
                    continue
                return None

        return None

    def fetch_pdf_bytes(self, pdf_url: str) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Downloads PDF bytes within safety limits.
        Returns (bytes, error_code).
        """
        if not pdf_url:
            return None, "empty_url"

        req = urllib.request.Request(
            pdf_url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/pdf,*/*",
            },
        )

        backoff = 2.0
        for attempt in range(1, 4):
            self._wait_for_rate_limit()
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=_SSL_CONTEXT) as resp:
                    cl = resp.headers.get("Content-Length")
                    if cl and int(cl) > self.max_bytes:
                        return None, "too_large"

                    chunks = []
                    total = 0
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > self.max_bytes:
                            return None, "too_large"
                        chunks.append(chunk)

                    pdf_bytes = b"".join(chunks)
                    if not pdf_bytes.startswith(b"%PDF"):
                        return None, "invalid_magic"

                    return pdf_bytes, None

            except urllib.error.HTTPError as he:
                if he.code in (429, 503) and attempt < 3:
                    time.sleep(backoff)
                    backoff *= 2.0
                    continue
                return None, f"http_{he.code}"
            except Exception as e:
                if attempt < 3:
                    time.sleep(backoff)
                    backoff *= 1.5
                    continue
                return None, f"network_error_{type(e).__name__}"

        return None, "retries_exhausted"

    def extract_text(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """
        Extracts structured text from PDF bytes using PyMuPDF.
        """
        if not _PYMUPDF_AVAILABLE:
            raise RuntimeError("pymupdf is not installed in the python environment.")

        if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
            return {
                "page_count": 0,
                "text": "",
                "char_count": 0,
                "word_count": 0,
                "status": "failed",
                "error": "invalid_pdf_bytes",
            }

        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            page_count = doc.page_count
            pages_text = []

            for page_num in range(page_count):
                page = doc[page_num]
                text = page.get_text("text")
                if text:
                    # Clean layout artifacts and excess spacing
                    cleaned = re.sub(r"[ \t]+", " ", text)
                    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
                    cleaned_str = cleaned.strip()
                    if cleaned_str:
                        pages_text.append(f"<!-- Page {page_num + 1} -->\n{cleaned_str}")

            full_text = "\n\n".join(pages_text).strip()
            char_count = len(full_text)
            word_count = len(full_text.split())

            if char_count < MIN_EXTRACT_CHARS:
                return {
                    "page_count": page_count,
                    "text": full_text,
                    "char_count": char_count,
                    "word_count": word_count,
                    "status": "scanned_or_sparse",
                    "error": "sparse_text_layer",
                }

            return {
                "page_count": page_count,
                "text": full_text,
                "char_count": char_count,
                "word_count": word_count,
                "status": "extracted",
                "error": None,
            }

        except Exception as ex:
            return {
                "page_count": 0,
                "text": "",
                "char_count": 0,
                "word_count": 0,
                "status": "failed",
                "error": str(ex),
            }

    def process_article(self, article: Dict[str, Any]) -> Dict[str, Any]:
        """
        End-to-end processing of a DergiPark article record to extract full-text.
        """
        landing_url = article.get("fulltext_url") or ""
        if not landing_url:
            return {
                "id": article.get("id"),
                "status": "no_url",
                "error": "missing_fulltext_url",
            }

        pdf_url = self.resolve_pdf_url(landing_url)
        if not pdf_url:
            return {
                "id": article.get("id"),
                "status": "failed",
                "error": "could_not_resolve_pdf_link",
            }

        pdf_bytes, err = self.fetch_pdf_bytes(pdf_url)
        if err or not pdf_bytes:
            return {
                "id": article.get("id"),
                "pdf_url": pdf_url,
                "status": err if err in ("too_large",) else "failed",
                "error": err or "empty_bytes",
            }

        res = self.extract_text(pdf_bytes)
        res["id"] = article.get("id")
        res["pdf_url"] = pdf_url
        res["pdf_bytes"] = pdf_bytes
        res["title"] = article.get("title", "")
        res["journal"] = article.get("journal", "")
        res["year"] = article.get("year", 0)
        res["language"] = article.get("language", "tr")
        res["doi"] = article.get("doi", "")
        return res

