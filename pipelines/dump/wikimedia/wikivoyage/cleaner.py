#!/usr/bin/env python3
"""
Wikivoyage Travel Guide Cleaner & Streaming XML Parser — protokol-7

Streams worldwide travel guides, itineraries, phrasebooks, and geographical articles from
Wikimedia Wikivoyage XML bz2 dumps with O(1) constant RAM. Cleans MediaWiki wikitext into
structured GFM markdown tailored for geospatial intelligence, travel reasoning, and location planning.
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

# Listing templates typical in Wikivoyage: {{see|name=...|alt=...|address=...|...|content=...}}
RE_LISTING_TAG = re.compile(r"\{\{(see|do|buy|eat|drink|sleep|listing)\s*\|(.*?)\}\}", re.IGNORECASE | re.DOTALL)


def format_listing_match(match: re.Match) -> str:
    """Formats Wikivoyage {{see|...}} or {{eat|...}} listing template into readable markdown."""
    params_str = match.group(2)
    name = ""
    address = ""
    description = ""
    url = ""

    # Parse key=val pairs
    tokens = re.split(r"(?<!\\)\|", params_str)
    for t in tokens:
        if "=" in t:
            k, v = t.split("=", 1)
            k = k.strip().lower()
            v = v.strip()
            if k == "name":
                name = v
            elif k in ("address", "addr"):
                address = v
            elif k in ("content", "description"):
                description = v
            elif k == "url":
                url = v
        elif not name:
            name = t.strip()

    if not name and not description:
        return ""

    parts = []
    if name:
        parts.append(f"**{name}**")
    if address:
        parts.append(f"({address})")
    if description:
        parts.append(description)

    return " - " + " ".join(parts)


def remove_nested_templates(text: str) -> str:
    """Removes remaining double-bracket templates {{...}} even when deeply nested."""
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


def clean_wikivoyage_text(raw_text: str) -> str:
    """Transforms raw Wikivoyage wikitext into clean GFM travel guide markdown."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Format listing templates
    text = RE_LISTING_TAG.sub(format_listing_match, text)

    # 2. Strip comments, ref tags, HTML tags
    text = RE_COMMENTS.sub("", text)
    text = RE_REF_TAGS.sub("", text)
    text = RE_REF_SELF_CLOSING.sub("", text)
    text = RE_HTML_TAGS.sub("", text)

    # 3. Strip tables and media
    text = RE_TABLES.sub("", text)
    text = RE_FILE_MEDIA.sub("", text)
    text = RE_CATEGORY.sub("", text)

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


def stream_wikivoyage_entries(
    dump_bz2_path: str,
    lang: str = "en",
    min_length: int = 40,
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams cleaned Wikivoyage entries from a bz2 XML dump.
    Uses xml.etree.ElementTree.iterparse for O(1) constant memory usage.
    """
    with bz2.BZ2File(dump_bz2_path, "rb") as bz2_stream:
        # Wrap in TextIOWrapper with utf-8 decoding and error replacement
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
                # Filter for main namespace (ns == "0") and non-redirect
                if current_ns == "0" and current_title and current_text:
                    is_redirect = current_text.strip().lower().startswith(("#redirect", "#yönlendir"))
                    if not is_redirect:
                        cleaned = clean_wikivoyage_text(current_text)
                        if len(cleaned) >= min_length:
                            encoded_title = urllib.parse.quote(current_title.replace(" ", "_"))
                            url = f"https://{lang}.wikivoyage.org/wiki/{encoded_title}"
                            yield {
                                "article_id": current_id or 0,
                                "title": current_title,
                                "lang": lang,
                                "text": cleaned,
                                "raw_length": len(current_text),
                                "clean_length": len(cleaned),
                                "url": url,
                                "timestamp": current_timestamp or "",
                            }

                # Reset state and clear XML element from memory
                current_id = None
                current_title = None
                current_ns = None
                current_text = None
                current_timestamp = None
                elem.clear()
