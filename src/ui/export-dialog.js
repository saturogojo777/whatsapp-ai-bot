/**
 * HueForge — export-dialog.js
 * Wires the export modal: format switching, live code preview, prefix options,
 * clipboard and downloads (including binary ASE and rendered PNG).
 */

import {
  EXPORT_FORMATS,
  buildExport,
  exportFilename,
  paletteName,
} from '../core/exporters.js';
import { highlight } from './highlight.js';
import { renderPng } from './png.js';
import { copyText, toast } from './toast.js';

const PNG_FORMAT = {
  id: 'png',
  label: 'PNG poster',
  extension: 'png',
  mime: 'image/png',
  binary: true,
  image: true,
  hint: '1600 × 1000. Rendered in your browser — perfect for README screenshots, social posts or a style guide cover.',
};

const HINTS = {
  css: 'Paste into your global stylesheet. RGB triplets let you add opacity with rgb(var(--hue-500-rgb) / 0.4).',
  tailwind: 'Requires Tailwind CSS v4 or newer. Import it after @import "tailwindcss".',
  scss: 'Variables plus a map and helper function — works with Dart Sass and modern compilers.',
  json: 'Machine-readable tokens for scripts, Figma plugins or documentation generators.',
  tokens: 'W3C Design Tokens Community Group format. Supported by Tokens Studio, Style Dictionary and more.',
  svg: 'Vector poster with the palette name, roles and hex codes. Drop it straight into a README.',
  ase: 'Adobe Swatch Exchange. Import via the Swatches panel in Photoshop, Illustrator or InDesign.',
  png: PNG_FORMAT.hint,
};

/** Trigger a browser download for text or binary content. */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * @param {object} refs
 * @param {HTMLDialogElement} refs.dialog
 * @param {HTMLElement} refs.formatsEl
 * @param {HTMLPreElement} refs.codeEl
 * @param {HTMLElement} refs.imageWrap
 * @param {HTMLImageElement} refs.imageEl
 * @param {HTMLInputElement} refs.prefixEl
 * @param {HTMLElement} refs.hintEl
 * @param {HTMLButtonElement} refs.copyBtn
 * @param {HTMLButtonElement} refs.downloadBtn
 * @param {() => {colors: string[]}} getState
 */
