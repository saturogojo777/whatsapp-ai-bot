/**
 * HueForge — palette.js
 * -----------------------------------------------------------------------------
 * Deterministic palette generation in OKLCH.
 *
 * A palette is five colours ordered from light to dark. Hue relationships come
 * from the selected harmony; lightness and chroma follow calibrated ramps so
 * every result is immediately usable as a UI scale. Locked swatches survive
 * regeneration, and the same seed + inputs always produce the same palette —
 * which is what makes share links reliable.
 */

import {
  clamp,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  colorName,
  bestText,
} from './color.js';

export const PALETTE_SIZE = 5;
export const DEFAULT_BASE = '#7c5cff';

/** Tailwind-style numeric tokens for each light-to-dark slot. */
export const TOKENS = ['100', '300', '500', '700', '900'];

/**
 * Harmony definitions.
 *
 * The five swatches are a lightness ramp (100 = lightest → 900 = darkest), so
 * lightness never jumps: that is what keeps the contrast matrix trustworthy.
 * Harmonies then decide *where accents land* on that ramp.
 *
 * `offsets`     hue rotation (degrees) per slot.
 * `chromaScale` how strongly the accent is allowed to push chroma per slot.
 *               Light accent steps stay soft; the `700` step carries the
 *               statement colour; the darkest step stays close to the anchor so
 *               text roles never turn into neon.
 */
export const HARMONIES = {
  auto: { label: 'Auto', hint: 'Picks a balanced harmony for you.' },
  analogous: {
    label: 'Analogous',
    offsets: [0, -14, 0, 14, 0],
    chromaScale: [0.85, 0.6, 1, 0.95, 0.75],
    hint: 'Neighbouring hues. Calm, cohesive, easy on the eye.',
  },
  complementary: {
    label: 'Complementary',
    offsets: [0, 0, 0, 180, 0],
    chromaScale: [0.85, 0.75, 1, 0.95, 0.7],
    hint: 'Anchor ramp plus a true opposite accent at step 700.',
  },
  split: {
    label: 'Split comp.',
    offsets: [0, 150, 0, 210, 0],
    chromaScale: [0.8, 0.5, 1, 0.9, 0.7],
    hint: 'Two neighbours of the opposite hue. Bold but balanced.',
  },
  triadic: {
    label: 'Triadic',
    offsets: [0, 120, 0, 240, 0],
    chromaScale: [0.8, 0.5, 1, 0.9, 0.7],
    hint: 'Three evenly spaced hues; accents sit at 300 and 700.',
  },
  tetradic: {
    label: 'Tetradic',
    offsets: [0, 90, 0, 270, 0],
    chromaScale: [0.8, 0.55, 1, 0.9, 0.7],
    hint: 'Four evenly spaced hues. Rich, editorial palettes.',
  },
  monochrome: {
    label: 'Monochrome',
    offsets: [0, 0, 0, 0, 0],
    chromaScale: [0.8, 0.9, 1, 0.95, 0.8],
    hint: 'One hue, five lightness steps. The safest bet for product UI.',
  },
  shades: {
    label: 'Shades',
    offsets: [0, 0, 0, 0, 0],
    neutral: true,
    hint: 'Almost-neutral steps. Perfect for surfaces and text.',
  },
  prism: {
    label: 'Prism',
    offsets: null,
    hint: 'Seeded hue scatter. A little chaos, carefully contained.',
  },
};

/** Modes Auto can resolve to (Prism is opt-in). */
const AUTO_POOL = [
  'analogous',
  'analogous',
  'complementary',
  'split',
  'triadic',
  'tetradic',
  'monochrome',
];

/** Calibrated OKLCH lightness and chroma curves, light → dark. */
const LIGHTNESS_RAMP = [0.935, 0.795, 0.635, 0.475, 0.32];
const CHROMA_RAMP = [0.24, 0.52, 1, 0.86, 0.6];

/** Small, fast, deterministic PRNG. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit unsigned int. */
export function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Seed from a string, a number, or nothing. */
const toSeed = (seed) => {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.floor(seed) >>> 0) || 1;
  }
  return hashString(String(seed ?? '')) || 1;
};

