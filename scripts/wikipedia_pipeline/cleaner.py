#!/usr/bin/env python3
import bz2
import io
import re
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Generator, Dict, Any, Optional

# Pre-compiled regular expressions for fast wikitext cleaning
RE_COMMENTS = re.compile(r"<!--.*?-->", re.DOTALL)
RE_REF_TAGS = re.compile(r"<ref[^>]*>.*?</ref>", re.DOTALL | re.IGNORECASE)
RE_REF_SELF_CLOSING = re.compile(r"<ref[^>]*/>", re.IGNORECASE)
RE_HTML_TAGS = re.compile(r"</?[a-zA-Z0-9]+[^>]*>")
RE_FILE_MEDIA = re.compile(
    r"\[\[(Dosya|Resim|File|Image):.+?\]\]", re.IGNORECASE | re.DOTALL
)
RE_CATEGORY = re.compile(r"\[\[(Kategori|Category):.+?\]\]", re.IGNORECASE)
RE_TABLES = re.compile(r"\{\|.*?\|\}", re.DOTALL)
RE_HEADINGS = re.compile(r"^={1,6}\s*(.*?)\s*={1,6}$", re.MULTILINE)
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


def clean_wikitext(raw_text: str) -> str:
    """Transforms raw wikitext into clean plain text suitable for LLM pre-training."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Remove comments and ref tags
    text = RE_COMMENTS.sub("", text)
    text = RE_REF_TAGS.sub("", text)
    text = RE_REF_SELF_CLOSING.sub("", text)

    # 2. Remove wikitables
    text = RE_TABLES.sub("", text)

    # 3. Remove nested templates (infoboxes, citations, etc.)
    text = remove_nested_templates(text)

    # 4. Remove media links and categories (run multiple passes for nested bracket links)
    for _ in range(3):
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

    # 6. External links
    text = RE_EXT_LINKS_WITH_TEXT.sub(r"\1", text)
    text = RE_EXT_LINKS_NO_TEXT.sub("", text)

    # 7. Headings and bold/italic markup
    text = RE_HEADINGS.sub(r"\1", text)
    text = RE_BOLD_ITALIC.sub("", text)

    # 8. Remaining HTML tags
    text = RE_HTML_TAGS.sub("", text)

    # 9. Normalize whitespace
    text = RE_MULTIPLE_SPACES.sub(" ", text)
    text = RE_MULTIPLE_NEWLINES.sub("\n\n", text)

    return text.strip()


def stream_articles(
    source_file: str, min_chars: int = 150, lang: str = "tr"
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams and yields clean articles from a compressed (.xml.bz2) or raw (.xml) Wikimedia dump.
    Memory footprint stays bounded by explicitly clearing parsed XML elements.
    """
    is_bz2 = source_file.endswith(".bz2")
    open_fn = bz2.open if is_bz2 else open

    with open_fn(source_file, "rb") as f:
        # Strip namespace prefixes for clean tag matching
        context = ET.iterparse(f, events=("start", "end"))
        _, root = next(context)

        current_tag = None
        in_page = False
        page_id: Optional[str] = None
        page_title: Optional[str] = None
        page_ns: Optional[str] = None
        is_redirect = False
        text_content: Optional[str] = None

        for event, elem in context:
            tag = elem.tag.split("}")[-1]  # remove XML namespace

            if event == "start":
                if tag == "page":
                    in_page = True
                    page_id = None
                    page_title = None
                    page_ns = None
                    is_redirect = False
                    text_content = None
                elif tag == "redirect" and in_page:
                    is_redirect = True

            elif event == "end":
                if in_page:
                    if tag == "id" and page_id is None:
                        page_id = elem.text.strip() if elem.text else None
                    elif tag == "title":
                        page_title = elem.text.strip() if elem.text else None
                    elif tag == "ns":
                        page_ns = elem.text.strip() if elem.text else None
                    elif tag == "text":
                        text_content = elem.text or ""

                    elif tag == "page":
                        # Process only standard encyclopedic articles (Namespace 0)
                        if (
                            page_ns == "0"
                            and not is_redirect
                            and page_title
                            and text_content
                        ):
                            # Skip wikitext redirects that didn't use the XML redirect tag
                            upper_preview = text_content[:100].upper()
                            if not upper_preview.startswith(
                                ("#YÖNLENDİRME", "#YONLENDIRME", "#REDIRECT")
                            ):
                                clean_text = clean_wikitext(text_content)
                                if len(clean_text) >= min_chars:
                                    safe_title = urllib.parse.quote(
                                        page_title.replace(" ", "_")
                                    )
                                    url = f"https://{lang}.wikipedia.org/wiki/{safe_title}"
                                    yield {
                                        "id": page_id or "",
                                        "url": url,
                                        "title": page_title,
                                        "text": clean_text,
                                    }

                        in_page = False
                        root.clear()