export function createExportController(refs, getState) {
  const formats = [...EXPORT_FORMATS, PNG_FORMAT];
  let activeId = 'css';
  let pngCache = { key: '', blob: null, url: '' };
  let refreshTimer = 0;

  const activeFormat = () => formats.find((format) => format.id === activeId) ?? formats[0];
  const prefix = () => refs.prefixEl.value.trim() || 'hue';

  /** Buttons ------------------------------------------------------------- */
  refs.formatsEl.innerHTML = formats
    .map(
      (format) => `
      <button
        class="export-format${format.id === activeId ? ' is-active' : ''}"
        type="button"
        role="tab"
        aria-selected="${format.id === activeId}"
        data-format="${format.id}"
      >
        <span>${format.label}</span>
        <small>.${format.extension}${format.binary ? ' · binary' : ''}</small>
      </button>`,
    )
    .join('');

  function selectFormat(id, { focus = false } = {}) {
    activeId = formats.some((format) => format.id === id) ? id : 'css';
    refs.formatsEl.querySelectorAll('[data-format]').forEach((button) => {
      const isActive = button.dataset.format === activeId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
      if (isActive && focus) button.focus();
    });
    refresh();
  }

  /** Preview + metadata ------------------------------------------------ */
  async function refresh() {
    const format = activeFormat();
    const colors = getState().colors;
    const name = paletteName(colors);
    const isBinaryOnly = Boolean(format.binary);

    refs.prefixEl.disabled = ['svg', 'png'].includes(format.id);
    refs.copyBtn.disabled = isBinaryOnly;
    refs.copyBtn.title = isBinaryOnly ? 'Binary formats must be downloaded' : 'Copy to clipboard';
    refs.hintEl.textContent = HINTS[format.id] ?? '';
    refs.imageWrap.hidden = format.id !== 'png';
    refs.codeEl.hidden = format.id === 'png';

    if (format.id === 'png') {
      await showPng(colors, name);
      return;
    }

    if (format.id === 'ase') {
      // Text preview of a binary file is misleading — show a manifest instead.
      const bytes = buildExport('ase', colors, { prefix: prefix() }).content;
      refs.codeEl.innerHTML = highlight(
        `// ${name}.ase — Adobe Swatch Exchange
// ${colors.length} global RGB swatches · ${bytes.byteLength} bytes
//
// ${colors.map((hex, index) => `${prefix()}-${['100', '300', '500', '700', '900'][index]}  ${hex.toUpperCase()}`).join('\n// ')}
//
// Download this file, then choose Swatches → Load Swatches
// in Photoshop, Illustrator or InDesign.`,
        'scss',
      );
      return;
    }

    const result = buildExport(format.id, colors, { prefix: prefix(), name: `${name} palette` });
    if (!result) return;
    refs.codeEl.innerHTML = highlight(result.content, format.language);
  }

  async function showPng(colors, name) {
    const key = `${colors.join('')}:${name}`;
    if (pngCache.key !== key) {
      if (pngCache.url) URL.revokeObjectURL(pngCache.url);
      pngCache = { key: '', blob: null, url: '' };
      refs.imageWrap.dataset.loading = 'true';
      try {
        const blob = await renderPng(colors, { name });
        pngCache = { key, blob, url: URL.createObjectURL(blob) };
      } catch {
        refs.imageWrap.dataset.loading = 'false';
        toast('Could not render the PNG poster', 'error');
        return;
      }
    }
    refs.imageWrap.dataset.loading = 'false';
    refs.imageEl.src = pngCache.url;
  }

  /** Copy / download --------------------------------------------------- */
  refs.copyBtn.addEventListener('click', () => {
    const format = activeFormat();
    if (format.binary) {
      toast('Binary formats need to be downloaded', 'info');
      return;
    }
    copyText(refs.codeEl.textContent, `${format.label} copied`);
  });

  refs.downloadBtn.addEventListener('click', async () => {
    const format = activeFormat();
    const state = getState();
    const name = paletteName(state.colors);
    const filename = exportFilename(format, { name });

    if (format.id === 'png') {
      try {
        const blob = pngCache.blob ?? (await renderPng(state.colors, { name }));
        download(blob, filename);
        toast('PNG poster downloaded');
      } catch {
        toast('Could not render the PNG poster', 'error');
      }
      return;
    }

    const result = buildExport(format.id, state.colors, {
      prefix: prefix(),
      name: `${name} palette`,
    });
    if (!result) return;

    if (format.binary) {
      download(new Blob([result.content], { type: format.mime }), filename);
    } else {
      download(new Blob([result.content], { type: `${format.mime};charset=utf-8` }), filename);
    }
    toast(`${format.label} downloaded`);
  });

  refs.prefixEl.addEventListener('input', () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 160);
  });

  /* Format list: click + arrow-key navigation (tablist pattern). */
  refs.formatsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-format]');
    if (button) selectFormat(button.dataset.format);
  });

  refs.formatsEl.addEventListener('keydown', (event) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = formats.findIndex((format) => format.id === activeId);
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % formats.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + formats.length) % formats.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = formats.length - 1;
    selectFormat(formats[next].id, { focus: true });
  });

  return {
    open(formatId) {
      if (formatId) {
        activeId = formats.some((format) => format.id === formatId) ? formatId : activeId;
        refs.formatsEl.querySelectorAll('[data-format]').forEach((button) => {
          const isActive = button.dataset.format === activeId;
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-selected', String(isActive));
          button.tabIndex = isActive ? 0 : -1;
        });
      }
      if (!refs.dialog.open) refs.dialog.showModal();
      refresh();
      // Focus the selected format for keyboard users.
      refs.formatsEl.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    },
    refresh,
    close() {
      refs.dialog.close();
    },
  };
}
