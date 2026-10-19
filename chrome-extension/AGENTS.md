# CHROME EXTENSION KNOWLEDGE BASE

## OVERVIEW
Manifest V3 content script providing bi-directional WebSocket communication (`ws://localhost:8765`) and DOM adapters for webchat interfaces.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Manifest & host permissions | `manifest.json` | Matches `gemini.google.com`, `chatgpt.com`, `chat.openai.com`, `claude.ai` |
| DOM adapters & platform detection | `content.js:16-176` | `Adapters.Gemini`, `Adapters.ChatGPT`, `Adapters.Claude` implementations |
| Human-like click simulation | `content.js:232-298` | Dispatches pointerdown, mousedown, pointerup, mouseup, click sequences |
| Input injection & submission | `content.js:301-379` | Handles `textarea`, `contenteditable`, and `ProseMirror` targets |
| Generation state observer | `content.js:381-423` | Polls stop button and response DOM mutations with 3-minute timeout |
| WebSocket lifecycle & UI badge | `content.js:180-230,425-545` | Manages floating status badge and auto-reconnects every 2000ms |

## CONVENTIONS
- All platform adapters MUST implement 5 methods: `getModelName()`, `findInputBox()`, `findSendButton()`, `findStopButton()`, `getLatestResponseText()`.
- Status badge `#gemini-agent-bridge-badge` is injected directly into page DOM at bottom-left corner with inline CSS.
- Content script runs at `document_idle`.
- WebSocket automatically attempts reconnection every 2000ms on close or error.

## ANTI-PATTERNS
- NEVER submit text with 0ms delay in Safe Mode; enforce randomized jitter between 1200ms and 2400ms (`delayMs`).
- NEVER use raw `.click()` on send buttons; use `simulateHumanClick` with simulated client coordinates to avoid anti-bot detection.
- DO NOT mutate or access external extension storage; all state is synchronized in-memory via WebSocket messages (`HELLO`, `STATUS`, `PROMPT`, `RESPONSE`, `ERROR`).
