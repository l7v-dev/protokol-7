#!/usr/bin/env python3
"""
DergiPark URL Backfill Script -- protokol-7

Backfills fulltext_url / article landing page URLs for all articles
in data/catalogs/dergipark_catalog.sqlite using:
1. OAI ListSets mapping (setName -> setSpec)
2. DOI pattern extraction (journal slug from DOI)
3. Direct OAI sample lookup for remaining high-volume journals
4. Persistent DOI fallback (https://doi.org/{doi})
"""

import os
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(REPO_ROOT, "data", "catalogs", "dergipark_catalog.sqlite")

sys.path.insert(0, os.path.join(REPO_ROOT, "pipelines", "api_stream", "dergipark"))
from downloader import DergiParkDownloader


def get_base_journal(j: str) -> str:
    """Extracts base journal name before volume/issue delimiters."""
    if not j:
        return ""
    return j.split(",")[0].strip()


def build_slug_map(db_conn: sqlite3.Connection, downloader: DergiParkDownloader) -> dict[str, str]:
    slug_map: dict[str, str] = {}

    # 1. Fetch OAI ListSets
    print("[1/4] Fetching OAI ListSets from DergiPark...", flush=True)
    try:
        raw_sets = downloader._fetch_raw("https://dergipark.org.tr/api/public/oai/?verb=ListSets")
        if raw_sets:
            root = ET.fromstring(raw_sets)
            for s in root.findall(".//{http://www.openarchives.org/OAI/2.0/}set"):
                spec_el = s.find("{http://www.openarchives.org/OAI/2.0/}setSpec")
                name_el = s.find("{http://www.openarchives.org/OAI/2.0/}setName")
                if spec_el is not None and name_el is not None and spec_el.text and name_el.text:
                    slug_map[name_el.text.strip()] = spec_el.text.strip()
            print(f"      Mapped {len(slug_map)} journals from ListSets.", flush=True)
    except Exception as e:
        print(f"      [WARN] Failed to fetch ListSets: {e}", flush=True)

    # 2. Extract slugs from existing DOIs in SQLite
    print("[2/4] Extracting journal slugs from DOIs in database...", flush=True)
    cur = db_conn.cursor()
    cur.execute("SELECT journal, doi FROM dergipark_articles WHERE doi != '';")
    doi_count = 0
    for j, doi in cur.fetchall():
        base_j = get_base_journal(j)
        if base_j in slug_map:
            continue
        m = re.search(r"10\.\d+/([a-zA-Z0-9_\-]+)", doi)
        if m:
            candidate = m.group(1).split(".")[0].lower()
            if len(candidate) > 2 and not candidate.isdigit():
                slug_map[base_j] = candidate
                doi_count += 1
    print(f"      Mapped {doi_count} additional journals from DOIs. Total mapped: {len(slug_map)}.", flush=True)

    # 3. Sample OAI GetRecord for remaining high-volume journals
    print("[3/4] Identifying top unmapped journals for OAI sampling...", flush=True)
    cur.execute("SELECT id, journal, doi FROM dergipark_articles;")
    unmapped_sample: dict[str, str] = {}
    unmapped_counts: dict[str, int] = {}
    for art_id, j, doi in cur.fetchall():
        base_j = get_base_journal(j)
        if base_j not in slug_map and not doi:
            unmapped_counts[base_j] = unmapped_counts.get(base_j, 0) + 1
            if base_j not in unmapped_sample:
                unmapped_sample[base_j] = art_id

    # Sort by count descending, sample journals with >= 50 articles
    target_samples = [
        (j, unmapped_sample[j], c)
        for j, c in sorted(unmapped_counts.items(), key=lambda x: x[1], reverse=True)
        if c >= 50
    ]
    print(f"      Sampling {len(target_samples)} top unmapped journals (>= 50 articles each)...", flush=True)

    sampled_count = 0
    for base_j, art_id, count in target_samples:
        clean_id = art_id.split("/")[-1] if "/" in art_id else art_id
        url = f"https://dergipark.org.tr/api/public/oai/?verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:dergipark.org.tr:article/{clean_id}"
        try:
            raw_xml = downloader._fetch_raw(url)
            if raw_xml:
                root = ET.fromstring(raw_xml)
                set_el = root.find(".//{http://www.openarchives.org/OAI/2.0/}setSpec")
                if set_el is not None and set_el.text:
                    spec = set_el.text.strip()
                    slug_map[base_j] = spec
                    sampled_count += 1
                    print(f"      [OK] '{base_j}' ({count} arts) -> {spec}", flush=True)
            time.sleep(0.2)
        except Exception as e:
            print(f"      [WARN] Failed to sample '{base_j}': {e}", flush=True)

    print(f"      Successfully sampled {sampled_count} journals. Final slug map size: {len(slug_map)}.", flush=True)
    return slug_map


