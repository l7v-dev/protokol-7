#!/usr/bin/env python3
"""
DOAJ (Directory of Open Access Journals) API Stream Downloader -- protokol-7

Fetches open access article and journal metadata from DOAJ REST API v2
with strict politeness rate-limiting and exponential backoff retry.
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

DOAJ_BASE_URL = "https://doaj.org/api/v2"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Research Data Ingestion Engine; mailto:l7v-dev@protokol.local)"


class DoajDownloader:
    """
    Polite HTTP client for DOAJ REST API v2.
    Respects rate limits with exponential backoff and connection reuse.
    """

    def __init__(
        self,
        base_url: str = DOAJ_BASE_URL,
        timeout: int = 30,
        max_retries: int = 4,
        min_interval: float = 0.25,
    ):
        self.base_url = base_url.rstrip("/")
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

    def _fetch_json(self, url: str) -> Dict[str, Any]:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "application/json",
        }
        backoff = 1.0

        for attempt in range(1, self.max_retries + 1):
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self._ssl_context) as resp:
                    raw = resp.read()
                    return json.loads(raw.decode("utf-8"))
            except urllib.error.HTTPError as he:
                if he.code == 429:
                    time.sleep(backoff * 2)
                    backoff *= 2.0
                    continue
                if he.code in (500, 502, 503, 504) and attempt < self.max_retries:
                    time.sleep(backoff)
                    backoff *= 1.5
                    continue
                if he.code == 404:
                    return {"total": 0, "results": []}
                raise
            except Exception as e:
                if attempt < self.max_retries:
                    time.sleep(backoff)
                    backoff *= 1.5
                    continue
                raise

        return {"total": 0, "results": []}

    def search_articles(
        self,
        query: str,
        page: int = 1,
        page_size: int = 50,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Queries the DOAJ search/articles endpoint."""
        enc_query = urllib.parse.quote(query or "*:*")
        params = [f"page={page}", f"pageSize={min(100, max(1, page_size))}"]
        if sort:
            params.append(f"sort={urllib.parse.quote(sort)}")

        url = f"{self.base_url}/search/articles/{enc_query}?{'&'.join(params)}"
        return self._fetch_json(url)

    def search_journals(
        self,
        query: str,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """Queries the DOAJ search/journals endpoint."""
        enc_query = urllib.parse.quote(query or "*:*")
        params = [f"page={page}", f"pageSize={min(100, max(1, page_size))}"]
        url = f"{self.base_url}/search/journals/{enc_query}?{'&'.join(params)}"
        return self._fetch_json(url)

    def get_article(self, article_id: str) -> Dict[str, Any]:
        """Retrieves full article metadata record by DOAJ ID."""
        clean_id = urllib.parse.quote(article_id.strip())
        url = f"{self.base_url}/articles/{clean_id}"
        return self._fetch_json(url)

    def stream_articles(
        self,
        query: str,
        start_page: int = 1,
        page_size: int = 50,
        max_records: Optional[int] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Paginates through DOAJ search results and yields raw article dicts.
        """
        page = start_page
        yielded = 0

        while True:
            data = self.search_articles(query=query, page=page, page_size=page_size)
            results = data.get("results", [])
            total = data.get("total", 0)

            if not results:
                break

            for item in results:
                yield item
                yielded += 1
                if max_records and yielded >= max_records:
                    return

            if yielded >= total or len(results) < page_size:
                break

            page += 1
