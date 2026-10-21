#!/usr/bin/env node
/**
 * Brand + documentation asset generator.
 *
 *   npm run assets
 *
 * Produces:
 *   assets/favicon.svg, assets/icon-192.png, assets/icon-512.png, assets/og.png
 *   docs/banner.png, docs/palettes.png, docs/contrast.png, docs/palette-poster.png
 *
 * Note: docs/screenshot.png is a real browser capture of the studio, not a
 * generated mock — regenerate it by hand after significant UI changes.
 *
 * Design assets are generated rather than hand-drawn so the branding always
 * matches the live palette engine. Requires `sharp` (dev dependency) and the
 * Inter / Space Grotesk / JetBrains Mono fonts installed on the system (they are
 * bundled as woff2 for the web app; install the desktop TTFs to regenerate).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  contrastGrade,
  contrastRatio,
  formatRatio,
  hexToOklch,
  readableTextColor,
} from '../src/core/color.js';
import { describeColor, generatePalette } from '../src/core/palette.js';
import { paletteName, toSvg } from '../src/core/exporters.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = {
  assets: resolve(ROOT, 'assets'),
  docs: resolve(ROOT, 'docs'),
};

const FONT = {
  display: 'Space Grotesk',
  body: 'Inter',
  mono: 'JetBrains Mono',
};

const INK = '#f1f4fa';
const MUTED = '#b7bfd0';
const FAINT = '#7f889c';
const BG = '#06070b';
const VIOLET = '#8b7cff';
const TEAL = '#3dd6c4';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const text = (
  x,
  y,
  content,
  {
    font = FONT.body,
    size = 18,
    fill = INK,
    weight = 400,
    anchor = 'start',
    opacity = 1,
    letterSpacing = 0,
  } = {},
) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}" letter-spacing="${letterSpacing}">${esc(content)}</text>`;

const rect = (x, y, width, height, fill, { radius = 0, stroke, strokeWidth = 1, opacity = 1 } = {}) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ''} opacity="${opacity}"/>`;

const circle = (cx, cy, r, fill, { stroke, strokeWidth = 1, opacity = 1 } = {}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ''} opacity="${opacity}"/>`;

/** The HueForge mark: nested rings + core dot. */
function brandMark(cx, cy, size = 44, id = 'mark') {
  const r = size / 2;
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${size * 0.05}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.56}" fill="none" stroke="url(#${id})" stroke-width="${size * 0.038}" opacity="0.72"/>
    <path d="M${cx} ${cy - r}V${cy + r}M${cx - r} ${cy}H${cx + r}" stroke="url(#${id})" stroke-width="${size * 0.03}" opacity="0.38"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="url(#${id})"/>
  </g>`;
}

const gradient = (id, stops, { angle = 45 } = {}) => {
  const radians = (angle * Math.PI) / 180;
  const x1 = 50 - Math.cos(radians) * 50;
  const y1 = 50 - Math.sin(radians) * 50;
  const x2 = 50 + Math.cos(radians) * 50;
  const y2 = 50 + Math.sin(radians) * 50;
  return `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops
    .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
    .join('')}</linearGradient>`;
};

/** A dark page base with glows and a faint grid. */
function background(width, height, { glow = VIOLET, glow2 = TEAL } = {}) {
  return `
    ${rect(0, 0, width, height, BG)}
    <ellipse cx="${width * 0.16}" cy="${height * 0.02}" rx="${width * 0.46}" ry="${height * 0.72}" fill="url(#bgGlow)"/>
    <ellipse cx="${width * 0.92}" cy="${height * 0.06}" rx="${width * 0.36}" ry="${height * 0.58}" fill="url(#bgGlow2)" opacity="0.6"/>
    <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.55"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>`;
}

