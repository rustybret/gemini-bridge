# Gemini Bridge: Setup, Start, and Usage Guide

Gemini Bridge connects local coding agents and OpenAI-compatible clients to live, authenticated browser sessions on Google Gemini, ChatGPT, and Claude via a local WebSocket harness.

---

## 1. Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher.
- **Google Chrome** (or Chromium): Any recent desktop release.

### Step 1.1: Clone and Install Dependencies
Clone the repository and install the minimal runtime dependencies (`ws`):

```bash
git clone https://github.com/rustybret/gemini-bridge.git
cd gemini-bridge
npm install
```

Verify your local installation:
```bash
npm test
```

### Step 1.2: Install the Chrome Extension
The extension runs as an unpacked Manifest V3 content script that injects DOM adapters into your webchat tabs:

1. Open Google Chrome.
2. If you use multiple Chrome profiles (e.g., work, personal, or dedicated agent accounts like `Bantam`), switch to the specific Chrome profile you plan to use.
3. In the address bar, navigate to:
   ```
   chrome://extensions
   ```
4. In the top-right corner, switch **Developer mode** to **ON**.
5. In the top-left toolbar, click **"Load unpacked"**.
6. Select the `chrome-extension` directory inside the repository:
   ```
   /path/to/gemini-bridge/chrome-extension
   ```
7. Verify that **Gemini Bridge - Universal Webchat Agent Bridge** appears in your extensions list.

---

## 2. Start

To use the bridge, you start two components: the **bridge server** and the **browser tab**.

### Step 2.1: Start the Bridge Server

You can run the server in two modes:

#### Option A: Interactive CLI Mode (Foreground REPL)
Runs an interactive prompt where you can chat with the model and watch local tool calls execute live in your terminal:
```bash
npm start
```

#### Option B: Background Daemon Mode (API Only)
Runs quietly in the background without tying up a terminal or expecting keyboard input. Defaults to loopback `127.0.0.1:8765`:
```bash
node cli.js --daemon
```

*Optional Flags:*
- `-p, --port <port>`: Change port (default: `8765`).
- `-H, --host <ip>`: Bind to specific interface (default: `127.0.0.1`).
- `--fast`: Disable humanized jitter and pacing delays (default: enabled).

### Step 2.2: Open the Webchat Tab

Open your target webchat platform in Chrome:
- **Google Gemini**: [https://gemini.google.com](https://gemini.google.com)
- **ChatGPT**: [https://chatgpt.com](https://chatgpt.com)
- **Claude**: [https://claude.ai](https://claude.ai)

#### Using the Standalone Launch Script (Optional)
If you want to launch Chrome directly into a specific signed-in profile:
```bash
# Auto-resolves by profile name:
./launch-standalone.sh --profile Bantam

# Or direct profile directory:
./launch-standalone.sh --profile "Profile 4"
```

### Step 2.3: Verify Connection

1. **Visual Check**: Look at the bottom-left corner of the webchat tab. A floating badge will appear:
   - 🟢 **Ready | Gemini Web**: Connected and ready for requests.
   - 🟡 **Busy**: Model is currently generating or executing tools.
   - 🔴 **Disconnected**: Bridge server on `:8765` is not running or unreachable.

2. **CLI / API Check**:
   Query the local status endpoint:
   ```bash
   curl -s http://localhost:8765/v1/status
   ```
   *Expected Response:*
   ```json
   {
     "status": "ok",
     "connected": true,
     "platform": "Gemini",
     "model": "Gemini Web",
     "safeMode": true
   }
   ```

---

## 3. Usage

Once connected, the bridge exposes a standard **OpenAI-compatible API** on `http://localhost:8765/v1`.

### 3.1: Direct API Calls (curl)

Send standard Chat Completion requests:

```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-web",
    "messages": [
      {
        "role": "user",
        "content": "Explain the concept of deterministic finite automata in three sentences."
      }
    ]
  }'
```

### 3.2: Connecting to Developer Tools & IDEs

Configure any OpenAI-compatible tool to point to your local bridge:

| Tool | Base URL | API Key | Model Name |
|---|---|---|---|
| **Cursor** | `http://localhost:8765/v1` | `any-string` | `gemini-web` (or any name) |
| **Aider** | `http://localhost:8765/v1` | `any-string` | `openai/gemini-web` |
| **OpenCode** | `http://localhost:8765/v1` | `any-string` | Custom provider |
| **Python SDK** | `base_url="http://localhost:8765/v1"` | `api_key="none"` | `gemini-web` |

#### Python Example:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8765/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gemini-web",
    messages=[
        {"role": "user", "content": "Write a Python script to reverse a string."}
    ]
)

print(response.choices[0].message.content)
```

---

## 4. Operational Tips & Maintenance

### Automated Extension Reload
If you make code edits to `chrome-extension/`:
1. `cli.js` watches the directory and automatically broadcasts a reload signal.
2. To trigger a manual reload and refresh open tabs via CLI:
   ```bash
   npm run reload
   ```

### Human Safety Mode
Human Safety Mode is active by default to protect your account against anti-bot bans:
- Randomized paste jitter (1200ms–2400ms delay).
- Full browser DOM pointer events (not raw DOM value setters).
- 1500ms pacing pause between automated tool turns.
- Tool output truncation clamped to 50 lines / 2000 characters.

To disable safety delays for faster execution during local testing, pass `--fast`:
```bash
node cli.js --fast
```
