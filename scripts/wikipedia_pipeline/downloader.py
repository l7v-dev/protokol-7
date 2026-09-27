#!/usr/bin/env python3
"""
scripts/wikipedia_pipeline/downloader.py

Unified Wikimedia Dump Downloader with Multi-Part HTTP Range Parallel Downloads
and In-Flight MD5 Verification.
"""

import argparse
import concurrent.futures
import hashlib
import os
import ssl
import sys
import threading
import urllib.error
import urllib.request
import io
import time
import urllib.parse
from typing import Optional, List, Tuple

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

WIKIMEDIA_MIRRORS: List[str] = [
    "https://dumps.wikimedia.org",
    "https://dumps.wikimedia.your.org",
    "https://mirror.accum.se/mirror/wikimedia.org/dumps",
    "https://dumps.wikimedia.cl.uzh.ch",
]


class StreamHashReader(io.RawIOBase):
    """
    Wraps an underlying binary stream to compute in-flight cryptographic hashes
    (MD5) and update progress counters transparently without writing to disk.
    """

    def __init__(self, raw_stream, hasher=None, progress_bar=None):
        self.raw_stream = raw_stream
        self.hasher = hasher or hashlib.md5()
        self.progress_bar = progress_bar
        self.bytes_read = 0

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        if size == -1 or size is None:
            chunk = self.raw_stream.read()
        else:
            chunk = self.raw_stream.read(size)
        if chunk:
            self.hasher.update(chunk)
            self.bytes_read += len(chunk)
            if self.progress_bar is not None:
                self.progress_bar.update(len(chunk))
        return chunk

    def readinto(self, b) -> int:
        if hasattr(self.raw_stream, "readinto"):
            n = self.raw_stream.readinto(b)
        else:
            data = self.read(len(b))
            n = len(data)
            b[:n] = data
            return n

        if n and n > 0:
            self.hasher.update(b[:n])
            self.bytes_read += n
            if self.progress_bar is not None:
                self.progress_bar.update(n)
        return n or 0

    def get_hash(self) -> str:
        return self.hasher.hexdigest().lower()

    def close(self):
        if hasattr(self.raw_stream, "close"):
            try:
                self.raw_stream.close()
            except Exception:
                pass
        super().close()


def find_fastest_wikimedia_mirror(
    dump_url: str,
    mirrors: Optional[List[str]] = None,
    timeout: float = 3.0,
) -> str:
    """
    Probes candidate Wikimedia mirrors concurrently and returns the mirror URL
    with the lowest round-trip latency. Falls back to original dump_url if all fail.
    """
    parsed = urllib.parse.urlparse(dump_url)
    if not parsed.scheme.startswith("http"):
        return dump_url

    path = parsed.path
    candidate_mirrors = mirrors or WIKIMEDIA_MIRRORS
    headers = {"User-Agent": "protokol-7-llm-pipeline/1.0 (mirror-probe)"}

    def probe_mirror(base_url: str) -> Optional[Tuple[float, str]]:
        target = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
        t0 = time.perf_counter()
        try:
            req = urllib.request.Request(target, headers=headers, method="HEAD")
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT) as resp:
                if resp.status in (200, 206):
                    elapsed = time.perf_counter() - t0
                    return (elapsed, target)
        except Exception:
            pass
        return None

    results: List[Tuple[float, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(candidate_mirrors)) as executor:
        futures = [executor.submit(probe_mirror, m) for m in candidate_mirrors]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res is not None:
                results.append(res)

    if not results:
        return dump_url

    results.sort(key=lambda x: x[0])
    fastest_latency, fastest_url = results[0]
    print(
        f"[INFO] Selected fastest Wikimedia mirror ({fastest_latency * 1000:.1f}ms): {fastest_url}"
    )
    return fastest_url


def calculate_md5(file_path: str, chunk_size: int = 4194304) -> str:
    """Calculates the MD5 checksum of a local file in 4MB chunks."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def fetch_expected_md5(md5_url: str, target_filename: str) -> Optional[str]:
    """Fetches and parses the official md5sums.txt from Wikimedia."""
    try:
        req = urllib.request.Request(
            md5_url,
            headers={"User-Agent": "protokol-7-llm-pipeline/1.0 (academic; l7v-research)"},
        )
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            for line in content.splitlines():
                parts = line.strip().split()
                if len(parts) >= 2:
                    checksum, fname = parts[0], parts[1]
                    if (
                        fname.endswith("pages-articles.xml.bz2")
                        and not fname.endswith("multistream.xml.bz2")
                    ):
                        return checksum.lower()
                    if os.path.basename(fname) == target_filename or fname == target_filename:
                        return checksum.lower()
    except Exception as e:
        print(f"[WARN] Failed to fetch md5sums.txt: {e}", file=sys.stderr)
    return None


def fetch_head_info(url: str) -> tuple[int, bool]:
    """Inspects Content-Length and Accept-Ranges support via HEAD request."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "protokol-7-llm-pipeline/1.0 (academic; l7v-research)"},
            method="HEAD",
        )
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            content_length = int(resp.headers.get("Content-Length", 0))
            accept_ranges = resp.headers.get("Accept-Ranges", "").lower() == "bytes"
            return content_length, accept_ranges
    except Exception:
        return 0, False


