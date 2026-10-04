#!/usr/bin/env python3
"""
Aperta (TUBITAK ULAKBIM) Stream Downloader -- protokol-7

Fetches open access research records and datasets from TUBITAK ULAKBIM Aperta
via OAI-PMH 2.0 endpoints (https://aperta.ulakbim.gov.tr/oai2d) and Invenio REST API v1
(https://aperta.ulakbim.gov.tr/api/records) with strict politeness rate limits,
resumption tokens, SSL validation, and exponential backoff retry.
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
from typing import Any, Dict, Generator, List, Optional, Tuple

APERTA_BASE_URL = "https://aperta.ulakbim.gov.tr"
APERTA_OAI_URL = "https://aperta.ulakbim.gov.tr/oai2d"
APERTA_REST_URL = "https://aperta.ulakbim.gov.tr/api/records"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Tubitak Ulakbim Aperta Ingestion Engine; mailto:l7v-dev@protokol.local)"

OAI_NS = {
    "oai": "http://www.openarchives.org/OAI/2.0/",
    "oai_dc": "http://www.openarchives.org/OAI/2.0/oai_dc/",
    "dc": "http://purl.org/dc/elements/1.1/",
}


class ApertaDownloader:
    """
    Polite HTTP client for TUBITAK ULAKBIM Aperta repository.
    Supports both OAI-PMH 2.0 streaming harvest and Invenio REST API queries.
    """

    def __init__(
        self,
        base_url: str = APERTA_BASE_URL,
        oai_url: str = APERTA_OAI_URL,
        rest_url: str = APERTA_REST_URL,
        timeout: int = 35,
        max_retries: int = 6,
        min_interval: float = 1.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.oai_url = oai_url
        self.rest_url = rest_url
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

    def _fetch_url(self, url: str, accept_header: str = "*/*") -> bytes:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": accept_header,
        }
        backoff = 1.5

        for attempt in range(1, self.max_retries + 1):
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self._ssl_context) as resp:
                    return resp.read()
            except urllib.error.HTTPError as he:
                if he.code == 429:
                    retry_after = he.headers.get("Retry-After")
                    sleep_time = float(retry_after) if retry_after else (backoff * 2)
                    time.sleep(sleep_time)
                    backoff *= 2.0
                    continue
                if he.code in (500, 502, 503, 504) and attempt < self.max_retries:
                    time.sleep(backoff)
                    backoff *= 1.5
                    continue
                if he.code == 404:
                    return b""
                raise
            except Exception:
                if attempt < self.max_retries:
                    time.sleep(backoff)
                    backoff *= 1.5
                else:
                    raise
        return b""

    # --------------------------------------------------------------------------
    # OAI-PMH 2.0 Harvest Protocol
    # --------------------------------------------------------------------------

    def fetch_oai_page(
        self,
        resumption_token: Optional[str] = None,
        metadata_prefix: str = "oai_dc",
    ) -> Tuple[List[Dict[str, Any]], Optional[str], int, int]:
        """
        Fetches a single OAI-PMH page (ListRecords).
        Returns:
            (records, next_resumption_token, cursor, complete_list_size)
        """
        if resumption_token:
            params = {
                "verb": "ListRecords",
                "resumptionToken": resumption_token,
            }
        else:
            params = {
                "verb": "ListRecords",
                "metadataPrefix": metadata_prefix,
            }

        url = f"{self.oai_url}?{urllib.parse.urlencode(params)}"
        raw_xml = self._fetch_url(url, accept_header="application/xml, text/xml")
        if not raw_xml:
            return [], None, 0, 0

        return self._parse_oai_xml(raw_xml)

    def _parse_oai_xml(
        self, raw_xml: bytes
    ) -> Tuple[List[Dict[str, Any]], Optional[str], int, int]:
        root = ET.fromstring(raw_xml)

        error_elem = root.find("oai:error", OAI_NS)
        if error_elem is not None:
            err_code = error_elem.attrib.get("code", "")
            err_msg = error_elem.text or ""
            if err_code == "noRecordsMatch":
                return [], None, 0, 0
            raise RuntimeError(f"Aperta OAI-PMH Error ({err_code}): {err_msg}")

        list_records_elem = root.find("oai:ListRecords", OAI_NS)
        if list_records_elem is None:
            return [], None, 0, 0

        records: List[Dict[str, Any]] = []
        for record_elem in list_records_elem.findall("oai:record", OAI_NS):
            parsed = self._parse_oai_record(record_elem)
            if parsed:
                records.append(parsed)

        next_token: Optional[str] = None
        cursor = 0
        total = 0

        resumption_elem = list_records_elem.find("oai:resumptionToken", OAI_NS)
        if resumption_elem is not None:
            token_text = (resumption_elem.text or "").strip()
            if token_text:
                next_token = token_text
            cursor = int(resumption_elem.attrib.get("cursor", 0))
            total = int(resumption_elem.attrib.get("completeListSize", 0))

        return records, next_token, cursor, total

    def _parse_oai_record(self, record_elem: ET.Element) -> Optional[Dict[str, Any]]:
        header = record_elem.find("oai:header", OAI_NS)
        if header is None:
            return None

        # Check for deleted records
        status = header.attrib.get("status", "")
        if status == "deleted":
            return None

        ident_elem = header.find("oai:identifier", OAI_NS)
        identifier = ident_elem.text.strip() if ident_elem is not None and ident_elem.text else ""

        datestamp_elem = header.find("oai:datestamp", OAI_NS)
        datestamp = datestamp_elem.text.strip() if datestamp_elem is not None and datestamp_elem.text else ""

        set_specs = [
            s.text.strip()
            for s in header.findall("oai:setSpec", OAI_NS)
            if s.text
        ]

        metadata_elem = record_elem.find("oai:metadata", OAI_NS)
        dc_data: Dict[str, List[str]] = {}

        if metadata_elem is not None:
            dc_elem = metadata_elem.find("oai_dc:dc", OAI_NS)
            if dc_elem is not None:
                for child in dc_elem:
                    tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    text = (child.text or "").strip()
                    if text:
                        if tag not in dc_data:
                            dc_data[tag] = []
                        dc_data[tag].append(text)

        # Extract record ID from identifier (e.g., oai:aperta.ulakbim.gov.tr:241793 -> 241793)
        record_id = ""
        if identifier:
            match = re.search(r":(\d+)$", identifier)
            if match:
                record_id = match.group(1)
            else:
                record_id = identifier

        return {
            "id": record_id,
            "oai_identifier": identifier,
            "datestamp": datestamp,
            "sets": set_specs,
            "dc": dc_data,
        }

    def stream_oai_records(
        self,
        resumption_token: Optional[str] = None,
        max_records: int = 0,
        metadata_prefix: str = "oai_dc",
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Yields harvested records continuously across resumption tokens.
        """
        current_token = resumption_token
        fetched_count = 0

        while True:
            records, next_token, cursor, total = self.fetch_oai_page(
                resumption_token=current_token,
                metadata_prefix=metadata_prefix,
            )

            for rec in records:
                yield rec
                fetched_count += 1
                if 0 < max_records <= fetched_count:
                    return

            if not next_token or not records:
                break

            current_token = next_token

    # --------------------------------------------------------------------------
    # Invenio REST API v1 Protocol
    # --------------------------------------------------------------------------

    def search_rest(
        self,
        query: str = "*",
        page: int = 1,
        size: int = 20,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes a search query against Invenio REST API (/api/records).
        Note: Elasticsearch imposes a max_result_window=10000 offset limit.
        """
        params: Dict[str, Any] = {
            "q": query,
            "page": page,
            "size": size,
        }
        if sort:
            params["sort"] = sort

        url = f"{self.rest_url}?{urllib.parse.urlencode(params)}"
        raw_json = self._fetch_url(url, accept_header="application/json")
        if not raw_json:
            return {"hits": {"total": 0, "hits": []}}

        return json.loads(raw_json.decode("utf-8", errors="replace"))

    def get_record_detail(self, record_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves complete Invenio record details including attached files and metadata.
        """
        clean_id = str(record_id).strip()
        url = f"{self.rest_url}/{clean_id}"
        raw_json = self._fetch_url(url, accept_header="application/json")
        if not raw_json:
            return None

        try:
            return json.loads(raw_json.decode("utf-8", errors="replace"))
        except Exception:
            return None
