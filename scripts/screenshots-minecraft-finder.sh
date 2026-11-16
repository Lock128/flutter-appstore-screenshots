#!/usr/bin/env bash
# Usage: scripts/screenshots-minecraft-finder.sh [out-dir]
# Repository: https://github.com/Lock128/minecraft-finder
# Flutter project: minecraft-finder/flutter_app
# App URL: https://minecraft.lockhead.cloud
# Capture Minecraft Finder store screenshots using screenshots.config.minecraft-finder.json.
#
# This app has no login, so SCREENSHOT_USER and SCREENSHOT_PASSWORD are optional.
#
# Precedence (highest first): environment variables / out-dir argument,
# scripts/screenshots-minecraft-finder.local.sh (git-ignored), defaults below.
set -euo pipefail
ENV_OUT_DIR="${OUT_DIR:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# ----------------------------------------------------------------------------
# SETTINGS: edit here, or put them in scripts/screenshots-minecraft-finder.local.sh
# (git-ignored) so real credentials never end up in a commit.
# Anything already set in the environment wins over these defaults.
# ----------------------------------------------------------------------------
SCREENSHOT_USER="${SCREENSHOT_USER:-}"                  # Minecraft Finder login, e.g. you@example.com
SCREENSHOT_PASSWORD="${SCREENSHOT_PASSWORD:-}"          # Minecraft Finder password (never printed)
URL="${URL:-https://minecraft.lockhead.cloud}"                # app to capture
DEVICES="${DEVICES:-}"                                  # space separated presets, empty = all, e.g. "iphone-6.9 play-phone"
THEME="${THEME:-}"                                      # light | dark | both, empty = value from the config
OUT_DIR_SETTING="${OUT_DIR_SETTING:-}"                  # output directory, empty = ./screenshots
EXTRA_FLAGS="${EXTRA_FLAGS:-}"                          # extra CLI flags, e.g. "--max-screens 40 --nav-timeout 90000 --retries 3"
# ----------------------------------------------------------------------------

# Optional git-ignored local overrides. Values already in the environment still win.
LOCAL_FILE="$SCRIPT_DIR/screenshots-minecraft-finder.local.sh"
if [ -f "$LOCAL_FILE" ]; then
  _env_user="${SCREENSHOT_USER:-}"; _env_pw="${SCREENSHOT_PASSWORD:-}"
  _env_url="${URL:-}"; _env_dev="${DEVICES:-}"; _env_theme="${THEME:-}"; _env_extra="${EXTRA_FLAGS:-}"
  # shellcheck disable=SC1090
  source "$LOCAL_FILE"
  [ -z "$_env_user" ] || SCREENSHOT_USER="$_env_user"
  [ -z "$_env_pw" ] || SCREENSHOT_PASSWORD="$_env_pw"
  [ "$_env_url" = "https://minecraft.lockhead.cloud" ] || URL="$_env_url"
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

export SCREENSHOT_USER SCREENSHOT_PASSWORD DEVICES THEME OUT_DIR
export SCREENSHOTS_CONFIG="$REPO_ROOT/screenshots.config.minecraft-finder.json"

echo "Capturing $URL into $OUT_DIR"
setup_tool
# shellcheck disable=SC2086
run_capture --url "$URL" $EXTRA_FLAGS
