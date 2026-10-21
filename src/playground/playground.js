/**
 * HueForge Playground — playground.js
 * -----------------------------------------------------------------------------
 * Injected only by `npm run playground` (see playground/server.mjs). It adds a
 * floating "Try the assistant" panel that talks to the local API, themes the
 * chat bubbles with the palette currently on screen, and explains *why* each
 * reply was chosen.
 *
 * The production GitHub Pages build never loads this file.
 */

const STYLE_ID = 'playground-styles';

const CSS = /* css */ `
  .pg-launcher {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 9500;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 11px 17px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: linear-gradient(140deg, #a99cff, #7c5cff 55%, #6c53f0);
    color: #fff;
    font: 600 13px/1 'Inter', system-ui, sans-serif;
    letter-spacing: -0.01em;
    box-shadow: 0 18px 40px -18px rgba(124, 92, 255, 0.9);
    cursor: pointer;
    transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .pg-launcher:hover { transform: translateY(-2px); }
  .pg-launcher span.pg-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #3dd6c4;
    box-shadow: 0 0 10px #3dd6c4;
  }

  .pg-panel {
    position: fixed;
    right: 20px;
    bottom: 78px;
    z-index: 9501;
    display: flex;
    flex-direction: column;
    width: min(400px, calc(100vw - 32px));
    max-height: min(640px, calc(100vh - 120px));
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 20px;
    background: #0a0c12;
    color: #f1f4fa;
    font-family: 'Inter', system-ui, sans-serif;
    box-shadow: 0 40px 90px -50px #000;
    overflow: hidden;
    opacity: 0;
    transform: translateY(10px) scale(0.99);
    pointer-events: none;
    transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .pg-panel.is-open { opacity: 1; transform: none; pointer-events: auto; }

  .pg-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: 15px 16px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  }
  .pg-head h2 { margin: 0; font: 600 15px/1.2 'Space Grotesk', system-ui, sans-serif; letter-spacing: -0.02em; }
  .pg-head p { margin: 4px 0 0; color: #7f889c; font-size: 11px; }
  .pg-close {
    display: grid; place-items: center; width: 28px; height: 28px; flex: none;
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 50%;
    background: transparent; color: #b7bfd0; font-size: 15px; cursor: pointer;
  }
  .pg-close:hover { color: #fff; border-color: rgba(255, 255, 255, 0.28); }

  .pg-toolbar { display: flex; gap: 6px; padding: 10px 16px 0; flex-wrap: wrap; }
  .pg-tone {
    padding: 5px 10px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px;
    background: rgba(255, 255, 255, 0.03); color: #7f889c;
    font: 500 11px/1 'Inter', system-ui, sans-serif; cursor: pointer;
  }
  .pg-tone.is-active { color: #fff; border-color: rgba(139, 124, 255, 0.6); background: rgba(139, 124, 255, 0.16); }

  .pg-thread {
    display: flex; flex-direction: column; gap: 10px;
    flex: 1; min-height: 180px; padding: 14px 16px; overflow-y: auto;
  }

  .pg-bubble {
    max-width: 88%;
    padding: 10px 13px;
    border-radius: 14px;
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .pg-bubble strong { font-weight: 600; }
  .pg-bubble em { color: rgba(255, 255, 255, 0.7); font-style: normal; }

  .pg-bubble--in {
    align-self: flex-end;
    border-bottom-right-radius: 5px;
    background: #1b2030;
    color: #e7ebf5;
  }
  .pg-bubble--out {
    align-self: flex-start;
    border-bottom-left-radius: 5px;
    background: var(--pg-accent, #7c5cff);
    color: var(--pg-accent-text, #fff);
  }

  .pg-why {
    display: flex; flex-wrap: wrap; gap: 5px;
    margin-top: 6px; font: 400 10px/1.4 'JetBrains Mono', ui-monospace, monospace;
    opacity: 0.72;
  }
  .pg-why code {
    padding: 1px 5px; border-radius: 4px;
    background: rgba(0, 0, 0, 0.18);
    font: inherit;
  }

  .pg-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .pg-chip {
    padding: 4px 9px; border-radius: 999px;
    border: 1px solid currentColor; background: transparent;
    color: inherit; opacity: 0.8; font-size: 10.5px; cursor: pointer;
  }
  .pg-chip:hover { opacity: 1; }

  .pg-form {
    display: flex; gap: 8px; padding: 12px 16px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.09);
  }
  .pg-form input {
    flex: 1; min-width: 0; padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 11px;
    background: rgba(255, 255, 255, 0.04); color: #f1f4fa;
    font: 400 12.5px 'Inter', system-ui, sans-serif; outline: none;
  }
  .pg-form input:focus { border-color: #8b7cff; box-shadow: 0 0 0 3px rgba(139, 124, 255, 0.18); }
  .pg-form button {
    padding: 0 15px; border: 0; border-radius: 11px;
    background: #8b7cff; color: #fff; font: 600 12px 'Inter', system-ui, sans-serif; cursor: pointer;
  }
  .pg-form button:disabled { opacity: 0.5; cursor: progress; }

  .pg-foot {
    display: flex; justify-content: space-between; gap: 10px;
    padding: 0 16px 13px; color: #5c6478;
    font: 400 9.5px/1.4 'JetBrains Mono', ui-monospace, monospace;
  }
  .pg-foot a { color: #7f889c; text-decoration: underline; text-underline-offset: 2px; }
`;

const TONES = ['warm', 'direct', 'technical', 'playful'];

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

