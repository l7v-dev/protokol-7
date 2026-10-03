#!/usr/bin/env python3
"""
DergiPark Metadata Cleaner & Normalizer -- protokol-7

Cleans Dublin Core records harvested from TÜBİTAK ULAKBİM DergiPark OAI-PMH,
normalizes Turkish and English textual fields, extracts DOIs and ISSNs,
and produces standardized 16-field dictionary records ready for PyArrow Parquet sharding.
"""

import html
import re
from typing import Any, Dict, List, Optional


class DergiParkCleaner:
    """
    Cleans and standardizes raw DergiPark OAI Dublin Core records.
    """

    def __init__(self, min_title_chars: int = 4):
        self.min_title_chars = min_title_chars

    @staticmethod
    def _strip_html(text: str) -> str:
        if not text:
            return ""
        clean = re.sub(r"<[^>]+>", " ", text)
        clean = html.unescape(clean)
        clean = re.sub(r"\s+", " ", clean).strip()
        return clean

    @staticmethod
    def _clean_str(text: Any) -> str:
        if text is None:
            return ""
        val = str(text)
        val = html.unescape(val)
        return re.sub(r"\s+", " ", val).strip()

    def clean_record(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Transforms a raw DergiPark article record into a normalized 16-field record.
        Returns None if record fails quality validation (e.g. missing title).
        """
        if not raw or not isinstance(raw, dict):
            return None

        # Check deleted flag
        if raw.get("status") == "deleted":
            return None

        raw_id = self._clean_str(raw.get("id") or raw.get("identifier"))
        if not raw_id:
            return None

        # Normalize ID (e.g. "oai:dergipark.org.tr:article/10" -> "dergipark:10" or "article/10")
        if "oai:dergipark.org.tr:" in raw_id:
            art_id = raw_id.split("oai:dergipark.org.tr:")[-1].strip()
        elif ":" in raw_id and not raw_id.startswith("http"):
            art_id = raw_id.split(":")[-1].strip()
        else:
            art_id = raw_id

        title = self._strip_html(raw.get("title", ""))
        if len(title) < self.min_title_chars:
            return None

        abstract = self._strip_html(raw.get("abstract") or raw.get("description", ""))

        # Authors
        authors_val = raw.get("authors") or raw.get("creator") or []
        if isinstance(authors_val, list):
            authors_clean = [self._clean_str(a) for a in authors_val if self._clean_str(a)]
            authors_str = "; ".join(authors_clean)
        else:
            authors_str = self._clean_str(authors_val)

        # Journal & Publisher
        journal = self._clean_str(raw.get("journal") or raw.get("source", ""))
        publisher = self._clean_str(raw.get("publisher", ""))

        # Year
        pub_date = self._clean_str(raw.get("publication_date") or raw.get("date", ""))
        year = 0
        if pub_date:
            year_match = re.search(r"\b(19\d{2}|20\d{2})\b", pub_date)
            if year_match:
                year = int(year_match.group(1))

        # Language
        lang = self._clean_str(raw.get("language", "tr")).lower()
        if lang in ("tur", "tr", "turkish"):
            lang = "tr"
        elif lang in ("eng", "en", "english"):
            lang = "en"
        elif not lang:
            lang = "tr"

        # DOI & ISSN extraction
        doi = self._clean_str(raw.get("doi", ""))
        issn = self._clean_str(raw.get("issn", ""))
        fulltext_url = self._clean_str(raw.get("fulltext_url") or raw.get("pdf_url") or raw.get("html_url", ""))
        article_url = ""
        pdf_url = ""

        identifiers = raw.get("identifiers") or []
        if isinstance(identifiers, str):
            identifiers = [identifiers]

        for ident in identifiers:
            ident_clean = self._clean_str(ident)
            if not ident_clean:
                continue
            if not doi and ("doi.org/" in ident_clean or ident_clean.startswith("10.")):
                doi_match = re.search(r"\b(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)\b", ident_clean)
                if doi_match:
                    doi = doi_match.group(1)
                elif ident_clean.startswith("10."):
                    doi = ident_clean
            if not issn and re.search(r"\b\d{4}-\d{3}[\dX]\b", ident_clean, re.IGNORECASE):
                issn_match = re.search(r"\b(\d{4}-\d{3}[\dX])\b", ident_clean, re.IGNORECASE)
                if issn_match:
                    issn = issn_match.group(1).upper()
            if not pdf_url and (ident_clean.endswith(".pdf") or "/download/" in ident_clean):
                pdf_url = ident_clean
            elif not article_url and "dergipark.org.tr" in ident_clean and "/article/" in ident_clean:
                article_url = ident_clean

        # Assign fulltext_url by preference: explicit -> pdf_url -> article_url -> doi fallback -> set_spec pattern
        if not fulltext_url:
            if pdf_url:
                fulltext_url = pdf_url
            elif article_url:
                fulltext_url = article_url
            elif doi:
                fulltext_url = f"https://doi.org/{doi}"
            elif raw.get("set_spec") and art_id:
                clean_id = art_id.split("/")[-1] if "/" in art_id else art_id
                fulltext_url = f"https://dergipark.org.tr/tr/pub/{raw.get('set_spec')}/article/{clean_id}"

        # Check journal source for ISSN if missing
        if not issn and journal:
            issn_match = re.search(r"\b(\d{4}-\d{3}[\dX])\b", journal, re.IGNORECASE)
            if issn_match:
                issn = issn_match.group(1).upper()

        # Keywords / Subjects
        keywords_val = raw.get("keywords") or raw.get("subject") or []
        if isinstance(keywords_val, list):
            kw_clean = [self._clean_str(k) for k in keywords_val if self._clean_str(k)]
            keywords_str = ", ".join(kw_clean)
        else:
            keywords_str = self._clean_str(keywords_val)

        subjects_str = self._clean_str(raw.get("subjects", ""))
        affiliations_str = self._clean_str(raw.get("affiliations", ""))

        # Character & Word metrics
        combined_text = f"{title} {abstract}"
        char_count = len(combined_text)
        word_count = len(combined_text.split())

        return {
            "id": art_id,
            "doi": doi,
            "title": title,
            "abstract": abstract,
            "journal": journal,
            "publisher": publisher,
            "issn": issn,
            "language": lang,
            "year": year,
            "authors": authors_str,
            "affiliations": affiliations_str,
            "keywords": keywords_str,
            "subjects": subjects_str,
            "fulltext_url": fulltext_url,
            "char_count": char_count,
            "word_count": word_count,
        }
