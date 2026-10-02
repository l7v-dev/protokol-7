#!/usr/bin/env python3
"""
Wikispecies Biological Taxonomy Cleaner & Streaming XML Parser — protokol-7

Streams global species classifications, phylogenetic hierarchies, and binomial nomenclature from
Wikimedia Wikispecies XML bz2 dumps with O(1) constant RAM. Cleans MediaWiki wikitext into
structured GFM markdown tailored for biological research, taxonomy graphs, and biodiversity AI.
"""

import bz2
import io
import re
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Generator, Dict, Any, Optional

RE_COMMENTS = re.compile(r"<!--.*?-->", re.DOTALL)
RE_REF_TAGS = re.compile(r"<ref[^>]*>.*?</ref>", re.DOTALL | re.IGNORECASE)
RE_REF_SELF_CLOSING = re.compile(r"<ref[^>]*/>", re.IGNORECASE)
RE_HTML_TAGS = re.compile(r"</?[a-zA-Z0-9]+[^>]*>")
RE_FILE_MEDIA = re.compile(r"\[\[(Dosya|Resim|File|Image):.+?\]\]", re.IGNORECASE | re.DOTALL)
RE_CATEGORY = re.compile(r"\[\[(Kategori|Category):.+?\]\]", re.IGNORECASE)
RE_TABLES = re.compile(r"\{\|.*?\|\}", re.DOTALL)
RE_HEADINGS = re.compile(r"^={2,5}\s*(.*?)\s*={2,5}$", re.MULTILINE)
RE_EXT_LINKS_WITH_TEXT = re.compile(r"\[(?:https?|ftp)://[^\s\]]+\s+([^\]]+)\]")
RE_EXT_LINKS_NO_TEXT = re.compile(r"\[(?:https?|ftp)://[^\]]+\]")
RE_MULTIPLE_NEWLINES = re.compile(r"\n{3,}")


def remove_nested_templates(text: str) -> str:
    """Removes double-bracket templates {{...}} even when deeply nested."""
    result = []
    depth = 0
    i = 0
    n = len(text)
    while i < n:
        if text[i : i + 2] == "{{":
            depth += 1
            i += 2
        elif text[i : i + 2] == "}}" and depth > 0:
            depth -= 1
            i += 2
        elif depth == 0:
            result.append(text[i])
            i += 1
        else:
            i += 1
    return "".join(result)


def clean_wikispecies_text(raw_text: str) -> str:
    """Transforms raw Wikispecies wikitext into clean GFM taxonomic markdown."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Strip comments, ref tags, HTML tags
    text = RE_COMMENTS.sub("", text)
    text = RE_REF_TAGS.sub("", text)
    text = RE_REF_SELF_CLOSING.sub("", text)
    text = RE_HTML_TAGS.sub("", text)

    # 2. Strip tables and media
    text = RE_TABLES.sub("", text)
    text = RE_FILE_MEDIA.sub("", text)
    text = RE_CATEGORY.sub("", text)

    # 3. Clean taxonavigation templates like {{regnum}}, {{classis}}, etc. before full strip
    text = re.sub(r"\{\{([a-zA-Z0-9_]+)\}\}", r"\1", text)

    # 4. Remove all remaining nested templates
    text = remove_nested_templates(text)

    # 5. Clean internal wikilinks: [[Link|Text]] -> Text, [[Link]] -> Link
    def clean_wikilink(match: re.Match) -> str:
        content = match.group(1).strip()
        if "|" in content:
            target, anchor = content.split("|", 1)
            anchor = anchor.strip()
            return anchor if anchor else target.strip()
        return content

    text = re.sub(r"\[\[([^\[\]]+)\]\]", clean_wikilink, text)

    # 6. External links: [http://... anchor] -> anchor, [http://...] -> ''
    text = RE_EXT_LINKS_WITH_TEXT.sub(r"\1", text)
    text = RE_EXT_LINKS_NO_TEXT.sub("", text)

    # 7. Convert headings to markdown
    def convert_heading(match: re.Match) -> str:
        line = match.group(0).strip()
        level = 0
        while level < len(line) and line[level] == "=":
            level += 1
        title = match.group(1).strip()
        md_level = min(level, 4)
        return f"{'#' * md_level} {title}"

    text = RE_HEADINGS.sub(convert_heading, text)

    # 8. Clean bold / italic wikitext
    text = re.sub(r"\'{5}(.*?)\'{5}", r"***\1***", text)
    text = re.sub(r"\'{3}(.*?)\'{3}", r"**\1**", text)
    text = re.sub(r"\'{2}(.*?)\'{2}", r"*\1*", text)

    # 9. Clean excessive blank lines
    text = RE_MULTIPLE_NEWLINES.sub("\n\n", text)
    return text.strip()


def stream_wikispecies_entries(
    dump_bz2_path: str,
    min_length: int = 30,
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams cleaned Wikispecies taxonomic entries from a bz2 XML dump.
    Uses xml.etree.ElementTree.iterparse for O(1) constant memory usage.
    """
    with bz2.BZ2File(dump_bz2_path, "rb") as bz2_stream:
        text_stream = io.TextIOWrapper(bz2_stream, encoding="utf-8", errors="replace")
        context = ET.iterparse(text_stream, events=("end",))

        current_id = None
        current_title = None
        current_ns = None
        current_text = None
        current_timestamp = None

        for event, elem in context:
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

            if tag == "id" and current_id is None:
                try:
                    current_id = int(elem.text.strip()) if elem.text else 0
                except (ValueError, AttributeError):
                    current_id = 0
            elif tag == "title":
                current_title = elem.text.strip() if elem.text else ""
            elif tag == "ns":
                current_ns = elem.text.strip() if elem.text else ""
            elif tag == "timestamp":
                current_timestamp = elem.text.strip() if elem.text else ""
            elif tag == "text":
                current_text = elem.text if elem.text else ""
            elif tag == "page":
                if current_ns == "0" and current_title and current_text:
                    is_redirect = current_text.strip().lower().startswith(("#redirect", "#yönlendir"))
                    if not is_redirect:
                        cleaned = clean_wikispecies_text(current_text)
                        if len(cleaned) >= min_length:
                            encoded_title = urllib.parse.quote(current_title.replace(" ", "_"))
                            url = f"https://species.wikimedia.org/wiki/{encoded_title}"
                            yield {
                                "article_id": current_id or 0,
                                "title": current_title,
                                "lang": "mul",  # Wikispecies is multilingual / global
                                "text": cleaned,
                                "raw_length": len(current_text),
                                "clean_length": len(cleaned),
                                "url": url,
                                "timestamp": current_timestamp or "",
                            }

                current_id = None
                current_title = None
                current_ns = None
                current_text = None
                current_timestamp = None
                elem.clear()
