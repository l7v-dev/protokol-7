#!/usr/bin/env python3
"""
Gutenberg Catalog Downloader & Text Fetcher -- protokol-7

Primary catalog source: PG's official RDF dump (~100 MB tar.bz2 containing
one RDF/XML file per book). Parsed with stdlib xml.etree; no third-party deps.
Fallback: Gutendex REST API (paginated JSON) — used if RDF dump fails.
All network I/O is streamed in chunks; no full file is held in RAM.
"""

import gzip
import io
import os
import ssl
import tarfile
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from typing import Iterator, Dict, Any, Optional, List

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; gutenberg-pipeline)"

# Official PG RDF catalog dump — all ~70k books in one bz2 tar
PG_RDF_DUMP_URL = "https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2"

# Gutendex is an open-source Gutenberg REST API mirror (fallback)
GUTENDEX_BASE = "https://gutendex.com/books"

# Official PG mirrors for raw text downloads
PG_MIRRORS: List[str] = [
    "https://www.gutenberg.org",
    "https://gutenberg.pglaf.org",
]

CHUNK_SIZE = 1 * 1024 * 1024   # 1 MB network read buffer
MAX_TEXT_BYTES = 10 * 1024 * 1024  # 10 MB per book safety cap

# RDF namespace map
_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
_DC  = "http://purl.org/dc/terms/"
_PG  = "http://www.gutenberg.org/2009/pgterms/"
_DCAM = "http://purl.org/dc/dcam/"


def _make_request(url: str, timeout: int = 60) -> urllib.request.Request:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return req


def _parse_rdf_ebook(content: bytes) -> Optional[Dict[str, Any]]:
    """
    Parses a single PG RDF/XML file (cache/epub/<id>/pg<id>.rdf) into a
    book dict compatible with the Gutendex results format.
    Returns None if the entry is not a Text-type book.
    """
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return None

    ebook = root.find(f"{{{_PG}}}ebook")
    if ebook is None:
        return None

    # Media type filter — only Text books
    media_type_el = ebook.find(f"{{{_DC}}}type/{{{_DCAM}}}memberOf/../{{{_RDF}}}value")
    # Simpler check: look for any type element containing "Text"
    type_texts = [el.text or "" for el in ebook.iter(f"{{{_DC}}}type")]
    media_types = [el.text or "" for el in ebook.iter(f"{{{_DCAM}}}memberOf")]
    # Check rdf:value under dcterms:type
    for el in ebook.iter(f"{{{_RDF}}}value"):
        if "Text" in (el.text or ""):
            break
    else:
        # No "Text" media type found — skip
        return None

    # Book ID from rdf:about attribute
    about = ebook.get(f"{{{_RDF}}}about", "")
    # about = "ebooks/12345" or "https://www.gutenberg.org/ebooks/12345"
    book_id_str = about.rstrip("/").split("/")[-1]
    try:
        book_id = int(book_id_str)
    except ValueError:
        return None

    # Title
    title_el = ebook.find(f"{{{_DC}}}title")
    title = title_el.text.strip() if title_el is not None and title_el.text else ""

    # Authors
    authors = []
    for creator in ebook.findall(f"{{{_DC}}}creator"):
        agent = creator.find(f"{{{_PG}}}agent")
        if agent is not None:
            name_el = agent.find(f"{{{_PG}}}name")
            if name_el is not None and name_el.text:
                birth = agent.find(f"{{{_PG}}}birthdate")
                death = agent.find(f"{{{_PG}}}deathdate")
                authors.append({
                    "name": name_el.text.strip(),
                    "birth_year": int(birth.text) if birth is not None and birth.text else None,
                    "death_year": int(death.text) if death is not None and death.text else None,
                })

    # Subjects
    subjects = []
    for subj in ebook.findall(f"{{{_DC}}}subject"):
        val = subj.find(f"{{{_RDF}}}value")
        if val is not None and val.text:
            subjects.append(val.text.strip())

    # Languages
    languages = []
    for lang in ebook.findall(f"{{{_DC}}}language"):
        val = lang.find(f"{{{_RDF}}}value")
        if val is not None and val.text:
            languages.append(val.text.strip())

    # Download count
    dl_el = ebook.find(f"{{{_PG}}}downloads")
    download_count = int(dl_el.text) if dl_el is not None and dl_el.text else 0

    # Formats: build dict of mime_type -> url
    formats: Dict[str, str] = {}
    for file_el in ebook.findall(f"{{{_DC}}}hasFormat"):
        pg_file = file_el.find(f"{{{_PG}}}file")
        if pg_file is None:
            continue
        file_url = pg_file.get(f"{{{_RDF}}}about", "")
        for fmt in pg_file.findall(f"{{{_DC}}}format"):
            val = fmt.find(f"{{{_RDF}}}value")
            if val is not None and val.text and file_url:
                formats[val.text.strip()] = file_url

    return {
        "id": book_id,
        "title": title,
        "authors": authors,
        "subjects": subjects,
        "languages": languages,
        "download_count": download_count,
        "formats": formats,
        "bookshelves": [],
        "summaries": [],
    }


