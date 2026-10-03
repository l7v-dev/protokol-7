#!/usr/bin/env bash
# Starts the OpenAlex pipeline detached from the current terminal.
# Usage: ./scripts/run_openalex.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$REPO/logs/openalex.log"
PYTHON="$REPO/.venv/bin/python"
SCRIPT="$REPO/pipelines/api_stream/openalex/orchestrator.py"

mkdir -p "$REPO/logs"

nohup "$PYTHON" -u "$SCRIPT" --all >> "$LOG" 2>&1 &
PID=$!

echo "[OK] OpenAlex pipeline started — PID: $PID"
echo "[OK] Log: $LOG"
echo "     Monitor: tail -f $LOG"
echo "     Stop:    kill $PID"
