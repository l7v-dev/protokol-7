#!/usr/bin/env python3
"""
NCBI E-utilities and BioC API Stream Downloader -- protokol-7

Fetches PubMed metadata, XML full records, and PMC open-access BioC full text
with strict politeness rate-limiting and exponential retry backoff.
"""

import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.cleaner_base import clean_text

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
BIOC_BASE = "https://www.ncbi.nlm.nih.gov/research/biorc/rest"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Research Data Ingestion Engine; mailto:l7v-dev@protokol.local)"


class PubmedDownloader:
    """
    Polite HTTP client for NCBI E-utilities (esearch, efetch) and BioC API.
    Adheres to NCBI concurrency limits (max 3 req/sec without API key, 10 req/sec with key).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        email: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 4,
    ):
        self.api_key = api_key or os.environ.get("NCBI_API_KEY")
        self.email = email or os.environ.get("NCBI_EMAIL")
        self.timeout = timeout
        self.max_retries = max_retries
        self.min_interval = 0.12 if self.api_key else 0.35
        self._last_request_time = 0.0

    def _wait_for_rate_limit(self) -> None:
        elapsed = time.time() - self._last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_time = time.time()

    def _fetch_url(self, url: str) -> bytes:
        headers = {"User-Agent": DEFAULT_USER_AGENT}
        if self.email:
            headers["From"] = self.email

        for attempt in range(self.max_retries + 1):
            self._wait_for_rate_limit()
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    return response.read()
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                    backoff = 2**attempt + 0.5
                    print(f"[PUBMED] HTTP {e.code} on {url[:60]}... Retrying in {backoff:.1f}s")
                    time.sleep(backoff)
                    continue
                raise
            except Exception as e:
                if attempt < self.max_retries:
                    backoff = 2**attempt + 0.5
                    print(f"[PUBMED] Network error: {e}. Retrying in {backoff:.1f}s")
                    time.sleep(backoff)
                    continue
                raise

        raise RuntimeError(f"Exceeded max retries for URL: {url}")

    def search_pmids(
        self,
        query: str,
        retmax: int = 100,
        retstart: int = 0,
        sort: str = "pub_date",
    ) -> List[str]:
        """Queries esearch.fcgi and returns list of matching PMIDs."""
        params = {
            "db": "pubmed",
            "term": query,
            "retmax": str(retmax),
            "retstart": str(retstart),
            "sort": sort,
            "retmode": "json",
        }
        if self.api_key:
            params["api_key"] = self.api_key

        url = f"{EUTILS_BASE}/esearch.fcgi?{urllib.parse.urlencode(params)}"
        raw_bytes = self._fetch_url(url)
        import json

        data = json.loads(raw_bytes.decode("utf-8"))
        id_list = data.get("esearchresult", {}).get("idlist", [])
        return [str(x) for x in id_list]

    def fetch_articles_xml(self, pmids: List[str]) -> List[Dict[str, Any]]:
        """Queries efetch.fcgi with up to 100 PMIDs and parses structured article dicts."""
        if not pmids:
            return []

        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        }
        if self.api_key:
            params["api_key"] = self.api_key

        url = f"{EUTILS_BASE}/efetch.fcgi?{urllib.parse.urlencode(params)}"
        raw_xml = self._fetch_url(url)
        return self._parse_pubmed_xml(raw_xml)

    def _parse_pubmed_xml(self, xml_bytes: bytes) -> List[Dict[str, Any]]:
        try:
            root = ET.fromstring(xml_bytes)
        except Exception as e:
            print(f"[PUBMED] XML parse error: {e}")
            return []

        articles = []
        for article_node in root.findall(".//PubmedArticle"):
            rec = self._parse_single_article(article_node)
            if rec:
                articles.append(rec)
        return articles

    def _parse_single_article(self, node: ET.Element) -> Optional[Dict[str, Any]]:
        medline = node.find(".//MedlineCitation")
        if medline is None:
            return None

        pmid_elem = medline.find(".//PMID")
        pmid = pmid_elem.text.strip() if pmid_elem is not None and pmid_elem.text else ""
        if not pmid:
            return None

        article_elem = medline.find(".//Article")
        if article_elem is None:
            return None

        # Title
        title_elem = article_elem.find(".//ArticleTitle")
        title = "".join(title_elem.itertext()).strip() if title_elem is not None else ""

        # Journal
        journal_elem = article_elem.find(".//Journal/Title")
        journal = journal_elem.text.strip() if journal_elem is not None and journal_elem.text else ""

        # Year
        year_elem = article_elem.find(".//JournalIssue/PubDate/Year")
        if year_elem is None or not year_elem.text:
            year_elem = medline.find(".//DateCompleted/Year")
        pub_year = int(year_elem.text.strip()) if year_elem is not None and year_elem.text and year_elem.text.isdigit() else 0

        # Authors
        authors_list = []
        for author in article_elem.findall(".//AuthorList/Author"):
            last = author.findtext("LastName") or ""
            fore = author.findtext("ForeName") or author.findtext("Initials") or ""
            full = f"{last} {fore}".strip()
            if full:
                authors_list.append(full)
            elif author.findtext("CollectiveName"):
                authors_list.append(author.findtext("CollectiveName").strip())

        # Abstract
        abstract_parts = []
        for ab in article_elem.findall(".//Abstract/AbstractText"):
            label = ab.attrib.get("Label")
            text = "".join(ab.itertext()).strip()
            if text:
                if label:
                    abstract_parts.append(f"{label}: {text}")
                else:
                    abstract_parts.append(text)
        abstract = "\n\n".join(abstract_parts)

        # MeSH Headings
        mesh_terms = []
        for mh in medline.findall(".//MeshHeadingList/MeshHeading"):
            desc = mh.findtext("DescriptorName") or ""
            is_major = mh.find("DescriptorName").attrib.get("MajorTopicYN") == "Y" if mh.find("DescriptorName") is not None else False
            if desc:
                mesh_terms.append({"name": desc, "is_major": is_major})

        # Identifiers (DOI, PMCID)
        doi = ""
        pmcid = ""
        for art_id in node.findall(".//PubmedData/ArticleIdList/ArticleId"):
            id_type = art_id.attrib.get("IdType")
            val = (art_id.text or "").strip()
            if id_type == "doi":
                doi = val
            elif id_type == "pmc":
                pmcid = val

        return {
            "pmid": pmid,
            "pmcid": pmcid,
            "doi": doi,
            "title": clean_text(title),
            "journal": clean_text(journal),
            "pub_year": pub_year,
            "authors": ", ".join(authors_list[:12]),
            "mesh_terms": mesh_terms,
            "keywords": "",
            "abstract": clean_text(abstract),
            "text": "",
            "is_pmc_oa": bool(pmcid),
        }
