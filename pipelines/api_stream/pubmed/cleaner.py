#!/usr/bin/env python3
"""
PubMed Record Cleaner and Quality Gate -- protokol-7

Filters raw PubMed article records, normalizes MeSH headings, validates abstracts,
and synthesizes structured, high-signal Markdown records for LLM training.
"""

import os
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.cleaner_base import BaseCleaner, clean_text


class PubmedCleaner(BaseCleaner):
    def __init__(self, min_char_count: int = 50, min_word_count: int = 10):
        super().__init__(
            min_char_count=min_char_count,
            min_word_count=min_word_count,
            filter_paratext=True,
            filter_retracted=True,
        )

    def clean_record(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        pmid = str(raw.get("pmid") or "").strip()
        if not pmid or not pmid.isdigit():
            return None

        title = clean_text(raw.get("title") or "")
        if len(title) < 5 or self.is_paratext(title):
            return None

        abstract = clean_text(raw.get("abstract") or "")
        fulltext = clean_text(raw.get("text") or "")

        # Require at least abstract or full text
        primary_body = abstract if abstract else fulltext
        if not self.validate_bounds(primary_body):
            return None

        journal = clean_text(raw.get("journal") or "")
        pub_year = int(raw.get("pub_year") or 0)
        authors = clean_text(raw.get("authors") or "")
        doi = clean_text(raw.get("doi") or "")
        pmcid = clean_text(raw.get("pmcid") or "")

        # MeSH terms normalization
        mesh_raw = raw.get("mesh_terms") or []
        mesh_names: List[str] = []
        if isinstance(mesh_raw, list):
            for m in mesh_raw:
                if isinstance(m, dict):
                    name = m.get("name")
                    if name:
                        mesh_names.append(name + ("*" if m.get("is_major") else ""))
                elif isinstance(m, str):
                    mesh_names.append(m)
        elif isinstance(mesh_raw, str):
            mesh_names = [s.strip() for s in mesh_raw.split(",") if s.strip()]

        mesh_str = ", ".join(mesh_names[:20])

        # Synthesize LLM Markdown text
        md_lines = [f"# {title}", ""]
        meta_parts = []
        if authors:
            meta_parts.append(f"**Authors:** {authors}")
        if journal:
            year_suffix = f" ({pub_year})" if pub_year > 0 else ""
            meta_parts.append(f"**Journal:** {journal}{year_suffix}")
        meta_parts.append(f"**PMID:** {pmid}")
        if pmcid:
            meta_parts.append(f"**PMCID:** {pmcid}")
        if doi:
            meta_parts.append(f"**DOI:** {doi}")
        if mesh_str:
            meta_parts.append(f"**MeSH:** {mesh_str}")

        md_lines.append(" | ".join(meta_parts))
        md_lines.append("")

        if abstract:
            md_lines.append("## Abstract")
            md_lines.append(abstract)
            md_lines.append("")

        if fulltext:
            md_lines.append("## Full Text")
            md_lines.append(fulltext)
            md_lines.append("")

        synthesized_text = "\n".join(md_lines).strip()

        return {
            "pmid": pmid,
            "pmcid": pmcid,
            "doi": doi,
            "title": title,
            "journal": journal,
            "pub_year": pub_year,
            "authors": authors,
            "mesh_terms": mesh_str,
            "keywords": clean_text(raw.get("keywords") or ""),
            "abstract": abstract,
            "text": synthesized_text,
            "is_pmc_oa": bool(pmcid),
            "char_count": len(synthesized_text),
            "word_count": len(synthesized_text.split()),
            "raw_mesh_list": mesh_raw,
        }
