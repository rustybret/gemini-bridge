/**
 * Universal Webchat Agent Bridge - Content Script
 * Supports: Gemini (gemini.google.com), ChatGPT (chatgpt.com, chat.openai.com), Claude (claude.ai)
 * Connects to local CLI orchestrator via ws://localhost:8765
 */

(() => {
  const WS_URL = 'ws://localhost:8765';
  let socket = null;
  let isGenerating = false;
  let safeModeActive = true;
  const reconnectInterval = 2000;
  let lastReportedModel = '';

  // 1. Platform Detection
  function getPlatform() {
    const host = window.location.hostname;
    if (host.includes('gemini.google.com')) return 'Gemini';
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'ChatGPT';
    if (host.includes('claude.ai')) return 'Claude';
    return 'WebChat';
  }

  const platform = getPlatform();

  // 2. Modular Platform DOM Adapters
  const Adapters = {
    Gemini: {
      getModelName() {
        const picker =
          document.querySelector('button[data-test-id="model-selector-button"]') ||
          document.querySelector('button[aria-label*="model" i]') ||
          document.querySelector('.model-pill') ||
          document.querySelector('button span.model-title');
        if (picker) {
          const text = (picker.innerText || picker.textContent || '').trim();
          if (text) return text.split('\n')[0].trim();
        }
        return 'Gemini Web';
      },
      findInputBox() {
        return (
          document.querySelector('rich-textarea div[role="textbox"]') ||
          document.querySelector('div[role="textbox"][contenteditable="true"]') ||
          document.querySelector('.ql-editor[contenteditable="true"]') ||
          document.querySelector('rich-textarea [contenteditable="true"]') ||
          document.querySelector('textarea')
        );
      },
      findSendButton() {
        return (
          document.querySelector('button[aria-label*="Send message"]') ||
          document.querySelector('button[aria-label*="Send"]') ||
          document.querySelector('button.send-button') ||
          document.querySelector('button[data-test-id="send-button"]') ||
          document.querySelector('.send-button-container button')
        );
      },
      findStopButton() {
        const inputContainer = document.querySelector(
          'chat-window, input-area, .input-area, bottom-container, .bottom-container, form, rich-textarea, .text-input-field'
        );
        const root = inputContainer || document;
        return (
          root.querySelector('button[aria-label*="Stop response" i]') ||
          root.querySelector('button[aria-label*="Stop generating" i]') ||
          root.querySelector('button[data-test-id*="stop-generating" i]') ||
          root.querySelector('button[data-test-id="stop-button"]') ||
          root.querySelector('button.stop-button')
        );
      },
      isComplete() {
        const responses = document.querySelectorAll(
          'model-response, .model-response-text, message-content, [data-message-id], model-turn'
        );
        if (!responses.length) return false;
        const last = responses[responses.length - 1];
        const actionToolbar =
          last.querySelector('button[aria-label*="Good response" i]') ||
          last.querySelector('button[aria-label*="Copy" i]') ||
          last.querySelector('button[data-test-id*="copy"]') ||
          last.querySelector('button[aria-label*="Share" i]') ||
          last.querySelector('.response-actions, [data-test-id*="response-actions"]');
        return Boolean(actionToolbar);
      },
      getLatestResponseText() {
        const responses = document.querySelectorAll(
          'model-response, .model-response-text, message-content, [data-message-id], model-turn'
        );
        if (responses.length > 0) {
          const last = responses[responses.length - 1];

          // Extract generated images if present
          const imgElements = Array.from(
            last.querySelectorAll('img[src*="googleusercontent"], img[src*="blob:"], .image-container img, picture img')
          ).filter((img) => img.src && !img.src.includes('avatar') && !img.src.includes('profile') && !img.src.includes('sparkle'));

          const imageDesc = imgElements.length
            ? imgElements.map((img) => `\n\n![${img.alt || 'Generated Image'}](${img.src})`).join('\n')
            : '';

          // Look for markdown element specifically outside thought blocks
          const allMarkdowns = Array.from(last.querySelectorAll('.markdown, message-content, .model-response-text'));
          const responseElements = allMarkdowns.filter(
            (m) =>
              !m.closest(
                '.thought-container, .collapsible-thought, [data-test-id*="thought"], expandable-thought, .thinking-process, details'
              )
          );

          for (let i = responseElements.length - 1; i >= 0; i--) {
            const text = (responseElements[i].innerText || responseElements[i].textContent || '').trim();
            if (text.length > 0) return text + imageDesc;
          }

          const fallback = (last.innerText || last.textContent || '').trim();
          return (fallback || '') + imageDesc;
        }
        const markdowns = document.querySelectorAll('.markdown');
        if (markdowns.length > 0) {
          return (markdowns[markdowns.length - 1].innerText || '').trim();
        }
        return '';
      }
    },

    ChatGPT: {
      getModelName() {
        const modelBtn =
          document.querySelector('button[data-testid="model-switcher-dropdown-button"]') ||
          document.querySelector('button[aria-haspopup="menu"] span') ||
          document.querySelector('div[data-testid="model-switcher"]');
        if (modelBtn) {
          const text = (modelBtn.innerText || modelBtn.textContent || '').trim();
          if (text) return text.split('\n')[0].trim();
        }
        return 'ChatGPT';
      },
      findInputBox() {
        const dictate =
          document.querySelector('button[aria-label="Dictate"]') ||
          document.querySelector('button[aria-label="Start Voice"]') ||
          document.querySelector('button[aria-label="Add files and more"]');
        if (dictate) {
          const container = dictate.closest('form, [data-testid*="composer"], div.relative, div.flex, div.w-full') || document;
          const input = container.querySelector(
            '#prompt-textarea, [contenteditable="true"], [role="textbox"], textarea, p[data-placeholder]'
          );
          if (input) return input;
        }
        return (
          document.querySelector('#prompt-textarea') ||
          document.querySelector('[contenteditable="true"][role="textbox"]') ||
          document.querySelector('[contenteditable="true"]') ||
          document.querySelector('div#prompt-textarea') ||
          document.querySelector('textarea[data-id="root"]') ||
          document.querySelector('textarea')
        );
      },
      findSendButton() {
        return (
          document.querySelector('button[data-testid="send-button"]') ||
          document.querySelector('button[data-testid="fruitjuice-send-button"]') ||
          document.querySelector('button[data-testid*="send"]') ||
          document.querySelector('button[aria-label*="Send prompt" i]') ||
          document.querySelector('button[aria-label*="Send message" i]') ||
          document.querySelector('button[aria-label="Send"]') ||
          document.querySelector('button.composer-submit-btn')
        );
      },
      findStopButton() {
        return (
          document.querySelector('button[data-testid="stop-button"]') ||
          document.querySelector('button[data-testid*="stop"]') ||
          document.querySelector('button[aria-label*="Stop generating" i]') ||
          document.querySelector('button[aria-label*="Stop" i]')
        );
      },
      isComplete() {
        const assistants = document.querySelectorAll('[data-message-author-role="assistant"], .agent-turn');
        if (!assistants.length) return false;
        const last = assistants[assistants.length - 1];
        const copyBtn =
          last.querySelector('button[data-testid*="copy"]') ||
          last.querySelector('button[aria-label*="Copy" i]') ||
          last.querySelector('button[data-testid*="thumbs"]') ||
          last.querySelector('button[aria-label*="Good response" i]') ||
          last.querySelector('button[aria-label*="Read aloud" i]');
        return Boolean(copyBtn);
      },
      getLatestResponseText() {
        const assistants = document.querySelectorAll('[data-message-author-role="assistant"], .agent-turn');
        if (assistants.length > 0) {
          const last = assistants[assistants.length - 1];
          const markdown = last.querySelector('.markdown, div.prose') || last;
          return (markdown.innerText || markdown.textContent || '').trim();
        }
        return '';
      }
    },

    Claude: {
      getModelName() {
        const selector =
          document.querySelector('button[aria-haspopup="menu"] [data-testid*="model"]') ||
          document.querySelector('button[data-testid="model-selector-dropdown"]') ||
          document.querySelector('button[aria-haspopup="menu"]');
        if (selector) {
          const text = (selector.innerText || selector.textContent || '').trim();
          if (text && (text.includes('Claude') || text.includes('Sonnet') || text.includes('Opus') || text.includes('Haiku'))) {
            return text.split('\n')[0].trim();
          }
        }
        return 'Claude 3.7 Sonnet';
      },
      findInputBox() {
        return (
          document.querySelector('div[contenteditable="true"].ProseMirror') ||
          document.querySelector('fieldset div[contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"]')
        );
      },
      findSendButton() {
        return (
          document.querySelector('button[aria-label*="Send Message"]') ||
          document.querySelector('button[aria-label*="Send"]') ||
          document.querySelector('button[data-testid="send-button"]')
        );
      },
      findStopButton() {
        return (
          document.querySelector('button[aria-label*="Stop responding"]') ||
          document.querySelector('button[aria-label*="Stop Response"]') ||
          document.querySelector('button[aria-label*="Stop"]')
        );
      },
      getLatestResponseText() {
        const messages = document.querySelectorAll(
          '.font-claude-message, [data-testid="chat-message-assistant"], .prose'
        );
        if (messages.length > 0) {
          const last = messages[messages.length - 1];
          return (last.innerText || last.textContent || '').trim();
        }
        return '';
      }
    }
  };

  const currentAdapter = Adapters[platform] || Adapters.Gemini;

  // 3. Floating Status Badge
  const badge = document.createElement('div');
  badge.id = 'gemini-agent-bridge-badge';
  badge.style.position = 'fixed';
  badge.style.bottom = '16px';
  badge.style.left = '16px';
  badge.style.zIndex = '999999';
  badge.style.display = 'flex';
  badge.style.alignItems = 'center';
  badge.style.gap = '8px';
  badge.style.padding = '8px 14px';
  badge.style.backgroundColor = '#0f172a';
  badge.style.color = '#f8fafc';
  badge.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = '600';
  badge.style.borderRadius = '9999px';
  badge.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.35)';
  badge.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  badge.style.userSelect = 'none';
  badge.style.transition = 'all 0.2s ease-in-out';

  const dot = document.createElement('span');
  dot.style.width = '8px';
  dot.style.height = '8px';
  dot.style.borderRadius = '50%';
  dot.style.backgroundColor = '#ef4444';
  dot.style.display = 'inline-block';

  const textLabel = document.createElement('span');
  textLabel.textContent = 'Agent Bridge: Disconnected';

  badge.appendChild(dot);
  badge.appendChild(textLabel);
  document.body.appendChild(badge);

  function setStatus(status) {
    const activeModel = currentAdapter.getModelName();
    const modeLabel = safeModeActive ? 'Safe Mode' : 'Fast Mode';
    if (status === 'connected' || status === 'ready') {
      dot.style.backgroundColor = '#10b981';
      textLabel.textContent = `Agent Bridge: Ready [${platform}: ${activeModel} | ${modeLabel}]`;
    } else if (status === 'busy') {
      dot.style.backgroundColor = '#f59e0b';
      textLabel.textContent = `Agent Bridge: Busy [${platform}: ${activeModel} | ${modeLabel}]`;
    } else {
      dot.style.backgroundColor = '#ef4444';
      textLabel.textContent = 'Agent Bridge: Disconnected';
    }
  }

  // 4. Human-like Simulated Pointer Events
  function simulateHumanClick(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const offsetX = rect.width * (0.35 + Math.random() * 0.3);
    const offsetY = rect.height * (0.35 + Math.random() * 0.3);
    const clientX = Math.round(rect.left + offsetX);
    const clientY = Math.round(rect.top + offsetY);
    const screenX = Math.round(window.screenX + clientX);
    const screenY = Math.round(window.screenY + clientY);

    const baseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: 1,
      clientX,
      clientY,
      screenX,
      screenY,
      button: 0
    };

    const downInit = {
      ...baseEventInit,
      buttons: 1
    };

    const upInit = {
      ...baseEventInit,
      buttons: 0
    };

    const pointerDownInit = {
      ...downInit,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: 0.5
    };

    const pointerUpInit = {
      ...upInit,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: 0
    };

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerdown', pointerDownInit));
    }
    element.dispatchEvent(new MouseEvent('mousedown', downInit));

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerup', pointerUpInit));
    }
    element.dispatchEvent(new MouseEvent('mouseup', upInit));
    element.dispatchEvent(new MouseEvent('click', upInit));

    return true;
  }

  // 5. Prompt Injection and Submission
  function injectPrompt(text) {
    if (typeof text === 'string') {
      text = text.replace(/^\[User\]:\s*/i, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    const input = currentAdapter.findInputBox();

    input.focus();
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    if (input.tagName.toLowerCase() === 'textarea') {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Rich contenteditable / ProseMirror elements (ChatGPT / Claude)
    const target = input.querySelector('p') || input;
    target.focus();

    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {}

    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      target.textContent = text;
    }

    if (typeof InputEvent === 'function') {
      target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
      target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
    }
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return true;
  }

  function submitPrompt() {
    const sendBtn = currentAdapter.findSendButton();
    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
      simulateHumanClick(sendBtn);
      return true;
    }

    const input = currentAdapter.findInputBox();
    if (input) {
      input.focus();
      const enterDown = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      const enterPress = new KeyboardEvent('keypress', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      const enterUp = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      input.dispatchEvent(enterDown);
      input.dispatchEvent(enterPress);
      input.dispatchEvent(enterUp);
      return true;
    }

    return false;
  }

  // 6. Response Monitor
  function monitorResponse(initialText) {
    return new Promise((resolve) => {
      let settledTimer = null;
      let hasStarted = false;
      let lastSeenText = '';
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const stopBtn = currentAdapter.findStopButton();
        const currentText = currentAdapter.getLatestResponseText();

        // Reset settled timer whenever response text is actively streaming/changing
        if (currentText !== lastSeenText) {
          lastSeenText = currentText;
          if (settledTimer) {
            clearTimeout(settledTimer);
            settledTimer = null;
          }
        }

        if (stopBtn) {
          hasStarted = true;
          setStatus('busy');
        }

        if (!hasStarted && currentText !== initialText && currentText.length > 0) {
          hasStarted = true;
          setStatus('busy');
        }

        // Check if text is only an intermediate thinking / tool-call status header
        const isThinkingOnly = (() => {
          const trimmed = currentText.trim();
          if (!trimmed) return false;
          if (/^Thinking\s*(it\s*through)?…*/i.test(trimmed)) {
            const nonThinking = trimmed
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => {
                if (!l) return false;
                if (/^Thinking\s*(it\s*through)?…*/i.test(l)) return false;
                if (/^I've\s+begun\s+analyzing/i.test(l)) return false;
                if (/^Searched\s+for/i.test(l)) return false;
                if (/^Using\s+skill:/i.test(l)) return false;
                if (/^Working\s+on/i.test(l)) return false;
                if (/^Reading\s+/i.test(l)) return false;
                return true;
              });
            return nonThinking.length === 0;
          }
          return false;
        })();

        const isTurnFinished = currentAdapter.isComplete ? currentAdapter.isComplete() : false;

        if (hasStarted && (isTurnFinished || (!stopBtn && !isThinkingOnly && currentText.length > 0))) {
          if (!settledTimer) {
            const waitMs = isTurnFinished ? 800 : 2500;
            settledTimer = setTimeout(() => {
              clearInterval(checkInterval);
              const finalText = currentAdapter.getLatestResponseText();
              resolve(finalText);
            }, waitMs);
          }
        } else if ((stopBtn || isThinkingOnly) && !isTurnFinished && settledTimer) {
          clearTimeout(settledTimer);
          settledTimer = null;
        }

        // Safety timeout: 3 minutes max
        if (Date.now() - startTime > 180000) {
          clearInterval(checkInterval);
          if (settledTimer) clearTimeout(settledTimer);
          resolve(currentAdapter.getLatestResponseText());
        }
      }, 400);
    });
  }
  async function executeAction(actionMsg) {
    const { action, selector, textPattern, target } = actionMsg;

    if (action === 'test_composer') {
      const input = currentAdapter.findInputBox();
      const sendBtn = currentAdapter.findSendButton();
      const allInputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')).map((el) => ({
        tag: el.tagName,
        id: el.id,
        className: (el.className || '').toString().slice(0, 50),
        role: el.getAttribute('role'),
        placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '',
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height)
      }));
      return {
        platform,
        inputFound: Boolean(input),
        inputInfo: input ? { tag: input.tagName, id: input.id, class: (input.className || '').toString().slice(0, 50), html: input.outerHTML.slice(0, 200) } : null,
        sendBtnFound: Boolean(sendBtn),
        sendBtnInfo: sendBtn ? { tag: sendBtn.tagName, aria: sendBtn.getAttribute('aria-label'), testId: sendBtn.getAttribute('data-testid'), disabled: sendBtn.disabled } : null,
        allInputs
      };
    }

    // 1. Generic Click
    if (action === 'click') {
      let el = null;
      if (selector) el = document.querySelector(selector);
      if (!el && (textPattern || target)) {
        const reg = new RegExp(textPattern || target, 'i');
        const candidates = document.querySelectorAll(
          'button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], [role="radio"], mat-chip, .model-pill, span, div'
        );
        for (const cand of candidates) {
          const t = (cand.innerText || cand.textContent || '').trim();
          const a = cand.getAttribute('aria-label') || '';
          const d = cand.getAttribute('data-test-id') || '';
          if (reg.test(t) || reg.test(a) || reg.test(d)) {
            const rect = cand.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el = cand;
              break;
            }
          }
        }
      }
      if (!el) return { success: false, error: `Element not found for ${selector || textPattern || target}` };
      simulateHumanClick(el);
      return { success: true, clicked: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 60) };
    }

    // 2. Configure Model and Thinking Level
    if (action === 'configure_model') {
      const targetModel = actionMsg.model || 'Argon';
      const level = actionMsg.thinkingLevel || 'Medium';
      const steps = [];

      // A. Open model selector dropdown
      const modelBtn =
        document.querySelector('button[data-test-id="model-selector-button"]') ||
        document.querySelector('button[aria-label*="model" i]') ||
        document.querySelector('.model-pill') ||
        document.querySelector('button:has(span.model-title)') ||
        document.querySelector('button:has([data-test-id*="model"])');

      if (modelBtn) {
        simulateHumanClick(modelBtn);
        steps.push('Opened model selector dropdown');
        await new Promise((r) => setTimeout(r, 600));
      }

      // B. Select model option
      const modelReg = new RegExp(targetModel, 'i');
      const menuItems = document.querySelectorAll(
        '[role="menuitem"], [role="option"], button, .mat-mdc-menu-item, mat-option, [data-test-id*="model"]'
      );
      let modelItem = null;
      for (const item of menuItems) {
        const t = (item.innerText || item.textContent || item.getAttribute('aria-label') || '').trim();
        if (modelReg.test(t)) {
          modelItem = item;
          break;
        }
      }
      if (modelItem) {
        simulateHumanClick(modelItem);
        steps.push(`Selected model: ${targetModel}`);
        await new Promise((r) => setTimeout(r, 600));
      } else {
        steps.push(`Model option '${targetModel}' not found in open menu; attempting direct text match`);
      }

      // C. Set thinking level (e.g. Medium)
      if (level) {
        const levelReg = new RegExp(level, 'i');
        const levelItems = document.querySelectorAll(
          '[role="menuitem"], [role="option"], [role="radio"], button, mat-chip, .thinking-budget-chip, .thinking-level, [data-test-id*="thinking"]'
        );
        let levelItem = null;
        for (const item of levelItems) {
          const t = (item.innerText || item.textContent || item.getAttribute('aria-label') || '').trim();
          if (levelReg.test(t)) {
            levelItem = item;
            break;
          }
        }
        if (levelItem) {
          simulateHumanClick(levelItem);
          steps.push(`Selected thinking level: ${level}`);
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      return { success: true, steps, currentModel: currentAdapter.getModelName() };
    }

    // 3. Switch to Task Mode
    if (action === 'switch_mode') {
      const modePattern = new RegExp(actionMsg.mode || 'Task', 'i');
      const modeButtons = document.querySelectorAll(
        'button, [role="tab"], [role="button"], mat-chip, .mode-toggle, [data-test-id*="mode"], .task-mode-button'
      );
      let modeBtn = null;
      for (const btn of modeButtons) {
        const t = (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '').trim();
        if (modePattern.test(t)) {
          modeBtn = btn;
          break;
        }
      }
      if (modeBtn) {
        simulateHumanClick(modeBtn);
        await new Promise((r) => setTimeout(r, 500));
        return { success: true, mode: (modeBtn.innerText || modeBtn.getAttribute('aria-label') || '').trim() };
      }
      return { success: false, error: `Mode button for '${actionMsg.mode || 'Task'}' not found` };
    }

    // 4. Attach Device / Computer Access
    if (action === 'attach_device') {
      const deviceName = actionMsg.device || 'Mac Studio';
      const devicePattern = new RegExp(deviceName, 'i');
      const steps = [];

      // Find attach/tools/computer button
      const attachBtn =
        document.querySelector('button[aria-label*="computer" i]') ||
        document.querySelector('button[aria-label*="device" i]') ||
        document.querySelector('button[aria-label*="attach" i]') ||
        document.querySelector('button[aria-label*="tools" i]') ||
        document.querySelector('button[data-test-id*="device"]') ||
        document.querySelector('button[data-test-id*="computer"]') ||
        document.querySelector('button[aria-label*="add" i]');

      if (attachBtn) {
        simulateHumanClick(attachBtn);
        steps.push('Clicked attach/device control');
        await new Promise((r) => setTimeout(r, 600));
      }

      // Find device option in menu
      const options = document.querySelectorAll(
        '[role="menuitem"], [role="option"], button, .device-item, span, div'
      );
      let deviceOption = null;
      for (const opt of options) {
        const t = (opt.innerText || opt.textContent || opt.getAttribute('aria-label') || '').trim();
        if (devicePattern.test(t)) {
          deviceOption = opt;
          break;
        }
      }
      if (deviceOption) {
        simulateHumanClick(deviceOption);
        steps.push(`Selected device: ${deviceName}`);
        await new Promise((r) => setTimeout(r, 400));
        return { success: true, steps, device: deviceName };
      }
      return { success: false, steps, error: `Device option for '${deviceName}' not found` };
    }

    return { success: false, error: `Unknown action: ${action}` };
  }

  // 7. WebSocket Lifecycle
  function connect() {
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      setStatus('disconnected');
      setTimeout(connect, reconnectInterval);
      return;
    }

    socket.onopen = () => {
      const activeModel = currentAdapter.getModelName();
      lastReportedModel = activeModel;
      console.log(`[Agent Bridge] Connected to CLI orchestrator on ${platform} (${activeModel}) [Safe Mode: ${safeModeActive}]`);
      setStatus('ready');

      socket.send(
        JSON.stringify({
          type: 'HELLO',
          platform,
          model: activeModel,
          safeMode: safeModeActive,
          url: window.location.href
        })
      );
    };

    socket.onclose = () => {
      console.log('[Agent Bridge] Disconnected from CLI orchestrator, retrying...');
      setStatus('disconnected');
      socket = null;
      setTimeout(connect, reconnectInterval);
    };

    socket.onerror = () => {
      setStatus('disconnected');
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'CONFIG') {
          if (msg.safeMode !== undefined) {
            safeModeActive = Boolean(msg.safeMode);
          }
          setStatus(isGenerating ? 'busy' : 'ready');
          return;
        }

        if (msg.type === 'INSPECT') {
          const elements = [];
          const selectors =
            'button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], [role="radio"], mat-chip, .model-pill, [data-test-id], a, select, input, textarea, [contenteditable="true"], [role="textbox"]';
          document.querySelectorAll(selectors).forEach((el) => {
            const text = (el.innerText || el.textContent || '').trim();
            const ariaLabel = el.getAttribute('aria-label') || '';
            const testId = el.getAttribute('data-test-id') || el.getAttribute('data-testid') || '';
            const role = el.getAttribute('role') || el.tagName.toLowerCase();
            const rect = el.getBoundingClientRect();
            if ((text || ariaLabel || testId || el.id || role === 'textbox' || el.tagName.toLowerCase() === 'textarea') && rect.width > 0 && rect.height > 0) {
              elements.push({
                tag: el.tagName.toLowerCase(),
                role,
                text: text.slice(0, 100),
                ariaLabel,
                testId,
                id: el.id || '',
                className: (el.className || '').toString().slice(0, 80)
              });
            }
          });

          const activeInput = currentAdapter.findInputBox();
          const activeSendBtn = currentAdapter.findSendButton();

          socket.send(
            JSON.stringify({
              type: 'INSPECT_RESULT',
              platform,
              url: window.location.href,
              currentModel: currentAdapter.getModelName(),
              inputFound: Boolean(activeInput),
              inputTag: activeInput ? activeInput.tagName : null,
              inputId: activeInput ? activeInput.id : null,
              sendBtnFound: Boolean(activeSendBtn),
              sendBtnDisabled: activeSendBtn ? Boolean(activeSendBtn.disabled || activeSendBtn.getAttribute('aria-disabled') === 'true') : null,
              elements: elements.slice(-25)
            })
          );
          return;
        }

        if (msg.type === 'ACTION') {
          try {
            const result = await executeAction(msg);
            socket.send(JSON.stringify({ type: 'ACTION_RESULT', ...result }));
          } catch (err) {
            socket.send(JSON.stringify({ type: 'ACTION_RESULT', success: false, error: err.message }));
          }
          return;
        }


        if (msg.type === 'PROMPT') {
          if (msg.safeMode !== undefined) {
            safeModeActive = Boolean(msg.safeMode);
          }

          if (isGenerating) {
            socket.send(
              JSON.stringify({
                type: 'ERROR',
                message: `${platform} is currently busy processing another turn.`
              })
            );
            return;
          }

          isGenerating = true;
          setStatus('busy');

          const baselineText = currentAdapter.getLatestResponseText();
          const injected = injectPrompt(msg.text);

          if (!injected) {
            isGenerating = false;
            setStatus('ready');
            socket.send(
              JSON.stringify({
                type: 'ERROR',
                message: `Failed to inject prompt into ${platform} input element.`
              })
            );
            return;
          }

          // Humanized jitter delay: between 1200ms and 2400ms in safe mode (never 0ms)
          const delayMs = safeModeActive
            ? Math.floor(1200 + Math.random() * 1200)
            : 300;

          setTimeout(async () => {
            submitPrompt();
            const resultText = await monitorResponse(baselineText);
            isGenerating = false;
            setStatus('ready');

            socket.send(
              JSON.stringify({
                type: 'RESPONSE',
                text: resultText
              })
            );
          }, delayMs);
        }
      } catch (err) {
        console.error('[Agent Bridge] Message processing error:', err);
      }
    };
  }

  // Periodic model check to notify CLI if model changes dynamically
  setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const currentModel = currentAdapter.getModelName();
      if (currentModel !== lastReportedModel) {
        lastReportedModel = currentModel;
        setStatus('ready');
        socket.send(
          JSON.stringify({
            type: 'STATUS',
            platform,
            model: currentModel,
            safeMode: safeModeActive
          })
        );
      }
    }
  }, 3000);

  connect();
})();
