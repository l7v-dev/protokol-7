#!/usr/bin/env python3
"""
Wikiversity Academic Resource Cleaner & Streaming XML Parser — protokol-7

Streams university learning modules, research projects, and pedagogical courses from
Wikimedia Wikiversity XML bz2 dumps with O(1) constant RAM. Cleans MediaWiki wikitext into
structured GFM markdown tailored for academic reasoning, curriculum modeling, and research.
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
RE_SYNTAX = re.compile(r"<(syntaxhighlight|source)(?:\s+lang=[\"']?([a-zA-Z0-9_+-]+)[\"']?)?[^>]*>(.*?)</\1>", re.DOTALL | re.IGNORECASE)
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


def clean_wikiversity_text(raw_text: str) -> str:
    """Transforms raw Wikiversity wikitext into clean GFM academic markdown."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Preserve code blocks
    code_blocks = []
    def code_replacer(match: re.Match) -> str:
        lang = match.group(2) or ""
        code = match.group(3).strip()
        idx = len(code_blocks)
        code_blocks.append(f"\n```{lang}\n{code}\n```\n")
        return f"__CODE_BLOCK_{idx}__"

    text = RE_SYNTAX.sub(code_replacer, text)

    # 2. Remove comments and references
    text = RE_COMMENTS.sub("", text)
    text = RE_REF_TAGS.sub("", text)
    text = RE_REF_SELF_CLOSING.sub("", text)

    # 3. Remove wikitables
    text = RE_TABLES.sub("", text)

    # 4. Clean templates
    text = remove_nested_templates(text)

    # 5. Remove media files and categories
    for _ in range(2):
        text = RE_FILE_MEDIA.sub("", text)
        text = RE_CATEGORY.sub("", text)

    # 6. Clean internal wiki links: [[Target|Label]] -> Label, [[Target]] -> Target
    def link_replacer(match: re.Match) -> str:
        content = match.group(1)
        if "|" in content:
            parts = content.split("|", 1)
            return parts[1].strip()
        return content.strip()

    text = re.sub(r"\[\[([^\[\]]+)\]\]", link_replacer, text)

    # 7. Clean external hyperlinks
    text = RE_EXT_LINKS_WITH_TEXT.sub(r"\1", text)
    text = RE_EXT_LINKS_NO_TEXT.sub("", text)

    # 8. Format headings: == Syllabus == -> ## Syllabus
    def heading_replacer(match: re.Match) -> str:
        heading_text = match.group(1).strip()
        return f"\n## {heading_text}\n"

    text = RE_HEADINGS.sub(heading_replacer, text)

    # 9. Clean HTML tags
    text = RE_HTML_TAGS.sub("", text)

    # 10. Format bold and italic markers
    text = re.sub(r"'''(.*?)'''", r"**\1**", text)
    text = re.sub(r"''(.*?)''", r"*\1*", text)

    # 11. Restore preserved code blocks
    for idx, block in enumerate(code_blocks):
        text = text.replace(f"__CODE_BLOCK_{idx}__", block)

    text = RE_MULTIPLE_NEWLINES.sub("\n\n", text).strip()
    return text


def stream_wikiversity_entries(
    xml_bz2_path: str,
    lang: str = "en",
    min_length: int = 50,
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams and yields cleaned Wikiversity articles from a compressed .xml.bz2 dump file.
    Maintains O(1) constant RAM footprint via incremental ElementTree parsing.
    """
    with bz2.BZ2File(xml_bz2_path, "rb") as bz2_stream:
        context = ET.iterparse(bz2_stream, events=("end",))

        for _, elem in context:
            tag_name = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

            if tag_name == "page":
                ns_elem = elem.find("{*}ns") if "{" in elem.tag else elem.find("ns")
                ns_val = ns_elem.text.strip() if ns_elem is not None and ns_elem.text else "0"

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
                    clean_text = clean_wikiversity_text(raw_text)
                    if len(clean_text) >= min_length:
                        quoted_title = urllib.parse.quote(title.replace(" ", "_"))
                        url = f"https://{lang}.wikiversity.org/wiki/{quoted_title}"

                        yield {
                            "article_id": page_id,
                            "title": title,
                            "lang": lang,
                            "text": clean_text,
                            "raw_length": len(raw_text),
                            "clean_length": len(clean_text),
                            "url": url,
                            "timestamp": timestamp,
                        }

                elem.clear()
