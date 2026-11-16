#!/usr/bin/env bash
# Usage: scripts/screenshots.sh <url> [out-dir]
# Capture store screenshots (all devices, light and dark) from a running Flutter web app.
set -euo pipefail
[ $# -ge 1 ] || { echo "Usage: $0 <url> [out-dir]" >&2; exit 2; }
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
URL="$1"
[ -z "${2:-}" ] || OUT_DIR="$(abs_path "$2")"
setup_tool
run_capture --url "$URL"