/** Escape user/reply text, then restore the tiny markdown subset we emit. */
function formatReply(text) {
  return String(text)
    .replace(/[&<>"']/g, (character) => {
      switch (character) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

/** Read the palette the studio is currently showing. */
function currentPalette() {
  const cards = [...document.querySelectorAll('#swatch-grid .swatch')];
  const colors = cards.map((card) => card.dataset.hex).filter(Boolean);
  return colors.length === 5 ? colors : ['#d6e6fc', '#a4b3f4', '#8963fd', '#722da8', '#491152'];
}

function accentFrom(palette) {
  const accent = palette[2];
  const value = accent.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return { accent, text: luminance > 0.55 ? '#0b0d12' : '#ffffff' };
}

/* -------------------------------------------------------------------------- */
/* Widget                                                                     */
/* -------------------------------------------------------------------------- */

export function mountPlayground() {
  if (document.getElementById('pg-panel')) return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'pg-launcher';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'pg-panel');
  launcher.innerHTML = '<span class="pg-dot" aria-hidden="true"></span> Try the assistant';

  const panel = document.createElement('section');
  panel.id = 'pg-panel';
  panel.className = 'pg-panel';
  panel.setAttribute('aria-label', 'Playground assistant');
  panel.innerHTML = `
    <header class="pg-head">
      <div>
        <h2>Assistant playground</h2>
        <p>Local template engine · palette-aware replies</p>
      </div>
      <button class="pg-close" type="button" aria-label="Close playground">×</button>
    </header>
    <div class="pg-toolbar" role="group" aria-label="Tone">
      ${TONES.map(
        (tone) =>
          `<button class="pg-tone${tone === 'warm' ? ' is-active' : ''}" type="button" data-tone="${tone}" aria-pressed="${tone === 'warm'}">${tone}</button>`,
      ).join('')}
    </div>
    <div class="pg-thread" id="pg-thread" role="log" aria-live="polite"></div>
    <form class="pg-form" id="pg-form">
      <input id="pg-input" type="text" placeholder="Ask about pricing, delivery, returns…" autocomplete="off" maxlength="600" aria-label="Message" />
      <button type="submit" id="pg-send">Send</button>
    </form>
    <div class="pg-foot">
      <span>No API key · no outbound requests</span>
      <a href="/api/health" target="_blank" rel="noopener">API health</a>
    </div>`;

  document.body.append(launcher, panel);

  const thread = panel.querySelector('#pg-thread');
  const form = panel.querySelector('#pg-form');
  const input = panel.querySelector('#pg-input');
  const send = panel.querySelector('#pg-send');
  let tone = 'warm';
  let busy = false;

  const refreshTheme = () => {
    const palette = currentPalette();
    const { accent, text } = accentFrom(palette);
    panel.style.setProperty('--pg-accent', accent);
    panel.style.setProperty('--pg-accent-text', text);
  };

  const open = (state) => {
    panel.classList.toggle('is-open', state);
    launcher.setAttribute('aria-expanded', String(state));
    if (state) {
      refreshTheme();
      input.focus();
    }
  };

  launcher.addEventListener('click', () => open(!panel.classList.contains('is-open')));
  panel.querySelector('.pg-close').addEventListener('click', () => open(false));

  panel.querySelectorAll('.pg-tone').forEach((button) => {
    button.addEventListener('click', () => {
      tone = button.dataset.tone;
      panel.querySelectorAll('.pg-tone').forEach((other) => {
        const active = other === button;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      });
    });
  });

  const addBubble = ({ text, role, meta, chips }) => {
    const bubble = document.createElement('div');
    bubble.className = `pg-bubble pg-bubble--${role === 'in' ? 'in' : 'out'}`;
    bubble.innerHTML = formatReply(text);

    if (meta) {
      const why = document.createElement('div');
      why.className = 'pg-why';
      why.innerHTML = `<code>${meta.intent}</code><span>${meta.label}</span><span>·</span><span>${Math.round(meta.confidence * 100)}% confident</span>`;
      bubble.appendChild(why);
    }

    if (chips?.length) {
      const chipRow = document.createElement('div');
      chipRow.className = 'pg-chips';
      chips.forEach((chip) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pg-chip';
        button.textContent = chip;
        button.addEventListener('click', () => submit(chip));
        chipRow.appendChild(button);
      });
      bubble.appendChild(chipRow);
    }

    thread.appendChild(bubble);
    thread.scrollTop = thread.scrollHeight;
  };

  const ask = async (prompt) => {
    const response = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, palette: currentPalette(), tone }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error ?? 'Request failed');
    }
    return response.json();
  };

  async function submit(text) {
    const prompt = String(text ?? input.value).trim();
    if (!prompt || busy) return;
    busy = true;
    send.disabled = true;
    input.value = '';
    addBubble({ text: prompt, role: 'in' });

    try {
      const reply = await ask(prompt);
      refreshTheme();
      addBubble({
        text: reply.text,
        role: 'out',
        meta: { intent: reply.intent, label: reply.label, confidence: reply.confidence },
        chips: reply.chips,
      });
    } catch (error) {
      addBubble({
        text: `Could not reach the local API — is \`npm run playground\` still running?\n\n_${error.message}_`,
        role: 'out',
      });
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  // Refresh bubble colours as the palette changes.
  const observer = new MutationObserver(refreshTheme);
  const grid = document.getElementById('swatch-grid');
  if (grid) observer.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-hex'] });

  addBubble({
    text:
      'Hey! I answer from a local template engine, so nothing leaves this machine.\n\nTry “how much does it cost?”, “how long is delivery?” or “send me a human”.',
    role: 'out',
    chips: ['How much does it cost?', 'How long is delivery?', 'Talk to a human'],
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountPlayground, { once: true });
} else {
  mountPlayground();
}
