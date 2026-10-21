/**
 * HueForge — import.js
 * -----------------------------------------------------------------------------
 * Getting colours *into* the tool:
 *   • parse pasted hex / rgb lists
 *   • expand any 1–5 colours into a five-step ramp
 *   • pull a palette out of an uploaded image with k-means clustering in OKLab
 *
 * Only `extractFromImage` touches the DOM, and only when a file is supplied.
 */

import {
  hexToOklab,
  hexToOklch,
  oklabToHex,
  oklchToHex,
  normalizeHex,
  rgbToHex,
  clamp,
} from './color.js';
import { generatePalette, PALETTE_SIZE } from './palette.js';

/** Expected lightness of each slot — used to extrapolate missing ends. */
const RAMP_LIGHTNESS = [0.935, 0.795, 0.635, 0.475, 0.32];

/**
 * Parse free-form colour text. Accepts hex (3/6 digits, with or without #),
 * `rgb(r, g, b)` and space/comma/semicolon separated lists.
 * Returns a de-duplicated array of `#rrggbb`.
 */
export function parseColorList(input) {
  if (typeof input !== 'string') return [];
  const found = [];
  const text = input.trim();

  // rgb()/rgba() first, so their numbers don't get mistaken for hex.
  const rgbMatches = text.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})[^)]*\)/gi);
  for (const match of rgbMatches) {
    found.push(
      rgbToHex({
        r: clamp(Number(match[1]), 0, 255),
        g: clamp(Number(match[2]), 0, 255),
        b: clamp(Number(match[3]), 0, 255),
      }),
    );
  }

  const withoutRgb = text.replace(/rgba?\([^)]*\)/gi, ' ');
  for (const match of withoutRgb.matchAll(/#?([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = normalizeHex(match[0]);
    if (hex) found.push(hex);
  }

  return [...new Set(found)];
}

/** Sort colours by perceptual lightness, light → dark. */
export const sortByLightness = (colors) =>
  [...colors].sort((a, b) => hexToOklch(b).l - hexToOklch(a).l);

/**
 * Interpolate between two colours in OKLCH, taking the shortest hue path.
 */
function mixOklch(aHex, bHex, t) {
  const a = hexToOklch(aHex);
  const b = hexToOklch(bHex);
  let deltaHue = b.h - a.h;
  if (deltaHue > 180) deltaHue -= 360;
  if (deltaHue < -180) deltaHue += 360;
  return oklchToHex({
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: a.h + deltaHue * t,
  });
}

/**
 * Build a five-swatch palette from any list of 1–5 colours.
 *
 * Strategy:
 *   1. Sort light → dark.
 *   2. Place each colour in the slot closest to its rank.
 *   3. Interpolate the gaps in OKLCH (hue + chroma), using lightness
 *      interpolation between the anchors so the given colours keep their value.
 *   4. Extrapolate missing ends along a gentle ramp.
 *
 * @returns {{ colors: string[], base: string } | null}
 */
export function buildPaletteFromHexes(input) {
  const colors = sortByLightness(
    [...new Set((Array.isArray(input) ? input : parseColorList(input)).map(normalizeHex).filter(Boolean))],
  );
  if (!colors.length) return null;

  const base =
    [...colors].sort((a, b) => hexToOklch(b).c - hexToOklch(a).c)[0] ?? colors[0];

  if (colors.length === 1) {
    const palette = generatePalette({ base: colors[0], mode: 'monochrome', seed: 7 });
    return { colors: palette.colors, base };
  }

  const slots = Array(PALETTE_SIZE).fill(null);
  const n = Math.min(colors.length, PALETTE_SIZE);

  const wanted = colors.slice(0, PALETTE_SIZE).map((hex, rank) => ({
    hex,
    target:
      PALETTE_SIZE === n
        ? rank
        : Math.round((rank / Math.max(1, n - 1)) * (PALETTE_SIZE - 1)),
  }));

  for (const { hex, target } of wanted) {
    let index = clamp(target, 0, PALETTE_SIZE - 1);
    let distance = 0;
    // Walk outwards until a free slot is found.
    while (slots[index] && distance <= PALETTE_SIZE) {
      distance += 1;
      const right = index + distance;
      const left = index - distance;
      if (right < PALETTE_SIZE && !slots[right]) {
        index = right;
        break;
      }
      if (left >= 0 && !slots[left]) {
        index = left;
        break;
      }
    }
    slots[index] = hex;
  }

  const assigned = slots
    .map((hex, index) => ({ hex, index }))
    .filter((entry) => entry.hex);

  const first = assigned[0];
  const last = assigned[assigned.length - 1];

  // Fill leading gaps: extend the first colour's hue upward in lightness.
  for (let index = 0; index < first.index; index += 1) {
    const { c, h } = hexToOklch(first.hex);
    slots[index] = oklchToHex({
      l: clamp(hexToOklch(first.hex).l + (first.index - index) * 0.12, 0.05, 0.985),
      c: c * Math.pow(0.72, first.index - index),
      h,
    });
  }

  // Fill trailing gaps: descend and slightly desaturate.
  for (let index = last.index + 1; index < PALETTE_SIZE; index += 1) {
    const { l, c, h } = hexToOklch(last.hex);
    slots[index] = oklchToHex({
      l: clamp(l - (index - last.index) * 0.11, 0.06, 0.96),
      c: c * Math.pow(0.78, index - last.index),
      h,
    });
  }

  // Fill interior gaps by interpolating between the bounding anchors.
  for (let index = 0; index < PALETTE_SIZE; index += 1) {
    if (slots[index]) continue;
    const before = [...assigned].reverse().find((entry) => entry.index < index);
    const after = assigned.find((entry) => entry.index > index);
    if (!before || !after) continue;
    const span = after.index - before.index;
    const t = (index - before.index) / span;
    slots[index] = mixOklch(before.hex, after.hex, t);
  }

  // Final safety net: any remaining hole gets a ramp value based on `base`.
  const fallback = generatePalette({ base, mode: 'monochrome', seed: 11 });
  for (let index = 0; index < PALETTE_SIZE; index += 1) {
    if (!slots[index]) slots[index] = fallback.colors[index];
  }

  return { colors: slots, base };
}

