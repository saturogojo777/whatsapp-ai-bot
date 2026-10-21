/**
 * HueForge — main.js
 * -----------------------------------------------------------------------------
 * Application controller. Owns the palette state, the undo stack, keyboard
 * shortcuts, URL sharing, persistence and the glue between the UI modules and
 * the Three.js hero scene.
 *
 * Reading order, top to bottom:
 *   1. DOM lookup          5. Palette actions
 *   2. State + history     6. Library + image import
 *   3. Rendering           7. Theme, tabs, dialogs, shortcuts
 *   4. Harmony / controls  8. Boot
 */

import {
  CVD_LABELS,
  colorName,
  contrastRatio,
  normalizeHex,
} from './core/color.js';
import {
  DEFAULT_BASE,
  HARMONIES,
  PALETTE_SIZE,
  createSeed,
  decodeShare,
  encodeShare,
  generatePalette,
  moveColor,
  normalizeLocks,
  randomBase,
  resolveMode,
} from './core/palette.js';
import { paletteName } from './core/exporters.js';
import {
  addSavedPalette,
  clearSaved,
  loadSaved,
  loadSession,
  loadTheme,
  removeSavedPalette,
  saveSession,
  saveTheme,
} from './core/storage.js';
import {
  buildPaletteFromHexes,
  extractFromImage,
  parseColorList,
} from './core/import.js';
import { createHeroScene } from './three/hero.js';
import { renderSwatches } from './ui/swatches.js';
import { renderContrast } from './ui/contrast.js';
import {
  renderVision,
  renderVisionModes,
  setActiveVisionMode,
} from './ui/vision.js';
import { PREVIEW_VARIATIONS, renderPreview } from './ui/preview.js';
import { renderLibrary } from './ui/library.js';
import { createExportController } from './ui/export-dialog.js';
import { copyText, toast } from './ui/toast.js';

/* -------------------------------------------------------------------------- */
/* 1. DOM                                                                     */
/* -------------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const dom = {
  root: document.documentElement,
  header: $('site-header'),
  nav: $('site-nav'),
  menuToggle: $('menu-toggle'),
  themeToggle: $('theme-toggle'),

  heroStage: $('hero-stage'),
  heroRandom: $('hero-random'),
  heroBadgeA: $('hero-badge-a'),
  heroBadgeB: $('hero-badge-b'),

  baseWell: $('base-well'),
  baseColor: $('base-color'),
  baseHex: $('base-hex'),
  baseName: $('base-name'),
  copyBase: $('copy-base'),
  randomBaseBtn: $('random-base'),
  eyedropper: $('eyedropper'),

  paletteInput: $('palette-input'),
  importBtn: $('import-palette'),
  importHint: $('import-hint'),
  imageInput: $('image-input'),
  uploadLabel: document.querySelector('.upload'),

  harmonyGrid: $('harmony-grid'),
  harmonyHint: $('harmony-hint'),
  seedLabel: $('seed-label'),

  generate: $('generate'),
  generateHint: $('generate-hint'),
  undo: $('undo'),
  redo: $('redo'),
  lockAll: $('lock-all'),
  save: $('save'),
  share: $('share'),

  savedList: $('saved-list'),
  savedEmpty: $('saved-empty'),
  clearSaved: $('clear-saved'),

  paletteTitle: $('palette-title'),
  paletteSubtitle: $('palette-subtitle'),
  swatchGrid: $('swatch-grid'),
  copyAll: $('copy-all'),
  exportOpen: $('export-open'),

  contrastMatrix: $('contrast-matrix'),
  contrastSummary: $('contrast-summary'),
  largeText: $('large-text'),

  previewIndex: $('shuffle-preview'),
  visionModes: $('vision-modes'),
  visionGrid: $('vision-grid'),

  featureRamp: $('feature-ramp'),

  exportDialog: $('export-dialog'),
  exportClose: $('export-close'),
  exportFormats: $('export-formats'),
  exportCode: $('export-code'),
  exportImageWrap: $('export-image-wrap'),
  exportImage: $('export-image'),
  exportPrefix: $('export-prefix'),
  exportHint: $('export-hint'),
  exportCopy: $('export-copy'),
  exportDownload: $('export-download'),

  helpDialog: $('help-dialog'),
  helpOpen: $('help-open'),
  helpClose: $('help-close'),

  year: $('year'),
};

/* -------------------------------------------------------------------------- */
/* 2. State + history                                                         */
/* -------------------------------------------------------------------------- */