def download_file_sequential(
    url: str,
    output_path: str,
    expected_md5: Optional[str] = None,
    force: bool = False,
    block_size: int = 4194304,
) -> str:
    """Sequential single-stream download with in-flight MD5 verification."""
    temp_path = f"{output_path}.part"
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    existing_bytes = os.path.getsize(temp_path) if os.path.exists(temp_path) else 0

    hasher = hashlib.md5()
    if existing_bytes > 0:
        with open(temp_path, "rb") as existing_f:
            while True:
                b = existing_f.read(block_size)
                if not b:
                    break
                hasher.update(b)

    headers = {"User-Agent": "protokol-7-llm-pipeline/1.0 (academic; l7v-research)"}
    if existing_bytes > 0:
        headers["Range"] = f"bytes={existing_bytes}-"
        print(f"[INFO] Resuming sequential download from byte {existing_bytes}: {url}")
    else:
        print(f"[INFO] Starting sequential download: {url} -> {output_path}")

    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as resp:
            content_range = resp.headers.get("Content-Range")
            if content_range:
                total_size = int(content_range.split("/")[-1])
            else:
                total_size = existing_bytes + int(resp.headers.get("Content-Length", 0))

            mode = "ab" if existing_bytes > 0 else "wb"

            with open(temp_path, mode) as f:
                if tqdm:
                    with tqdm(
                        total=total_size,
                        initial=existing_bytes,
                        unit="B",
                        unit_scale=True,
                        desc="[DOWNLOAD]",
                        ascii=True,
                    ) as bar:
                        while True:
                            buffer = resp.read(block_size)
                            if not buffer:
                                break
                            f.write(buffer)
                            hasher.update(buffer)
                            bar.update(len(buffer))
                else:
                    downloaded = existing_bytes
                    while True:
                        buffer = resp.read(block_size)
                        if not buffer:
                            break
                        f.write(buffer)
                        hasher.update(buffer)
                        downloaded += len(buffer)
                        if total_size > 0:
                            pct = (downloaded / total_size) * 100.0
                            sys.stdout.write(f"\r[DOWNLOAD] {downloaded / 1048576:.1f} MB / {total_size / 1048576:.1f} MB ({pct:.1f}%)")
                            sys.stdout.flush()
                    print()

    except urllib.error.HTTPError as e:
        if e.code != 416:
            raise

    actual_md5 = hasher.hexdigest().lower()
    if expected_md5:
        expected_normalized = expected_md5.lower().strip()
        if actual_md5 != expected_normalized:
            print(
                f"[ERROR] In-flight MD5 mismatch! Expected: {expected_normalized}, Actual: {actual_md5}",
                file=sys.stderr,
            )
            raise RuntimeError(f"MD5 mismatch for {url}: expected {expected_normalized}, got {actual_md5}")
        print(f"[OK] In-flight MD5 verified: {actual_md5}")
    else:
        print(f"[INFO] In-flight MD5 calculated: {actual_md5}")

    os.replace(temp_path, output_path)
    print(f"[INFO] Download completed: {output_path}")
    return output_path