def backfill_database() -> None:
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found at: {DB_PATH}")
        sys.exit(1)

    print(f"[DERGIPARK-BACKFILL] Connecting to SQLite: {DB_PATH}", flush=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT count(*) FROM dergipark_articles;")
    total_articles = cur.fetchone()[0]

    cur.execute("SELECT count(*) FROM dergipark_articles WHERE fulltext_url IS NOT NULL AND fulltext_url != '';")
    initial_populated = cur.fetchone()[0]
    print(f"[DERGIPARK-BACKFILL] Total articles: {total_articles} | Currently populated: {initial_populated}", flush=True)

    downloader = DergiParkDownloader()
    slug_map = build_slug_map(conn, downloader)

    print("[4/4] Updating fulltext_url for all records in SQLite...", flush=True)
    cur.execute("SELECT id, journal, doi, fulltext_url FROM dergipark_articles;")
    rows = cur.fetchall()

    updates = []
    slug_url_count = 0
    doi_url_count = 0
    unresolved_count = 0

    for art_id, journal, doi, existing_url in rows:
        base_j = get_base_journal(journal)
        clean_id = art_id.split("/")[-1] if "/" in art_id else art_id

        new_url = ""
        if base_j in slug_map:
            slug = slug_map[base_j]
            new_url = f"https://dergipark.org.tr/tr/pub/{slug}/article/{clean_id}"
            slug_url_count += 1
        elif doi:
            new_url = f"https://doi.org/{doi}"
            doi_url_count += 1
        else:
            unresolved_count += 1

        if new_url:
            updates.append((new_url, art_id))

    print(f"[DERGIPARK-BACKFILL] Applying {len(updates)} URL updates in single transaction...", flush=True)
    cur.execute("BEGIN IMMEDIATE;")
    cur.executemany("UPDATE dergipark_articles SET fulltext_url = ? WHERE id = ?;", updates)
    conn.commit()

    cur.execute("SELECT count(*) FROM dergipark_articles WHERE fulltext_url IS NOT NULL AND fulltext_url != '';")
    final_populated = cur.fetchone()[0]
    coverage = (final_populated / total_articles) * 100 if total_articles > 0 else 0.0

    print("============================================================================")
    print(f"[DERGIPARK-BACKFILL] Backfill Complete!")
    print(f"[DERGIPARK-BACKFILL] Total articles: {total_articles}")
    print(f"[DERGIPARK-BACKFILL] Direct DergiPark URLs: {slug_url_count} ({(slug_url_count/total_articles)*100:.2f}%)")
    print(f"[DERGIPARK-BACKFILL] Persistent DOI URLs:   {doi_url_count} ({(doi_url_count/total_articles)*100:.2f}%)")
    print(f"[DERGIPARK-BACKFILL] Total URLs Populated:  {final_populated} ({coverage:.2f}%)")
    print(f"[DERGIPARK-BACKFILL] Unresolved remaining: {unresolved_count} ({(unresolved_count/total_articles)*100:.2f}%)")
    print("============================================================================")
    conn.close()


if __name__ == "__main__":
    backfill_database()