def stream_remote_articles(
    dump_url: str,
    expected_md5: Optional[str] = None,
    min_chars: int = 150,
    user_agent: str = "protokol-7-llm-pipeline/1.0 (academic; l7v-research)",
    lang: str = "tr",
) -> Generator[Dict[str, Any], None, None]:
    """
    Streams and yields clean articles directly from a remote Wikimedia dump URL
    without saving the raw compressed dump or uncompressed XML to disk.
    Calculates in-flight MD5 over the raw HTTP byte stream and verifies it upon completion.
    """
    from downloader import StreamHashReader, SSL_CONTEXT, tqdm
    import urllib.request

    req = urllib.request.Request(dump_url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as response:
        content_length = response.headers.get("Content-Length")
        total_size = int(content_length) if content_length and content_length.isdigit() else None

        progress = None
        if tqdm is not None and total_size:
            progress = tqdm(
                total=total_size,
                unit="B",
                unit_scale=True,
                desc="In-Flight Stream",
                leave=False,
            )

        hash_reader = StreamHashReader(response, progress_bar=progress)
        is_bz2 = dump_url.endswith(".bz2") or (response.headers.get("Content-Type") == "application/x-bzip2")
        stream_source = bz2.open(hash_reader, "rb") if is_bz2 else hash_reader

        try:
            context = ET.iterparse(stream_source, events=("start", "end"))
            _, root = next(context)

            in_page = False
            page_id: Optional[str] = None
            page_title: Optional[str] = None
            page_ns: Optional[str] = None
            is_redirect = False
            text_content: Optional[str] = None

            for event, elem in context:
                tag = elem.tag.split("}")[-1]

                if event == "start":
                    if tag == "page":
                        in_page = True
                        page_id = None
                        page_title = None
                        page_ns = None
                        is_redirect = False
                        text_content = None
                    elif tag == "redirect" and in_page:
                        is_redirect = True

                elif event == "end":
                    if in_page:
                        if tag == "id" and page_id is None:
                            page_id = elem.text.strip() if elem.text else None
                        elif tag == "title":
                            page_title = elem.text.strip() if elem.text else None
                        elif tag == "ns":
                            page_ns = elem.text.strip() if elem.text else None
                        elif tag == "text":
                            text_content = elem.text or ""

                        elif tag == "page":
                            if (
                                page_ns == "0"
                                and not is_redirect
                                and page_title
                                and text_content
                            ):
                                upper_preview = text_content[:100].upper()
                                if not upper_preview.startswith(
                                    ("#YÖNLENDİRME", "#YONLENDIRME", "#REDIRECT")
                                ):
                                    clean_text = clean_wikitext(text_content)
                                    if len(clean_text) >= min_chars:
                                        safe_title = urllib.parse.quote(
                                            page_title.replace(" ", "_")
                                        )
                                        url = f"https://{lang}.wikipedia.org/wiki/{safe_title}"
                                        yield {
                                            "id": page_id or "",
                                            "url": url,
                                            "title": page_title,
                                            "text": clean_text,
                                        }

                            in_page = False
                            root.clear()
        finally:
            if progress is not None:
                progress.close()
            stream_source.close()

        actual_md5 = hash_reader.get_hash()
        if expected_md5:
            if actual_md5.lower() != expected_md5.lower():
                raise ValueError(
                    f"In-flight MD5 verification failed! Expected {expected_md5}, got {actual_md5}"
                )
            print(f"[OK] In-flight stream MD5 verified: {actual_md5}")
        else:
            print(f"[INFO] In-flight stream completed. MD5: {actual_md5}")

