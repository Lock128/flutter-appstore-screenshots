#!/usr/bin/env bash
# Usage: scripts/screenshots-local.sh [flutter-project-dir] [out-dir]
# Build a Flutter project for web (default: current directory) and capture screenshots.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
PROJECT="$(abs_path "${1:-.}")"
[ -z "${2:-}" ] || OUT_DIR="$(abs_path "$2")"
[ -f "$PROJECT/pubspec.yaml" ] || { echo "Error: $PROJECT/pubspec.yaml not found" >&2; exit 1; }
command -v flutter >/dev/null || { echo "Error: flutter is not on PATH" >&2; exit 1; }
(cd "$PROJECT" && flutter build web --release --pwa-strategy none)
setup_tool
run_capture --web-dir "$PROJECT/build/web"
