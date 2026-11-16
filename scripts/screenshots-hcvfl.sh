#!/usr/bin/env bash
# Usage: scripts/screenshots-hcvfl.sh [out-dir]
# Capture HCVFL store screenshots using screenshots.config.hcvfl.json.
#
# Precedence (highest first): environment variables / out-dir argument,
# scripts/screenshots-hcvfl.local.sh (git-ignored), defaults below.
set -euo pipefail
ENV_OUT_DIR="${OUT_DIR:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# ----------------------------------------------------------------------------
# SETTINGS: edit here, or put them in scripts/screenshots-hcvfl.local.sh
# (git-ignored) so real credentials never end up in a commit.
# Anything already set in the environment wins over these defaults.
# ----------------------------------------------------------------------------
SCREENSHOT_USER="${SCREENSHOT_USER:-}"                  # HCVFL login, e.g. you@example.com
SCREENSHOT_PASSWORD="${SCREENSHOT_PASSWORD:-}"          # HCVFL password (never printed)
URL="${URL:-https://app.hcvfl.de}"                # app to capture
DEVICES="${DEVICES:-}"                                  # space separated presets, empty = all, e.g. "iphone-6.9 play-phone"
THEME="${THEME:-}"                                      # light | dark | both, empty = value from the config
OUT_DIR_SETTING="${OUT_DIR_SETTING:-}"                  # output directory, empty = ./screenshots
EXTRA_FLAGS="${EXTRA_FLAGS:-}"                          # extra CLI flags, e.g. "--max-screens 40 --nav-timeout 90000 --retries 3"
# ----------------------------------------------------------------------------

# Optional git-ignored local overrides. Values already in the environment still win.
LOCAL_FILE="$SCRIPT_DIR/screenshots-hcvfl.local.sh"
if [ -f "$LOCAL_FILE" ]; then
  _env_user="${SCREENSHOT_USER:-}"; _env_pw="${SCREENSHOT_PASSWORD:-}"
  _env_url="${URL:-}"; _env_dev="${DEVICES:-}"; _env_theme="${THEME:-}"; _env_extra="${EXTRA_FLAGS:-}"
  # shellcheck disable=SC1090
  source "$LOCAL_FILE"
  [ -z "$_env_user" ] || SCREENSHOT_USER="$_env_user"
  [ -z "$_env_pw" ] || SCREENSHOT_PASSWORD="$_env_pw"
  [ "$_env_url" = "https://app.hcvfl.de" ] || URL="$_env_url"
  [ -z "$_env_dev" ] || DEVICES="$_env_dev"
  [ -z "$_env_theme" ] || THEME="$_env_theme"
  [ -z "$_env_extra" ] || EXTRA_FLAGS="$_env_extra"
fi

# Output directory: argument > OUT_DIR env > OUT_DIR_SETTING > ./screenshots.
if [ -n "${1:-}" ]; then
  OUT_DIR="$(abs_path "$1")"
elif [ -z "$ENV_OUT_DIR" ] && [ -n "$OUT_DIR_SETTING" ]; then
  OUT_DIR="$(abs_path "$OUT_DIR_SETTING")"
fi

is_placeholder() {
  case "$1" in
    ""|"your-"*|"YOUR_"*|"changeme"|"CHANGE_ME"|"<"*">") return 0 ;;
    *) return 1 ;;
  esac
}
if is_placeholder "$SCREENSHOT_USER" || is_placeholder "$SCREENSHOT_PASSWORD"; then
  {
    echo "Error: SCREENSHOT_USER and SCREENSHOT_PASSWORD are not set."
    echo "Set them in the SETTINGS block of $0, in $LOCAL_FILE (git-ignored),"
    echo "or in the environment: SCREENSHOT_USER=... SCREENSHOT_PASSWORD=... $0"
  } >&2
  exit 1
fi

export SCREENSHOT_USER SCREENSHOT_PASSWORD DEVICES THEME OUT_DIR
export SCREENSHOTS_CONFIG="$REPO_ROOT/screenshots.config.hcvfl.json"

echo "Capturing $URL into $OUT_DIR (credentials loaded, not shown)"
setup_tool
# shellcheck disable=SC2086
run_capture --url "$URL" $EXTRA_FLAGS