/* -------------------------------------------------------------------------- */
/* Image extraction                                                           */
/* -------------------------------------------------------------------------- */

const toOklab = (r, g, b) => {
  const lab = hexToOklab(rgbToHex({ r, g, b }));
  return { L: lab.L, a: lab.a, b: lab.b };
};

/**
 * Extract up to `count` representative colours from an image using k-means in
 * OKLab, weighted towards saturated clusters (so a pale background does not win
 * over the logo in the middle).
 *
 * @param {File|Blob} file
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function extractFromImage(file, count = 5) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const bitmap = await loadBitmap(file);
  const size = 96;
  const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  // Collect opaque, non-near-white/near-black pixels in OKLab.
  const points = [];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Keep very dark and very light pixels, but down-weight them later.
    if (max === min && min > 245) continue;
    const lab = toOklab(r, g, b);
    const chroma = Math.hypot(lab.a, lab.b);
    points.push({ ...lab, r, g, b, chroma });
  }

  if (!points.length) return [];

  const k = Math.min(Math.max(count, 3), 6);
  // Deterministic seed: evenly spaced samples across the pixel list.
  let centroids = Array.from({ length: k }, (_, index) => {
    const point = points[Math.floor((index + 0.5) * (points.length / k))];
    return { L: point.L, a: point.a, b: point.b, weight: 0 };
  });

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sums = Array.from({ length: k }, () => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (const point of points) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < k; c += 1) {
        const distance =
          (point.L - centroids[c].L) ** 2 +
          (point.a - centroids[c].a) ** 2 +
          (point.b - centroids[c].b) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = c;
        }
      }
      sums[best].L += point.L;
      sums[best].a += point.a;
      sums[best].b += point.b;
      sums[best].n += 1;
    }

    centroids = centroids.map((centroid, index) => {
      const sum = sums[index];
      if (!sum.n) return centroid;
      return {
        L: sum.L / sum.n,
        a: sum.a / sum.n,
        b: sum.b / sum.n,
        weight: sum.n / points.length,
      };
    });
  }

  const clusters = centroids
    .filter((centroid) => centroid.weight > 0)
    .map((centroid) => {
      const chroma = Math.hypot(centroid.a, centroid.b);
      return {
        hex: oklabToHex({ L: centroid.L, a: centroid.a, b: centroid.b }),
        lightness: centroid.L,
        chroma,
        // Favour colourful clusters, penalise extremes in lightness.
        score:
          centroid.weight *
          (0.22 + Math.min(chroma * 2.6, 1.1)) *
          (1 - Math.abs(centroid.L - 0.55) * 0.5),
      };
    })
    .sort((a, b) => b.score - a.score);

  // Deduplicate perceptually similar clusters.
  const picked = [];
  for (const cluster of clusters) {
    if (picked.length >= 5) break;
    const duplicate = picked.some((existing) => {
      const a = hexToOklab(existing);
      const b = hexToOklab(cluster.hex);
      return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b) < 0.045;
    });
    if (!duplicate) picked.push(cluster.hex);
  }

  return sortByLightness(picked);
}

/** Turn a File/Blob into something drawable, preferring createImageBitmap. */
async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // Keep the bitmap data before the URL is revoked.
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read.'));
    };
    image.src = url;
  });
}
