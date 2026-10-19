#!/usr/bin/env bash
# Gemini Bridge - Background & Headless Browser Launcher
# Runs Chrome in the background without needing a visible tab open on your screen.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$DIR/chrome-extension"
PROFILE_DIR="${GEMINI_BRIDGE_PROFILE:-$HOME/.config/gemini-bridge-profile}"
TARGET_URL="https://gemini.google.com"
MODE="headless"

if [[ "$(basename "$0")" == *"standalone"* ]]; then
  MODE="standalone"
fi

SPECIFIED_PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --login|-l)
      MODE="login"
      shift
      ;;
    --standalone|-s)
      MODE="standalone"
      shift
      ;;
    --headless)
      MODE="headless"
      shift
      ;;
    --profile|-p)
      SPECIFIED_PROFILE="$2"
      shift 2
      ;;
    --profile=*)
      SPECIFIED_PROFILE="${1#*=}"
      shift
      ;;
    --help|-h)
      MODE="help"
      shift
      ;;
    http://*|https://*)
      TARGET_URL="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

RESOLVED_PROFILE_DIR=""
if [ -n "$SPECIFIED_PROFILE" ]; then
  RESOLVED_PROFILE_DIR=$(node -e '
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const target = process.argv[1];
    const localStatePath = path.join(os.homedir(), "Library/Application Support/Google/Chrome/Local State");
    if (fs.existsSync(localStatePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
        const infoCache = data.profile?.info_cache || {};
        for (const [dir, info] of Object.entries(infoCache)) {
          if (dir.toLowerCase() === target.toLowerCase()) { console.log(dir); process.exit(0); }
          if (info.name && info.name.toLowerCase() === target.toLowerCase()) { console.log(dir); process.exit(0); }
          if (info.user_name && info.user_name.toLowerCase() === target.toLowerCase()) { console.log(dir); process.exit(0); }
        }
      } catch {}
    }
    console.log(target);
  ' "$SPECIFIED_PROFILE" 2>/dev/null || echo "$SPECIFIED_PROFILE")
fi

CHROME_BIN="${CHROME_BIN:-${CHROME_PATH:-}}"

if [ -z "$CHROME_BIN" ]; then
  CANDIDATES=(
    "google-chrome-stable"
    "google-chrome"
    "chromium"
    "chromium-browser"
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  )
  for bin in "${CANDIDATES[@]}"; do
    if command -v "$bin" &>/dev/null || [ -x "$bin" ]; then
      CHROME_BIN="$bin"
      break
    fi
  done
fi

if [ -z "$CHROME_BIN" ]; then
  echo "Error: No Chrome or Chromium binary found in PATH or standard application directories."
  echo "Set CHROME_BIN to the executable path (e.g. export CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')."
  exit 1
fi

mkdir -p "$PROFILE_DIR"

if [ "$MODE" == "help" ]; then
  echo "Usage: $(basename "$0") [OPTIONS] [URL]"
  echo ""
  echo "Options:"
  echo "  --profile, -p     Launch with specific Chrome profile name, email, or directory (e.g. Bantam)"
  echo "  --standalone, -s  Open visible standalone Chrome tab with extension loaded"
  echo "  --login, -l       Open visible browser once to log into your account"
  echo "  --headless        Launch invisible background daemon (default for launch-headless.sh)"
  echo "  --help, -h        Display this help message"
  echo ""
  echo "URLs:"
  echo "  https://gemini.google.com (default)"
  echo "  https://chatgpt.com"
  echo "  https://claude.ai"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") --standalone               # Run visible browser window"
  echo "  $(basename "$0") --login                    # Log in once"
  echo "  $(basename "$0") https://claude.ai          # Run with target URL"
  exit 0
fi

if [ "$MODE" == "login" ] || [ "$MODE" == "standalone" ]; then
  echo "=== Launching Gemini Bridge Standalone Browser ==="
  echo "Binary:    $CHROME_BIN"
  echo "Extension: $EXT_DIR"
  echo "Profile:   $PROFILE_DIR"
  echo "URL:       $TARGET_URL"
  echo ""
  if [ -n "$RESOLVED_PROFILE_DIR" ]; then
    echo "Profile Dir: $RESOLVED_PROFILE_DIR"
    echo ""
    "$CHROME_BIN" \
      --profile-directory="$RESOLVED_PROFILE_DIR" \
      --load-extension="$EXT_DIR" \
      "$TARGET_URL"
  else
    "$CHROME_BIN" \
      --user-data-dir="$PROFILE_DIR" \
      --load-extension="$EXT_DIR" \
      "$TARGET_URL"
  fi
  exit 0
fi

echo "=== Launching Gemini Bridge Headless Background Daemon ==="
echo "Binary:    $CHROME_BIN"
echo "Extension: $EXT_DIR"
echo "Profile:   $PROFILE_DIR"
echo "URL:       $TARGET_URL"
echo ""

if [ -n "$RESOLVED_PROFILE_DIR" ]; then
  nohup "$CHROME_BIN" \
    --headless=new \
    --disable-gpu \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --profile-directory="$RESOLVED_PROFILE_DIR" \
    --load-extension="$EXT_DIR" \
    "$TARGET_URL" > /dev/null 2>&1 &
else
  nohup "$CHROME_BIN" \
    --headless=new \
    --disable-gpu \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --user-data-dir="$PROFILE_DIR" \
    --load-extension="$EXT_DIR" \
    "$TARGET_URL" > /dev/null 2>&1 &
fi

CHROME_PID=$!
echo "✓ Headless Chrome daemon running in background (PID: $CHROME_PID)"
echo "You can now run 'npm start' to start the CLI orchestrator."
echo "To terminate the background browser: kill $CHROME_PID"