def iter_catalog_from_rdf_dump() -> Iterator[List[Dict[str, Any]]]:
    """
    Primary catalog source: downloads PG's official RDF dump tar.bz2
    (~300 MB compressed) to a temp file, then parses each per-book
    RDF/XML entry with r:bz2 (non-streaming) mode.

    Temp file is deleted on completion or failure. No third-party deps.
    """
    import tempfile

    print(f"[INFO] Downloading PG RDF catalog dump from {PG_RDF_DUMP_URL}...")
    req = _make_request(PG_RDF_DUMP_URL)
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".tar.bz2")
    try:
        # Stream-download in 4 MB chunks (~300 MB written to disk)
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=300) as resp:
            downloaded = 0
            with os.fdopen(tmp_fd, "wb") as fout:
                tmp_fd = -1  # ownership transferred to fdopen context
                while True:
                    chunk = resp.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    fout.write(chunk)
                    downloaded += len(chunk)
                    mb = downloaded // (1024 * 1024)
                    if mb % 50 == 0 and mb > 0:
                        print(f"[INFO] RDF dump: {mb} MB downloaded...")

        print(f"[INFO] RDF dump ready ({downloaded // (1024*1024)} MB). Parsing entries...")
        batch: List[Dict[str, Any]] = []

        # r:bz2 — non-streaming, random-access member reads (reliable)
        with tarfile.open(tmp_path, mode="r:bz2") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                # Only per-book RDF files: cache/epub/<id>/pg<id>.rdf
                if not member.name.endswith(".rdf"):
                    continue
                try:
                    f = tar.extractfile(member)
                    if f is None:
                        continue
                    content = f.read()
                except Exception:
                    continue
                book = _parse_rdf_ebook(content)
                if book is None:
                    continue
                batch.append(book)
                if len(batch) >= 32:
                    yield batch
                    batch = []
        if batch:
            yield batch
    finally:
        if tmp_fd != -1:
            try:
                os.close(tmp_fd)
            except OSError:
                pass
        try:
            os.unlink(tmp_path)
            print("[INFO] RDF dump temp file deleted.")
        except OSError:
            pass


def fetch_gutendex_page(page: int = 1, page_size: int = 32) -> Dict[str, Any]:
    """
    Fetches one page of the Gutendex book catalog.
    Returns parsed JSON dict with 'count', 'next', 'results' keys.
    """
    import json
    url = f"{GUTENDEX_BASE}?page={page}&mime_type=text%2Fplain"
    req = _make_request(url)
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def iter_catalog_pages(start_page: int = 1) -> Iterator[List[Dict[str, Any]]]:
    """
    Generator: yields lists of raw book dicts from Gutendex, page by page,
    until no next page exists. Handles 429/502/503/504 and transient network
    timeouts with exponential backoff (max 5 attempts per page).
    """
    RETRIABLE_HTTP = {429, 502, 503, 504}
    page = start_page
    while True:
        last_exc: Optional[Exception] = None
        for attempt in range(5):
            try:
                data = fetch_gutendex_page(page)
                last_exc = None
                break
            except urllib.error.HTTPError as e:
                if e.code in RETRIABLE_HTTP:
                    wait = 2 ** attempt * 10
                    print(f"[WARN] HTTP {e.code} on page {page} (attempt {attempt + 1}/5). Waiting {wait}s...")
                    time.sleep(wait)
                    last_exc = e
                else:
                    raise
            except (TimeoutError, OSError) as e:
                wait = 2 ** attempt * 10
                print(f"[WARN] Network error on page {page} (attempt {attempt + 1}/5): {e}. Retrying in {wait}s...")
                time.sleep(wait)
                last_exc = e
        if last_exc is not None:
            raise RuntimeError(f"Failed to fetch catalog page {page} after 5 attempts.") from last_exc

        results = data.get("results", [])
        if not results:
            break
        yield results

        if not data.get("next"):
            break
        page += 1
        time.sleep(0.5)



