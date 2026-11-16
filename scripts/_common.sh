#!/usr/bin/env bash
# Shared helpers. Source this file; do not run it directly.
# Optional env: DEVICES (space separated), THEME (light|dark|both), OUT_DIR,
# SCREENSHOT_USER, SCREENSHOT_PASSWORD, SCREENSHOTS_CONFIG.

CALLER_DIR="$PWD"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Make a path absolute relative to where the user ran the script.
abs_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$CALLER_DIR/$1" ;;
  esac
}

OUT_DIR="$(abs_path "${OUT_DIR:-screenshots}")"

setup_tool() {
  cd "$REPO_ROOT"
  command -v node >/dev/null || { echo "Error: node (>=20) is required" >&2; exit 1; }
  [ -d node_modules ] || npm ci
  [ -f dist/cli.js ] || npm run build
  if ! ls "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/chromium-* >/dev/null 2>&1; then
    npx playwright install chromium
  fi
}

# run_capture <--url URL | --web-dir DIR>
run_capture() {
  local cfg="${SCREENSHOTS_CONFIG:-}" args=()
  TMP_CONFIG=""
  if [ -n "$cfg" ]; then
    cfg="$(abs_path "$cfg")"
  else
    TMP_CONFIG="$(mktemp "${TMPDIR:-/tmp}/screenshots-config.XXXXXX")"
    trap '[ -z "$TMP_CONFIG" ] || rm -f "$TMP_CONFIG"' EXIT
    cfg="$TMP_CONFIG"
    printf '%s\n' '{"url":"http://placeholder.invalid","enableSemantics":true,"screens":[{"name":"home"}]}' > "$cfg"
  fi
  args=(capture --config "$cfg" "$@" --out "$OUT_DIR")
  # Only override the config theme when THEME is set explicitly.
  [ -z "${THEME:-}" ] || args+=(--theme "$THEME")
  # shellcheck disable=SC2206
  [ -z "${DEVICES:-}" ] || args+=(--device ${DEVICES})
  node dist/cli.js "${args[@]}"
}
