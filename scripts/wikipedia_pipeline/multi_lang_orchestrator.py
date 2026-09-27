#!/usr/bin/env python3
import argparse
import json
import os
import ssl
import sys
import time
import urllib.request
from typing import List, Dict, Tuple, Optional

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

from run_pipeline import execute_pipeline

# Reference metrics and sizes for Ancient/Historical, Regional and Major Languages
# Values represent content article counts (Namespace 0)
STATIC_WIKI_METRICS = {
    # 1. Antik ve Tarihi Diller (Ancient & Historical Languages)
    "got": 900,       # Gotça (Gothic)
    "arc": 1100,      # Aramice (Aramaic)
    "cu": 1200,       # Eski Kilise Slavcası (Old Church Slavonic)
    "ang": 4500,      # Eski İngilizce / Anglo-Sakson (Old English)
    "sa": 12000,      # Sanskritçe (Sanskrit)
    "lzh": 13500,     # Klasik Çince (Literary Chinese / 文言)
    "la": 140000,     # Latince (Latin)

    # 2. Türk Dilleri & Bölgesel Diller (Turkic & Regional)
    "tk": 7000,       # Türkmence (Turkmen)
    "ug": 13000,      # Uygurca (Uyghur)
    "ky": 80000,      # Kırgızca (Kyrgyz)
    "az": 218000,     # Azerice (Azerbaijani)
    "kk": 245000,     # Kazakça (Kazakh)
    "el": 273000,     # Yunanca (Greek)
    "uz": 364000,     # Özbekçe (Uzbek)
    "tt": 500000,     # Tatarca (Tatar)
    "tr": 701000,     # Türkçe (Turkish - Already completed)

    # 3. Orta Ölçekli Diller (Medium Scale)
    "fa": 1090000,    # Farsça (Persian)
    "ar": 1330000,    # Arapça (Arabic)
    "it": 1880000,    # İtalyanca (Italian)

    # 4. Büyük ve Devasa Diller (En Sona İndirilecekler)
    "es": 2050000,    # İspanyolca (Spanish)
    "ru": 2120000,    # Rusça (Russian)
    "fr": 2700000,    # Fransızca (French)
    "de": 3150000,    # Almanca (German)
    "en": 7050000,    # İngilizce (English - Largest, strictly last)
}

ANCIENT_LANGUAGES = ["got", "arc", "cu", "ang", "sa", "lzh", "la"]
DEFAULT_LANGUAGES = [
    # Önce antik diller (en küçükler)
    "got", "arc", "cu", "ang", "sa", "lzh", "la",
    # Sonra bölgesel ve Türk dilleri
    "tk", "ug", "ky", "az", "kk", "el", "uz", "tt",
    # Sonra orta diller
    "fa", "ar", "it",
    # En son devasa diller
    "es", "ru", "fr", "de", "en",
]


def discover_all_wikimedia_wikis() -> List[str]:
    """Queries Wikimedia sitematrix to discover all 340+ active language wikis."""
    url = "https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "protokol-7-llm-pipeline/1.0 (academic; l7v-research)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=SSL_CONTEXT) as resp:
            data = json.loads(resp.read().decode("utf-8")).get("sitematrix", {})
            langs = []
            for k, v in data.items():
                if isinstance(v, dict) and "site" in v:
                    code = v.get("code")
                    for s in v["site"]:
                        if s.get("code") == "wiki" and "closed" not in s:
                            if code:
                                langs.append(code)
            return sorted(list(set(langs)))
    except Exception as e:
        print(f"[WARN] Failed to query sitematrix: {e}. Falling back to default list.")
        return DEFAULT_LANGUAGES


def fetch_live_article_count(lang: str) -> Optional[int]:
    """Fetches real-time article count for a language wiki via Wikimedia API."""
    url = f"https://{lang}.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=statistics&format=json"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "protokol-7-llm-pipeline/1.0 (academic; l7v-research)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8, context=SSL_CONTEXT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return int(data["query"]["statistics"]["articles"])
    except Exception:
        return None


def get_sorted_languages(
    languages: List[str], ascending: bool = True
) -> List[Tuple[str, int]]:
    """
    Sorts language codes by article count.
    Smallest/least articles come first, largest come last.
    """
    metrics = []
    print("\n[INFO] Resolving article counts to enforce size-based ordering...")

    for lang in languages:
        count = fetch_live_article_count(lang)
        if count is None:
            count = STATIC_WIKI_METRICS.get(lang, 50000)
            print(f"[METRIC] {lang.upper():5}: {count:>10,} articles (reference scale)")
        else:
            print(f"[METRIC] {lang.upper():5}: {count:>10,} articles (live API)")
        metrics.append((lang, count))

    # Sort ascending: smallest article count first
    sorted_langs = sorted(metrics, key=lambda x: x[1], reverse=(not ascending))
    return sorted_langs