const defs = (width, height, { glow = VIOLET, glow2 = TEAL } = {}) => `
  <defs>
    ${gradient('brand', [
      [0, '#b9a7ff'],
      [0.55, '#7c5cff'],
      [1, '#3dd6c4'],
    ], { angle: 45 })}
    ${gradient('headline', [
      [0, '#b9a7ff'],
      [0.42, '#e3d9ff'],
      [1, '#3dd6c4'],
    ], { angle: 12 })}
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${glow}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlow2" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${glow2}" stop-opacity="0.15"/>
      <stop offset="1" stop-color="${glow2}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#8b7cff" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#6b4cff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#6b4cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbBody" cx="33%" cy="26%" r="78%">
      <stop offset="0" stop-color="#f1eaff"/>
      <stop offset="0.28" stop-color="#b7a2ff"/>
      <stop offset="0.58" stop-color="#7251ee"/>
      <stop offset="0.85" stop-color="#33207f"/>
      <stop offset="1" stop-color="#170d3d"/>
    </radialGradient>
    <radialGradient id="orbRim" cx="68%" cy="74%" r="60%">
      <stop offset="0" stop-color="#3dd6c4" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#3dd6c4" stop-opacity="0"/>
    </radialGradient>
    ${gradient('ringStroke', [
      [0, '#b9a7ff'],
      [0.5, '#6b4cff'],
      [1, '#3dd6c4'],
    ], { angle: 70 })}
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M80 0H0V80" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="42%" r="72%">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

/** The hero orb, drawn with gradients + elliptical rings. */
function orb(cx, cy, radius) {
  const ring = (rx, ry, angle, opacity, width = 1.4) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="url(#ringStroke)" stroke-width="${width}" opacity="${opacity}" transform="rotate(${angle} ${cx} ${cy})"/>`;

  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${radius * 1.65}" fill="url(#orbGlow)" filter="url(#blur)"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#orbBody)"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#orbRim)"/>
    <ellipse cx="${cx - radius * 0.22}" cy="${cy - radius * 0.34}" rx="${radius * 0.5}" ry="${radius * 0.34}" fill="url(#sheen)" opacity="0.7"/>
    ${ring(radius * 1.5, radius * 0.42, -18, 0.55)}
    ${ring(radius * 1.78, radius * 0.55, 26, 0.35, 1.1)}
    ${ring(radius * 2.05, radius * 0.68, -46, 0.18, 0.9)}
    ${circle(cx + radius * 1.46, cy - radius * 0.35, 5, TEAL)}
    ${circle(cx - radius * 1.72, cy + radius * 0.28, 3.4, '#d9ccff', { opacity: 0.85 })}
    ${circle(cx + radius * 0.55, cy - radius * 1.15, 2.8, '#ffffff', { opacity: 0.7 })}
  </g>`;
}

/** Pill chip. */
function chip(x, y, label, { fill = 'rgba(255,255,255,0.04)', color = MUTED, border = 'rgba(255,255,255,0.14)', size = 13 } = {}) {
  const width = label.length * size * 0.68 + 30;
  return `<g>
    ${rect(x, y, width, 34, fill, { radius: 17, stroke: border })}
    ${text(x + 15, y + 23, label, { font: FONT.mono, size, fill: color, letterSpacing: 1.2 })}
  </g>`;
}

/** Five palette cards for a banner/poster strip. */
function paletteStrip(colors, x, y, width, height, { gap = 14, labelSize = 12, hexSize = 20, specimen = 54 } = {}) {
  const cardWidth = (width - gap * (colors.length - 1)) / colors.length;
  return colors
    .map((hex, index) => {
      const cx = x + index * (cardWidth + gap);
      const on = readableTextColor(hex);
      const subtle = on === '#ffffff' ? 'rgba(255,255,255,0.68)' : 'rgba(11,13,18,0.62)';
      const faint = on === '#ffffff' ? 'rgba(255,255,255,0.45)' : 'rgba(11,13,18,0.42)';
      const token = ['100', '300', '500', '700', '900'][index];
      const role = ['Veil', 'Surface', 'Tint', 'Core', 'Ink'][index];
      return `${rect(cx, y, cardWidth, height, hex, { radius: 18, stroke: 'rgba(255,255,255,0.10)' })}
        ${text(cx + 20, y + 30, token, { font: FONT.mono, size: labelSize, fill: subtle, letterSpacing: 1.4 })}
        ${text(cx + 18, y + height - 92, 'Aa', { font: FONT.display, size: specimen, weight: 500, fill: on, opacity: 0.94 })}
        ${text(cx + 20, y + height - 44, hex.toUpperCase(), { font: FONT.mono, size: hexSize, weight: 600, fill: on })}
        ${text(cx + 20, y + height - 20, `${role} · ${paletteNameFor(hex)}`, { font: FONT.body, size: 12, fill: faint })}`;
    })
    .join('');
}

const paletteNameFor = (hex) => describeColor(hex, 2).name;

/* -------------------------------------------------------------------------- */
/* Banner                                                                     */
/* -------------------------------------------------------------------------- */

const palette = generatePalette({ base: '#7c5cff', mode: 'analogous', seed: 24 });
const COLORS = palette.colors;

function buildBanner() {
  const width = 1600;
  const height = 900;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs(width, height)}
    ${background(width, height)}
    <g transform="translate(80, 56)">
      ${brandMark(22, 22, 44, 'brand')}
      ${text(58, 34, 'HueForge', { font: FONT.display, size: 26, weight: 600 })}
    </g>
    ${text(width - 80, 78, 'OPEN SOURCE · MIT · NO SIGN-UP', { font: FONT.mono, size: 13, fill: FAINT, anchor: 'end', letterSpacing: 2.4 })}

    ${text(80, 238, 'Palettes that', { font: FONT.display, size: 82, weight: 600, letterSpacing: -3 })}
    ${text(80, 330, 'survive real interfaces.', { font: FONT.display, size: 82, weight: 600, fill: 'url(#headline)', letterSpacing: -3 })}
    ${text(80, 396, 'Five-step OKLCH ramps, WCAG-checked contrast and live UI previews —', { size: 22, fill: MUTED })}
    ${text(80, 428, 'so your palette works before it ships.', { size: 22, fill: MUTED })}

    ${chip(80, 474, 'OKLCH RAMPS', { color: '#cdc3ff' })}
    ${chip(258, 474, 'WCAG 2.1', { color: '#9de9dd' })}
    ${chip(386, 474, 'COLOUR VISION', { color: MUTED })}
    ${chip(560, 474, '8 EXPORTS', { color: MUTED })}

    ${orb(1245, 296, 182)}

    ${rect(1029, 88, 126, 38, 'rgba(10,12,20,0.6)', { radius: 19, stroke: 'rgba(255,255,255,0.16)' })}
    ${text(1092, 113, '#7C5CFF', { font: FONT.mono, size: 14, fill: INK, anchor: 'middle' })}
    ${rect(1332, 456, 78, 36, TEAL, { radius: 18 })}
    ${text(1371, 480, 'AAA', { font: FONT.mono, size: 15, weight: 600, fill: '#07130f', anchor: 'middle' })}

    ${text(80, 560, 'THE OUTPUT', { font: FONT.mono, size: 12, fill: FAINT, letterSpacing: 3 })}
    ${text(1600 - 80, 560, `SEED ${palette.seed} · ${palette.resolvedMode.toUpperCase()} · ${paletteName(COLORS).toUpperCase()}`, { font: FONT.mono, size: 12, fill: FAINT, anchor: 'end', letterSpacing: 1.6 })}
    ${paletteStrip(COLORS, 80, 586, 1440, 216, { specimen: 46, hexSize: 18 })}

    ${text(80, 858, 'HUEFORGE · hueforge.app', { font: FONT.mono, size: 12, fill: '#5c6478', letterSpacing: 1.8 })}
    ${text(width - 80, 858, 'OKLCH · WCAG 2.1 · BUILT WITH THREE.JS', { font: FONT.mono, size: 12, fill: '#5c6478', anchor: 'end', letterSpacing: 1.8 })}
  </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Social card                                                                */
/* -------------------------------------------------------------------------- */

function buildOg() {
  const width = 1200;
  const height = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs(width, height)}
    ${background(width, height)}
    <g transform="translate(64, 48)">${brandMark(20, 20, 40, 'brand')}${text(52, 31, 'HueForge', { font: FONT.display, size: 23, weight: 600 })}</g>
    ${text(width - 64, 72, 'OPEN SOURCE', { font: FONT.mono, size: 12, fill: FAINT, anchor: 'end', letterSpacing: 2.4 })}
    ${text(64, 214, 'Palettes that survive', { font: FONT.display, size: 58, weight: 600, letterSpacing: -2 })}
    ${text(64, 278, 'real interfaces.', { font: FONT.display, size: 58, weight: 600, fill: 'url(#headline)', letterSpacing: -2 })}
    ${text(64, 336, 'OKLCH ramps · WCAG contrast · live previews', { size: 19, fill: MUTED })}
    ${text(64, 364, 'Eight exports. Zero uploads.', { size: 19, fill: MUTED })}
    ${chip(64, 398, 'MIT LICENSED', { color: '#cdc3ff', size: 12 })}
    ${chip(218, 398, 'WCAG AA', { color: '#9de9dd', size: 12 })}
    ${orb(965, 260, 138)}
    ${COLORS.map((hex, index) => {
      const w = (width - 128) / 5;
      return rect(64 + index * w, 486, w - 4, 82, hex, { radius: index === 0 ? 12 : 0 });
    }).join('')}
    ${text(64, 604, 'hueforge.app — accessible colour, without the guesswork', { font: FONT.mono, size: 11, fill: '#5c6478', letterSpacing: 1.2 })}
  </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Palette gallery                                                            */
/* -------------------------------------------------------------------------- */

const GALLERY = [
  { label: 'Violet study', base: '#7c5cff', mode: 'analogous', seed: 24 },
  { label: 'Ember set', base: '#ff8a5c', mode: 'triadic', seed: 8 },
  { label: 'Jade system', base: '#12b886', mode: 'split', seed: 41 },
  { label: 'Noon / midnight', base: '#ffd166', mode: 'tetradic', seed: 19 },
  { label: 'Rose contrast', base: '#ff5c8a', mode: 'complementary', seed: 3 },
  { label: 'Azure mono', base: '#4dabf7', mode: 'monochrome', seed: 77 },
];

function buildGallery() {
  const width = 1600;
  const height = 1180;
  const cardWidth = 453;
  const cardHeight = 424;
  const gapX = 40;
  const gapY = 36;
  const startX = 80;
  const startY = 250;

  const cards = GALLERY.map((entry, index) => {
    const generated = generatePalette({ base: entry.base, mode: entry.mode, seed: entry.seed });
    const x = startX + (index % 3) * (cardWidth + gapX);
    const y = startY + Math.floor(index / 3) * (cardHeight + gapY);
    const swatchWidth = (cardWidth - 36) / 5;

    return `<g>
      ${rect(x, y, cardWidth, cardHeight, 'rgba(255,255,255,0.028)', { radius: 22, stroke: 'rgba(255,255,255,0.09)' })}
      ${generated.colors
        .map((hex, swatchIndex) => {
          const on = readableTextColor(hex);
          return `${rect(x + 18 + swatchIndex * swatchWidth, y + 18, swatchWidth - 2, 268, hex, { radius: swatchIndex === 0 ? 12 : 2 })}
            ${text(x + 18 + swatchIndex * swatchWidth + 12, y + 262, ['100', '300', '500', '700', '900'][swatchIndex], {
              font: FONT.mono,
              size: 10,
              fill: on,
              opacity: 0.6,
              letterSpacing: 1,
            })}`;
        })
        .join('')}
      ${text(x + 20, y + 330, entry.label, { font: FONT.display, size: 23, weight: 600 })}
      ${text(x + 20, y + 356, `${entry.mode.toUpperCase()} · ${describeColor(entry.base, 2).name.toUpperCase()}`, { font: FONT.mono, size: 11, fill: FAINT, letterSpacing: 1.2 })}
      ${text(x + cardWidth - 20, y + 356, `SEED ${entry.seed}`, { font: FONT.mono, size: 11, fill: FAINT, anchor: 'end', letterSpacing: 1.2 })}
      ${generated.colors
        .map(
          (hex, swatchIndex) =>
            text(x + 20 + swatchIndex * 84, y + 394, hex.toUpperCase(), {
              font: FONT.mono,
              size: 11,
              fill: '#8d95a8',
              letterSpacing: 0.4,
            }),
        )
        .join('')}
    </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs(width, height)}
    ${background(width, height)}
    <g transform="translate(80, 48)">${brandMark(18, 18, 36, 'brand')}${text(48, 28, 'HueForge', { font: FONT.display, size: 21, weight: 600 })}</g>
    ${text(width - 80, 68, 'GENERATED IN THE BROWSER · NO UPLOADS', { font: FONT.mono, size: 11, fill: FAINT, anchor: 'end', letterSpacing: 2.2 })}
    ${text(80, 158, 'One base. Infinite ramps.', { font: FONT.display, size: 54, weight: 600, letterSpacing: -2 })}
    ${text(80, 196, 'Six starting points, each five steps deep — every palette is contrast-checked and export-ready.', { size: 18, fill: MUTED })}
    ${cards}
    ${text(80, 1162, 'HUEFORGE · hueforge.app', { font: FONT.mono, size: 11, fill: '#5c6478', letterSpacing: 1.8 })}
  </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Contrast matrix                                                            */
