/**
 * HueForge — toast.js
 * Small, accessible notifications. The region is `aria-live="polite"` in the
 * markup, so screen readers announce messages without stealing focus.
 */

const MAX_VISIBLE = 3;

/**
 * @param {string} message
 * @param {'success'|'info'|'error'} tone
 */
export function toast(message, tone = 'success') {
  const region = document.getElementById('toast-region');
  if (!region) return;

  while (region.children.length >= MAX_VISIBLE) {
    region.firstElementChild?.remove();
  }

  const element = document.createElement('div');
  element.className = `toast toast--${tone}`;
  element.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  element.innerHTML = `<span class="toast__dot" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
  region.appendChild(element);

  window.setTimeout(() => {
    element.classList.add('is-leaving');
    element.addEventListener('animationend', () => element.remove(), { once: true });
    // Fallback in case animations are disabled by the OS.
    window.setTimeout(() => element.remove(), 400);
  }, tone === 'error' ? 4200 : 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Copy text with a graceful fallback for non-secure contexts. */
export async function copyText(text, successMessage = 'Copied to clipboard') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      if (!ok) throw new Error('execCommand failed');
    }
    toast(successMessage);
    return true;
  } catch {
    toast('Copy failed — select the text and press Ctrl/Cmd + C', 'error');
    return false;
  }
}