def parse_args():
    parser = argparse.ArgumentParser(
        description="Multi-Language Wikipedia LLM Orchestrator (Ascending Size-Ordered Queue)"
    )
    parser.add_argument(
        "--langs",
        default=None,
        help="Comma-separated language codes to process (e.g. got,cu,sa,la,az,uz)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process ALL 340+ active language wikis in Wikimedia",
    )
    parser.add_argument(
        "--ancient-only",
        action="store_true",
        help="Process ONLY ancient and historical languages (got, arc, cu, ang, sa, lzh, la)",
    )
    parser.add_argument(
        "--skip-completed",
        action="store_true",
        default=True,
        help="Skip languages that have already been processed into Parquet",
    )
    parser.add_argument(
        "--folder-id",
        default=None,
        help="Google Drive Target Root Folder ID",
    )
    parser.add_argument(
        "--credentials",
        default=None,
        help="Path to Google credentials.json or service_account.json",
    )
    parser.add_argument(
        "--max-part-gb",
        type=float,
        default=10.0,
        help="Maximum size per Parquet shard in GB (default: 10.0 GB)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10000,
        help="RAM buffering batch size before row group flush",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode (local sharding without Google API sync)",
    )
    parser.add_argument(
        "--clean-dump",
        action="store_true",
        default=True,
        help="Delete raw bz2 dump file immediately after each language finishes to save disk space",
    )
    parser.add_argument(
        "--limit-per-lang",
        type=int,
        default=None,
        help="Limit articles processed per language (useful for testing)",
    )
    parser.add_argument(
        "--fastest-mirror",
        action="store_true",
        default=True,
        help="Probe and select fastest Wikimedia mirror before downloading/streaming",
    )
    parser.add_argument(
        "--in-flight",
        action="store_true",
        help="Zero-Raw In-Flight Streaming: Stream and clean remote bz2 directly to Parquet without downloading dump to disk",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    if args.ancient_only:
        selected_langs = ANCIENT_LANGUAGES
    elif args.all:
        print("[INFO] Discovering all active language wikis from Wikimedia...")
        selected_langs = discover_all_wikimedia_wikis()
        print(f"[OK] Discovered {len(selected_langs)} language editions.")
    elif args.langs:
        selected_langs = [l.strip().lower() for l in args.langs.split(",") if l.strip()]
    else:
        selected_langs = DEFAULT_LANGUAGES

    # Sort languages strictly smallest to largest
    sorted_langs = get_sorted_languages(selected_langs, ascending=True)

    print("\n" + "=" * 70)
    print("MULTI-LANGUAGE WIKIPEDIA PIPELINE EXECUTION PLAN")
    print("RULE: Smallest languages are processed first, largest strictly last.")
    print("=" * 70)
    for idx, (lang, count) in enumerate(sorted_langs, 1):
        is_ancient = " (Ancient/Historical)" if lang in ANCIENT_LANGUAGES else ""
        print(f"  {idx:3d}. [{lang.upper():5}] ~{count:>10,} articles{is_ancient}")
    print("=" * 70 + "\n")

    overall_start = time.time()
    results = []

    for idx, (lang, count) in enumerate(sorted_langs, 1):
        # Skip if already completed (e.g. tr is already finished)
        if args.skip_completed:
            db_file = f"data/{lang}wiki_parquet/wikipedia_metadata.sqlite"
            if os.path.exists(db_file):
                try:
                    import sqlite3
                    with sqlite3.connect(db_file) as conn:
                        row = conn.execute("SELECT status FROM pipeline_runs WHERE status = 'COMPLETED' LIMIT 1").fetchone()
                        if row:
                            print(f"[SKIP] Language [{lang.upper()}] already completed in {db_file}. Skipping.")
                            continue
                except Exception:
                    pass
            manifest_candidate = f"data/{lang}wiki_parquet/metadata/{lang}wiki_20260925_manifest.json"
            if os.path.exists(manifest_candidate):
                print(f"[SKIP] Language [{lang.upper()}] already completed ({manifest_candidate}). Skipping.")
                continue

        print("\n" + "#" * 70)
        print(f"STARTING STAGE {idx}/{len(sorted_langs)}: LANGUAGE [{lang.upper()}] (~{count:,} articles)")
        print("#" * 70 + "\n")

        try:
            res = execute_pipeline(
                lang=lang,
                max_part_gb=args.max_part_gb,
                batch_size=args.batch_size,
                limit=args.limit_per_lang,
                credentials=args.credentials,
                folder_id=args.folder_id,
                clean_dump=args.clean_dump,
                dry_run=args.dry_run,
                in_flight=args.in_flight,
                fastest_mirror=args.fastest_mirror,
            )
            results.append(res)
            print(f"\n[OK] Completed language [{lang.upper()}] in {res['elapsed_min']:.2f} mins.")

        except Exception as e:
            print(f"\n[ERROR] Pipeline failed for language [{lang.upper()}]: {e}", file=sys.stderr)
            continue

    total_time_min = (time.time() - overall_start) / 60.0
    print("\n" + "=" * 70)
    print("MULTI-LANGUAGE PIPELINE RUN FINISHED")
    print(f"Total Languages Processed: {len(results)}/{len(sorted_langs)}")
    print(f"Total Execution Time     : {total_time_min:.2f} minutes")
    print("=" * 70)


if __name__ == "__main__":
    main()
