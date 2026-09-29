#!/usr/bin/env python3
"""
OpenAlex Record Cleaner & Abstract Reconstructor -- protokol-7

Transforms raw OpenAlex API work dicts into clean, LLM-ready records.

Cleaning stages
---------------
1. Reconstruct abstract from inverted index (word -> [position, ...]).
2. Normalise author list (display names, first 10 only).
3. Extract best open-access URL (prefer non-PDF landing page).
4. Clean concept tags (top 5 by score).
5. Build a unified "text" field: title + abstract (+ OA body if available).
6. Enforce minimum quality gate: abstract >= 30 tokens.
"""

import re
from typing import Dict, Any, Optional, List

_RE_HTML   = re.compile(r"<[^>]{1,200}>")
_RE_SPACES = re.compile(r"[ \t]{2,}")
_RE_MULTI_NL = re.compile(r"\n{3,}")

MIN_ABSTRACT_TOKENS = 30


def reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> Optional[str]:
    """
    Reconstructs human-readable abstract from OpenAlex inverted index.
    { "The": [0, 12], "quick": [1], ... }  ->  "The quick ..."
    """
    if not inverted_index or not isinstance(inverted_index, dict):
        return None

    positions: List[tuple] = []
    for word, pos_list in inverted_index.items():
        if isinstance(pos_list, list):
            for p in pos_list:
                if isinstance(p, int):
                    positions.append((p, word))

    if not positions:
        return None

    positions.sort()
    text = " ".join(w for _, w in positions).strip()
    return text if len(text.split()) >= MIN_ABSTRACT_TOKENS else None


def _clean_html(text: str) -> str:
    text = _RE_HTML.sub("", text)
    text = _RE_SPACES.sub(" ", text)
    text = _RE_MULTI_NL.sub("\n\n", text)
    return text.strip()


def build_record(raw: Dict[str, Any], fulltext: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Transforms a raw OpenAlex work dict into a Parquet-ready record.
    Returns None if the record fails the quality gate.
    """
    work_id   = raw.get("id", "")
    doi       = raw.get("doi", "") or ""
    title     = (raw.get("title") or raw.get("display_name") or "").strip()
    pub_year  = raw.get("publication_year") or 0
    pub_date  = raw.get("publication_date") or ""
    work_type = raw.get("type") or ""
    language  = raw.get("language") or ""
    cited     = int(raw.get("cited_by_count") or 0)

    # Abstract
    abstract = reconstruct_abstract(raw.get("abstract_inverted_index"))

    # Authors (first 10)
    authorships = raw.get("authorships") or []
    authors = "; ".join(
        a["author"]["display_name"]
        for a in authorships[:10]
        if a.get("author") and a["author"].get("display_name")
    )

    # Concepts (top 5 by score)
    concepts_raw = sorted(
        (raw.get("concepts") or []),
        key=lambda c: float(c.get("score") or 0),
        reverse=True,
    )[:5]
    concepts = "; ".join(c.get("display_name", "") for c in concepts_raw if c.get("display_name"))

    # Best OA URL
    oa_info   = raw.get("open_access") or {}
    prim_loc  = raw.get("primary_location") or {}
    oa_url    = (
        oa_info.get("oa_url")
        or prim_loc.get("landing_page_url")
        or ""
    )

    # Build unified text field: Title + Abstract + (optional full text)
    parts: List[str] = []
    if title:
        parts.append(f"# {title}")
    if abstract:
        parts.append(abstract)
    if fulltext:
        cleaned_ft = _clean_html(fulltext)
        if cleaned_ft:
            parts.append(cleaned_ft[:50_000])  # cap at 50k chars

    if not abstract and not fulltext:
        return None  # no textual content at all

    text = "\n\n".join(parts).strip()

    # Quality gate
    if len(text.split()) < MIN_ABSTRACT_TOKENS:
        return None

    return {
        "work_id":       work_id,
        "doi":           doi,
        "title":         title,
        "authors":       authors,
        "publication_year": int(pub_year),
        "publication_date": pub_date,
        "abstract":      abstract or "",
        "concepts":      concepts,
        "language":      language,
        "work_type":     work_type,
        "cited_by_count": cited,
        "oa_url":        oa_url,
        "text":          text,
        "char_count":    len(text),
        "word_count":    len(text.split()),
    }
