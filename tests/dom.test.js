/**
 * DOM smoke test.
 *
 * Boots the real index.html inside jsdom, then exercises the main interactions.
 * WebGL is unavailable in jsdom, which also verifies the graceful CSS fallback.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Install the browser APIs jsdom does not implement. */
function installStubs(window) {
  window.HTMLElement.prototype.scrollIntoView = () => {};

  class ObserverStub {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      this.callback([{ isIntersecting: true, target }]);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  window.IntersectionObserver = ObserverStub;
  window.ResizeObserver = ObserverStub;
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });

  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }

  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return null; // forces the WebGL fallback
  };

  Object.assign(window.navigator, {
    clipboard: {
      async writeText() {},
    },
  });

  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
  window.confirm = () => true;
}

test('the app boots and every surface renders', async (t) => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://hueforge.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  installStubs(window);

  // Expose globals for ES module code running in Node.
  const previous = {};
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLDialogElement: window.HTMLDialogElement,
    HTMLCanvasElement: window.HTMLCanvasElement,
    IntersectionObserver: window.IntersectionObserver,
    ResizeObserver: window.ResizeObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    matchMedia: window.matchMedia,
    localStorage: window.localStorage,
    history: window.history,
    location: window.location,
    getComputedStyle: window.getComputedStyle.bind(window),
  };

  for (const [key, value] of Object.entries(globals)) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }

  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (!descriptor) delete globalThis[key];
      else Object.defineProperty(globalThis, key, descriptor);
    }
    window.close();
  });

  await import('../src/main.js');

  const $ = (selector) => window.document.querySelector(selector);
  const $$ = (selector) => [...window.document.querySelectorAll(selector)];

  /* Initial render ----------------------------------------------------- */
  assert.equal($$('#swatch-grid .swatch').length, 5, 'five swatches');
  assert.equal($$('#contrast-matrix tbody tr').length, 5, 'five contrast rows');
  assert.equal($$('#contrast-matrix tbody td').length, 25, '25 contrast cells');
  assert.equal($$('#harmony-grid [data-mode]').length, 9, 'nine harmonies');
  assert.equal($$('#vision-modes [data-vision]').length, 5, 'five vision modes');
  assert.equal($$('#vision-grid .vision-item').length, 5, 'five vision previews');
  assert.equal($$('#export-formats [data-format]').length, 8, 'eight export formats');
  assert.match($('#palette-title').textContent, /^Palette — /);
  assert.match($('#base-name').textContent, /\S+/);
  assert.ok($('#contrast-matrix tbody td').getAttribute('style').includes('background'));
  assert.ok($('#preview-card').getAttribute('style').includes('--p-bg'));

  const initialHexes = $$('#swatch-grid .swatch').map((card) => card.dataset.hex);
  assert.equal(new Set(initialHexes).size, 5, 'unique swatches');

  /* Generation --------------------------------------------------------- */
  $('#generate').click();
  const generatedHexes = $$('#swatch-grid .swatch').map((card) => card.dataset.hex);
  assert.notDeepEqual(generatedHexes, initialHexes, 'generate changes colours');
  assert.equal($('#undo').disabled, false, 'undo becomes available');

  /* Undo --------------------------------------------------------------- */
  $('#undo').click();
  assert.deepEqual(
    $$('#swatch-grid .swatch').map((card) => card.dataset.hex),
    initialHexes,
    'undo restores the previous palette',
  );

  /* Redo --------------------------------------------------------------- */
  $('#redo').click();
  assert.deepEqual(
    $$('#swatch-grid .swatch').map((card) => card.dataset.hex),
    generatedHexes,
    'redo reapplies',
  );

  /* Lock a swatch and regenerate --------------------------------------- */
  const lockButton = $('#swatch-grid .swatch [data-action="lock"]');
  lockButton.click();
  const lockedHex = $('#swatch-grid .swatch').dataset.hex;
  assert.equal(
    $('#swatch-grid .swatch [data-action="lock"]').getAttribute('aria-pressed'),
    'true',
  );
  $('#generate').click();
  assert.equal($('#swatch-grid .swatch').dataset.hex, lockedHex, 'locked swatch survives');

  /* Harmony switch ----------------------------------------------------- */
  const triadic = $('#harmony-grid [data-mode="triadic"]');
  triadic.click();
  assert.equal(triadic.getAttribute('aria-checked'), 'true');
  assert.match($('#palette-subtitle').textContent, /Triadic/);

  /* Import ------------------------------------------------------------- */
  $('#palette-input').value = '#ffd166, #ff8a5c, #112233';
  $('#import-palette').click();
  const imported = $$('#swatch-grid .swatch').map((card) => card.dataset.hex);
  assert.equal(imported.length, 5);
  assert.ok(imported.includes('#ffd166'), 'imported colour preserved');
  assert.ok(imported.includes('#112233'), 'imported colour preserved');
  assert.match($('#palette-subtitle').textContent, /Imported/);

  /* Contrast toggle ---------------------------------------------------- */
  $('#large-text').checked = true;
  $('#large-text').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal($('#contrast-matrix').dataset.threshold, '3');

  /* Tabs --------------------------------------------------------------- */
  $('#tab-preview').click();
  assert.equal($('#panel-preview').hidden, false);
  assert.equal($('#panel-contrast').hidden, true);
  $('#tab-vision').click();
  assert.equal($('#panel-vision').hidden, false);

  /* Vision simulation -------------------------------------------------- */
  $('#vision-modes [data-vision="deuteranopia"]').click();
  assert.ok($('#vision-modes [data-vision="deuteranopia"]').classList.contains('is-active'));

  /* Export dialog ------------------------------------------------------ */
  $('#export-open').click();
  assert.ok($('#export-dialog').hasAttribute('open'));
  const code = $('#export-code').textContent;
  assert.match(code, /:root/);
  const jsonButton = $('#export-formats [data-format="json"]');
  jsonButton.click();
  assert.match($('#export-code').textContent, /"colors"/);
  $('#export-prefix').value = 'brand';
  $('#export-prefix').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#export-close').click();
  assert.equal($('#export-dialog').hasAttribute('open'), false);

  /* Theme -------------------------------------------------------------- */
  const beforeTheme = window.document.documentElement.dataset.theme;
  $('#theme-toggle').click();
  assert.notEqual(window.document.documentElement.dataset.theme, beforeTheme);

  /* Save to library ---------------------------------------------------- */
  $('#save').click();
  assert.equal($$('#saved-list .saved-item').length, 1, 'palette saved');
  $('#saved-list [data-action="remove"]').click();
  assert.equal($$('#saved-list .saved-item').length, 0, 'palette removed');

  /* URL sharing -------------------------------------------------------- */
  $('#share').click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.match(window.location.hash, /p=[0-9a-f-]+/);

  /* Hero fallback ------------------------------------------------------ */
  assert.ok($('#hero-stage').classList.contains('is-fallback'), 'CSS orb fallback engaged');

  /* Every swatch has an accessible label ------------------------------- */
  for (const card of $$('#swatch-grid .swatch')) {
    assert.match(card.getAttribute('aria-label'), /contrast/i);
  }
});
