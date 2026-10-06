#!/usr/bin/env python3
"""
DergiPark Full-Text PDF Extractor -- protokol-7

Fetches open-access academic article PDFs from TÜBİTAK ULAKBİM DergiPark,
resolves landing page URLs to direct article-file download streams,
extracts full text with PyMuPDF, and formats text into LLM-ready markdown.
"""

import os
import io
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import EvidenceWriteError, capture_bytes
from pipelines.shared.safe_http import urlopen
from pipelines.shared.adaptive_rate_limiter import AdaptiveRateLimiter
from pipelines.shared.pipeline_runtime import current_stats
from pipelines.shared.pymupdf_parser import PyMuPDFParser
from pipelines.shared.error_classifier import is_retriable
from pipelines.shared.retry_policy import retry_after_seconds
from pipelines.shared.cloudflare_detector import reject_challenge, ChallengeError

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


class ThreadSafeRateLimiter(AdaptiveRateLimiter):
    def __init__(self, min_interval=.35):
        super().__init__(base_delay=min_interval, max_delay=max(60, min_interval))
        self.min_interval = min_interval


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
        use_impersonation: bool = False,
    ):
        self.stats = current_stats()
        self.curl_backend = None
        if use_impersonation:
            from pipelines.shared.curl_downloader import CurlDownloader
            self.curl_backend = CurlDownloader(maximum_bytes=max_bytes)
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_bytes = max_bytes
        self.min_interval = min_interval
        self.rate_limiter = rate_limiter
        self._last_request_time = 0.0

    def _feedback(self, url, status):
        if isinstance(self.rate_limiter, AdaptiveRateLimiter):
            self.rate_limiter.update_delay(url, status)
        if self.stats:
            self.stats.inc(f"http_{status}")

    def _open_http(self, request):
        if self.curl_backend is None:
            return urlopen(request, timeout=self.timeout, context=_SSL_CONTEXT)
        try:
            with urlopen(request, timeout=self.timeout, context=_SSL_CONTEXT) as response:
                payload = response.read(self.max_bytes + 1)
                if len(payload) > self.max_bytes:
                    raise ValueError("HTTP response exceeds byte limit")
                reject_challenge(payload)
                buffered = io.BytesIO(payload)
                buffered.headers = response.headers
                return buffered
        except urllib.error.HTTPError as error:
            error.close()
            if error.code not in {403, 429}:
                raise
            self._feedback(request.full_url, error.code)
        except ChallengeError:
            pass
        self._wait_for_rate_limit(request.full_url)
        return self.curl_backend.get(request.full_url, dict(request.header_items()), self.timeout)

    def _wait_for_rate_limit(self, url="") -> None:
        if self.rate_limiter is not None:
            if isinstance(self.rate_limiter, AdaptiveRateLimiter):
                self.rate_limiter.wait(url)
            else:
                self.rate_limiter.wait()
            return
        elapsed = time.time() - self._last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_time = time.time()

    def resolve_pdf_url_with_error(self, landing_url: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Resolves a DergiPark landing page URL or DOI link to direct PDF download link.
        Returns (resolved_url, error_reason).
        """
        if not landing_url:
            return None, "missing_url"

        clean_url = landing_url.strip()

        # If already a direct download link
        if "/download/article-file/" in clean_url or clean_url.endswith(".pdf"):
            return clean_url, None

        req = urllib.request.Request(
            clean_url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

        for attempt in range(1, 4):
            self._wait_for_rate_limit(req.full_url)
            try:
                with self._open_http(req) as resp:
                    self._feedback(req.full_url, getattr(resp, "status", 200))
                    payload = resp.read()
                    reject_challenge(payload)
                    html = payload.decode("utf-8", errors="ignore")

                    # Match canonical DergiPark download button pattern
                    match = re.search(r'href=[\'"]([^\'"]*download/article-file[^\'"]*)[\'"]', html)
                    if match:
                        rel_path = match.group(1).strip()
                        return urllib.parse.urljoin("https://dergipark.org.tr", rel_path), None
                    return None, "could_not_resolve_pdf_link"

            except urllib.error.HTTPError as he:
                self._feedback(req.full_url, he.code)
                he.close()
                if is_retriable(he):
                    if self.rate_limiter and hasattr(self.rate_limiter, "cooldown"):
                        self.rate_limiter.cooldown(8.0)
                    if attempt < 3:
                        specified = retry_after_seconds(he.headers.get("Retry-After")) if he.headers else None
                        time.sleep(specified if specified is not None else 3.0 * attempt)
                        continue
                return None, f"http_{he.code}"
            except Exception as e:
                if attempt < 3 and is_retriable(e):
                    time.sleep(1.5 * attempt)
                    continue
                return None, f"resolve_error_{type(e).__name__}"

        return None, "resolve_timeout"

    def resolve_pdf_url(self, landing_url: str) -> Optional[str]:
        """
        Resolves a DergiPark landing page URL or DOI link to direct PDF download link.
        """
        url, err = self.resolve_pdf_url_with_error(landing_url)
        self._last_resolve_error = err
        return url

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
            self._wait_for_rate_limit(req.full_url)
            try:
                with self._open_http(req) as resp:
                    self._feedback(req.full_url, getattr(resp, "status", 200))
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
                self._feedback(req.full_url, he.code)
                he.close()
                if is_retriable(he):
                    if self.rate_limiter and hasattr(self.rate_limiter, "cooldown"):
                        self.rate_limiter.cooldown(8.0)
                    if attempt < 3:
                        specified = retry_after_seconds(he.headers.get("Retry-After")) if he.headers else None
                        time.sleep(specified if specified is not None else backoff)
                        backoff *= 2.0
                        continue
                return None, f"http_{he.code}"
            except Exception as e:
                if attempt < 3 and is_retriable(e):
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
            with PyMuPDFParser() as parser:
                parsed = parser.parse_bytes(pdf_bytes)
            page_count = parsed.page_count
            full_text = parsed.raw_text
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
            resolve_err = getattr(self, "_last_resolve_error", None)
            status = "rate_limited_429" if (resolve_err and "429" in resolve_err) else "failed"
            return {
                "id": article.get("id"),
                "status": status,
                "error": resolve_err or "could_not_resolve_pdf_link",
            }

        pdf_bytes, err = self.fetch_pdf_bytes(pdf_url)
        if err or not pdf_bytes:
            status = "rate_limited_429" if (err and "429" in err) else (err if err in ("too_large",) else "failed")
            return {
                "id": article.get("id"),
                "pdf_url": pdf_url,
                "status": status,
                "error": err or "empty_bytes",
            }

        try:
            raw_evidence = capture_bytes(pdf_bytes, "dergipark", pdf_url)
        except Exception as failure:
            raise EvidenceWriteError("Raw evidence persistence failed") from failure
        res = self.extract_text(pdf_bytes)
        res["_raw_evidence"] = raw_evidence
        res["id"] = article.get("id")
        res["pdf_url"] = pdf_url
        res["pdf_bytes"] = pdf_bytes
        res["title"] = article.get("title", "")
        res["journal"] = article.get("journal", "")
        res["year"] = article.get("year", 0)
        res["language"] = article.get("language", "tr")
        res["doi"] = article.get("doi", "")
        return res

