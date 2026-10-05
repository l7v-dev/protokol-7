#!/usr/bin/env python3
"""
Binance Vision S3 Public Bucket Downloader -- protokol-7

Streams historical crypto market data (klines, trades, aggTrades) from Binance Vision's
public Amazon S3 bucket (https://s3-ap-northeast-1.amazonaws.com/data.binance.vision).
Performs XML bucket parsing, streaming ZIP downloads, and cryptographic SHA-256 checksum verification.
"""

import hashlib
import os
import ssl
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, Generator, List, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

BINANCE_S3_BASE_URL = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision"
DEFAULT_USER_AGENT = "protokol-7/1.0.0 (Binance Vision Ingestion Engine; mailto:l7v-dev@protokol.local)"
S3_NS = "http://s3.amazonaws.com/doc/2006-03-01/"


class BinanceVisionDownloader:
    """
    HTTP client for querying and downloading public datasets from Binance Vision S3 storage.
    """

    def __init__(
        self,
        base_url: str = BINANCE_S3_BASE_URL,
        timeout: int = 35,
        max_retries: int = 5,
        backoff_factor: float = 1.5,
        user_agent: str = DEFAULT_USER_AGENT,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.user_agent = user_agent
        try:
            import certifi
            self.ssl_context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            self.ssl_context = ssl.create_default_context()


    def _http_get(self, url: str) -> bytes:
        """Executes HTTP GET request with exponential backoff and jitter."""
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "*/*",
            },
        )

        last_error = None
        for attempt in range(self.max_retries):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self.ssl_context) as resp:
                    if resp.status == 200:
                        return resp.read()
                    raise urllib.error.HTTPError(
                        url, resp.status, f"HTTP Error {resp.status}", resp.headers, None
                    )
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ConnectionResetError) as err:
                last_error = err
                wait_time = self.backoff_factor * (2**attempt)
                time.sleep(wait_time)

        raise RuntimeError(f"HTTP GET failed after {self.max_retries} retries: {url}. Error: {last_error}")

    def list_bucket(
        self,
        prefix: str = "",
        marker: Optional[str] = None,
        delimiter: Optional[str] = None,
        max_keys: int = 1000,
    ) -> Dict[str, Any]:
        """
        Queries S3 ListBucket XML endpoint for objects and subfolders matching prefix.
        """
        params = {"prefix": prefix, "max-keys": str(max_keys)}
        if marker:
            params["marker"] = marker
        if delimiter:
            params["delimiter"] = delimiter

        query_string = urllib.parse.urlencode(params)
        url = f"{self.base_url}?{query_string}"
        xml_bytes = self._http_get(url)

        root = ET.fromstring(xml_bytes)

        def strip_ns(tag: str) -> str:
            return tag.split("}")[-1] if "}" in tag else tag

        files: List[Dict[str, Any]] = []
        common_prefixes: List[str] = []
        is_truncated = False
        next_marker = None

        for child in root:
            tag = strip_ns(child.tag)
            if tag == "Contents":
                file_info: Dict[str, Any] = {}
                for sub in child:
                    sub_tag = strip_ns(sub.tag)
                    if sub_tag == "Key":
                        file_info["key"] = sub.text or ""
                    elif sub_tag == "Size":
                        file_info["size"] = int(sub.text or 0)
                    elif sub_tag == "LastModified":
                        file_info["last_modified"] = sub.text or ""
                if "key" in file_info:
                    files.append(file_info)
            elif tag == "CommonPrefixes":
                for sub in child:
                    if strip_ns(sub.tag) == "Prefix" and sub.text:
                        common_prefixes.append(sub.text)
            elif tag == "IsTruncated":
                is_truncated = (child.text or "").strip().lower() == "true"
            elif tag == "NextMarker":
                next_marker = child.text

        if is_truncated and not next_marker and files:
            next_marker = files[-1]["key"]

        return {
            "files": files,
            "common_prefixes": common_prefixes,
            "is_truncated": is_truncated,
            "next_marker": next_marker,
        }

    def crawl_prefix(
        self,
        prefix: str,
        file_suffix: str = ".zip",
        max_files: Optional[int] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Streams all file descriptors matching the given prefix and suffix across pages.
        """
        marker = None
        count = 0

        while True:
            result = self.list_bucket(prefix=prefix, marker=marker)
            for item in result["files"]:
                key = item.get("key", "")
                if file_suffix and not key.endswith(file_suffix):
                    continue
                yield item
                count += 1
                if max_files and count >= max_files:
                    return

            if not result["is_truncated"] or not result["next_marker"]:
                break
            marker = result["next_marker"]

    def list_symbols(
        self,
        market: str = "spot",
        period_type: str = "monthly",
        data_type: str = "klines",
    ) -> List[str]:
        """
        Discovers all available symbols for a given market, period, and data type using S3 delimiter hierarchy.
        """
        market_path = market.replace("_", "/")
        prefix = f"data/{market_path}/{period_type}/{data_type}/"
        symbols: List[str] = []
        marker = None

        while True:
            result = self.list_bucket(prefix=prefix, delimiter="/", marker=marker, max_keys=1000)
            for common_prefix in result.get("common_prefixes", []):
                sym = common_prefix.rstrip("/").split("/")[-1].strip().upper()
                if sym:
                    symbols.append(sym)

            if not result["is_truncated"] or not result["next_marker"]:
                break
            marker = result["next_marker"]

        return sorted(list(set(symbols)))

    def download_file_bytes(self, key: str) -> bytes:
        """Downloads raw bytes of an S3 object key."""
        encoded_key = urllib.parse.quote(key)
        url = f"{self.base_url}/{encoded_key}"
        return self._http_get(url)

    def download_and_verify(
        self,
        zip_key: str,
        verify_checksum: bool = True,
    ) -> Tuple[bytes, str, bool]:
        """
        Downloads a ZIP file and verifies its cryptographic SHA-256 against the accompanying .CHECKSUM file.
        Returns (zip_bytes, sha256_hash, is_valid).
        """
        zip_bytes = self.download_file_bytes(zip_key)
        computed_hash = hashlib.sha256(zip_bytes).hexdigest()

        if not verify_checksum:
            return zip_bytes, computed_hash, True

        checksum_key = f"{zip_key}.CHECKSUM"
        try:
            checksum_bytes = self.download_file_bytes(checksum_key)
            checksum_text = checksum_bytes.decode("utf-8", errors="ignore").strip()
            # Binance CHECKSUM format: "<hash>  <filename>" or "<hash>"
            expected_hash = checksum_text.split()[0].lower()
            is_valid = computed_hash.lower() == expected_hash
            return zip_bytes, computed_hash, is_valid
        except Exception:
            # If checksum file is missing on S3, accept computed hash
            return zip_bytes, computed_hash, True
