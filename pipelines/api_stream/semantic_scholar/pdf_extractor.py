#!/usr/bin/env python3
"""
Semantic Scholar PDF Text Extractor -- protokol-7

Stage 1 of the 3-tier PDF extraction pipeline.
Attempts native text extraction from open-access PDFs using pdfminer.six.
Records which papers need OCR (Stage 2/3 in Colab) without blocking the main pipeline.

Extraction tiers:
  Stage 1 (this module): pdfminer.six -- native text layer for born-digital PDFs.
  Stage 2 (Colab):       Tesseract OCR -- for scanned PDFs with no text layer.
  Stage 3 (Colab GPU):   baidu/Unlimited-OCR or Qwen2.5-VL-7B -- for complex/mixed layouts.

Output fields added to each record:
  pdf_text       str   Extracted text. Empty string if extraction failed or not OA.
  pdf_ocr_needed int   1 = needs Colab OCR (born-digital failed or clearly scanned).
                        0 = text extracted or not open access.
  pdf_char_count int   Character count of pdf_text (0 if empty).
"""

import io
import ssl
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()

try:
    from pdfminer.high_level import extract_text_to_fp
    from pdfminer.layout import LAParams
    _PDFMINER_AVAILABLE = True
except ImportError:
    _PDFMINER_AVAILABLE = False

# Maximum PDF size to attempt download (bytes). Larger files are skipped.
MAX_PDF_BYTES    = 15 * 1024 * 1024   # 15 MB
PDF_FETCH_TIMEOUT = 45                 # seconds
PDF_FETCH_RETRIES = 2
# Minimum character count to consider extraction successful.
MIN_TEXT_CHARS   = 200

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; s2-pdf-extractor)"


from contextvars import ContextVar
from pipelines.shared.producer_provenance import capture_bytes
_PDF_EVIDENCE = ContextVar("s2_pdf_evidence", default=None)

def _fetch_pdf_bytes(url: str) -> Optional[bytes]:
    """
    Downloads a PDF from url. Returns raw bytes or None on error/size-exceeded.
    Respects MAX_PDF_BYTES by streaming with content-length check.
    """
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, PDF_FETCH_RETRIES + 1):
        try:
            with urllib.request.urlopen(
                req, context=_SSL_CONTEXT, timeout=PDF_FETCH_TIMEOUT
            ) as resp:
                content_length = resp.headers.get("Content-Length")
                if content_length and int(content_length) > MAX_PDF_BYTES:
                    return None

                chunks = []
                total  = 0
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_PDF_BYTES:
                        return None
                    chunks.append(chunk)
                return b"".join(chunks)

        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503) and attempt < PDF_FETCH_RETRIES:
                time.sleep(5 * attempt)
            else:
                return None
        except Exception:
            if attempt < PDF_FETCH_RETRIES:
                time.sleep(3)
            else:
                return None

    return None


def _extract_text_pdfminer(pdf_bytes: bytes) -> str:
    """
    Runs pdfminer.six extraction on raw PDF bytes.
    Returns cleaned text string, or empty string on failure.
    """
    if not _PDFMINER_AVAILABLE:
        return ""
    try:
        buf = io.BytesIO(pdf_bytes)
        out = io.StringIO()
        extract_text_to_fp(
            buf, out,
            laparams=LAParams(
                line_margin=0.5,
                word_margin=0.1,
                boxes_flow=0.5,
                detect_vertical=False,
            ),
            output_type="text",
            codec="utf-8",
        )
        text = out.getvalue()
        # Collapse excessive whitespace while preserving paragraph breaks
        import re
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"\n{4,}", "\n\n\n", text)
        return text.strip()
    except Exception:
        return ""


def extract_pdf(url: str) -> Tuple[str, int, int]:
    """
    Downloads and extracts text from a PDF at `url`.

    Returns:
        (pdf_text, pdf_ocr_needed, pdf_char_count)

        pdf_text:       Extracted text, empty string on failure.
        pdf_ocr_needed: 1 if OCR is needed (no/minimal text extracted), else 0.
        pdf_char_count: len(pdf_text).
    """
    _PDF_EVIDENCE.set(None)
    if not url:
        return "", 0, 0

    pdf_bytes = _fetch_pdf_bytes(url)
    if not pdf_bytes:
        # Could not download. Not flagging as ocr_needed -- may be access-gated.
        return "", 0, 0

    _PDF_EVIDENCE.set(capture_bytes(pdf_bytes, "semantic_scholar", url))
    text = _extract_text_pdfminer(pdf_bytes)
    char_count = len(text)

    if char_count >= MIN_TEXT_CHARS:
        return text, 0, char_count

    # Text layer empty or minimal -- mark for Colab OCR stage.
    return "", 1, 0


def enrich_record_with_pdf(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Adds pdf_text, pdf_ocr_needed, pdf_char_count to a cleaner.build_record() output.
    Only fetches PDF when is_open_access=1 and oa_pdf_url is non-empty.
    Mutates and returns the record dict.
    """
    if record.get("is_open_access") == 1 and record.get("oa_pdf_url"):
        pdf_text, pdf_ocr_needed, pdf_char_count = extract_pdf(record["oa_pdf_url"])
    else:
        pdf_text, pdf_ocr_needed, pdf_char_count = "", 0, 0

    record["pdf_text"]       = pdf_text
    record["pdf_ocr_needed"] = pdf_ocr_needed
    record["pdf_char_count"] = pdf_char_count
    record["_pdf_raw_evidence"] = _PDF_EVIDENCE.get()
    return record


if __name__ == "__main__":
    # Standalone smoke test: pass a PDF URL as argv[1]
    if len(sys.argv) < 2:
        print("Usage: pdf_extractor.py <pdf_url>", file=sys.stderr)
        sys.exit(1)

    url_arg = sys.argv[1]
    print(f"[INFO] Fetching: {url_arg}", file=sys.stderr)
    text_out, ocr_needed_out, char_count_out = extract_pdf(url_arg)
    print(f"[RESULT] ocr_needed={ocr_needed_out}, chars={char_count_out}")
    if text_out:
        print("--- Text preview (first 500 chars) ---")
        print(text_out[:500])
