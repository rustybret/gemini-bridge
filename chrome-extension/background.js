// Gemini Bridge - Background Service Worker
// Automatically reloads the extension and active webchat tabs when code changes occur

const WS_URL = 'ws://localhost:8765';
let socket = null;
let reconnectInterval = 3000;

function connectReloadSocket() {
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    setTimeout(connectReloadSocket, reconnectInterval);
    return;
  }

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: 'REGISTER_SERVICE_WORKER',
        service: 'gemini-bridge-reloader'
      })
    );
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'RELOAD_EXTENSION') {
        console.log('[Gemini Bridge] Hot-reload triggered. Reloading extension and webchat tabs...');

        chrome.tabs.query(
          {
            url: [
              'https://gemini.google.com/*',
              'https://chatgpt.com/*',
              'https://chat.openai.com/*',
              'https://claude.ai/*'
            ]
          },
          (tabs) => {
            if (tabs && tabs.length > 0) {
              for (const tab of tabs) {
                if (tab.id) chrome.tabs.reload(tab.id);
              }
            }
            // Reload the unpacked extension from disk
            chrome.runtime.reload();
          }
        );
      }
    } catch (e) {
      console.error('[Gemini Bridge] Background service worker message error:', e);
    }
  };

  socket.onclose = () => {
    socket = null;
    setTimeout(connectReloadSocket, reconnectInterval);
  };

  socket.onerror = () => {
    if (socket) socket.close();
  };
}

connectReloadSocket();