/** A fresh seed for the next generation. */
export const createSeed = () =>
  (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;

/** Rand helper with range. */
const between = (random, min, max) => min + random() * (max - min);

/** Resolve `auto` to a concrete harmony using the same seed. */
export function resolveMode(mode, seed) {
  if (mode !== 'auto') return HARMONIES[mode] ? mode : 'monochrome';
  const random = mulberry32(toSeed(seed));
  return AUTO_POOL[Math.floor(random() * AUTO_POOL.length)];
}

/**
 * Generate a five-colour palette.
 *
 * @param {object} options
 * @param {string} options.base   Anchor colour.
 * @param {string} options.mode   Harmony key, or `auto`.
 * @param {number} options.seed   Deterministic seed.
 * @param {boolean[]} options.locks  Slots that must keep their previous colour.
 * @param {string[]} options.previous  Current palette (used for locked slots).
 */
export function generatePalette({
  base = DEFAULT_BASE,
  mode = 'auto',
  seed = 1,
  locks = [],
  previous = [],
} = {}) {
  const baseHex = normalizeHex(base) ?? DEFAULT_BASE;
  const anchor = hexToOklch(baseHex);
  const resolvedMode = resolveMode(mode, seed);
  const random = mulberry32(toSeed(seed) ^ hashString(`${baseHex}:${mode}`));

  // Small seeded jitter keeps repeated generations from feeling mechanical.
  const hueJitter = between(random, -7, 7);
  const lightnessJitter = between(random, -0.018, 0.018);
  const chromaJitter = between(random, 0.9, 1.12);

  const definition = HARMONIES[resolvedMode];
  let offsets = definition.offsets;

  if (!offsets) {
    // Prism: anchor on the base hue, scatter the rest across the wheel.
    offsets = Array.from({ length: PALETTE_SIZE }, (_, index) => {
      if (index === 2) return 0;
      const spread = [0, 48, 0, 96, 0][index] ?? 60;
      const direction = random() > 0.5 ? 1 : -1;
      return spread * direction + between(random, -14, 14);
    });
  }

  const baseChroma = clamp(anchor.c, 0.015, 0.34);
  const colors = offsets.map((offset, index) => {
    if (locks[index] && normalizeHex(previous[index])) {
      return normalizeHex(previous[index]);
    }

    const lightness = clamp(
      LIGHTNESS_RAMP[index] + lightnessJitter,
      0.11,
      0.98,
    );
    const hue = anchor.h + offset + hueJitter;

    // Chroma is scaled by the ramp, then reduced near white/black so colours
    // stay subtle where they should and saturated where they can.
    const edgeFalloff = 0.55 + 0.45 * Math.sin(Math.PI * lightness);
    const accentScale = definition.chromaScale?.[index] ?? 1;
    let chroma =
      baseChroma *
      CHROMA_RAMP[index] *
      chromaJitter *
      edgeFalloff *
      accentScale *
      (definition.neutral ? 0.16 : 1);

    // Match the anchor's chroma at the middle slot so the result feels derived
    // from the chosen base rather than unrelated.
    if (index === 2) chroma = baseChroma * chromaJitter;
    if (definition.neutral) chroma = clamp(baseChroma * 0.16, 0.003, 0.03);

    return oklchToHex({ l: lightness, c: Math.max(0, chroma), h: hue });
  });

  return {
    colors,
    base: baseHex,
    mode: HARMONIES[mode] ? mode : 'auto',
    resolvedMode,
    seed: toSeed(seed),
    locks: normalizeLocks(locks),
  };
}

/** Force a lock array into five booleans. */
export function normalizeLocks(locks = []) {
  return Array.from({ length: PALETTE_SIZE }, (_, index) => Boolean(locks[index]));
}

/** A pleasant random base colour (mid-light, usable chroma). */
export function randomBase(seed = createSeed()) {
  const random = mulberry32(toSeed(seed));
  return oklchToHex({
    l: between(random, 0.5, 0.74),
    c: between(random, 0.1, 0.23),
    h: between(random, 0, 360),
  });
}

/** Replace a single slot without disturbing the rest. */
export function replaceColor(colors, index, hex) {
  const safe = normalizeHex(hex);
  if (!safe || index < 0 || index >= colors.length) return colors;
  return colors.map((color, position) => (position === index ? safe : color));
}

/** Move a colour in the palette (used by drag-and-drop and the arrow buttons). */
export function moveColor(colors, from, to) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= colors.length ||
    to >= colors.length
  ) {
    return colors;
  }
  const next = [...colors];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Semantic role derived from perceptual lightness. */
export function roleFor(hex) {
  const { l } = hexToOklch(hex);
  if (l >= 0.87) return 'Veil';
  if (l >= 0.72) return 'Surface';
  if (l >= 0.56) return 'Tint';
  if (l >= 0.4) return 'Core';
  return 'Ink';
}

/** Everything the UI needs to describe one swatch. */
export function describeColor(hex, index = 0) {
  const safe = normalizeHex(hex) ?? '#000000';
  const { l, c, h } = hexToOklch(safe);
  const text = bestText(safe);
  return {
    hex: safe,
    index,
    token: TOKENS[index] ?? String((index + 1) * 100),
    role: roleFor(safe),
    name: colorName(safe),
    oklch: { l, c, h },
    textColor: text.color,
    textRatio: text.ratio,
  };
}

/**
 * Encode state for a shareable URL hash (without the leading `#`).
 * Example: `p=hex-hex-...&b=hex&m=triadic&s=42&l=00100`
 */
export function encodeShare({ colors, base, mode, seed, locks }) {
  const params = new URLSearchParams();
  params.set('p', colors.map((color) => color.replace('#', '')).join('-'));
  params.set('b', base.replace('#', ''));
  params.set('m', mode);
  params.set('s', String(seed));
  params.set('l', normalizeLocks(locks).map((lock) => (lock ? '1' : '0')).join(''));
  return params.toString();
}

/** Decode and validate a hash produced by `encodeShare`. Returns null if bad. */
export function decodeShare(hash) {
  try {
    const params = new URLSearchParams(String(hash).replace(/^#/, ''));
    const rawColors = (params.get('p') ?? '').split('-');
    if (rawColors.length !== PALETTE_SIZE) return null;

    const colors = rawColors.map((value) => normalizeHex(value));
    if (colors.some((color) => !color)) return null;

    const base = normalizeHex(params.get('b')) ?? colors[2];
    const mode = HARMONIES[params.get('m')] ? params.get('m') : 'auto';
    const seed = Number.parseInt(params.get('s') ?? '1', 10) || 1;
    const lockString = params.get('l') ?? '';
    const locks = normalizeLocks(lockString.split('').map((flag) => flag === '1'));

    return { colors, base, mode, seed, locks };
  } catch {
    return null;
  }
}
