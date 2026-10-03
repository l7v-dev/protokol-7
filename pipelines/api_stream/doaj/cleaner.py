#!/usr/bin/env python3
"""
DOAJ Article and Journal Data Cleaner & Normalizer -- protokol-7

Sanitizes raw DOAJ API payload objects into LLM-training-ready tabular records.
Extracts DOIs, ISSNs, multilingual metadata, subject classifications, and keywords.
"""

import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.cleaner_base import BaseCleaner, clean_text


class DoajCleaner(BaseCleaner):
    """Normalizer for DOAJ articles and journals."""

    def __init__(
        self,
        min_char_count: int = 30,
        min_word_count: int = 5,
        min_title_len: int = 5,
        min_abstract_len: int = 0,
        filter_paratext: bool = True,
    ):
        super().__init__(
            min_char_count=min_char_count,
            min_word_count=min_word_count,
            filter_paratext=filter_paratext,
        )
        self.min_title_len = min_title_len
        self.min_abstract_len = min_abstract_len

    def clean_record(self, raw_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Parses a raw DOAJ article record and returns a flattened, typed dictionary.
        """
        if not raw_item or not isinstance(raw_item, dict):
            return None

        article_id = str(raw_item.get("id") or "").strip()
        if not article_id:
            return None

        bib = raw_item.get("bibjson", {})
        if not bib or not isinstance(bib, dict):
            return None

        # Title
        raw_title = bib.get("title", "")
        title = clean_text(raw_title)
        if len(title) < self.min_title_len:
            return None

        if self.is_paratext(title):
            return None

        # Abstract
        raw_abstract = bib.get("abstract", "")
        abstract = clean_text(raw_abstract)
        if self.min_abstract_len > 0 and len(abstract) < self.min_abstract_len:
            return None

        # DOI and ISSN extraction from identifiers
        doi = ""
        issns: List[str] = []
        for ident in bib.get("identifier", []):
            if isinstance(ident, dict):
                itype = ident.get("type", "").lower()
                val = str(ident.get("id", "")).strip()
                if itype == "doi" and not doi:
                    doi = val
                elif "issn" in itype and val:
                    issns.append(val)

        # Journal and Publisher
        journal_info = bib.get("journal", {})
        journal_title = clean_text(journal_info.get("title", ""))
        publisher = clean_text(journal_info.get("publisher", ""))

        # Merge journal ISSNs
        for j_issn in journal_info.get("issns", []):
            if j_issn and j_issn not in issns:
                issns.append(str(j_issn).strip())
        issn_str = ", ".join(issns)

        # Language
        lang_list = journal_info.get("language", []) or bib.get("language", [])
        if isinstance(lang_list, list):
            languages = ", ".join(str(l).upper() for l in lang_list if l)
        else:
            languages = str(lang_list).upper() if lang_list else "EN"

        # Year
        try:
            year = int(bib.get("year", 0) or 0)
        except (ValueError, TypeError):
            year = 0

        # Authors and Affiliations
        authors: List[str] = []
        affiliations: List[str] = []
        for author in bib.get("author", []):
            if isinstance(author, dict):
                name = clean_text(author.get("name", ""))
                if name:
                    authors.append(name)
                affil = clean_text(author.get("affiliation", ""))
                if affil and affil not in affiliations:
                    affiliations.append(affil)
        authors_str = ", ".join(authors)
        affiliations_str = "; ".join(affiliations)

        # Keywords
        raw_keywords = bib.get("keywords", [])
        keywords: List[str] = []
        if isinstance(raw_keywords, list):
            for kw in raw_keywords:
                ckw = clean_text(str(kw))
                if ckw and ckw not in keywords:
                    keywords.append(ckw)
        keywords_str = ", ".join(keywords)

        # Subject terms
        subjects: List[str] = []
        for subj in bib.get("subject", []):
            if isinstance(subj, dict):
                term = clean_text(subj.get("term", ""))
                if term and term not in subjects:
                    subjects.append(term)
        subjects_str = ", ".join(subjects)

        # Fulltext link
        fulltext_url = ""
        for link in bib.get("link", []):
            if isinstance(link, dict):
                url = str(link.get("url", "")).strip()
                ltype = link.get("type", "").lower()
                if ltype == "fulltext" and url:
                    fulltext_url = url
                    break
                elif not fulltext_url and url:
                    fulltext_url = url

        content_for_metrics = f"{title}\n\n{abstract}" if abstract else title
        char_count = len(content_for_metrics)
        word_count = len(content_for_metrics.split())

        return {
            "id": article_id,
            "doi": doi,
            "title": title,
            "abstract": abstract,
            "journal": journal_title,
            "publisher": publisher,
            "issn": issn_str,
            "language": languages,
            "year": year,
            "authors": authors_str,
            "affiliations": affiliations_str,
            "keywords": keywords_str,
            "subjects": subjects_str,
            "fulltext_url": fulltext_url,
            "char_count": char_count,
            "word_count": word_count,
        }