const STORAGE_DEFAULTS = {
  base: DEFAULT_BASE,
  mode: 'auto',
  seed: 1,
  locks: Array(PALETTE_SIZE).fill(false),
  largeText: false,
  visionMode: 'none',
};

/** Restore a palette saved in localStorage, validating every field. */
function restoreSession() {
  const stored = loadSession();
  if (!stored || !Array.isArray(stored.colors) || stored.colors.length !== PALETTE_SIZE) {
    return null;
  }
  const colors = stored.colors.map(normalizeHex);
  if (colors.some((hex) => !hex)) return null;

  return {
    colors,
    base: normalizeHex(stored.base) ?? colors[2],
    mode: HARMONIES[stored.mode] ? stored.mode : 'auto',
    seed: Number.isFinite(stored.seed) ? Math.floor(stored.seed) : 1,
    locks: normalizeLocks(stored.locks),
    largeText: Boolean(stored.largeText),
    visionMode: CVD_LABELS[stored.visionMode] ? stored.visionMode : 'none',
  };
}

/** First paint state: URL hash → session → deterministic default. */
function createInitialState() {
  const shared = decodeShare(window.location.hash);
  if (shared) {
    return {
      ...STORAGE_DEFAULTS,
      ...shared,
      colors: shared.colors,
      locks: normalizeLocks(shared.locks),
      largeText: false,
      visionMode: 'none',
      source: 'link',
    };
  }

  const session = restoreSession();
  if (session) return { ...session, source: 'session' };

  const seed = createSeed();
  const palette = generatePalette({ base: DEFAULT_BASE, mode: 'auto', seed });
  return {
    ...STORAGE_DEFAULTS,
    colors: palette.colors,
    base: palette.base,
    mode: palette.mode,
    seed: palette.seed,
    locks: palette.locks,
    source: 'generated',
  };
}

const state = createInitialState();
let past = [];
let future = [];
const HISTORY_LIMIT = 50;

const cloneState = () => ({
  colors: [...state.colors],
  base: state.base,
  mode: state.mode,
  seed: state.seed,
  locks: [...state.locks],
});

function remember() {
  past.push(cloneState());
  if (past.length > HISTORY_LIMIT) past.shift();
  future = [];
  updateHistoryButtons();
}

function restore(snapshot) {
  state.colors = [...snapshot.colors];
  state.base = snapshot.base;
  state.mode = snapshot.mode;
  state.seed = snapshot.seed;
  state.locks = [...snapshot.locks];
  state.source = 'generated';
}

function updateHistoryButtons() {
  if (dom.undo) dom.undo.disabled = past.length === 0;
  if (dom.redo) dom.redo.disabled = future.length === 0;
}

/* -------------------------------------------------------------------------- */
/* 3. Rendering                                                               */
/* -------------------------------------------------------------------------- */

let hero = null;
let savedPalettes = loadSaved();
let exportController = null;
let hashTimer = 0;

/** Recompute colours from the current base, mode, seed and locks. */
function regenerate({ newSeed = false } = {}) {
  if (newSeed) state.seed = createSeed();
  const palette = generatePalette({
    base: state.base,
    mode: state.mode,
    seed: state.seed,
    locks: state.locks,
    previous: state.colors,
  });
  state.colors = palette.colors;
  state.locks = palette.locks;
  state.source = 'generated';
}

