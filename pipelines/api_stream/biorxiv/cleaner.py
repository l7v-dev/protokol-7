#!/usr/bin/env python3
"""
bioRxiv & medRxiv Record Cleaner and Quality Gate -- protokol-7

Filters raw preprint records from Cold Spring Harbor Laboratory APIs,
validates abstracts, normalizes categories and affiliations, and synthesizes
structured, high-signal Markdown records for language model training.
"""

import datetime
import os
import sys
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.cleaner_base import BaseCleaner, clean_text


class BiorxivCleaner(BaseCleaner):
    """
    Quality gate cleaner for bioRxiv and medRxiv preprint records.
    """

    def __init__(self, min_char_count: int = 50, min_word_count: int = 10):
        super().__init__(
            min_char_count=min_char_count,
            min_word_count=min_word_count,
            filter_paratext=True,
            filter_retracted=True,
        )

    def clean_record(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        doi = clean_text(raw.get("doi") or "").strip()
        if not doi or "/" not in doi:
            return None

        title = clean_text(raw.get("title") or "")
        if len(title) < 5 or self.is_paratext(title):
            return None

        abstract = clean_text(raw.get("abstract") or "")
        if not self.validate_bounds(abstract):
            return None

        server = clean_text(raw.get("server") or "biorxiv").lower()
        if server not in ("biorxiv", "medrxiv"):
            server = "biorxiv"

        category = clean_text(raw.get("category") or "general").lower()
        authors = clean_text(raw.get("authors") or "")
        corresponding_author = clean_text(raw.get("author_corresponding") or "")
        institution = clean_text(raw.get("author_corresponding_institution") or "")
        license_str = clean_text(raw.get("license") or "")
        published_doi = clean_text(raw.get("published") or "")
        if published_doi.lower() == "na":
            published_doi = ""

        raw_date = str(raw.get("date") or "").strip()
        pub_year = 0
        pub_date = raw_date
        if raw_date:
            try:
                dt = datetime.date.fromisoformat(raw_date[:10])
                pub_year = dt.year
                pub_date = dt.isoformat()
            except ValueError:
                if len(raw_date) >= 4 and raw_date[:4].isdigit():
                    pub_year = int(raw_date[:4])

        version_str = str(raw.get("version") or "1").strip()
        version = int(version_str) if version_str.isdigit() else 1

        # Synthesize LLM Markdown text
        md_lines = [f"# {title}", ""]
        meta_parts = []
        if authors:
            meta_parts.append(f"**Authors:** {authors}")
        meta_parts.append(f"**Server:** {server.capitalize()}")
        if category:
            meta_parts.append(f"**Category:** {category.title()}")
        meta_parts.append(f"**DOI:** {doi} (v{version})")
        if pub_date:
            meta_parts.append(f"**Date:** {pub_date}")
        if institution:
            meta_parts.append(f"**Institution:** {institution}")
        if license_str:
            meta_parts.append(f"**License:** {license_str}")
        if published_doi:
            meta_parts.append(f"**Published Version:** {published_doi}")

        md_lines.append(" | ".join(meta_parts))
        md_lines.append("")

        if abstract:
            md_lines.append("## Abstract")
            md_lines.append(abstract)
            md_lines.append("")

        synthesized_text = "\n".join(md_lines).strip()

        return {
            "doi": doi,
            "title": title,
            "server": server,
            "category": category,
            "pub_date": pub_date,
            "pub_year": pub_year,
            "version": version,
            "authors": authors,
            "corresponding_author": corresponding_author,
            "institution": institution,
            "license": license_str,
            "published_doi": published_doi,
            "abstract": abstract,
            "text": synthesized_text,
            "char_count": len(synthesized_text),
            "word_count": len(synthesized_text.split()),
        }
