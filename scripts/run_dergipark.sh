#!/usr/bin/env bash
# Starts the DergiPark continuous pipeline detached from the current terminal.
# Usage: ./scripts/run_dergipark.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$REPO/logs/dergipark.log"
PYTHON="$REPO/.venv/bin/python"
SCRIPT="$REPO/pipelines/api_stream/dergipark/orchestrator.py"

mkdir -p "$REPO/logs"
export PYTHONUNBUFFERED=1

setsid nohup "$PYTHON" -u "$SCRIPT" --all --max-records 0 --batch-size 1000 --max-shard-records 50000 --shard-size-mb 512 >> "$LOG" 2>&1 &
PID=$!

echo "[OK] DergiPark pipeline started -- PID: $PID"
echo "[OK] Log: $LOG"
echo "     Monitor: tail -f $LOG"
echo "     Stop:    kill $PID"
