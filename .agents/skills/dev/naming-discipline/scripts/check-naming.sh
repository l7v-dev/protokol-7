#!/usr/bin/env bash
set -euo pipefail

# Banned buzzwords regex
BANNED_REGEX='(?i)\b(smart|intelligent|advanced|next-?gen|ultra|super|enhanced|optimized|seamless|powerful|ai-?powered|autonomous|robust|magical?|lightning)\b'

TARGET_DIR="${1:-.}"

echo "Scanning for marketing buzzwords in identifiers and file names under: $TARGET_DIR"

# Check file and folder names
echo "--- Checking File & Directory Names ---"
FOUND_FILES=$(find "$TARGET_DIR" -not -path '*/.*' -not -path '*/node_modules/*' | grep -P "$BANNED_REGEX" || true)

if [ -n "$FOUND_FILES" ]; then
  echo "WARNING: Found files/directories matching banned words:"
  echo "$FOUND_FILES"
else
  echo "No banned words found in filenames."
fi

# Check code contents (excluding .git, node_modules, dist, etc.)
echo "--- Checking Code Contents ---"
if command -v rg >/dev/null 2>&1; then
  rg -n -i --glob '!*.{lock,min.js,svg}' --glob '!node_modules/**' --glob '!.git/**' \
    '\b(smart|intelligent|advanced|next-?gen|ultra|super|enhanced|optimized|seamless|powerful|ai-?powered|autonomous|robust|magical?|lightning)\b' \
    "$TARGET_DIR" || echo "No banned words found in code contents."
else
  grep -rnEI --exclude-dir={.git,node_modules,.next,dist} \
    -E "(smart|intelligent|advanced|next-?gen|ultra|super|enhanced|optimized|seamless|powerful|ai-?powered|autonomous|robust|magical?|lightning)" \
    "$TARGET_DIR" || echo "No banned words found in code contents."
fi
