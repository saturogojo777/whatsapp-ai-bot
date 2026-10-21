/**
 * HueForge — storage.js
 * -----------------------------------------------------------------------------
 * Tiny, defensive wrapper around localStorage. Safari private mode and some
 * embedded webviews throw on access, so every call is guarded and falls back to
 * an in-memory store. Nothing here is required for the tool to work.
 */

const STORAGE_KEY = 'hueforge:state:v1';
const SAVED_KEY = 'hueforge:saved:v1';
const THEME_KEY = 'hueforge:theme:v1';
const MAX_SAVED = 24;

/** In-memory fallback used when localStorage is unavailable. */
const memory = new Map();

const safeStorage = (() => {
  try {
    const testKey = '__hueforge_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
})();

function readRaw(key) {
  if (safeStorage) {
    try {
      return safeStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memory.get(key) ?? null;
}

function writeRaw(key, value) {
  if (safeStorage) {
    try {
      safeStorage.setItem(key, value);
      return true;
    } catch {
      // Quota exceeded — fall through to memory so the session still works.
    }
  }
  memory.set(key, value);
  return false;
}

function removeRaw(key) {
  if (safeStorage) {
    try {
      safeStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  memory.delete(key);
}

const parse = (raw, fallback) => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/** Persist the working palette so a refresh doesn't lose your place. */
export const saveSession = (state) => writeRaw(STORAGE_KEY, JSON.stringify(state));

/** Restore the working palette. Returns null when nothing valid is stored. */
export function loadSession() {
  const state = parse(readRaw(STORAGE_KEY), null);
  if (!state || !Array.isArray(state.colors) || state.colors.length !== 5) {
    return null;
  }
  return state;
}

/** Saved palette library (newest first). */
export function loadSaved() {
  const saved = parse(readRaw(SAVED_KEY), []);
  return Array.isArray(saved) ? saved.filter((entry) => entry?.colors?.length === 5) : [];
}

export function persistSaved(entries) {
  return writeRaw(SAVED_KEY, JSON.stringify(entries.slice(0, MAX_SAVED)));
}

/** Add a palette to the library, replacing an identical one. */
export function addSavedPalette(palette) {
  const saved = loadSaved();
  const signature = palette.colors.join('');
  const entry = { ...palette, id: `${Date.now()}-${signature.slice(1, 7)}` };
  const next = [entry, ...saved.filter((item) => item.colors.join('') !== signature)];
  persistSaved(next);
  return next.slice(0, MAX_SAVED);
}

/** Remove a palette by id. */
export function removeSavedPalette(id) {
  const next = loadSaved().filter((entry) => entry.id !== id);
  persistSaved(next);
  return next;
}

export const clearSaved = () => removeRaw(SAVED_KEY);

/** Theme preference: 'dark' | 'light' | 'system'. */
export const saveTheme = (theme) => writeRaw(THEME_KEY, theme);
export const loadTheme = () => readRaw(THEME_KEY) || 'system';