/** Draw the harmony pills once; state changes only update attributes/dots. */
function buildHarmonyButtons() {
  dom.harmonyGrid.innerHTML = Object.entries(HARMONIES)
    .map(
      ([key, definition]) => `
      <button
        class="harmony"
        type="button"
        role="radio"
        aria-checked="${state.mode === key}"
        data-mode="${key}"
        title="${definition.hint}"
      >
        <span>${definition.label}</span>
        <span class="harmony__dots" aria-hidden="true">
          ${Array.from({ length: PALETTE_SIZE }, () => '<i></i>').join('')}
        </span>
      </button>`,
    )
    .join('');
}

function updateHarmonyPreview() {
  dom.harmonyGrid.querySelectorAll('[data-mode]').forEach((button) => {
    const mode = button.dataset.mode;
    const checked = state.mode === mode;
    button.setAttribute('aria-checked', String(checked));
    const dots = button.querySelectorAll('i');
    const preview = generatePalette({
      base: state.base,
      mode,
      seed: state.seed,
      locks: [],
    });
    dots.forEach((dot, index) => {
      dot.style.setProperty('--dot', preview.colors[index]);
    });
  });
}

function updateHarmonyHint() {
  const resolved = resolveMode(state.mode, state.seed);
  if (state.mode === 'auto') {
    dom.harmonyHint.textContent = `Auto → ${HARMONIES[resolved].label}`;
  } else {
    dom.harmonyHint.textContent = HARMONIES[state.mode].line ?? HARMONIES[state.mode].label;
  }
}

/** Keep the URL shareable without spamming browser history. */
function syncHash() {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const next = `#${encodeShare(state)}`;
    if (window.location.hash !== next) {
      try {
        window.history.replaceState(null, '', next);
      } catch {
        /* file:// in some browsers refuses replaceState */
      }
    }
  }, 240);
}

/** Persist state for the next visit. */
let persistTimer = 0;
function persist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    saveSession({
      colors: state.colors,
      base: state.base,
      mode: state.mode,
      seed: state.seed,
      locks: state.locks,
      largeText: state.largeText,
      visionMode: state.visionMode,
    });
  }, 120);
}

/** The single render pass. Called after every state change. */
function render() {
  /* Swatches */
  renderSwatches(dom.swatchGrid, state);

  /* Base controls */
  dom.baseWell.style.setProperty('--well', state.base);
  dom.baseColor.value = state.base;
  if (document.activeElement !== dom.baseHex) dom.baseHex.value = state.base.slice(1);
  const baseLabel = colorName(state.base);
  dom.baseName.textContent = baseLabel;

  /* Titles and hints */
  dom.paletteTitle.textContent = `Palette — ${paletteName(state.colors)}`;
  const lockedCount = state.locks.filter(Boolean).length;
  if (state.source === 'imported') {
    dom.paletteSubtitle.textContent = 'Imported palette · 5 swatches · contrast checked locally';
  } else {
    dom.paletteSubtitle.textContent = `${HARMONIES[state.mode].label} harmony · seed ${state.seed}${
      lockedCount ? ` · ${lockedCount} locked` : ''
    } · generated locally`;
  }

  dom.seedLabel.textContent = `Seed ${state.seed}`;
  updateHarmonyHint();
  updateHarmonyPreview();

  dom.lockAll.checked = lockedCount === PALETTE_SIZE;
  dom.lockAll.indeterminate = lockedCount > 0 && lockedCount < PALETTE_SIZE;

  dom.generateHint.textContent = lockedCount
    ? `${lockedCount} swatch${lockedCount === 1 ? '' : 'es'} locked — they will survive the next generation.`
    : 'Tip: hover a swatch and tap the lock to keep it.';

  /* Analysis */
  renderContrast(dom.contrastMatrix, dom.contrastSummary, state);
  renderVision(dom.visionGrid, state);
  renderPreview(state, state.previewIndex ?? 0);

  /* Marketing ramp mirrors the live palette */
  if (dom.featureRamp) {
    dom.featureRamp.innerHTML = state.colors
      .map((hex) => `<span style="--c:${hex}"></span>`)
      .join('');
  }

  /* Hero badges + 3D colours */
  if (dom.heroBadgeA) dom.heroBadgeA.textContent = state.colors[2].toUpperCase();
  if (dom.heroBadgeB) {
    const ratio = contrastRatio(state.colors[0], state.colors[4]);
    dom.heroBadgeB.textContent = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? '3:1' : 'LOW';
  }
  // Keep the CSS fallback orb in sync even when WebGL is available.
  if (dom.heroStage) {
    ['a', 'b', 'c', 'd', 'e'].forEach((key, index) => {
      dom.heroStage.style.setProperty(`--hero-${key}`, state.colors[index]);
    });
  }

  hero?.setPalette(state.colors);

  updateHistoryButtons();
  persist();
  syncHash();
}

