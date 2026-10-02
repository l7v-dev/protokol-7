#!/usr/bin/env python3
"""
Wiktionary Lexical Cleaner & XML Streaming Parser — protokol-7

Streams lexical lemmas from Wikimedia Wiktionary XML bz2 dumps with O(1) constant RAM.
Cleans MediaWiki wikitext into structured dictionary definitions, parts of speech,
and examples tailored for LLM vocabulary and semantic training.
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
RE_BOLD_ITALIC = re.compile(r"'{2,5}")
RE_EXT_LINKS_WITH_TEXT = re.compile(r"\[(?:https?|ftp)://[^\s\]]+\s+([^\]]+)\]")
RE_EXT_LINKS_NO_TEXT = re.compile(r"\[(?:https?|ftp)://[^\]]+\]")
RE_MULTIPLE_NEWLINES = re.compile(r"\n{3,}")
RE_MULTIPLE_SPACES = re.compile(r"[ \t]{2,}")


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


def clean_wiktionary_text(raw_text: str) -> str:
    """Transforms raw Wiktionary wikitext into clean dictionary text."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Remove comments and references
    text = RE_COMMENTS.sub("", text)
    text = RE_REF_TAGS.sub("", text)
    text = RE_REF_SELF_CLOSING.sub("", text)

    # 2. Remove wikitables (conjugation/declension grids)
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

    # 7. Format headings: === Noun === -> ## Noun
    def heading_replacer(match: re.Match) -> str:
        heading_text = match.group(1).strip()
        return f"\n## {heading_text}\n"

    text = RE_HEADINGS.sub(heading_replacer, text)

    # 8. Strip bold and italic markers
    text = RE_BOLD_ITALIC.sub("", text)

    # 9. Clean HTML
    text = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    text = RE_HTML_TAGS.sub("", text)

    # 10. Normalize whitespace and empty lines
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(lines)
    text = RE_MULTIPLE_NEWLINES.sub("\n\n", text)
    text = RE_MULTIPLE_SPACES.sub(" ", text)

    return text.strip()


def stream_wiktionary_entries(
    dump_path: str,
    lang: str = "en",
    min_length: int = 30,
    limit: Optional[int] = None,
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams lexical entries from a Wiktionary .xml.bz2 dump file with constant O(1) RAM.
    Filters out redirects, non-main namespaces, and stub texts.
    """
    count = 0

    with bz2.BZ2File(dump_path, "rb") as bz2_file:
        context = ET.iterparse(bz2_file, events=("end",))
        _, root = next(context)

        current_id = None
        current_title = None
        current_ns = None
        current_redirect = False
        current_text = None
        current_timestamp = None

        for event, elem in context:
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

            if tag == "id" and current_id is None:
                current_id = int(elem.text) if elem.text and elem.text.isdigit() else 0
            elif tag == "title":
                current_title = elem.text or ""
            elif tag == "ns":
                current_ns = int(elem.text) if elem.text and elem.text.isdigit() else 0
            elif tag == "redirect":
                current_redirect = True
            elif tag == "timestamp":
                current_timestamp = elem.text or ""
            elif tag == "text":
                current_text = elem.text or ""
            elif tag == "page":
                # Only retain main namespace (ns == 0), non-redirects, non-empty
                if current_ns == 0 and not current_redirect and current_text and current_title:
                    clean_text = clean_wiktionary_text(current_text)
                    if len(clean_text) >= min_length:
                        host = f"{lang}.wiktionary.org"
                        url = f"https://{host}/wiki/{urllib.parse.quote(current_title.replace(' ', '_'))}"

                        yield {
                            "article_id": current_id or 0,
                            "word": current_title,
                            "lang": lang,
                            "text": clean_text,
                            "raw_length": len(current_text),
                            "clean_length": len(clean_text),
                            "url": url,
                            "timestamp": current_timestamp or "",
                        }
                        count += 1
                        if limit is not None and count >= limit:
                            elem.clear()
                            root.clear()
                            break

                # Clear element memory immediately to prevent RAM creep
                elem.clear()
                root.clear()
                current_id = None
                current_title = None
                current_ns = None
                current_redirect = False
                current_text = None
                current_timestamp = None
