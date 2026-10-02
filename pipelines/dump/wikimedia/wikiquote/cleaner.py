#!/usr/bin/env python3
"""
Wikiquote Quotations & Aphorisms Cleaner & Streaming XML Parser — protokol-7

Streams quotations, historical speeches, and aphorisms from Wikimedia Wikiquote
XML bz2 dumps with O(1) constant RAM. Cleans MediaWiki wikitext into structured,
high-density GFM markdown tailored for LLM rhetoric, style, and reasoning training.
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
RE_MULTIPLE_SPACES = re.compile(r"[ \t]{2,}")


def remove_nested_templates(text: str) -> str:
    """Removes double-bracket templates {{...}} while preserving special quote blocks."""
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


def clean_wikiquote_text(raw_text: str) -> str:
    """Transforms raw Wikiquote wikitext into clean GFM quotations markdown."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Remove comments and references
    text = RE_COMMENTS.sub("", text)
    text = RE_REF_TAGS.sub("", text)
    text = RE_REF_SELF_CLOSING.sub("", text)

    # 2. Remove wikitables (navigational grids)
    text = RE_TABLES.sub("", text)

    # 3. Clean templates
    text = remove_nested_templates(text)

    # 4. Remove media files and categories
    for _ in range(2):
        text = RE_FILE_MEDIA.sub("", text)
        text = RE_CATEGORY.sub("", text)

    # 5. Clean internal wiki links: [[Target|Label]] -> Label, [[Target]] -> Target
    def link_replacer(match: re.Match) -> str:
        content = match.group(1)
        if "|" in content:
            parts = content.split("|", 1)
            return parts[1].strip()
        return content.strip()

    text = re.sub(r"\[\[([^\[\]]+)\]\]", link_replacer, text)

    # 6. Clean external hyperlinks
    text = RE_EXT_LINKS_WITH_TEXT.sub(r"\1", text)
    text = RE_EXT_LINKS_NO_TEXT.sub("", text)

    # 7. Format headings: == Quotes == -> ## Quotes
    def heading_replacer(match: re.Match) -> str:
        heading_text = match.group(1).strip()
        return f"\n## {heading_text}\n"

    text = RE_HEADINGS.sub(heading_replacer, text)

    # 8. Clean HTML tags
    text = RE_HTML_TAGS.sub("", text)

    # 9. Format bold and italic markers: '''text''' -> **text**, ''text'' -> *text*
    text = re.sub(r"'''(.*?)'''", r"**\1**", text)
    text = re.sub(r"''(.*?)''", r"*\1*", text)

    # 10. Clean whitespace and empty lines
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # Standardize quote bullet items
        if stripped.startswith("*"):
            bullet_depth = len(stripped) - len(stripped.lstrip("*"))
            quote_body = stripped.lstrip("*").strip()
            indent = "  " * (bullet_depth - 1)
            lines.append(f"{indent}- {quote_body}")
        else:
            lines.append(stripped)

    cleaned = "\n".join(lines)
    cleaned = RE_MULTIPLE_NEWLINES.sub("\n\n", cleaned).strip()
    return cleaned


def count_quotes_in_text(cleaned_text: str) -> int:
    """Counts individual quotations in the cleaned text."""
    count = 0
    for line in cleaned_text.splitlines():
        s = line.strip()
        if s.startswith("- ") or s.startswith("> ") or s.startswith("* "):
            count += 1
    return max(1, count) if cleaned_text else 0


def stream_wikiquote_entries(
    xml_bz2_path: str,
    lang: str = "en",
    min_length: int = 50,
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams and yields cleaned Wikiquote articles from a compressed .xml.bz2 dump file.
    Maintains O(1) constant RAM footprint via incremental ElementTree parsing.
    """
    with bz2.BZ2File(xml_bz2_path, "rb") as bz2_stream:
        # Strip XML namespaces dynamically using local-name pattern
        context = ET.iterparse(bz2_stream, events=("end",))

        for _, elem in context:
            tag_name = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

            if tag_name == "page":
                ns_elem = elem.find("{*}ns") if "{" in elem.tag else elem.find("ns")
                ns_val = ns_elem.text.strip() if ns_elem is not None and ns_elem.text else "0"

                # Namespace 0 is the main article content namespace
                if ns_val != "0":
                    elem.clear()
                    continue

                redirect_elem = elem.find("{*}redirect") if "{" in elem.tag else elem.find("redirect")
                if redirect_elem is not None:
                    elem.clear()
                    continue

                title_elem = elem.find("{*}title") if "{" in elem.tag else elem.find("title")
                title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""

                id_elem = elem.find("{*}id") if "{" in elem.tag else elem.find("id")
                page_id = int(id_elem.text.strip()) if id_elem is not None and id_elem.text else 0

                revision_elem = elem.find("{*}revision") if "{" in elem.tag else elem.find("revision")
                raw_text = ""
                timestamp = ""

                if revision_elem is not None:
                    text_elem = (
                        revision_elem.find("{*}text")
                        if "{" in elem.tag
                        else revision_elem.find("text")
                    )
                    if text_elem is not None and text_elem.text:
                        raw_text = text_elem.text

                    ts_elem = (
                        revision_elem.find("{*}timestamp")
                        if "{" in elem.tag
                        else revision_elem.find("timestamp")
                    )
                    if ts_elem is not None and ts_elem.text:
                        timestamp = ts_elem.text.strip()

                if raw_text and len(raw_text) >= min_length:
                    clean_text = clean_wikiquote_text(raw_text)
                    if len(clean_text) >= min_length:
                        quotes_count = count_quotes_in_text(clean_text)
                        quoted_title = urllib.parse.quote(title.replace(" ", "_"))
                        url = f"https://{lang}.wikiquote.org/wiki/{quoted_title}"

                        yield {
                            "article_id": page_id,
                            "title": title,
                            "lang": lang,
                            "text": clean_text,
                            "quotes_count": quotes_count,
                            "raw_length": len(raw_text),
                            "clean_length": len(clean_text),
                            "url": url,
                            "timestamp": timestamp,
                        }

                elem.clear()