def download_file_multipart(
    url: str,
    output_path: str,
    total_size: int,
    expected_md5: Optional[str] = None,
    concurrency: int = 4,
    block_size: int = 4194304,
) -> str:
    """
    Downloads a file using multiple concurrent HTTP Range requests.
    Writes chunks directly into a pre-allocated sparse file in parallel.
    """
    temp_path = f"{output_path}.part"
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    print(
        f"[INFO] Starting multi-part parallel download ({concurrency} workers, {total_size / 1048576:.1f} MB): {url}"
    )

    # Pre-allocate sparse file to target size
    with open(temp_path, "wb") as f:
        f.truncate(total_size)

    chunk_size = total_size // concurrency
    ranges = []
    for i in range(concurrency):
        start = i * chunk_size
        end = (i + 1) * chunk_size - 1 if i < concurrency - 1 else total_size - 1
        ranges.append((i, start, end))

    progress_lock = threading.Lock()
    bar = None
    if tqdm:
        bar = tqdm(
            total=total_size,
            unit="B",
            unit_scale=True,
            desc=f"[PARALLEL x{concurrency}]",
            ascii=True,
        )

    def _worker(worker_id: int, start: int, end: int) -> None:
        headers = {
            "User-Agent": "protokol-7-llm-pipeline/1.0 (academic; l7v-research)",
            "Range": f"bytes={start}-{end}",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as resp:
            status = resp.status if hasattr(resp, "status") else resp.getcode()
            if status != 206:
                raise RuntimeError(f"Server did not return HTTP 206 Partial Content (got {status})")

            with open(temp_path, "r+b") as target_f:
                target_f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    to_read = min(block_size, remaining)
                    buf = resp.read(to_read)
                    if not buf:
                        break
                    target_f.write(buf)
                    remaining -= len(buf)
                    if bar:
                        with progress_lock:
                            bar.update(len(buf))

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [
                executor.submit(_worker, w_id, start, end)
                for w_id, start, end in ranges
            ]
            for future in concurrent.futures.as_completed(futures):
                future.result()
    finally:
        if bar:
            bar.close()

    os.replace(temp_path, output_path)

    # Verify MD5
    if expected_md5:
        if not verify_file_md5(output_path, expected_md5):
            raise RuntimeError(f"MD5 mismatch for {url}: expected {expected_md5}")
    else:
        actual_md5 = calculate_md5(output_path)
        print(f"[INFO] Post-download MD5 calculated: {actual_md5}")

    print(f"[INFO] Parallel download completed: {output_path}")
    return output_path


def download_file(
    url: str,
    output_path: str,
    expected_md5: Optional[str] = None,
    force: bool = False,
    concurrency: int = 4,
    min_multipart_bytes: int = 33554432,  # 32 MB threshold for parallel range
    block_size: int = 4194304,
) -> str:
    """
    Downloads a file with automatic multi-part parallel acceleration if supported,
    falling back seamlessly to single-stream in-flight MD5 verification.
    """
    if os.path.exists(output_path) and not force:
        print(f"[INFO] File already exists: {output_path}")
        if expected_md5:
            if verify_file_md5(output_path, expected_md5):
                return output_path
            print(f"[WARN] Existing file MD5 mismatch. Re-downloading: {output_path}", file=sys.stderr)
        else:
            return output_path

    # Check for multi-part eligibility
    if concurrency > 1:
        total_size, accept_ranges = fetch_head_info(url)
        if accept_ranges and total_size >= min_multipart_bytes:
            try:
                return download_file_multipart(
                    url=url,
                    output_path=output_path,
                    total_size=total_size,
                    expected_md5=expected_md5,
                    concurrency=concurrency,
                    block_size=block_size,
                )
            except Exception as e:
                print(
                    f"[WARN] Parallel download failed ({e}). Removing partial sparse file and falling back to sequential mode...",
                    file=sys.stderr,
                )
                temp_path = f"{output_path}.part"
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except OSError:
                        pass

    # Fallback / Sequential
    return download_file_sequential(
        url=url,
        output_path=output_path,
        expected_md5=expected_md5,
        force=force,
        block_size=block_size,
    )


def verify_file_md5(file_path: str, expected_md5: str) -> bool:
    """Verifies that the file MD5 matches the expected hash."""
    print(f"[INFO] Calculating local MD5 for {file_path}...")
    actual_md5 = calculate_md5(file_path)
    is_valid = actual_md5.lower() == expected_md5.lower()
    if is_valid:
        print(f"[OK] MD5 verified: {actual_md5}")
    else:
        print(
            f"[ERROR] MD5 mismatch! Expected: {expected_md5}, Actual: {actual_md5}",
            file=sys.stderr,
        )
    return is_valid


def parse_args():
    parser = argparse.ArgumentParser(
        description="Unified Wikimedia Dump Downloader with Multi-Part Range Parallelism"
    )
    parser.add_argument("--url", required=True, help="Wikimedia dump URL to download")
    parser.add_argument("--dest", required=True, help="Target destination file path")
    parser.add_argument("--expected-md5", default=None, help="Expected MD5 hash")
    parser.add_argument("--md5-url", default=None, help="Official md5sums.txt URL")
    parser.add_argument(
        "--concurrency",
        "-c",
        type=int,
        default=4,
        help="Number of concurrent worker threads (default: 4)",
    )
    parser.add_argument("--force", action="store_true", help="Force re-download")
    return parser.parse_args()


def main():
    args = parse_args()
    expected = args.expected_md5
    if not expected and args.md5_url:
        target_name = os.path.basename(args.url)
        expected = fetch_expected_md5(args.md5_url, target_name)
    download_file(
        args.url,
        args.dest,
        expected_md5=expected,
        force=args.force,
        concurrency=args.concurrency,
    )


if __name__ == "__main__":
    main()