/* -------------------------------------------------------------------------- */
/* 4. Palette actions                                                         */
/* -------------------------------------------------------------------------- */

function generate({ newSeed = true } = {}) {
  if (state.locks.every(Boolean)) {
    toast('Everything is locked — unlock a swatch to generate', 'info');
    return;
  }
  remember();
  regenerate({ newSeed });
  render();
}

function setBase(hex, { regeneratePalette = true } = {}) {
  const safe = normalizeHex(hex);
  if (!safe) {
    toast('That is not a valid hex colour', 'error');
    return;
  }
  remember();
  state.base = safe;
  if (regeneratePalette) regenerate();
  render();
}

function randomiseBase() {
  remember();
  const seed = createSeed();
  state.base = randomBase(seed);
  state.seed = seed;
  regenerate();
  state.source = 'generated';
  render();
}

function selectMode(mode) {
  if (!HARMONIES[mode] || state.mode === mode) return;
  remember();
  state.mode = mode;
  regenerate();
  render();
}

function toggleLock(index) {
  if (index < 0 || index >= PALETTE_SIZE) return;
  state.locks[index] = !state.locks[index];
  render();
}

function setAllLocks(locked) {
  state.locks = Array(PALETTE_SIZE).fill(Boolean(locked));
  render();
  toast(locked ? 'All swatches locked' : 'All swatches unlocked', 'info');
}

function setSwatchColor(index, hex) {
  const safe = normalizeHex(hex);
  if (!safe) return;
  remember();
  state.colors = state.colors.map((color, position) => (position === index ? safe : color));
  state.source = 'imported';
  render();
}

function reorder(from, to) {
  if (from === to) return;
  remember();
  state.colors = moveColor(state.colors, from, to);
  state.locks = moveColor(state.locks, from, to);
  state.source = 'imported';
  render();
}

function undo() {
  if (!past.length) return;
  future.push(cloneState());
  restore(past.pop());
  render();
}

function redo() {
  if (!future.length) return;
  past.push(cloneState());
  restore(future.pop());
  render();
}

function applyImported(result, message) {
  if (!result) return;
  remember();
  state.colors = result.colors;
  state.base = result.base;
  state.locks = Array(PALETTE_SIZE).fill(false);
  state.source = 'imported';
  render();
  if (message) toast(message);
}

/* -------------------------------------------------------------------------- */
/* 5. Library                                                                 */
/* -------------------------------------------------------------------------- */

function refreshLibrary() {
  renderLibrary(dom.savedList, dom.savedEmpty, savedPalettes);
}

function savePalette() {
  savedPalettes = addSavedPalette({
    colors: [...state.colors],
    base: state.base,
    mode: state.mode,
    seed: state.seed,
    locks: [...state.locks],
    createdAt: new Date().toISOString(),
  });
  refreshLibrary();
  toast('Palette saved to your library');
}

