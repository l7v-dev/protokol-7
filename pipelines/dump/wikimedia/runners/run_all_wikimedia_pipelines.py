#!/usr/bin/env python3
"""
Master Wikimedia Multi-Corpus Pipeline Coordinator — protokol-7

Sequentially coordinates zero-disk dump harvesting and Parquet ETL for:
1. Wikibooks (122 language editions)
2. Wikiversity (17 language editions)
3. Wikivoyage (27 language editions)

Architecture:
- Sequential pipeline execution to guarantee zero I/O contention, avoid Google Drive 429 quota limits,
  and maximize throughput with a 4 GB RAM ceiling.
- SQLite-backed state ledgers for complete fault isolation and seamless resumption.
- Automated Google Drive v3 synchronization with MD5 validation and immediate local purge.
"""

import argparse
import datetime
import os
import subprocess
import sys
import time
from typing import List, Dict, Any

def find_repo_root() -> str:
    cur = os.path.abspath(os.path.dirname(__file__))
    while cur and cur != os.path.dirname(cur):
        if os.path.exists(os.path.join(cur, "package.json")):
            return cur
        cur = os.path.dirname(cur)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))

PROJECT_ROOT = find_repo_root()
VENV_PYTHON = os.path.join(PROJECT_ROOT, ".venv", "bin", "python")
if not os.path.exists(VENV_PYTHON):
    VENV_PYTHON = sys.executable

PIPELINES = [
    {
        "name": "Wikibooks",
        "script": "pipelines/dump/wikimedia/wikibooks/orchestrator.py",
        "catalog": "data/catalogs/wikibooks_catalog.sqlite",
    },
    {
        "name": "Wikiversity",
        "script": "pipelines/dump/wikimedia/wikiversity/orchestrator.py",
        "catalog": "data/catalogs/wikiversity_catalog.sqlite",
    },
    {
        "name": "Wikivoyage",
        "script": "pipelines/dump/wikimedia/wikivoyage/orchestrator.py",
        "catalog": "data/catalogs/wikivoyage_catalog.sqlite",
    },
]


def print_banner(text: str) -> None:
    width = 76
    print(f"\n{'=' * width}\n[COORDINATOR] {text}\n{'=' * width}")


def run_pipeline(
    pipeline_def: Dict[str, Any],
    extra_args: List[str],
) -> int:
    name = pipeline_def["name"]
    script_rel = pipeline_def["script"]
    script_abs = os.path.join(PROJECT_ROOT, script_rel)

    cmd = [VENV_PYTHON, script_abs] + extra_args
    print_banner(f"Launching {name} Pipeline ({' '.join(cmd)})")

    start_time = time.time()
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=PROJECT_ROOT,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        ret_code = proc.wait()
        elapsed = time.time() - start_time
        if ret_code == 0:
            print(f"\n[OK] {name} completed successfully in {elapsed:.1f}s.")
        else:
            print(f"\n[ERROR] {name} exited with status code {ret_code} in {elapsed:.1f}s.", file=sys.stderr)
        return ret_code
    except KeyboardInterrupt:
        print(f"\n[WARN] Interrupted while running {name}. Terminating subprocess...")
        proc.terminate()
        return 130
    except Exception as e:
        print(f"\n[ERROR] Failed to execute {name}: {e}", file=sys.stderr)
        return 1


def show_all_statuses() -> None:
    print_banner("Aggregated Wikimedia Harvest Status")
    for pipe in PIPELINES:
        script_abs = os.path.join(PROJECT_ROOT, pipe["script"])
        cmd = [VENV_PYTHON, script_abs, "--status"]
        subprocess.run(cmd, cwd=PROJECT_ROOT)


def main():
    parser = argparse.ArgumentParser(description="Master Wikimedia Multi-Corpus Pipeline Coordinator")
    parser.add_argument(
        "--pipeline",
        choices=["all", "wikibooks", "wikiversity", "wikivoyage"],
        default="all",
        help="Target pipeline to run (default: all)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Dry run: harvest 50 items per language")
    parser.add_argument("--no-drive", action="store_true", help="Disable Drive upload (keep local files)")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of languages per pipeline")
    parser.add_argument("--status", action="store_true", help="Display catalog status across all pipelines")
    args = parser.parse_args()

    if args.status:
        show_all_statuses()
        return

    forward_args = ["--all"]
    if args.dry_run:
        forward_args.append("--dry-run")
    if args.no_drive:
        forward_args.append("--no-drive")
    if args.limit > 0:
        forward_args.extend(["--limit", str(args.limit)])

    targets = []
    if args.pipeline == "all":
        targets = PIPELINES
    else:
        targets = [p for p in PIPELINES if p["name"].lower() == args.pipeline.lower()]

    print_banner(f"Starting execution plan for: {', '.join(p['name'] for p in targets)}")
    total_start = time.time()
    results = {}

    for pipe in targets:
        code = run_pipeline(pipe, forward_args)
        results[pipe["name"]] = code
        if code != 0:
            print(f"[WARN] Pipeline {pipe['name']} finished with code {code}. Continuing to next pipeline...")

    total_elapsed = time.time() - total_start
    print_banner(f"All requested pipelines completed in {total_elapsed / 60:.2f} minutes.")
    print("Summary:")
    for name, code in results.items():
        status_str = "SUCCESS" if code == 0 else f"EXIT CODE {code}"
        print(f" - {name:15s}: {status_str}")


if __name__ == "__main__":
    main()
