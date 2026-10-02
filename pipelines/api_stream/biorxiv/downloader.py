#!/usr/bin/env python3
"""
Cold Spring Harbor Laboratory bioRxiv & medRxiv API Downloader -- protokol-7

Fetches preprint metadata and abstracts via CSHL Details REST API with
strict politeness rate-limiting, SSL certificate verification, and exponential retry backoff.
"""

import json
import os
import ssl
import sys
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, Generator, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

BIORXIV_API_BASE = "https://api.biorxiv.org/details"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Preprint Ingestion Engine; mailto:l7v-dev@protokol.local)"


class BiorxivDownloader:
    """
    Polite HTTP client for Cold Spring Harbor Laboratory Details API (bioRxiv and medRxiv).
    Adheres to CSHL rate-limiting guidelines (maximum 1-2 requests per second).
    """

    def __init__(
        self,
        timeout: int = 30,
        max_retries: int = 4,
        min_interval: float = 0.6,
    ):
        self.timeout = timeout
        self.max_retries = max_retries
        self.min_interval = min_interval
        self._last_request_time = 0.0

        try:
            import certifi
            self._ssl_context = ssl.create_default_context(cafile=certifi.where())
        except Exception:
            self._ssl_context = ssl.create_default_context()

    def _wait_for_rate_limit(self) -> None:
        elapsed = time.time() - self._last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_time = time.time()

    def _fetch_url(self, url: str) -> bytes:
        headers = {"User-Agent": DEFAULT_USER_AGENT}

        for attempt in range(self.max_retries + 1):
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self._ssl_context) as response:
                    return response.read()
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                    backoff = 2**attempt + 0.5
                    print(f"[BIORXIV] HTTP {e.code} on {url[:70]}... Retrying in {backoff:.1f}s")
                    time.sleep(backoff)
                    continue
                raise
            except Exception as e:
                if attempt < self.max_retries:
                    backoff = 2**attempt + 0.5
                    print(f"[BIORXIV] Network error: {e}. Retrying in {backoff:.1f}s")
                    time.sleep(backoff)
                    continue
                raise

        raise RuntimeError(f"Exceeded max retries for URL: {url}")

    def fetch_page(
        self,
        server: str = "biorxiv",
        interval: str = "2026-01-01/2026-10-02",
        cursor: int = 0,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetches a single page of preprint records from CSHL API."""
        srv = server.lower()
        if srv not in ("biorxiv", "medrxiv"):
            srv = "biorxiv"

        clean_interval = interval.replace(":", "/")
        url = f"{BIORXIV_API_BASE}/{srv}/{clean_interval}/{cursor}/json"
        if category:
            cat_encoded = urllib.parse.quote(category.lower().replace(" ", "_"))
            url += f"?category={cat_encoded}"

        raw_bytes = self._fetch_url(url)
        data = json.loads(raw_bytes.decode("utf-8"))

        msgs = data.get("messages") or []
        msg0 = msgs[0] if msgs else {}
        count = int(msg0.get("count") or 0)
        total_str = str(msg0.get("total") or "0")
        total = int(total_str) if total_str.isdigit() else 0
        collection = data.get("collection") or []

        return {
            "status": msg0.get("status", "unknown"),
            "count": count if count > 0 else len(collection),
            "total": total,
            "cursor": cursor,
            "server": srv,
            "collection": collection,
        }

    def fetch_by_doi(
        self,
        doi: str,
        server: str = "biorxiv",
    ) -> List[Dict[str, Any]]:
        """Fetches all versions of a specific preprint manuscript by DOI."""
        srv = server.lower()
        clean_doi = doi.strip()
        url = f"{BIORXIV_API_BASE}/{srv}/{clean_doi}"

        raw_bytes = self._fetch_url(url)
        data = json.loads(raw_bytes.decode("utf-8"))
        return data.get("collection") or []

    def stream_records(
        self,
        server: str = "biorxiv",
        interval: str = "2026-01-01/2026-10-02",
        max_records: Optional[int] = None,
        category: Optional[str] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Continuously yields preprint records across pages up to max_records or exhaustion.
        """
        cursor = 0
        yielded = 0
        total_target = max_records

        while True:
            page = self.fetch_page(
                server=server,
                interval=interval,
                cursor=cursor,
                category=category,
            )

            collection = page.get("collection") or []
            if not collection:
                break

            total_available = page.get("total", 0)
            if total_target is None and total_available > 0:
                total_target = total_available

            for rec in collection:
                yield rec
                yielded += 1
                if max_records and yielded >= max_records:
                    return

            page_count = page.get("count", len(collection))
            cursor += page_count

            if total_available > 0 and cursor >= total_available:
                break
