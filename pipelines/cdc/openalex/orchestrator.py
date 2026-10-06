"""Bounded OpenAlex delta CLI; raw metadata is durable before page checkpoints advance."""

import argparse
import hashlib
import json
import os
import sqlite3
import time
import tempfile
from pathlib import Path

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))
from pipelines.shared.producer_provenance import report_producer_error, producer_run

from pipelines.cdc.openalex.downloader import DeltaClient, DeltaError
from pipelines.cdc.openalex.ledger import DeltaLedger


def fsync_directory(path):
    directory_fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def durable_directory(path):
    missing = []
    parent = path
    while not parent.exists():
        missing.append(parent)
        parent = parent.parent
    for directory in reversed(missing):
        directory.mkdir(exist_ok=True)
        fsync_directory(directory.parent)


def persist_page(root, state, payload):
    encoded = (json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n").encode("utf8")
    digest = hashlib.sha256(encoded).hexdigest()
    directory = Path(root).resolve() / "raw" / "openalex" / state["window"]["run_id"]
    durable_directory(directory)
    path = directory / (digest + ".json")
    temporary_fd, temporary_path = tempfile.mkstemp(prefix=".delta-", dir=directory)
    try:
        with os.fdopen(temporary_fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary_path, path)
        except FileExistsError:
            if path.read_bytes() != encoded:
                raise ValueError("Raw artifact hash collision or corruption")
    finally:
        os.unlink(temporary_path)
    fsync_directory(directory)
    return str(path), digest


def run_delta(ledger, fetch_page, output_dir, since, until, max_pages=10, delay_seconds=1):
    if max_pages <= 0 or delay_seconds < 0:
        raise ValueError("Invalid page or delay budget")
    state = ledger.open_window(since, until)
    processed = 0
    for _ in range(max_pages):
        payload = fetch_page(state["window"])
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list) or not isinstance(payload.get("meta"), dict) or "next_cursor" not in payload["meta"]:
            raise ValueError("Malformed delta response; checkpoint preserved")
        records = payload["results"]
        if len(records) > 100:
            raise ValueError("Delta page exceeds the record bound")
        next_cursor = payload["meta"]["next_cursor"]
        if not records and next_cursor is not None:
            raise ValueError("Empty nonterminal delta page; checkpoint preserved")
        path, digest = persist_page(output_dir, state, payload)
        state = ledger.commit_page(state, records, next_cursor, path, digest)
        processed += len(records)
        if "window" not in state:
            return {"status": "success", "records": processed, "watermark": state["watermark"]}
        time.sleep(delay_seconds)
    return {"status": "partial", "records": processed, "watermark": state["watermark"]}


@producer_run("openalex-cdc")
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", required=True)
    parser.add_argument("--until", required=True)
    parser.add_argument("--ledger", default="data/cdc/openalex/ledger.sqlite")
    parser.add_argument("--output-dir", default="data/cdc/openalex")
    parser.add_argument("--max-pages", type=int, default=10)
    parser.add_argument("--max-requests", type=int, default=10)
    parser.add_argument("--max-bytes", type=int, default=10 * 1024**2)
    parser.add_argument("--max-seconds", type=int, default=300)
    args = parser.parse_args()
    try:
        client = DeltaClient(os.environ.get("OPENALEX_API_KEY"), args.max_requests, args.max_bytes, args.max_seconds)
        ledger = DeltaLedger(args.ledger)
        print(json.dumps(run_delta(ledger, client.fetch_page, args.output_dir, args.since, args.until, args.max_pages)))
    except (DeltaError, ValueError, OSError, sqlite3.Error, KeyError, TypeError):
        print("[ERROR] Delta run stopped. Check access, budget and the saved window.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
