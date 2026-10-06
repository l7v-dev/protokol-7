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

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import capture_fetch
from pipelines.shared.retry_policy import RetryPolicy
from pipelines.shared.safe_http import urlopen
from pipelines.shared.cloudflare_detector import reject_challenge



APERTA_BASE_URL = "https://aperta.ulakbim.gov.tr"
APERTA_OAI_URL = "https://aperta.ulakbim.gov.tr/oai2d"
APERTA_REST_URL = "https://aperta.ulakbim.gov.tr/api/records"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Tubitak Ulakbim Aperta Ingestion Engine; mailto:l7v-dev@protokol.local)"

OAI_NS = {
    "oai": "http://www.openarchives.org/OAI/2.0/",
    "oai_dc": "http://www.openarchives.org/OAI/2.0/oai_dc/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "marc": "http://www.loc.gov/MARC21/slim",
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

    @capture_fetch("aperta")
    def _fetch_url(self, url: str, accept_header: str = "*/*") -> bytes:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": accept_header,
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
        marc_data: Optional[Dict[str, Any]] = None

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

            marc_elem = metadata_elem.find("marc:record", OAI_NS)
            if marc_elem is not None:
                marc_data = self._parse_marc_element(marc_elem)

        # Extract record ID from identifier (e.g., oai:aperta.ulakbim.gov.tr:241793 -> 241793)
        record_id = ""
        if identifier:
            match = re.search(r":(\d+)$", identifier)
            if match:
                record_id = match.group(1)
            else:
                record_id = identifier

        if marc_data and marc_data.get("rec_id"):
            record_id = marc_data["rec_id"]

        result: Dict[str, Any] = {
            "id": record_id,
            "oai_identifier": identifier,
            "datestamp": datestamp,
            "sets": set_specs,
            "dc": dc_data,
        }
        if marc_data:
            result["marc"] = marc_data
        return result

    def _parse_marc_element(self, rec: ET.Element) -> Dict[str, Any]:
        """Extracts fields and all attached file manifests from MARCXML record."""
        rec_id = rec.findtext(".//marc:controlfield[@tag='001']", namespaces=OAI_NS)
        title = rec.findtext(".//marc:datafield[@tag='245']/marc:subfield[@code='a']", namespaces=OAI_NS) or ""

        creators = []
        for df in rec.findall(".//marc:datafield[@tag='100']", OAI_NS) + rec.findall(".//marc:datafield[@tag='700']", OAI_NS):
            c_name = df.findtext("marc:subfield[@code='a']", namespaces=OAI_NS)
            if c_name:
                creators.append(c_name.strip())

        desc = rec.findtext(".//marc:datafield[@tag='520']/marc:subfield[@code='a']", namespaces=OAI_NS) or ""
        date = rec.findtext(".//marc:datafield[@tag='260']/marc:subfield[@code='c']", namespaces=OAI_NS) or ""

        doi = ""
        for df in rec.findall(".//marc:datafield[@tag='024']", OAI_NS):
            code = df.findtext("marc:subfield[@code='2']", namespaces=OAI_NS)
            val = df.findtext("marc:subfield[@code='a']", namespaces=OAI_NS)
            if code == "doi" and val:
                doi = val.strip()

        res_types = [
            t.text.strip()
            for t in rec.findall(".//marc:datafield[@tag='980']/marc:subfield[@code='a']", OAI_NS)
            if t.text
        ]

        license_url = rec.findtext(".//marc:datafield[@tag='540']/marc:subfield[@code='u']", namespaces=OAI_NS) or ""
        license_code = rec.findtext(".//marc:datafield[@tag='540']/marc:subfield[@code='a']", namespaces=OAI_NS) or ""
        license_str = license_url or license_code

        # Extract all file attachments from MARC 856 (electronic location)
        files = []
        for df in rec.findall(".//marc:datafield[@tag='856']", OAI_NS):
            u = df.findtext("marc:subfield[@code='u']", namespaces=OAI_NS)
            s = df.findtext("marc:subfield[@code='s']", namespaces=OAI_NS)
            z = df.findtext("marc:subfield[@code='z']", namespaces=OAI_NS)
            if u and ("/files/" in u or s):
                file_name = u.split("/")[-1] if u else ""
                files.append({
                    "id": f"{rec_id}_{file_name}",
                    "key": file_name,
                    "size": int(s or 0),
                    "checksum": (z or "").strip(),
                    "download_url": u.strip(),
                })

        return {
            "rec_id": rec_id,
            "title": title,
            "creators": creators,
            "description": desc,
            "publication_date": date,
            "doi": doi,
            "resource_types": res_types,
            "license": license_str,
            "files": files,
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
