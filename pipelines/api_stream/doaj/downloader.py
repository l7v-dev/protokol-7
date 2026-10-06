#!/usr/bin/env python3
"""
DOAJ (Directory of Open Access Journals) Stream Downloader -- protokol-7

Fetches open access article and journal metadata from DOAJ REST API v2
and DOAJ OAI-PMH harvest endpoints (https://doaj.org/oai.article)
with strict rate-limiting, resumption tokens, and exponential backoff retry.
"""

import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, Generator, List, Optional


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import capture_fetch

from pipelines.shared.retry_policy import RetryPolicy
from pipelines.shared.safe_http import urlopen
from pipelines.shared.cloudflare_detector import reject_challenge

DOAJ_BASE_URL = "https://doaj.org/api/v2"
DOAJ_OAI_URL = "https://doaj.org/oai.article"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Research Data Ingestion Engine; mailto:l7v-dev@protokol.local)"


class DoajDownloader:
    """
    Polite HTTP client for DOAJ REST API v2 and OAI-PMH harvest service.
    Respects rate limits with exponential backoff and connection reuse.
    """

    def __init__(
        self,
        base_url: str = DOAJ_BASE_URL,
        oai_url: str = DOAJ_OAI_URL,
        timeout: int = 30,
        max_retries: int = 4,
        min_interval: float = 0.25,
    ):
        self.base_url = base_url.rstrip("/")
        self.oai_url = oai_url.rstrip("/")
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

    @capture_fetch("doaj")
    def _fetch_raw(self, url: str) -> bytes:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "*/*",
        }
        def fetch() -> bytes:
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urlopen(req, timeout=self.timeout, context=self._ssl_context) as resp:
                    payload = resp.read()
                    reject_challenge(payload)
                    return payload
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    error.close()
                    return b""
                error.close()
                raise

        return RetryPolicy(max_attempts=self.max_retries).execute(fetch, sleep=time.sleep)


    def _fetch_json(self, url: str) -> Dict[str, Any]:
        raw = self._fetch_raw(url)
        if not raw:
            return {"total": 0, "results": []}
        return json.loads(raw.decode("utf-8"))

    def search_articles(
        self,
        query: str,
        page: int = 1,
        page_size: int = 50,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Queries the DOAJ search/articles endpoint (max 1000 total results per query)."""
        clean_q = "*" if not query or query.strip() in ("*", "*:*") else query.strip()
        enc_query = urllib.parse.quote(clean_q)
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
        clean_q = "*" if not query or query.strip() in ("*", "*:*") else query.strip()
        enc_query = urllib.parse.quote(clean_q)
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
        query: str = "*",
        start_page: int = 1,
        page_size: int = 50,
        max_records: Optional[int] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Paginates through DOAJ search results. If query is a generic wildcard and max_records
        exceeds REST limits (>1000), delegates to stream_oai_articles for bulk ingestion.
        """
        is_wildcard = not query or query.strip() in ("*", "*:*")
        if is_wildcard and (max_records is None or max_records > 1000):
            yield from self.stream_oai_articles(max_records=max_records)
            return

        page = start_page
        yielded = 0

        while True:
            # REST search API throws HTTP 400 when from+size > 1000
            if (page - 1) * page_size >= 1000:
                break

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

    def stream_oai_articles(
        self,
        max_records: Optional[int] = None,
        from_date: Optional[str] = None,
        until_date: Optional[str] = None,
        resumption_token: Optional[str] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Continuously streams DOAJ open access articles via the official OAI-PMH harvest service.
        Yields normalized item dicts with {"id": ..., "bibjson": ...} structure.
        """
        yielded = 0
        token: Optional[str] = resumption_token
        self.oai_snapshot_complete = False
        self.oai_page_token = token

        while True:
            self.oai_page_token = token
            if token:
                url = f"{self.oai_url}?verb=ListRecords&resumptionToken={urllib.parse.quote(token)}"
            else:
                params = ["verb=ListRecords", "metadataPrefix=oai_dc"]
                if from_date:
                    params.append(f"from={from_date}")
                if until_date:
                    params.append(f"until={until_date}")
                url = f"{self.oai_url}?{'&'.join(params)}"

            raw_xml = self._fetch_raw(url)
            if not raw_xml:
                break

            try:
                root = ET.fromstring(raw_xml)
            except ET.ParseError:
                break

            err_elem = root.find(".//{http://www.openarchives.org/OAI/2.0/}error")
            if err_elem is not None:
                err_code = err_elem.get("code", "unknown")
                err_text = (err_elem.text or "").strip()
                print(f"[OAI-ERROR] OAI response error [{err_code}]: {err_text}", flush=True)
                if err_code == "badResumptionToken" and token:
                    print("[OAI-WARN] Resumption token invalid or expired. Restarting from root query.", flush=True)
                    token = None
                    continue
                break

            records = root.findall(".//{http://www.openarchives.org/OAI/2.0/}record")
            if not records:
                break

            for rec in records:
                header = rec.find("{http://www.openarchives.org/OAI/2.0/}header")
                if header is None:
                    continue

                status = header.get("status")
                if status == "deleted":
                    continue

                header_id_elem = header.find("{http://www.openarchives.org/OAI/2.0/}identifier")
                if header_id_elem is None or not header_id_elem.text:
                    continue

                raw_header_id = header_id_elem.text.strip()
                art_id = raw_header_id.split(":")[-1]

                dc = rec.find(".//{http://www.openarchives.org/OAI/2.0/oai_dc/}dc")
                if dc is None:
                    continue

                title_elem = dc.find("{http://purl.org/dc/elements/1.1/}title")
                title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""

                desc_elem = dc.find("{http://purl.org/dc/elements/1.1/}description")
                abstract = desc_elem.text.strip() if desc_elem is not None and desc_elem.text else ""

                publisher_elem = dc.find("{http://purl.org/dc/elements/1.1/}publisher")
                publisher = publisher_elem.text.strip() if publisher_elem is not None and publisher_elem.text else ""

                lang_elem = dc.find("{http://purl.org/dc/elements/1.1/}language")
                lang = lang_elem.text.strip() if lang_elem is not None and lang_elem.text else "EN"

                source_elem = dc.find("{http://purl.org/dc/elements/1.1/}source")
                journal_title = source_elem.text.strip() if source_elem is not None and source_elem.text else ""

                date_elem = dc.find("{http://purl.org/dc/elements/1.1/}date")
                pub_date = date_elem.text.strip() if date_elem is not None and date_elem.text else ""
                year = 0
                if pub_date:
                    try:
                        year = int(pub_date[:4])
                    except ValueError:
                        year = 0

                doi = ""
                issns: List[str] = []
                for ident in dc.findall("{http://purl.org/dc/elements/1.1/}identifier"):
                    if not ident.text:
                        continue
                    val = ident.text.strip()
                    if val.startswith("10.") and not doi:
                        doi = val
                    elif re.match(r"^\d{4}-\d{3}[\dX]$", val, re.IGNORECASE):
                        if val not in issns:
                            issns.append(val)

                relations = [el.text.strip() for el in dc.findall("{http://purl.org/dc/elements/1.1/}relation") if el.text]
                fulltext_url = ""
                for rel in relations:
                    if rel.startswith("http://") or rel.startswith("https://"):
                        if not rel.startswith("https://doaj.org/toc/"):
                            fulltext_url = rel
                            break

                authors = [
                    {"name": el.text.strip()}
                    for el in dc.findall("{http://purl.org/dc/elements/1.1/}creator")
                    if el.text and el.text.strip()
                ]

                subjects = [
                    {"term": el.text.strip()}
                    for el in dc.findall("{http://purl.org/dc/elements/1.1/}subject")
                    if el.text and el.text.strip()
                ]

                item = {
                    "id": art_id,
                    "bibjson": {
                        "title": title,
                        "abstract": abstract,
                        "year": year,
                        "identifier": (
                            ([{"type": "doi", "id": doi}] if doi else [])
                            + [{"type": "issn", "id": i} for i in issns]
                        ),
                        "journal": {
                            "title": journal_title,
                            "publisher": publisher,
                            "language": [lang],
                            "issns": issns,
                        },
                        "author": authors,
                        "subject": subjects,
                        "link": [{"type": "fulltext", "url": fulltext_url}] if fulltext_url else [],
                    },
                }

                yield item
                yielded += 1
                if max_records and yielded >= max_records:
                    return

            resumption_elem = root.find(".//{http://www.openarchives.org/OAI/2.0/}resumptionToken")
            if resumption_elem is not None and resumption_elem.text:
                token = resumption_elem.text.strip()
            else:
                self.oai_snapshot_complete = True
                break