def pick_text_url(formats: Dict[str, str]) -> Optional[str]:
    """
    Picks the best plain-text download URL from a book's formats dict.
    Preference: UTF-8 > ASCII > generic text/plain.
    """
    preferred = [
        "text/plain; charset=utf-8",
        "text/plain; charset=us-ascii",
        "text/plain",
    ]
    for mime in preferred:
        url = formats.get(mime)
        if url:
            return url
    # Fallback: scan for any text/plain key
    for key, url in formats.items():
        if "text/plain" in key and url:
            return url
    return None


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"}
MAX_BOOK_IMAGES_BYTES = 50 * 1024 * 1024  # 50 MB total images cap per book


def pick_image_source_url(formats: Dict[str, str]) -> Optional[str]:
    """
    Finds the best archive containing illustrations/images for a book.
    Priority:
      1. EPUB with images (application/epub+zip with '.images' in URL)
      2. HTML zip archive (application/zip or 'h.zip')
      3. Generic EPUB (often contains images in OEBPS/images/)
    """
    # 1. Illustrated EPUB
    epub_url = formats.get("application/epub+zip")
    if epub_url and ("images" in epub_url or "epub.images" in epub_url):
        return epub_url

    # 2. HTML zip archive (usually named *-h.zip)
    for mime, url in formats.items():
        if ("zip" in mime or "zip" in url.lower()) and ("-h.zip" in url.lower() or "images" in url.lower()):
            return url

    # 3. Fallback to standard EPUB if present
    if epub_url:
        return epub_url

    return None


def fetch_book_images(
    book_id: int,
    formats: Dict[str, str],
    timeout: int = 60,
) -> List[Dict[str, Any]]:
    """
    Extracts all illustrations and cover images for a book.
    Returns list of dicts: [{'name': 'cover.jpg', 'bytes': b'...', 'size': int}]
    """
    import io
    import zipfile

    extracted: List[Dict[str, Any]] = []
    seen_names = set()
    total_bytes = 0

    # 1. Try extracting images from EPUB / Zip archive
    archive_url = pick_image_source_url(formats)
    if archive_url:
        try:
            req = _make_request(archive_url)
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
                data = resp.read(MAX_BOOK_IMAGES_BYTES)
                if data:
                    with zipfile.ZipFile(io.BytesIO(data)) as zf:
                        for info in zf.infolist():
                            if info.is_dir():
                                continue
                            # ZipBomb protection: skip individual files > 20 MB
                            if info.file_size > 20 * 1024 * 1024:
                                continue
                            lower_name = info.filename.lower()
                            ext = os.path.splitext(lower_name)[1]
                            if ext in IMAGE_EXTENSIONS:
                                img_bytes = zf.read(info.filename)
                                if total_bytes + len(img_bytes) > MAX_BOOK_IMAGES_BYTES:
                                    break
                                base_name = os.path.basename(info.filename)
                                if not base_name or base_name in seen_names:
                                    base_name = f"img_{len(extracted)}{ext}"
                                seen_names.add(base_name)
                                extracted.append({
                                    "name": base_name,
                                    "bytes": img_bytes,
                                    "size": len(img_bytes),
                                })
                                total_bytes += len(img_bytes)
        except Exception as e:
            # Non-fatal: book may not have readable archive or network timeout
            pass

    # 2. Check standalone cover image if no cover found in archive
    cover_url = formats.get("image/jpeg")
    if cover_url and not any("cover" in item["name"].lower() for item in extracted):
        try:
            req = _make_request(cover_url)
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=30) as resp:
                cover_bytes = resp.read(5 * 1024 * 1024)
                if cover_bytes and (total_bytes + len(cover_bytes) <= MAX_BOOK_IMAGES_BYTES):
                    extracted.append({
                        "name": "cover.jpg",
                        "bytes": cover_bytes,
                        "size": len(cover_bytes),
                    })
        except Exception:
            pass

    return extracted


def stream_book_text(text_url: str, timeout: int = 120) -> Optional[bytes]:
    """
    Downloads raw book text up to MAX_TEXT_BYTES.
    Returns raw bytes or None on failure.
    """
    req = _make_request(text_url)
    try:
        with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
            chunks: List[bytes] = []
            total = 0
            while True:
                chunk = resp.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                chunks.append(chunk)
                if total >= MAX_TEXT_BYTES:
                    break
            return b"".join(chunks)
    except (urllib.error.URLError, OSError) as e:
        print(f"[WARN] Failed to fetch text from {text_url}: {e}")
        return None

