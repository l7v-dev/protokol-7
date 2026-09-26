#!/usr/bin/env python3
import pytest
from multi_lang_orchestrator import get_sorted_languages, STATIC_WIKI_METRICS


def test_get_sorted_languages_ascending_order():
    # Provide unordered mixed list of languages
    input_langs = ["en", "az", "de", "kk", "fa"]
    sorted_result = get_sorted_languages(input_langs, ascending=True)

    extracted_codes = [lang for lang, _ in sorted_result]

    # Expected: az (smallest, ~218k) -> kk (~245k) -> fa (~1.09M) -> de (~3.15M) -> en (~7.05M)
    assert extracted_codes == ["az", "kk", "fa", "de", "en"]

    # Verify counts strictly ascending
    counts = [cnt for _, cnt in sorted_result]
    for i in range(len(counts) - 1):
        assert counts[i] <= counts[i + 1], f"Order violation at index {i}"


def test_static_metrics_presence():
    for lang in ["az", "kk", "uz", "el", "fa", "ar", "ru", "en"]:
        assert lang in STATIC_WIKI_METRICS
        assert STATIC_WIKI_METRICS[lang] > 0