/* -------------------------------------------------------------------------- */

function buildContrast() {
  const width = 1240;
  const height = 1080;
  const palette6 = generatePalette({ base: '#7c5cff', mode: 'analogous', seed: 24 }).colors;
  const cell = 140;
  const gap = 8;
  const startX = 350;
  const startY = 300;

  let passAA = 0;
  let passAAA = 0;
  let total = 0;

  const header = palette6
    .map(
      (hex, index) =>
        `${rect(startX + index * (cell + gap), startY - 58, cell, 44, hex, { radius: 10, stroke: 'rgba(255,255,255,0.12)' })}
         ${text(startX + index * (cell + gap) + 14, startY - 30, ['100', '300', '500', '700', '900'][index], {
           font: FONT.mono,
           size: 12,
           fill: readableTextColor(hex),
           opacity: 0.85,
           letterSpacing: 1,
         })}`,
    )
    .join('');

  const rows = palette6
    .map((bg, row) => {
      const rowLabel = `${rect(80, startY + row * (cell + gap), 200, cell, bg, { radius: 10, stroke: 'rgba(255,255,255,0.12)' })}
        ${text(98, startY + row * (cell + gap) + 34, ['100', '300', '500', '700', '900'][row], { font: FONT.mono, size: 12, fill: readableTextColor(bg), opacity: 0.85, letterSpacing: 1 })}`;
      const cells = palette6
        .map((fg, col) => {
          const ratio = contrastRatio(fg, bg);
          const self = fg === bg;
          if (!self) {
            total += 1;
            if (contrastGrade(ratio).aa) passAA += 1;
            if (contrastGrade(ratio).aaa) passAAA += 1;
          }
          const grade = self ? '—' : contrastGrade(ratio).aaa ? 'AAA' : contrastGrade(ratio).aa ? 'AA' : 'FAIL';
          return `${rect(startX + col * (cell + gap), startY + row * (cell + gap), cell, cell, bg, { radius: 10, stroke: 'rgba(0,0,0,0.14)' })}
            ${text(startX + col * (cell + gap) + cell / 2, startY + row * (cell + gap) + 72, self ? '·' : formatRatio(ratio), {
              font: FONT.mono,
              size: 30,
              weight: 600,
              fill: fg,
              anchor: 'middle',
            })}
            ${text(startX + col * (cell + gap) + cell / 2, startY + row * (cell + gap) + 100, grade, {
              font: FONT.mono,
              size: 12,
              fill: fg,
              anchor: 'middle',
              opacity: 0.72,
              letterSpacing: 1.4,
            })}`;
        })
        .join('');
      return rowLabel + cells;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs(width, height)}
    ${background(width, height)}
    <g transform="translate(80, 48)">${brandMark(18, 18, 36, 'brand')}${text(48, 28, 'HueForge', { font: FONT.display, size: 21, weight: 600 })}</g>
    ${text(width - 80, 68, 'WCAG 2.1 · BODY TEXT', { font: FONT.mono, size: 11, fill: FAINT, anchor: 'end', letterSpacing: 2.2 })}
    ${text(80, 154, 'Every pair, graded.', { font: FONT.display, size: 50, weight: 600, letterSpacing: -2 })}
    ${text(80, 190, 'The 5 × 5 matrix renders your real colours, so an unreadable pair is impossible to miss.', { size: 18, fill: MUTED })}
    ${text(80, 224, `${passAA}/${total} pairs pass AA · ${passAAA}/${total} pass AAA`, { font: FONT.mono, size: 12, fill: '#9de9dd', letterSpacing: 1 })}
    ${header}
    ${rows}
    ${text(80, 1032, 'HUEFORGE · hueforge.app', { font: FONT.mono, size: 11, fill: '#5c6478', letterSpacing: 1.8 })}
  </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

function buildFavicon(size = 512, { padded = true } = {}) {
  const scale = padded ? 0.78 : 1;
  const inner = size * scale;
  const offset = (size - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      ${gradient('iconGradient', [
        [0, '#c3b3ff'],
        [0.5, '#7c5cff'],
        [1, '#3dd6c4'],
      ], { angle: 45 })}
      <radialGradient id="iconBg" cx="50%" cy="30%" r="80%">
        <stop offset="0" stop-color="#151827"/>
        <stop offset="1" stop-color="#06070b"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#iconBg)"/>
    <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${size * 0.22}" fill="none" stroke="rgba(255,255,255,0.12)"/>
    <g transform="translate(${offset}, ${offset})">
      ${brandMark(inner / 2, inner / 2, inner * 0.72, 'iconGradient')}
    </g>
  </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

async function writePng(svg, path, width) {
  const image = sharp(Buffer.from(svg));
  if (width) image.resize({ width });
  await image.png({ compressionLevel: 9 }).toFile(path);
  console.log('  ✓', path.replace(ROOT + '/', ''));
}

async function writeSvg(svg, path) {
  await writeFile(path, `${svg.trim()}\n`);
  console.log('  ✓', path.replace(ROOT + '/', ''));
}

async function main() {
  await mkdir(OUT.assets, { recursive: true });
  await mkdir(OUT.docs, { recursive: true });

  console.log('\nHueForge asset generator\n');

  const banner = buildBanner();
  await writeSvg(banner, resolve(OUT.docs, 'banner.svg'));
  await writePng(banner, resolve(OUT.docs, 'banner.png'));

  const og = buildOg();
  await writeSvg(og, resolve(OUT.docs, 'og.svg'));
  await writePng(og, resolve(OUT.assets, 'og.png'));

  const gallery = buildGallery();
  await writeSvg(gallery, resolve(OUT.docs, 'palettes.svg'));
  await writePng(gallery, resolve(OUT.docs, 'palettes.png'));

  const contrast = buildContrast();
  await writeSvg(contrast, resolve(OUT.docs, 'contrast.svg'));
  await writePng(contrast, resolve(OUT.docs, 'contrast.png'));

  const favicon = buildFavicon(64, { padded: false });
  await writeSvg(favicon, resolve(OUT.assets, 'favicon.svg'));
  await writePng(buildFavicon(192), resolve(OUT.assets, 'icon-192.png'));
  await writePng(buildFavicon(512), resolve(OUT.assets, 'icon-512.png'));
  await writePng(buildFavicon(180), resolve(OUT.assets, 'apple-touch-icon.png'));

  // Real exporter output, rasterised for the README.
  await writePng(
    toSvg(COLORS, { name: 'Violet Study' }),
    resolve(OUT.docs, 'palette-poster.png'),
    1200,
  );

  console.log('\nDone. Public assets live in assets/, documentation art in docs/.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
