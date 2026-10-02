#!/usr/bin/env python3
"""
Base Cleaner and Quality Gate -- protokol-7

Provides foundational text sanitization, HTML entity normalization,
inverted-index text reconstruction, and quality gate filters for LLM training datasets.
"""

import html
import json
import re
from typing import Any, Dict, List, Optional, Union

RE_HTML_TAGS = re.compile(r"<[^>]+>")
RE_WHITESPACE = re.compile(r"[ \t]+")
RE_PUNCT_SPACE = re.compile(r"\s+([.,;:!?])")
RE_PARAGRAPHS = re.compile(r"\n\s*\n+")
RE_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

PARATEXT_INDICATORS = (
    "table of contents",
    "editorial board",
    "author index",
    "subject index",
    "title page",
    "back matter",
    "front matter",
    "contents of volume",
    "issue information",
)


def clean_text(text: Optional[str]) -> str:
    """Removes HTML tags, decodes HTML entities, and normalizes whitespace."""
    if not text:
        return ""
    cleaned = RE_CONTROL_CHARS.sub(" ", str(text))
    cleaned = RE_HTML_TAGS.sub(" ", cleaned)
    cleaned = html.unescape(cleaned)
    cleaned = RE_PUNCT_SPACE.sub(r"\1", cleaned)
    paragraphs = [
        RE_WHITESPACE.sub(" ", p).strip()
        for p in RE_PARAGRAPHS.split(cleaned)
    ]
    return "\n\n".join(p for p in paragraphs if p).strip()


def reconstruct_inverted_index(
    raw_index: Union[str, Dict[str, Any], None], min_tokens: int = 5
) -> Optional[str]:
    """
    Reconstructs continuous natural-language text from inverted index maps:
    {"Word": [pos0, pos1, ...]} -> "Word ..."
    """
    if not raw_index:
        return None

    if isinstance(raw_index, str):
        try:
            index = json.loads(raw_index)
        except Exception:
            return None
    elif isinstance(raw_index, dict):
        index = raw_index
    else:
        return None

    if not isinstance(index, dict) or not index:
        return None

    pos_map: Dict[int, str] = {}
    for word, positions in index.items():
        if not isinstance(word, str) or not isinstance(positions, (list, tuple)):
            continue
        for p in positions:
            if isinstance(p, int):
                pos_map[p] = word

    if not pos_map:
        return None

    sorted_positions = sorted(pos_map.keys())
    tokens = [pos_map[p] for p in sorted_positions]
    if len(tokens) < min_tokens:
        return None

    reconstructed = " ".join(tokens).strip()
    return clean_text(reconstructed)


class BaseCleaner:
    """
    Base record cleaner providing reusable filters and sanitization passes.
    Subclasses customize validation rules for specific corpus sources.
    """

    def __init__(
        self,
        min_char_count: int = 50,
        min_word_count: int = 10,
        filter_paratext: bool = True,
        filter_retracted: bool = True,
    ):
        self.min_char_count = min_char_count
        self.min_word_count = min_word_count
        self.filter_paratext = filter_paratext
        self.filter_retracted = filter_retracted

    def is_paratext(self, title: Optional[str]) -> bool:
        """Checks if title matches known academic/publishing paratext phrases."""
        if not self.filter_paratext or not title:
            return False
        normalized = title.strip().lower()
        return any(indicator in normalized for indicator in PARATEXT_INDICATORS)

    def is_retracted(self, raw: Dict[str, Any]) -> bool:
        """Checks retraction flags in raw payload."""
        if not self.filter_retracted:
            return False
        return bool(raw.get("is_retracted") or raw.get("retracted"))

    def validate_bounds(self, text: Optional[str]) -> bool:
        """Validates character and word count thresholds."""
        if not text:
            return False
        char_count = len(text)
        if char_count < self.min_char_count:
            return False
        word_count = len(text.split())
        return word_count >= self.min_word_count

    def clean_record(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Processes a single raw record through the quality gate.
        Subclasses should override or extend this method.
        """
        raise NotImplementedError("Subclasses must implement clean_record()")