function loadFromLibrary(id) {
  const entry = savedPalettes.find((item) => item.id === id);
  if (!entry) return;
  remember();
  state.colors = [...entry.colors];
  state.base = normalizeHex(entry.base) ?? entry.colors[2];
  state.mode = HARMONIES[entry.mode] ? entry.mode : 'auto';
  state.seed = Number.isFinite(entry.seed) ? entry.seed : 1;
  state.locks = normalizeLocks(entry.locks);
  state.source = 'generated';
  render();
  toast('Palette loaded');
}

/* -------------------------------------------------------------------------- */
/* 6. Import                                                                  */
/* -------------------------------------------------------------------------- */

function importText() {
  const colors = parseColorList(dom.paletteInput.value);
  if (!colors.length) {
    dom.importHint.textContent = 'No hex colours found. Try #7c5cff or rgb(124 92 255).';
    toast('No colours found in that text', 'error');
    return;
  }

  const result = buildPaletteFromHexes(colors);
  if (!result) return;
  const message =
    colors.length === 1
      ? 'Base colour imported — ramp generated'
      : colors.length > 5
        ? `Read ${colors.length} colours — kept the 5 most evenly spaced`
        : `Imported ${colors.length} colours and filled the gaps`;
  dom.importHint.textContent =
    colors.length > 5
      ? `Read ${colors.length} colours; using 5 evenly spaced steps.`
      : 'Import worked — tweak the base or harmony to keep forging.';
  applyImported(result, message);
}

async function importImage(file) {
  if (!file) return;
  const uploadText = dom.uploadLabel?.querySelector('span');
  const originalText = uploadText?.textContent ?? '';
  dom.uploadLabel?.classList.add('is-loading');
  if (uploadText) uploadText.textContent = 'Analysing image…';
  try {
    const extracted = await extractFromImage(file, 5);
    if (!extracted.length) {
      toast('Could not find colours in that image', 'error');
      return;
    }
    const result = buildPaletteFromHexes(extracted);
    applyImported(result, `Pulled ${extracted.length} colours from “${file.name}”`);
    dom.importHint.textContent = `Extracted ${extracted.length} clusters from your image.`;
  } catch (error) {
    toast(error?.message ?? 'That image could not be read', 'error');
  } finally {
    dom.uploadLabel?.classList.remove('is-loading');
    if (uploadText) uploadText.textContent = originalText;
  }
}

function handleImageInput(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) importImage(file);
}

/* -------------------------------------------------------------------------- */
/* 7. Theme, tabs, dialogs                                                    */
/* -------------------------------------------------------------------------- */

function applyTheme(theme, { persist: shouldPersist = true } = {}) {
  dom.root.dataset.theme = theme;
  if (shouldPersist) saveTheme(theme);
  const isLight = theme === 'light';
  dom.themeToggle?.setAttribute(
    'aria-label',
    `Switch to ${isLight ? 'dark' : 'light'} theme`,
  );
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isLight ? '#f4f5fa' : '#06070b');
}

function toggleTheme() {
  applyTheme(dom.root.dataset.theme === 'light' ? 'dark' : 'light');
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter((tab) =>
    tab.classList.contains('tab'),
  );
  if (!tabs.length) return;

  const activate = (tab, { focus = false } = {}) => {
    tabs.forEach((candidate) => {
      const selected = candidate === tab;
      candidate.setAttribute('aria-selected', String(selected));
      candidate.classList.toggle('is-active', selected);
      candidate.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(candidate.getAttribute('aria-controls'));
      if (panel) {
        panel.hidden = !selected;
        panel.classList.toggle('is-active', selected);
      }
    });
    if (focus) tab.focus();
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        activate(next, { focus: true });
      }
    });
  });
}

