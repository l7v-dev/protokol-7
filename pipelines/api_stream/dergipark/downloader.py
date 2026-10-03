#!/usr/bin/env python3
"""
DergiPark (TÜBİTAK ULAKBİM) OAI-PMH Downloader -- protokol-7

Fetches academic article metadata from DergiPark OAI-PMH 2.0 endpoints
(https://dergipark.org.tr/api/public/oai/) with strict politeness rate limits,
SSL verification, resumption token handling, and exponential backoff retry.
"""

import os
import ssl
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, Generator, List, Optional

DERGIPARK_OAI_URL = "https://dergipark.org.tr/api/public/oai/"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Tubitak Ulakbim DergiPark Research Ingestion Engine; mailto:l7v-dev@protokol.local)"


class DergiParkDownloader:
    """
    Polite HTTP client for DergiPark OAI-PMH 2.0 service.
    """

    def __init__(
        self,
        base_url: str = DERGIPARK_OAI_URL,
        timeout: int = 40,
        max_retries: int = 15,
        min_interval: float = 0.35,
    ):
        self.base_url = base_url if base_url.endswith("/") else base_url + "/"
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

    def _fetch_raw(self, url: str) -> bytes:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "application/xml, text/xml, */*",
        }
        backoff = 1.0

        for attempt in range(1, self.max_retries + 1):
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self._ssl_context) as resp:
                    return resp.read()
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
                    return b""
                raise
            except Exception:
                if attempt < self.max_retries:
                    time.sleep(backoff)
                    backoff *= 1.5
                    continue
                raise

        return b""

    def list_sets(self) -> List[Dict[str, str]]:
        """Harvests available journal/collection sets from DergiPark."""
        url = f"{self.base_url}?verb=ListSets"
        raw_xml = self._fetch_raw(url)
        if not raw_xml:
            return []

        try:
            root = ET.fromstring(raw_xml)
        except ET.ParseError:
            return []

        sets: List[Dict[str, str]] = []
        for set_elem in root.findall(".//{http://www.openarchives.org/OAI/2.0/}set"):
            spec = set_elem.find("{http://www.openarchives.org/OAI/2.0/}setSpec")
            name = set_elem.find("{http://www.openarchives.org/OAI/2.0/}setName")
            if spec is not None and spec.text:
                sets.append({
                    "setSpec": spec.text.strip(),
                    "setName": name.text.strip() if name is not None and name.text else spec.text.strip(),
                })
        return sets

    def get_record(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Retrieves single article record by OAI identifier."""
        clean_id = urllib.parse.quote(identifier.strip())
        url = f"{self.base_url}?verb=GetRecord&identifier={clean_id}&metadataPrefix=oai_dc"
        raw_xml = self._fetch_raw(url)
        if not raw_xml:
            return None

        try:
            root = ET.fromstring(raw_xml)
        except ET.ParseError:
            return None

        rec_elem = root.find(".//{http://www.openarchives.org/OAI/2.0/}record")
        if rec_elem is None:
            return None

        return self._parse_oai_record(rec_elem)

    def _parse_oai_record(self, rec: ET.Element) -> Optional[Dict[str, Any]]:
        """Parses an OAI record element into raw dict format."""
        header = rec.find("{http://www.openarchives.org/OAI/2.0/}header")
        if header is None:
            return None

        if header.get("status") == "deleted":
            return {"status": "deleted"}

        header_id_elem = header.find("{http://www.openarchives.org/OAI/2.0/}identifier")
        if header_id_elem is None or not header_id_elem.text:
            return None

        identifier = header_id_elem.text.strip()

        dc = rec.find(".//{http://www.openarchives.org/OAI/2.0/oai_dc/}dc")
        if dc is None:
            return None

        def get_all_texts(tag: str) -> List[str]:
            return [
                el.text.strip()
                for el in dc.findall(f"{{http://purl.org/dc/elements/1.1/}}{tag}")
                if el.text and el.text.strip()
            ]

        def get_first_text(tag: str) -> str:
            texts = get_all_texts(tag)
            return texts[0] if texts else ""

        title = get_first_text("title")
        authors = get_all_texts("creator")
        abstract = get_first_text("description")
        publisher = get_first_text("publisher")
        pub_date = get_first_text("date")
        journal = get_first_text("source")
        lang = get_first_text("language") or "tr"
        identifiers = get_all_texts("identifier")
        relations = get_all_texts("relation")
        subjects = get_all_texts("subject")

        return {
            "id": identifier,
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "publisher": publisher,
            "date": pub_date,
            "journal": journal,
            "language": lang,
            "identifiers": identifiers + relations,
            "keywords": subjects,
            "status": "active",
        }

    def stream_records(
        self,
        set_spec: Optional[str] = None,
        from_date: Optional[str] = None,
        until_date: Optional[str] = None,
        max_records: Optional[int] = None,
        resumption_token: Optional[str] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Continuously streams records via DergiPark OAI-PMH ListRecords.
        Handles pagination transparently via resumptionToken.
        """
        yielded = 0
        token: Optional[str] = resumption_token

        while True:
            if token:
                url = f"{self.base_url}?verb=ListRecords&resumptionToken={urllib.parse.quote(token)}"
            else:
                params = ["verb=ListRecords", "metadataPrefix=oai_dc"]
                if set_spec:
                    params.append(f"set={urllib.parse.quote(set_spec)}")
                if from_date:
                    params.append(f"from={from_date}")
                if until_date:
                    params.append(f"until={until_date}")
                url = f"{self.base_url}?{'&'.join(params)}"

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
                print(f"[DERGIPARK-OAI] Error [{err_code}]: {err_text}", flush=True)
                if err_code == "badResumptionToken" and token:
                    print("[DERGIPARK-OAI] Resumption token invalid or expired. Restarting from root query.", flush=True)
                    token = None
                    continue
                break

            records = root.findall(".//{http://www.openarchives.org/OAI/2.0/}record")
            if not records:
                break

            for rec in records:
                parsed = self._parse_oai_record(rec)
                if not parsed or parsed.get("status") == "deleted":
                    continue

                yield parsed
                yielded += 1
                if max_records and yielded >= max_records:
                    return

            resumption_elem = root.find(".//{http://www.openarchives.org/OAI/2.0/}resumptionToken")
            if resumption_elem is not None and resumption_elem.text:
                token = resumption_elem.text.strip()
            else:
                break
