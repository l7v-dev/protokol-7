#!/usr/bin/env python3
"""
OpenAlex S3 Snapshot Downloader & Partitions Manager -- protokol-7

Fetches the official OpenAlex manifest and downloads individual works partitions
via high-throughput HTTPS / AWS S3 CLI with automatic retries and zero disk residue.
"""

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional

OPENALEX_MANIFEST_S3 = "s3://openalex/data/parquet/manifest.json"
OPENALEX_MANIFEST_HTTPS = "https://openalex.s3.amazonaws.com/data/parquet/manifest.json"
S3_PREFIX = "s3://openalex/"
HTTPS_PREFIX = "https://openalex.s3.amazonaws.com/"


def s3_to_https_url(s3_url: str) -> str:
    """Converts s3://openalex/... URI to https://openalex.s3.amazonaws.com/..."""
    if s3_url.startswith(S3_PREFIX):
        return HTTPS_PREFIX + s3_url[len(S3_PREFIX) :]
    return s3_url


def fetch_manifest(
    cache_path: Optional[str] = None, force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Downloads or reads the cached OpenAlex snapshot manifest.
    Manifest contains total record counts, file lists, and byte sizes.
    """
    if cache_path and os.path.exists(cache_path) and not force_refresh:
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "entities" in data:
                    print(f"[DOWNLOADER] Loaded cached manifest from: {cache_path}")
                    return data
        except Exception as e:
            print(f"[WARN] Failed to load cached manifest: {e}. Re-fetching...")

    print(f"[DOWNLOADER] Fetching manifest from {OPENALEX_MANIFEST_HTTPS}...")
    headers = {"User-Agent": "protokol-7-openalex-snapshot-client/1.0"}
    req = urllib.request.Request(OPENALEX_MANIFEST_HTTPS, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            content = resp.read()
            manifest = json.loads(content.decode("utf-8"))
    except Exception as err:
        print(f"[WARN] HTTPS manifest download failed: {err}. Attempting aws CLI fallback...")
        cmd = ["aws", "s3", "cp", OPENALEX_MANIFEST_S3, "-", "--no-sign-request"]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        manifest = json.loads(res.stdout.decode("utf-8"))

    if cache_path:
        os.makedirs(os.path.dirname(os.path.abspath(cache_path)), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print(f"[DOWNLOADER] Saved manifest cache: {cache_path}")

    return manifest


def extract_works_partitions(manifest: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extracts all works partition files from the manifest with normalized metadata.
    """
    entities = manifest.get("entities", [])
    works_entity = next((e for e in entities if e.get("entity") == "works"), None)
    if not works_entity:
        raise ValueError("Could not find 'works' entity in OpenAlex manifest.")

    raw_files = works_entity.get("files", [])
    partitions: List[Dict[str, Any]] = []

    for idx, f_entry in enumerate(raw_files):
        s3_url = f_entry.get("url", "")
        meta = f_entry.get("meta", {})
        content_length = int(meta.get("content_length") or 0)
        record_count = int(meta.get("record_count") or 0)

        partitions.append(
            {
                "index": idx,
                "s3_url": s3_url,
                "https_url": s3_to_https_url(s3_url),
                "content_length": content_length,
                "record_count": record_count,
            }
        )

    return partitions


def download_partition(
    partition: Dict[str, Any],
    target_path: str,
    max_retries: int = 3,
    chunk_size: int = 1024 * 1024,
) -> str:
    """
    Downloads an S3 partition Parquet file to target_path with size verification.
    """
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    expected_size = partition.get("content_length", 0)

    # If file already exists and size matches, reuse it
    if os.path.exists(target_path):
        current_size = os.path.getsize(target_path)
        if expected_size > 0 and current_size == expected_size:
            print(f"[DOWNLOADER] Partition already present and verified: {target_path}")
            return target_path

    s3_url = partition["s3_url"]
    https_url = partition.get("https_url") or s3_to_https_url(s3_url)
    filename = os.path.basename(target_path)

    for attempt in range(1, max_retries + 1):
        # Prefer AWS CLI if installed for reliable zero-SSL-headache streaming
        t0 = time.time()
        try:
            cmd = ["aws", "s3", "cp", s3_url, target_path, "--no-sign-request"]
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if res.returncode == 0 and os.path.exists(target_path):
                actual_size = os.path.getsize(target_path)
                if expected_size <= 0 or actual_size == expected_size:
                    elapsed = max(0.1, time.time() - t0)
                    speed_mb = (actual_size / 1024**2) / elapsed
                    print(
                        f"[DOWNLOADER] Downloaded via AWS CLI: {filename} "
                        f"({actual_size / 1024**2:.2f} MB, {speed_mb:.2f} MB/s)"
                    )
                    return target_path
        except Exception:
            pass

        # Fallback to HTTPS urllib with custom or unverified SSL context if system certs issue
        try:
            import ssl
            ssl_ctx = ssl.create_default_context()
            try:
                import certifi
                ssl_ctx.load_verify_locations(cafile=certifi.where())
            except Exception:
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE

            headers = {"User-Agent": "protokol-7-openalex-snapshot-client/1.0"}
            req = urllib.request.Request(https_url, headers=headers)

            with urllib.request.urlopen(req, timeout=120, context=ssl_ctx) as resp, open(target_path, "wb") as out:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    out.write(chunk)

            elapsed = max(0.1, time.time() - t0)
            actual_size = os.path.getsize(target_path)

            if expected_size > 0 and actual_size != expected_size:
                raise ValueError(
                    f"Size mismatch for {filename}: expected {expected_size}, got {actual_size}"
                )

            speed_mb = (actual_size / 1024**2) / elapsed
            print(
                f"[DOWNLOADER] Downloaded via HTTPS: {filename} ({actual_size / 1024**2:.2f} MB, {speed_mb:.2f} MB/s)"
            )
            return target_path

        except Exception as err:
            print(f"[WARN] Download attempt {attempt} failed for {filename}: {err}")
            if os.path.exists(target_path):
                os.remove(target_path)

            if attempt == max_retries:
                raise RuntimeError(
                    f"Failed to download partition {s3_url} after {max_retries} attempts: {err}"
                )
            time.sleep(2 * attempt)

    raise RuntimeError("Unexpected download termination.")


def cleanup_partition(target_path: str) -> None:
    """Safely removes local downloaded partition to ensure zero disk residue."""
    if os.path.exists(target_path):
        try:
            size_mb = os.path.getsize(target_path) / (1024 * 1024)
            os.remove(target_path)
            print(f"[CLEANUP] Deleted raw partition: {os.path.basename(target_path)} (Freed: {size_mb:.2f} MB)")
        except Exception as err:
            print(f"[WARN] Failed to delete raw partition {target_path}: {err}", file=sys.stderr)
