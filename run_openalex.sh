#!/usr/bin/env bash
# Starts the OpenAlex pipeline detached from the current terminal.
# Usage: ./run_openalex.sh
set -euo pipefail

REPO="/home/l7v/l7v-dev/play/protokol-7"
LOG="$REPO/logs/openalex.log"
PYTHON="$REPO/.venv/bin/python"
SCRIPT="$REPO/scripts/openalex_pipeline/orchestrator.py"

mkdir -p "$REPO/logs"

nohup "$PYTHON" -u "$SCRIPT" --all >> "$LOG" 2>&1 &
PID=$!

echo "[OK] OpenAlex pipeline started — PID: $PID"
echo "[OK] Log: $LOG"
echo "     Monitor: tail -f $LOG"
echo "     Stop:    kill $PID"
