# PROJECT KNOWLEDGE BASE

**Generated:** 2026-10-19 19:45:00 UTC
**Commit:** 565f1b4
**Branch:** main

## OVERVIEW
Universal webchat harness and local agent bridge connecting developer tools and OpenAI-compatible clients to browser sessions (Gemini, ChatGPT, Claude) via WebSocket and optional Android System 1 phone offload. Built with Node.js, `ws`, Chrome Manifest V3, and vanilla shell automation.

## STRUCTURE
```
.
├── cli.js                  # Combined HTTP proxy (/v1), WebSocket server, and agent REPL
├── tools.js                # Sandboxed local OS runners (run_command, read_file, write_file)
├── launch-headless.sh      # Background Chrome daemon launcher with custom profile isolation
├── launch-standalone.sh    # Visible standalone Chrome launcher with custom profile isolation
├── chrome-extension/       # MV3 content script and DOM adapters for webchat automation
├── scripts/reload-browser.sh # Automated extension and browser tab reloader
├── chrome-extension/       # MV3 content script, background worker, and DOM adapters
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| API proxy & WebSocket bridge | `cli.js` | Handles `/v1/chat/completions`, `/v1/models`, and ws connection |
| Local tool execution & safety | `tools.js` | Buffer caps (2000 chars, 50 lines), directory creation |
| Webchat DOM & input automation | `chrome-extension/content.js` | Platform adapters, simulated mouse clicks, response observer |
| Extension configuration | `chrome-extension/manifest.json` | Host permissions for Gemini, ChatGPT, Claude |
| Android System 1 offload | `phone-bridge/phone_laya_server.js` | `/risk` destructive check and `/prune` output reducer |
| ADB reverse setup | `phone-bridge/adb_connect.sh` | Port 8000 socket forwarding to phone |
| Standalone / visible browser launcher | `launch-standalone.sh` | Visible Chrome with extension preloaded |
| Background browser launcher | `launch-headless.sh` | Chrome `--headless=new` and profile management |
| Hot reload & extension refresh | `scripts/reload-browser.sh` | Dispatches /v1/reload and refreshes Chrome tabs |
| Background service worker | `chrome-extension/background.js` | Receives RELOAD_EXTENSION and calls chrome.runtime.reload() |
## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `start` | Function | `cli.js:282` | `cli.js:506` | Bootstraps HTTP API, WebSocket server, and readline REPL |
| `runAgentLoop` | Function | `cli.js:185` | `cli.js:501` | Autonomous turn loop coordinating prompt injection and tool execution |
| `formatOpenAIMessagesToPrompt` | Function | `cli.js:248` | `cli.js:324` | Serializes OpenAI ChatML messages and tool schemas into plain prompt text |
| `parseToolCall` | Function | `cli.js:89` | `cli.js:200,340` | Parses JSON blocks from markdown fences and raw object strings |
| `queryPhoneSystem1` | Function | `cli.js:132` | `cli.js:211,230` | HTTP client querying Termux/Oorty on port 8000 with 400ms timeout |
| `sendPromptToChrome` | Function | `cli.js:173` | `cli.js:194,339` | Sends WebSocket PROMPT event to content script and returns Promise |
| `run_command` | Function | `tools.js:31` | `cli.js:221` | Executes shell command with 30s timeout and 2MB buffer |
| `read_file` | Function | `tools.js:57` | `cli.js:223` | Reads file with optional 1-indexed start/end line bounds |
| `write_file` | Function | `tools.js:99` | `cli.js:225` | Writes/appends file and recursively creates parent directories |
| `truncateOutput` | Function | `tools.js:11` | `tools.js:45,81` | Clamps text to 2000 chars and 50 lines with head/tail split |

## CONVENTIONS
- Zero dependencies beyond `ws` in `package.json`; rely on Node.js standard libraries (`http`, `child_process`, `fs`, `readline`).
- Tool responses MUST be truncated (`truncateOutput`) to 2000 chars and 50 lines before returning to avoid webchat token floods.
- External service communication with Phone System 1 (`queryPhoneSystem1`) must fail gracefully within 400ms without throwing or blocking the agent loop.
- Human safety mode is active by default; automated prompts enforce a 1500ms reading pause between turns unless `--fast` is set.

## ANTI-PATTERNS (THIS PROJECT)
- DO NOT submit webchat prompts with 0ms delay; randomized human jitter (1200ms-2400ms) is required in `chrome-extension/content.js`.
- DO NOT use `navigator.webdriver` or testing flags in visible browser mode.
- DO NOT introduce heavy external frameworks or build tools; keep scripts self-contained vanilla CommonJS / bash.
- DO NOT allow tool outputs to dump untruncated logs into prompt contexts.

## UNIQUE STYLES
- ANSI color logging used consistently across CLI outputs (cyan for routing, yellow for tool calls, red for errors, green for success).
- Dual execution surface: single `cli.js` file functions simultaneously as an OpenAI HTTP proxy and interactive readline REPL.

## COMMANDS
```bash
npm start                  # Start CLI orchestrator and OpenAI proxy on :8765
npm test                   # Fast syntax and configuration smoke verification
npm run standalone         # Launch visible standalone Chrome tab with extension
npm run headless           # Launch background Chrome daemon on gemini.google.com
npm run headless:login     # Launch visible Chrome once to establish authenticated session
npm run reload             # Trigger automated extension reload and tab refresh
npm run headless:login     # Launch visible Chrome once to establish authenticated session
node cli.js --fast         # Run without 1500ms safety pacing delays
```

## NOTES
- When `ws` is uninstalled, `npm test` fails; ensure `node_modules` is populated via `npm install`.
- Phone offload requires ADB reverse port mapping (`bash phone-bridge/adb_connect.sh`) or direct Oorty Laya service on port 8000.
- Browser extension badge remains red (`Disconnected`) until `cli.js` WebSocket server is running.
