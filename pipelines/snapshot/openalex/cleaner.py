#!/usr/bin/env python3
"""
OpenAlex Snapshot Record Cleaner & Quality Gate — protokol-7

Filters raw OpenAlex parquet records, eliminates paratext/retracted records,
reconstructs natural-language abstracts from inverted indexes, and produces
compact, structured markdown records for LLM training.
"""

import html
import json
import re
from typing import Any, Dict, List, Optional, Union

RE_HTML_TAGS = re.compile(r"<[^>]+>")
RE_WHITESPACE = re.compile(r"[ \t]+")
RE_PUNCT_SPACE = re.compile(r"\s+([.,;:!?])")
RE_PARAGRAPHS = re.compile(r"\n\s*\n+")


def clean_text(text: Optional[str]) -> str:
    """Removes HTML tags, decodes HTML entities, and normalizes whitespace."""
    if not text:
        return ""
    cleaned = RE_HTML_TAGS.sub(" ", text)
    cleaned = html.unescape(cleaned)
    cleaned = RE_PUNCT_SPACE.sub(r"\1", cleaned)
    paragraphs = [
        RE_WHITESPACE.sub(" ", p).strip()
        for p in RE_PARAGRAPHS.split(cleaned)
    ]
    return "\n\n".join(p for p in paragraphs if p).strip()


def reconstruct_abstract(raw_index: Union[str, Dict[str, Any], None]) -> Optional[str]:
    """
    Reconstructs continuous natural-language abstract from inverted index map:
    {"Word": [position0, position1, ...]} -> "Word ..."
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
    abstract = " ".join(tokens).strip()
    return clean_text(abstract) if len(tokens) >= 5 else None


def build_clean_record(
    raw: Dict[str, Any], require_abstract: bool = True, min_abstract_words: int = 15
) -> Optional[Dict[str, Any]]:
    """
    Applies strict quality gate to raw OpenAlex work record.
    Returns cleaned record dict or None if rejected by quality gate.
    """
    # 1. Reject retracted works
    if raw.get("is_retracted") is True:
        return None

    # 2. Reject paratext (covers, editorial boards, issue tables of contents)
    if raw.get("is_paratext") is True:
        return None

    # 3. Title validation
    title_raw = raw.get("title") or raw.get("display_name") or ""
    title = clean_text(str(title_raw))
    if len(title) < 5 or len(title.split()) < 2:
        return None

    # 4. Work ID normalization (W2472757538)
    raw_id = str(raw.get("id") or "")
    work_id = raw_id.split("/")[-1] if "/" in raw_id else raw_id
    if not work_id:
        return None

    # 5. Abstract reconstruction
    abstract = reconstruct_abstract(raw.get("abstract_inverted_index"))
    if require_abstract:
        if not abstract or len(abstract.split()) < min_abstract_words:
            return None

    # 6. Authors extraction (up to 10)
    authors_raw = raw.get("authorships") or []
    author_names: List[str] = []
    if isinstance(authors_raw, (list, tuple)):
        for item in authors_raw[:10]:
            if isinstance(item, dict):
                author_obj = item.get("author") or {}
                if isinstance(author_obj, dict) and author_obj.get("display_name"):
                    author_names.append(str(author_obj["display_name"]))
                elif item.get("raw_author_name"):
                    author_names.append(str(item["raw_author_name"]))
    authors_str = ", ".join(author_names) if author_names else "Unknown"

    # 7. Topics extraction (primary topic + top 2 general topics)
    topics_list: List[str] = []
    primary_topic = raw.get("primary_topic")
    if isinstance(primary_topic, dict) and primary_topic.get("display_name"):
        topics_list.append(str(primary_topic["display_name"]))

    topics_raw = raw.get("topics") or []
    if isinstance(topics_raw, (list, tuple)):
        for top_item in topics_raw:
            if isinstance(top_item, dict) and top_item.get("display_name"):
                name = str(top_item["display_name"])
                if name not in topics_list:
                    topics_list.append(name)
            if len(topics_list) >= 3:
                break
    topics_str = "; ".join(topics_list) if topics_list else "General Science"

    # 8. Publication metadata
    try:
        pub_year = int(raw.get("publication_year") or 0)
    except (ValueError, TypeError):
        pub_year = 0

    doi = str(raw.get("doi") or "")
    citations = int(raw.get("cited_by_count") or 0)

    oa_dict = raw.get("open_access") or {}
    is_oa = bool(oa_dict.get("is_oa")) if isinstance(oa_dict, dict) else False
    oa_url = str(oa_dict.get("oa_url") or "") if isinstance(oa_dict, dict) else ""

    # 9. LLM structured text synthesis
    parts = [f"# {title}", f"Authors: {authors_str}"]

    meta_parts = []
    if pub_year > 0:
        meta_parts.append(f"Year: {pub_year}")
    if citations > 0:
        meta_parts.append(f"Citations: {citations}")
    if doi:
        meta_parts.append(f"DOI: {doi}")
    if meta_parts:
        parts.append(" | ".join(meta_parts))

    if topics_str:
        parts.append(f"Topics: {topics_str}")

    if abstract:
        parts.append(f"## Abstract\n{abstract}")

    full_text = "\n\n".join(parts).strip()
    words = full_text.split()
    if len(words) < 10:
        return None

    return {
        "id": work_id,
        "doi": doi,
        "title": title,
        "year": pub_year if 1000 <= pub_year <= 3000 else 0,
        "authors": authors_str,
        "topics": topics_str,
        "is_oa": is_oa,
        "oa_url": oa_url,
        "citations": citations,
        "text": full_text,
        "char_count": len(full_text),
        "word_count": len(words),
    }


import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import record_output

def process_partition_file(
    parquet_path: str,
    sharder: Any,
    batch_size: int = 5_000,
    require_abstract: bool = True,
    min_abstract_words: int = 15,
    raw_evidence=None,
) -> int:
    """
    Streams and processes a downloaded S3 OpenAlex partition file,
    filters noise, reconstructs abstracts, and appends clean records to sharder.
    Returns the count of clean records appended.
    """
    import pyarrow.parquet as pq

    clean_count = 0
    parquet_file = pq.ParquetFile(parquet_path)
    for batch in parquet_file.iter_batches(batch_size=batch_size):
        rows = batch.to_pylist()
        cleaned_batch = []
        for raw_work in rows:
            record = build_clean_record(
                raw_work,
                require_abstract=require_abstract,
                min_abstract_words=min_abstract_words,
            )
            if record is not None:
                record_output(record, raw_evidence)
                cleaned_batch.append(record)

        if cleaned_batch:
            sharder.append_batch(cleaned_batch)
            clean_count += len(cleaned_batch)

    return clean_count
