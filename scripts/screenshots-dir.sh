#!/usr/bin/env bash
# Usage: scripts/screenshots-dir.sh <web-dir> [out-dir]
# Capture store screenshots from a built Flutter web directory (build/web).
set -euo pipefail
[ $# -ge 1 ] || { echo "Usage: $0 <web-dir> [out-dir]" >&2; exit 2; }
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
WEB_DIR="$(abs_path "$1")"
[ -z "${2:-}" ] || OUT_DIR="$(abs_path "$2")"
[ -f "$WEB_DIR/index.html" ] || { echo "Error: $WEB_DIR/index.html not found" >&2; exit 1; }
setup_tool
run_capture --web-dir "$WEB_DIR"
