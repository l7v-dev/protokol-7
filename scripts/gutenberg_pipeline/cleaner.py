#!/usr/bin/env python3
"""
Gutenberg Text Cleaner & Metadata Extractor -- protokol-7

Strips Project Gutenberg legal boilerplate (header + footer), removes
transcriber notes, normalises whitespace, and yields structured dicts
ready for Parquet serialisation.

Cleaning stages
---------------
1. Decode bytes -> str (UTF-8 with latin-1 fallback).
2. Strip PG header block (everything before the START sentinel).
3. Strip PG footer block (everything after the END sentinel).
4. Remove transcriber / producer note blocks.
5. Remove chapter-level asterisk dividers, page markers.
6. Collapse excessive blank lines (max 2 consecutive).
7. Strip trailing whitespace per line.
8. Enforce minimum quality threshold (token count).
"""

import re
from typing import Optional, Dict, Any, List

# ------------------------------------------------------------------
# Sentinel patterns (case-insensitive, handle different PG editions)
# ------------------------------------------------------------------
_RE_START = re.compile(
    r"\*{3}\s*START\s+OF\s+(?:THE\s+|THIS\s+)?PROJECT\s+GUTENBERG\s+EBOOK[^\n]*\*{3}",
    re.IGNORECASE,
)
_RE_END = re.compile(
    r"\*{3}\s*END\s+OF\s+(?:THE\s+|THIS\s+)?PROJECT\s+GUTENBERG\s+EBOOK[^\n]*\*{3}",
    re.IGNORECASE,
)

# Transcriber / producer notes
_RE_TRANSCRIBER = re.compile(
    r"\[(?:Transcriber|Producer|Editor|Illustrator)['s]*\s+Note[^\]]*\].*?(?=\n\n|\Z)",
    re.IGNORECASE | re.DOTALL,
)

# Page markers like [Pg 12] or [Page 12]
_RE_PAGE_MARKER = re.compile(r"\[(?:Pg|Page)\s+\d+\]", re.IGNORECASE)

# Excessive asterisk or dash dividers (used as chapter breaks in plain text)
_RE_DIVIDER = re.compile(r"^[ *\-=]{5,}$", re.MULTILINE)

# Multiple blank lines -> max 2
_RE_MULTI_BLANK = re.compile(r"\n{3,}")

# Gutenberg-era OCR artefacts: page-break form-feed character
_RE_FORMFEED = re.compile(r"\f")

# Inline HTML that sometimes leaks into plain-text editions
_RE_HTML = re.compile(r"<[^>]{1,80}>")


def _decode(raw: bytes) -> str:
    """Decodes raw bytes to str, falling back to latin-1 if UTF-8 fails."""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace")


def strip_pg_envelope(text: str) -> str:
    """
    Removes everything before the START sentinel and after the END sentinel.
    If sentinels are absent (some editions omit them) returns text as-is.
    """
    start_match = _RE_START.search(text)
    if start_match:
        text = text[start_match.end():]

    end_match = _RE_END.search(text)
    if end_match:
        text = text[: end_match.start()]

    return text.strip()


def clean_gutenberg_text(raw: bytes) -> Optional[str]:
    """
    Full cleaning pipeline. Returns clean plain-text string or None if
    the result is below quality threshold (< 200 tokens).
    """
    text = _decode(raw)

    # 1. Strip PG legal envelope
    text = strip_pg_envelope(text)

    # 2. Remove transcriber notes
    text = _RE_TRANSCRIBER.sub("", text)

    # 3. Remove page markers
    text = _RE_PAGE_MARKER.sub("", text)

    # 4. Remove divider lines
    text = _RE_DIVIDER.sub("", text)

    # 5. Remove form-feed characters
    text = _RE_FORMFEED.sub("\n", text)

    # 6. Remove residual HTML tags
    text = _RE_HTML.sub("", text)

    # 7. Strip trailing whitespace on each line
    lines = [ln.rstrip() for ln in text.splitlines()]
    text = "\n".join(lines)

    # 8. Collapse excessive blank lines
    text = _RE_MULTI_BLANK.sub("\n\n", text).strip()

    # Quality gate: require at least 200 whitespace-separated tokens
    if len(text.split()) < 200:
        return None

    return text


def build_entry(
    book_id: int,
    title: str,
    authors: List[str],
    subjects: List[str],
    languages: List[str],
    download_count: int,
    text_url: str,
    raw_bytes: bytes,
) -> Optional[Dict[str, Any]]:
    """
    Cleans raw book bytes and assembles a Parquet-ready entry dict.
    Returns None if cleaning produces insufficient content.
    """
    clean_text = clean_gutenberg_text(raw_bytes)
    if clean_text is None:
        return None

    return {
        "book_id": book_id,
        "title": title,
        "authors": "; ".join(authors),          # serialise list as semicolon-joined string
        "subjects": "; ".join(subjects[:20]),    # cap subjects to 20 tags
        "languages": "; ".join(languages),
        "download_count": download_count,
        "text_url": text_url,
        "text": clean_text,
        "char_count": len(clean_text),
        "word_count": len(clean_text.split()),
    }
