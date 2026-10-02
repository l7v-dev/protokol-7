#!/usr/bin/env python3
"""
Semantic Scholar Record Cleaner -- protokol-7

Transforms raw S2 API paper dicts into clean, Parquet-ready records.

Cleaning stages
---------------
1. Extract and validate title + abstract.
2. Normalise author list (first 10, display names).
3. Extract external IDs: DOI, ArXiv, PubMed.
4. Resolve best open-access PDF URL.
5. Build S2 fields of study tags (top 5).
6. Build unified "text" field: title + abstract.
7. Quality gate: abstract >= 20 tokens.
"""

import re
from typing import Dict, Any, Optional, List

_RE_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_RE_MULTI_NL    = re.compile(r"\n{3,}")

MIN_ABSTRACT_TOKENS = 20


def _clean(text: str) -> str:
    text = _RE_MULTI_SPACE.sub(" ", text)
    text = _RE_MULTI_NL.sub("\n\n", text)
    return text.strip()


def build_record(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Cleans a raw S2 paper dict and returns a Parquet-ready record.
    Returns None if quality gate fails.
    """
    paper_id = raw.get("paperId") or ""
    title    = _clean(raw.get("title") or "")
    abstract = _clean(raw.get("abstract") or "")

    if not abstract or len(abstract.split()) < MIN_ABSTRACT_TOKENS:
        return None

    # External IDs
    ext_ids  = raw.get("externalIds") or {}
    doi      = ext_ids.get("DOI") or ""
    arxiv_id = ext_ids.get("ArXiv") or ""
    pubmed_id= ext_ids.get("PubMed") or ""

    # Authors (first 10)
    authors_raw = raw.get("authors") or []
    authors = "; ".join(
        a.get("name", "")
        for a in authors_raw[:10]
        if a.get("name")
    )

    year          = int(raw.get("year") or 0)
    pub_date      = raw.get("publicationDate") or ""
    citation_count= int(raw.get("citationCount") or 0)
    reference_count=int(raw.get("referenceCount") or 0)
    is_oa         = bool(raw.get("isOpenAccess"))

    oa_pdf_raw = raw.get("openAccessPdf") or {}
    oa_pdf_url = oa_pdf_raw.get("url") or "" if isinstance(oa_pdf_raw, dict) else ""

    # S2 fields of study
    s2_fields_raw = raw.get("s2FieldsOfStudy") or raw.get("fieldsOfStudy") or []
    if isinstance(s2_fields_raw, list):
        fields_of_study = "; ".join(
            f.get("category", "") if isinstance(f, dict) else str(f)
            for f in s2_fields_raw[:5]
            if f
        )
    else:
        fields_of_study = ""

    pub_types_raw = raw.get("publicationTypes") or []
    pub_types = "; ".join(pub_types_raw[:3]) if pub_types_raw else ""

    journal_raw = raw.get("journal") or {}
    journal = journal_raw.get("name", "") if isinstance(journal_raw, dict) else ""

    # Unified text: Title + Abstract
    text_parts: List[str] = []
    if title:
        text_parts.append(f"# {title}")
    text_parts.append(abstract)
    text = "\n\n".join(text_parts).strip()

    return {
        "paper_id":        paper_id,
        "doi":             doi,
        "arxiv_id":        arxiv_id,
        "pubmed_id":       pubmed_id,
        "title":           title,
        "abstract":        abstract,
        "authors":         authors,
        "year":            year,
        "publication_date":pub_date,
        "citation_count":  citation_count,
        "reference_count": reference_count,
        "is_open_access":  int(is_oa),
        "oa_pdf_url":      oa_pdf_url,
        "fields_of_study": fields_of_study,
        "publication_types":pub_types,
        "journal":         journal,
        "text":            text,
        "char_count":      len(text),
        "word_count":      len(text.split()),
    }
