---
name: "gemini-bridge"
description: "Connect to and drive local Gemini Bridge webchat sessions (Gemini Argon, ChatGPT, Claude) via OpenAI-compatible proxy, WebSocket harness, and Chrome extension without OS-level computer use."
---

# Gemini Bridge

Connect AI agents and OpenAI-compatible clients to live, authenticated webchat sessions on Google Gemini, ChatGPT, and Claude through a local WebSocket harness.

## Golden Rules (Read Before Interacting)

1. **NO OS-Level Computer-Use Clicking**: Under no circumstances drive the webchat via mouse coordinates, accessibility clicking, or desktop automation. All communication must run through the bridge's HTTP proxy (`http://127.0.0.1:8765/v1`) or WebSocket RPC.
2. **Verify Connection Before Prompting**: Always check `/v1/status` first. A `200 OK` with `"connected": true` proves the Chrome extension is actively attached. An HTTP `503` means no browser tab is listening.
3. **Multi-Platform Socket Routing**: The bridge supports concurrent browser sessions across Gemini, ChatGPT, and Claude. Route explicitly using model names (e.g., `argon` or `gemini-*` for Gemini, `gpt-*` for ChatGPT, `claude-*` for Claude) or switch the active target via `GET /v1/switch?platform=<gemini|chatgpt|claude>`.
4. **Human Safety Mode**: The bridge applies randomized paste jitter (1200ms–2400ms) and simulated pointer events by default to protect accounts against anti-bot flags. For automated pipelines where pacing is not needed, pass `--fast`.

---

## Setup & Startup

### 1. Verify Bridge Dependencies
```bash
cd /Volumes/Topper2TB/Git/gemini-bridge
npm install
npm test
```

### 2. Start Bridge Orchestrator
```bash
# Background daemon mode on 127.0.0.1:8765 (Recommended)
node cli.js --daemon

# Or interactive terminal REPL
npm start
```

### 3. Attach Browser Tab
Open your target platform in Google Chrome with the unpacked `chrome-extension/` loaded:
- **Google Gemini**: https://gemini.google.com
- **ChatGPT**: https://chatgpt.com
- **Claude**: https://claude.ai

To launch directly into a dedicated profile by name (e.g., `Bantam` / `Profile 4`):
```bash
./launch-standalone.sh --profile Bantam
```

The floating badge in the bottom-left corner of the webchat will turn green (`Ready | Gemini Web` or `Ready | ChatGPT`).

---

## API & Router Reference

Base URL: `http://localhost:8765/v1`

| Endpoint | Method | Purpose | Example / Notes |
|---|---|---|---|
| `/v1/status` | `GET` | Probe extension connection | `curl -s http://localhost:8765/v1/status` |
| `/v1/models` | `GET` | List available models | Dynamic model list reflecting active browser session |
| `/v1/switch` | `GET/POST` | Switch active platform | `curl -s "http://localhost:8765/v1/switch?platform=gemini"` |
| `/v1/chat/completions` | `POST` | OpenAI-compatible chat completion | Primary inference pipeline |
| `/v1/reload` | `POST` | Hot-reload unpacked extension | Refreshes extension worker & open webchat tabs |
| `/v1/inspect` | `POST` | Inspect webchat DOM state | Dumps active inputs, buttons, and model selector |

---

## Usage Recipes

### Case A: Standard Chat Completion (curl)
```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "argon",
    "messages": [
      {
        "role": "user",
        "content": "Explain deterministic finite automata in three sentences."
      }
    ]
  }'
```

### Case B: Python OpenAI SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8765/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gemini-web",
    messages=[
        {"role": "user", "content": "Generate a concise summary of the active project."}
    ]
)

print(response.choices[0].message.content)
```

### Case C: Switching Platforms Dynamically
```bash
# Route to Gemini
curl -s "http://localhost:8765/v1/switch?platform=gemini"

# Route to ChatGPT
curl -s "http://localhost:8765/v1/switch?platform=chatgpt"

# Route to Claude
curl -s "http://localhost:8765/v1/switch?platform=claude"
```

---

## Troubleshooting

- **Badge shows "Disconnected"**: The bridge server (`cli.js`) is not running. Start with `node cli.js --daemon`.
- **Badge stays "Busy"**: The previous prompt generation did not detect a completion turn. Call `POST /v1/reload` to reset extension state.
- **Multiple Chrome Profiles**: Extensions in Chrome are isolated per profile. Ensure `chrome-extension/` is unpacked and loaded in the exact profile window you are using.
