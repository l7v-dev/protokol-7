#!/usr/bin/env python3
"""
Text Normalization, PII Masking, Language Detection, and Quality Filtering Engine.
Integrates Unicode NFKC, tiktoken BPE tokenization, Lingua language identification,
regex PII redaction, and Gopher/FineWeb-style quality filters.
"""

from collections import Counter
import html
import re
import unicodedata
from typing import Optional, Tuple

try:
    import regex as reg
except ImportError:
    reg = re

try:
    import tiktoken
    _TIKTOKEN_ENCODING = tiktoken.get_encoding("cl100k_base")
except Exception:
    _TIKTOKEN_ENCODING = None

try:
    from lingua import Language, LanguageDetectorBuilder
    _LINGUA_DETECTOR = LanguageDetectorBuilder.from_all_languages().build()
except Exception:
    _LINGUA_DETECTOR = None

# Control characters regex: ASCII 0-31 and 127, excluding \t (9) and \n (10)
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
ZERO_WIDTH_RE = re.compile(r"[\u200b\u200c\u200d\u200e\u200f\ufeff]")
EXCESS_NEWLINES_RE = re.compile(r"\n{3,}")
EXCESS_SPACES_RE = re.compile(r"[^\S\r\n]{2,}")

# PII Patterns
EMAIL_RE = reg.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b")
PHONE_RE = reg.compile(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")
IBAN_RE = reg.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b")
JWT_SECRET_RE = reg.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9_-]{10,}\b")


class TextNormalizer:
    """Normalizes text into clean, standardized Unicode strings suitable for LLM tokenization."""

    @staticmethod
    def normalize(text: str, mask_pii: bool = True) -> str:
        """Applies full normalization pipeline: NFKC, control chars, zero-width spaces, whitespace, and PII."""
        if not text:
            return ""

        # Step 1: Decode HTML entities
        cleaned = html.unescape(text)

        # Step 2: Unicode NFKC standard
        cleaned = unicodedata.normalize("NFKC", cleaned)

        # Step 3: Remove control characters and zero-width artifacts
        cleaned = CONTROL_CHAR_RE.sub("", cleaned)
        cleaned = ZERO_WIDTH_RE.sub("", cleaned)

        # Step 4: Mask Sensitive PII if requested
        if mask_pii:
            cleaned = EMAIL_RE.sub("[EMAIL_REDACTED]", cleaned)
            cleaned = PHONE_RE.sub("[PHONE_REDACTED]", cleaned)
            cleaned = IBAN_RE.sub("[FINANCIAL_REDACTED]", cleaned)
            cleaned = JWT_SECRET_RE.sub("[SECRET_REDACTED]", cleaned)

        # Step 5: Normalize whitespace
        cleaned = EXCESS_SPACES_RE.sub(" ", cleaned)
        cleaned = EXCESS_NEWLINES_RE.sub("\n\n", cleaned)

        return cleaned.strip()


class LanguageIdentifier:
    """High-accuracy language identification using Lingua with confidence scoring."""

    @staticmethod
    def detect(text: str) -> Tuple[str, float]:
        """
        Detects language of given text.
        Returns: (iso_code: str, confidence: float)
        """
        if not text or len(text.strip()) < 20 or _LINGUA_DETECTOR is None:
            return "und", 0.0

        try:
            result = _LINGUA_DETECTOR.compute_language_confidence_values(text)
            if result:
                top_match = result[0]
                lang_code = top_match.language.iso_code_639_1.name.lower()
                return lang_code, float(top_match.value)
        except Exception:
            pass

        return "und", 0.0


class QualityFilter:
    """Gopher / FineWeb heuristic filter to eliminate spam, machine-generated gibberish, and malformed documents."""

    def __init__(
        self,
        min_chars: int = 100,
        min_words: int = 20,
        min_mean_word_length: float = 3.0,
        max_mean_word_length: float = 15.0,
        max_repeated_line_ratio: float = 0.35,
        max_symbol_ratio: float = 0.25,
    ):
        self.min_chars = min_chars
        self.min_words = min_words
        self.min_mean_word_length = min_mean_word_length
        self.max_mean_word_length = max_mean_word_length
        self.max_repeated_line_ratio = max_repeated_line_ratio
        self.max_symbol_ratio = max_symbol_ratio

    def evaluate(self, text: str) -> Tuple[bool, Optional[str]]:
        """
        Evaluates text against heuristic filters.
        Returns: (passed: bool, rejection_reason: Optional[str])
        """
        char_count = len(text)
        if char_count < self.min_chars:
            return False, f"too_short_chars ({char_count} < {self.min_chars})"

        words = text.split()
        word_count = len(words)
        if word_count < self.min_words:
            return False, f"too_few_words ({word_count} < {self.min_words})"

        mean_word_len = sum(len(w) for w in words) / word_count
        if not (self.min_mean_word_length <= mean_word_len <= self.max_mean_word_length):
            return False, f"abnormal_word_length ({mean_word_len:.2f})"

        # Check symbol-to-character ratio (excluding spaces, letters, digits, and common punctuation)
        symbol_count = len(re.findall(r"[\#\$\%\^\&\*\~\|\=\+\<\>\{\}\[\]\\]", text))
        symbol_ratio = symbol_count / char_count
        if symbol_ratio > self.max_symbol_ratio:
            return False, f"high_symbol_ratio ({symbol_ratio:.2f} > {self.max_symbol_ratio})"

        # Check line repetition ratio (prevents repetitive crawler loops or header/footer spam)
        lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 10]
        if len(lines) >= 5:
            line_counts = Counter(lines)
            most_common_line, count = line_counts.most_common(1)[0]
            rep_ratio = count / len(lines)
            if rep_ratio > self.max_repeated_line_ratio:
                return False, f"high_repeated_line_ratio ({rep_ratio:.2f} > {self.max_repeated_line_ratio})"

        return True, None


def estimate_token_count(text: str) -> int:
    """
    Computes exact reference token count via tiktoken (cl100k_base / GPT-4 / Llama-3 BPE),
    or falls back to 1.33x word count heuristic if tiktoken is uninitialized.
    """
    if _TIKTOKEN_ENCODING is not None:
        try:
            return len(_TIKTOKEN_ENCODING.encode(text, disallowed_special=()))
        except Exception:
            pass

    words = text.split()
    return max(1, int(len(words) * 1.33))
