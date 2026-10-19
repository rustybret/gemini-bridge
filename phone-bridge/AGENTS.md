# PHONE BRIDGE KNOWLEDGE BASE

## OVERVIEW
Termux / Android System 1 pocket-server microservice for on-device safety gating (`/risk`) and prompt token pruning (`/prune`).

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Phone HTTP microservice | `phone_laya_server.js` | Node.js HTTP server on port 8000; endpoints: `/`, `/health`, `/risk`, `/prune` |
| Destructive command blacklist | `phone_laya_server.js:11-21` | Regex patterns for dangerous commands (`rm -rf`, `mkfs`, `dd`, etc.) |
| Terminal output reduction | `phone_laya_server.js:76-100` | Slices output over `max_lines` (default: 40) keeping 50% head / 50% tail |
| ADB reverse port forwarding | `adb_connect.sh` | Maps host port 8000 to phone port 8000 (`adb reverse tcp:8000 tcp:8000`) |
| Termux environment installer | `termux_setup.sh` | Installs `nodejs-lts`, `git`, `termux-tools`, `curl` and copies server |

## CONVENTIONS
- Endpoints respond strictly with JSON (`Content-Type: application/json`).
- `/health` and `/` return `{ status: 'ok', device: '...', service: '...' }` for reachability checks.
- `/risk` returns `{ risk_score: 'high'|'low', requires_confirmation: boolean, reason: string }`.
- `/prune` preserves context by taking `head` and `tail` slices and inserting a pruning notice.

## ANTI-PATTERNS
- DO NOT crash or throw uncaught errors on malformed payloads; return 400 `{ error: 'Malformed JSON payload' }`.
- DO NOT require heavy npm dependencies on Termux; `phone_laya_server.js` uses only built-in `http`.
- DO NOT assume ADB is in standard PATH; `adb_connect.sh` checks `/home/bhoid/Android/Sdk/platform-tools/adb` fallback.
