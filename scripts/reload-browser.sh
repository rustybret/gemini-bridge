#!/usr/bin/env bash
# Gemini Bridge - Automated Extension & Tab Reloader
# Triggers hot-reload via the CLI orchestrator and refreshes active webchat tabs via AppleScript (macOS).

set -e

echo "=== Triggering Gemini Bridge Extension Reload ==="

# 1. Broadcast reload signal via CLI orchestrator HTTP API
if curl -s -X POST http://localhost:8765/v1/reload >/dev/null 2>&1; then
  echo "✓ Extension reload signal broadcast to background service worker via :8765/v1/reload"
else
  echo "Notice: CLI orchestrator is not running on port 8765; proceeding with tab refresh..."
fi

# 2. Refresh active webchat tabs in Google Chrome on macOS
if command -v osascript &>/dev/null; then
  osascript -e '
  tell application "Google Chrome"
    repeat with w in windows
      repeat with t in tabs of w
        set currentUrl to URL of t
        if currentUrl contains "gemini.google.com" or currentUrl contains "chatgpt.com" or currentUrl contains "claude.ai" then
          reload t
        end if
      end repeat
    end repeat
  end tell
  ' 2>/dev/null || true
  echo "✓ Chrome webchat tabs refreshed via AppleScript"
fi

echo "Extension reload sequence complete."