function setupNav() {
  dom.menuToggle?.addEventListener('click', () => {
    const open = !dom.nav.classList.contains('is-open');
    dom.nav.classList.toggle('is-open', open);
    dom.menuToggle.setAttribute('aria-expanded', String(open));
    dom.menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  dom.nav?.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      dom.nav.classList.remove('is-open');
      dom.menuToggle?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('click', (event) => {
    if (!dom.nav?.classList.contains('is-open')) return;
    if (event.target.closest('#site-nav') || event.target.closest('#menu-toggle')) return;
    dom.nav.classList.remove('is-open');
    dom.menuToggle?.setAttribute('aria-expanded', 'false');
  });

  window.addEventListener(
    'scroll',
    () => {
      dom.header?.classList.toggle('is-scrolled', window.scrollY > 8);
    },
    { passive: true },
  );
  dom.header?.classList.toggle('is-scrolled', window.scrollY > 8);
}

function setupDialogs() {
  const bindClose = (dialog, button) => {
    button?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  };

  bindClose(dom.exportDialog, dom.exportClose);
  bindClose(dom.helpDialog, dom.helpClose);
  dom.helpOpen?.addEventListener('click', () => dom.helpDialog?.showModal());
}

function setupReveal() {
  const elements = [...document.querySelectorAll('.reveal')];
  // Only hide-then-reveal when we can observe; otherwise content stays visible.
  dom.root.classList.add('js-reveal');

  if (!('IntersectionObserver' in window)) {
    elements.forEach((element) => element.classList.add('is-visible'));
    return;
  }

  // Safety net: if an element never intersects (printing, odd scroll
  // containers, automated screenshots), reveal everything after a moment.
  window.setTimeout(() => {
    elements.forEach((element) => element.classList.add('is-visible'));
  }, 4000);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  elements.forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
    observer.observe(element);
  });
}

/* -------------------------------------------------------------------------- */
/* 8. Keyboard shortcuts                                                      */
/* -------------------------------------------------------------------------- */

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName) ||
    target.isContentEditable ||
    Boolean(target.closest('dialog[open]'))
  );
}

function setupShortcuts() {
  document.addEventListener('keydown', (event) => {
    const modifier = event.metaKey || event.ctrlKey;

    if (modifier && event.key.toLowerCase() === 'z') {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }

    if (modifier && event.key.toLowerCase() === 'y') {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      redo();
      return;
    }

    if (modifier || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        generate();
        break;
      case 'r':
      case 'R':
        randomiseBase();
        break;
      case 'l':
      case 'L':
        setAllLocks(!state.locks.every(Boolean));
        break;
      case 'e':
      case 'E':
        exportController?.open();
        break;
      case 's':
      case 'S':
        savePalette();
        break;
      case 't':
      case 'T':
        toggleTheme();
        break;
      case '?':
        dom.helpDialog?.showModal();
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        toggleLock(Number(event.key) - 1);
        break;
      case 'Escape':
        dom.nav?.classList.remove('is-open');
        dom.menuToggle?.setAttribute('aria-expanded', 'false');
        break;
      default:
        break;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* 9. Event binding                                                           */
/* -------------------------------------------------------------------------- */

function bindControls() {
  /* Base colour ---------------------------------------------------------- */
  dom.baseColor?.addEventListener('change', (event) => setBase(event.target.value));
  dom.baseColor?.addEventListener('input', (event) => {
    // Live preview while the picker is open, but only record once on change.
    const safe = normalizeHex(event.target.value);
    if (!safe) return;
    dom.baseWell.style.setProperty('--well', safe);
  });

  const commitHex = () => {
    const safe = normalizeHex(dom.baseHex.value);
    if (!safe) {
      dom.baseHex.value = state.base.slice(1);
      dom.baseHex.classList.add('is-invalid');
      toast('Hex codes are 3 or 6 characters, 0–9 and A–F', 'error');
      window.setTimeout(() => dom.baseHex.classList.remove('is-invalid'), 900);
      return;
    }
    if (safe !== state.base) setBase(safe);
    else dom.baseHex.value = safe.slice(1);
  };

  dom.baseHex?.addEventListener('change', commitHex);
  dom.baseHex?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitHex();
      dom.baseHex.blur();
    }
  });

  dom.copyBase?.addEventListener('click', () => copyText(state.base, 'Base colour copied'));
  dom.randomBaseBtn?.addEventListener('click', randomiseBase);
  dom.heroRandom?.addEventListener('click', () => {
    randomiseBase();
    document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  dom.eyedropper?.addEventListener('click', async () => {
    if (!('EyeDropper' in window)) {
      toast('The screen eyedropper is available in Chromium browsers', 'info');
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      setBase(result.sRGBHex);
      toast('Colour picked from screen');
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Eyedropper cancelled', 'info');
    }
  });

  /* Import --------------------------------------------------------------- */
  dom.importBtn?.addEventListener('click', importText);
  dom.paletteInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      importText();
    }
  });
  dom.imageInput?.addEventListener('change', handleImageInput);

  /* Harmony -------------------------------------------------------------- */
  dom.harmonyGrid?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (button) selectMode(button.dataset.mode);
  });
  dom.harmonyGrid?.addEventListener('keydown', (event) => {
    const buttons = [...dom.harmonyGrid.querySelectorAll('[data-mode]')];
    const index = buttons.indexOf(document.activeElement);
    if (index === -1) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      buttons[(index + 1) % buttons.length].focus();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length].focus();
    }
  });

  /* Generation ----------------------------------------------------------- */
  dom.generate?.addEventListener('click', () => generate());
  dom.undo?.addEventListener('click', undo);
  dom.redo?.addEventListener('click', redo);
  dom.lockAll?.addEventListener('change', (event) => setAllLocks(event.target.checked));
  dom.save?.addEventListener('click', savePalette);
  dom.share?.addEventListener('click', () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeShare(state)}`;
    copyText(url, 'Share link copied — it rebuilds this exact palette');
  });

  /* Swatches ------------------------------------------------------------- */
  dom.swatchGrid?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const card = action.closest('.swatch');
    if (!card) return;
    const index = Number(card.dataset.index);
    const kind = action.dataset.action;

    if (kind === 'lock') toggleLock(index);
    if (kind === 'copy') copyText(state.colors[index], `${state.colors[index].toUpperCase()} copied`);
    if (kind === 'left') reorder(index, index - 1);
    if (kind === 'right') reorder(index, index + 1);
  });

  dom.swatchGrid?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-action="pick"]');
    if (!input) return;
    const card = input.closest('.swatch');
    if (card) setSwatchColor(Number(card.dataset.index), input.value);
  });

  /* Drag to reorder ------------------------------------------------------ */
  let dragFrom = null;

  dom.swatchGrid?.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.swatch');
    if (!card) return;
    dragFrom = Number(card.dataset.index);
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', String(dragFrom));
    } catch {
      /* older Safari */
    }
  });

  dom.swatchGrid?.addEventListener('dragend', () => {
    dom.swatchGrid.querySelectorAll('.swatch').forEach((card) => {
      card.classList.remove('is-dragging', 'is-drop-target');
    });
    dragFrom = null;
  });

  dom.swatchGrid?.addEventListener('dragover', (event) => {
    const card = event.target.closest('.swatch');
    if (!card || dragFrom === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dom.swatchGrid.querySelectorAll('.swatch').forEach((other) => {
      other.classList.toggle('is-drop-target', other === card && Number(other.dataset.index) !== dragFrom);
    });
  });

  dom.swatchGrid?.addEventListener('drop', (event) => {
    const card = event.target.closest('.swatch');
    if (!card || dragFrom === null) return;
    event.preventDefault();
    reorder(dragFrom, Number(card.dataset.index));
    dragFrom = null;
  });

  /* Studio toolbar ------------------------------------------------------- */
  dom.copyAll?.addEventListener('click', () =>
    copyText(state.colors.join(', '), 'Hex list copied'),
  );
  dom.exportOpen?.addEventListener('click', () => exportController?.open());

  /* Analysis ------------------------------------------------------------- */
  dom.largeText?.addEventListener('change', (event) => {
    state.largeText = event.target.checked;
    renderContrast(dom.contrastMatrix, dom.contrastSummary, state);
    persist();
  });

  dom.previewIndex?.addEventListener('click', () => {
    state.previewIndex = ((state.previewIndex ?? 0) + 1) % PREVIEW_VARIATIONS;
    renderPreview(state, state.previewIndex);
  });

  dom.visionModes?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-vision]');
    if (!button) return;
    state.visionMode = button.dataset.vision;
    setActiveVisionMode(dom.visionModes, state.visionMode);
    renderVision(dom.visionGrid, state);
    persist();
  });

  /* Library -------------------------------------------------------------- */
  dom.savedList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'load') loadFromLibrary(id);
    if (button.dataset.action === 'remove') {
      savedPalettes = removeSavedPalette(id);
      refreshLibrary();
      toast('Palette removed', 'info');
    }
  });

  dom.clearSaved?.addEventListener('click', () => {
    if (!savedPalettes.length) {
      toast('Your library is already empty', 'info');
      return;
    }
    if (window.confirm('Delete every saved palette? This cannot be undone.')) {
      clearSaved();
      savedPalettes = [];
      refreshLibrary();
      toast('Library cleared', 'info');
    }
  });

  /* Theme ---------------------------------------------------------------- */
  dom.themeToggle?.addEventListener('click', toggleTheme);

  /* Link changes --------------------------------------------------------- */
  window.addEventListener('hashchange', () => {
    const shared = decodeShare(window.location.hash);
    if (!shared) return;
    const same =
      shared.colors.join('') === state.colors.join('') &&
      shared.base === state.base &&
      shared.mode === state.mode &&
      shared.seed === state.seed;
    if (same) return;
    remember();
    state.colors = shared.colors;
    state.base = shared.base;
    state.mode = shared.mode;
    state.seed = shared.seed;
    state.locks = normalizeLocks(shared.locks);
    state.source = 'link';
    render();
    toast('Shared palette loaded');
  });
}

/* -------------------------------------------------------------------------- */
/* 10. Boot                                                                   */
/* -------------------------------------------------------------------------- */

function boot() {
  dom.year.textContent = String(new Date().getFullYear());

  /* Theme ---------------------------------------------------------------- */
  const storedTheme = loadTheme();
  const initialTheme =
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : dom.root.dataset.theme || 'dark';
  applyTheme(initialTheme, { persist: storedTheme !== 'system' });

  /* Palette UI ---------------------------------------------------------- */
  buildHarmonyButtons();
  renderVisionModes(dom.visionModes, state.visionMode);
  refreshLibrary();

  /* Hero scene ---------------------------------------------------------- */
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  hero = createHeroScene(dom.heroStage, { colors: state.colors, reducedMotion });

  /* Export dialog ------------------------------------------------------- */
  exportController = createExportController(
    {
      dialog: dom.exportDialog,
      formatsEl: dom.exportFormats,
      codeEl: dom.exportCode,
      imageWrap: dom.exportImageWrap,
      imageEl: dom.exportImage,
      prefixEl: dom.exportPrefix,
      hintEl: dom.exportHint,
      copyBtn: dom.exportCopy,
      downloadBtn: dom.exportDownload,
    },
    () => state,
  );

  /* Controls + renderers ------------------------------------------------ */
  bindControls();
  setupTabs();
  setupNav();
  setupDialogs();
  setupShortcuts();
  setupReveal();

  dom.largeText.checked = state.largeText;
  setActiveVisionMode(dom.visionModes, state.visionMode);

  render();

  /* First-visit nudge --------------------------------------------------- */
  if (state.source === 'generated' && !loadSaved().length) {
    window.setTimeout(() => {
      toast('Colours are generated locally — nothing leaves your browser', 'info');
    }, 2600);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
