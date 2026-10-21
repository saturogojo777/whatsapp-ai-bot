/**
 * HueForge — exporters.js
 * -----------------------------------------------------------------------------
 * Turns a palette into the formats designers and developers actually paste
 * into their projects: CSS variables, Tailwind, SCSS, JSON, W3C design tokens,
 * SVG, and Adobe Swatch Exchange (.ase). PNG is rendered separately in the UI
 * because it needs a <canvas>.
 *
 * Every builder is a pure function → string (or Uint8Array) so it can be unit
 * tested in Node without a DOM.
 */

import { describeColor, TOKENS } from './palette.js';
import {
  contrastRatio,
  formatHsl,
  formatOklch,
  formatRgb,
  hexToHsl,
  hexToRgb,
  readableTextColor,
} from './color.js';

/** "My Cool Palette!" → "my-cool-palette" */
export function slugify(value, fallback = 'hueforge') {
  const slug = String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** Derive a readable palette name from its middle colour ("Iris"). */
export function paletteName(colors) {
  const middle = describeColor(colors[2] ?? colors[0], 2);
  return middle.name === 'Custom' ? 'Custom palette' : middle.name;
}

/** Human-friendly metadata used by free-tier formats. */
const tokenRows = (colors) =>
  colors.map((hex, index) => ({
    ...describeColor(hex, index),
    token: TOKENS[index],
    rgb: hexToRgb(hex),
    hsl: hexToHsl(hex),
    rgbString: formatRgb(hex),
    hslString: formatHsl(hex),
    oklchString: formatOklch(hex),
  }));

/* -------------------------------------------------------------------------- */
/* CSS                                                                        */
/* -------------------------------------------------------------------------- */

export function toCss(colors, { prefix = 'hue' } = {}) {
  const safePrefix = slugify(prefix, 'hue');
  const rows = tokenRows(colors);
  const variables = rows.flatMap((row) => [
    `  --${safePrefix}-${row.token}: ${row.hex};`,
    `  --${safePrefix}-${row.token}-rgb: ${row.rgb.r} ${row.rgb.g} ${row.rgb.b};`,
    `  --${safePrefix}-${row.token}-contrast: ${row.textColor === '#ffffff' ? 'var(--white, #fff)' : 'var(--black, #0b0d12)'};`,
  ]);
  const base = rows[2]?.hex ?? colors[0];

  return `/* HueForge palette — paste into your global stylesheet */
:root {
${variables.join('\n')}
  --${safePrefix}-base: ${base};
}

/* Tailwind users: use rgb(var(--${safePrefix}-500-rgb) / <alpha-value>) */
`;
}

/* -------------------------------------------------------------------------- */
/* Tailwind CSS v4                                                            */
/* -------------------------------------------------------------------------- */

export function toTailwind(colors, { prefix = 'hue' } = {}) {
  const safePrefix = slugify(prefix, 'hue');
  const rows = tokenRows(colors);
  return `/* Tailwind CSS v4 — add to your CSS entrypoint */
@import "tailwindcss";

@theme {
${rows.map((row) => `  --color-${safePrefix}-${row.token}: ${row.hex};`).join('\n')}
}

/* Usage: <button class="bg-${safePrefix}-700 text-${safePrefix}-100"> */`;
}

/* -------------------------------------------------------------------------- */
/* SCSS                                                                       */
/* -------------------------------------------------------------------------- */

export function toScss(colors, { prefix = 'hue' } = {}) {
  const safePrefix = slugify(prefix, 'hue');
  const rows = tokenRows(colors);
  return `// HueForge palette — SCSS variables + map
${rows.map((row) => `$${safePrefix}-${row.token}: ${row.hex};`).join('\n')}

$${safePrefix}: (
${rows.map((row) => `  "${row.token}": $${safePrefix}-${row.token},`).join('\n')}
);

@function ${safePrefix}($step) {
  @return map-get($${safePrefix}, $step);
}`;
}

/* -------------------------------------------------------------------------- */
/* JSON                                                                       */
/* -------------------------------------------------------------------------- */

export function toJson(colors, { name = 'HueForge palette', prefix = 'hue' } = {}) {
  const safePrefix = slugify(prefix, 'hue');
  return JSON.stringify(
    {
      name,
      generator: 'HueForge',
      generatedAt: new Date().toISOString(),
      colors: tokenRows(colors).map((row) => ({
        token: `${safePrefix}-${row.token}`,
        hex: row.hex,
        rgb: row.rgbString,
        hsl: row.hslString,
        oklch: row.oklchString,
        role: row.role,
        onColor: row.textColor,
      })),
    },
    null,
    2,
  );
}

/** W3C Design Tokens Community Group format — the most future-proof handoff. */
export function toDesignTokens(colors, { prefix = 'hue' } = {}) {
  const safePrefix = slugify(prefix, 'hue');
  const tokens = {};
  for (const row of tokenRows(colors)) {
    tokens[`${safePrefix}-${row.token}`] = {
      $type: 'color',
      $value: row.hex,
      $description: `${row.role} · ${row.name} · contrast on white ${contrastRatio(row.hex, '#ffffff').toFixed(2)}:1`,
      $extensions: {
        'org.hueforge': {
          oklch: row.oklchString,
          onColor: row.textColor,
        },
      },
    };
  }
  return JSON.stringify({ $schema: 'https://schemas.tr.designtokens.org/format/2025.10/', [safePrefix]: tokens }, null, 2);
}

/* -------------------------------------------------------------------------- */
/* SVG                                                                        */
/* -------------------------------------------------------------------------- */

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * A poster-style palette strip. Sized for README screenshots and social posts:
 * 1200 × 420 with role labels, hex codes and the palette name.
 */
export function toSvg(colors, { name = paletteName(colors) } = {}) {
  const width = 1200;
  const height = 420;
  const padding = 32;
  const gap = 8;
  const swatchWidth = (width - padding * 2 - gap * (colors.length - 1)) / colors.length;
  const swatchHeight = 268;
  const top = 104;

  const swatches = colors
    .map((hex, index) => {
      const x = padding + index * (swatchWidth + gap);
      const label = readableTextColor(hex);
      const row = describeColor(hex, index);
      return `  <g>
    <rect x="${x.toFixed(2)}" y="${top}" width="${swatchWidth.toFixed(2)}" height="${swatchHeight}" rx="18" fill="${hex}"/>
    <text x="${(x + 20).toFixed(2)}" y="${top + 38}" fill="${label}" font-family="Inter, system-ui, sans-serif" font-size="13" letter-spacing="1.6" opacity="0.72">${escapeXml(row.role.toUpperCase())}</text>
    <text x="${(x + 20).toFixed(2)}" y="${top + swatchHeight - 24}" fill="${label}" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="18" font-weight="600">${escapeXml(hex.toUpperCase())}</text>
    <text x="${(x + 20).toFixed(2)}" y="${top + swatchHeight - 4}" fill="${label}" font-family="Inter, system-ui, sans-serif" font-size="12" opacity="0.7">${escapeXml(row.token)} · ${escapeXml(row.name)}</text>
  </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Palette ${escapeXml(name)}">
  <rect width="${width}" height="${height}" fill="#0b0d12"/>
  <text x="${padding}" y="52" fill="#f5f7fb" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="600">${escapeXml(name)}</text>
  <text x="${padding}" y="78" fill="#8b93a7" font-family="Inter, system-ui, sans-serif" font-size="14" letter-spacing="2">HUEFORGE · OKLCH PALETTE</text>
${swatches}
  <text x="${width - padding}" y="${height - 20}" text-anchor="end" fill="#5c6579" font-family="Inter, system-ui, sans-serif" font-size="12">hueforge.app</text>
</svg>
`;
}

/* -------------------------------------------------------------------------- */
/* Adobe Swatch Exchange (.ase)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build a binary `.ase` file. Format reference: Adobe Swatch Exchange.
 * Layout: "ASEF" | u16 major | u16 minor | u32 block count |
 *         for each colour: u16 type | u32 length | u16 nameLen(UTF-16 units,
 *         incl. terminator) | UTF-16BE name | "RGB " | 3 × f32 | u16 colourType
 */
export function toAse(colors, { prefix = 'hue' } = {}) {
  const safePrefix = slugify(prefix, 'hue');
  const names = colors.map((_, index) => `${safePrefix}-${TOKENS[index]}`);

  const nameBytes = names.map((name) => {
    const units = name.length + 1; // + null terminator
    const bytes = new Uint8Array(units * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < name.length; i += 1) {
      view.setUint16(i * 2, name.charCodeAt(i), false);
    }
    view.setUint16((units - 1) * 2, 0, false);
    return { units, bytes };
  });

  const blockLengths = nameBytes.map(({ units }) => 2 + units * 2 + 4 + 12 + 2);
  const total =
    4 + 2 + 2 + 4 + blockLengths.reduce((sum, length) => sum + 2 + 4 + length, 0);

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Signature + version
  bytes.set([0x41, 0x53, 0x45, 0x46], 0); // "ASEF"
  offset += 4;
  view.setUint16(offset, 1, false);
  offset += 2;
  view.setUint16(offset, 0, false);
  offset += 2;
  view.setUint32(offset, colors.length, false);
  offset += 4;

  colors.forEach((hex, index) => {
    const { r, g, b } = hexToRgb(hex);
    const { units, bytes: nameBuffer } = nameBytes[index];

    view.setUint16(offset, 0x0001, false); // colour entry
    offset += 2;
    view.setUint32(offset, blockLengths[index], false);
    offset += 4;
    view.setUint16(offset, units, false);
    offset += 2;
    bytes.set(nameBuffer, offset);
    offset += nameBuffer.byteLength;
    bytes.set([0x52, 0x47, 0x42, 0x20], offset); // "RGB "
    offset += 4;
    view.setFloat32(offset, r / 255, false);
    offset += 4;
    view.setFloat32(offset, g / 255, false);
    offset += 4;
    view.setFloat32(offset, b / 255, false);
    offset += 4;
    view.setUint16(offset, 0, false); // 0 = global colour
    offset += 2;
  });

  return bytes;
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Format registry used by the export modal.
 * `language` drives syntax highlighting and `binary` tells the UI to download
 * a Blob rather than copy text.
 */
export const EXPORT_FORMATS = [
  {
    id: 'css',
    label: 'CSS variables',
    extension: 'css',
    language: 'css',
    mime: 'text/css',
    build: (colors, options) => toCss(colors, options),
  },
  {
    id: 'tailwind',
    label: 'Tailwind v4',
    extension: 'css',
    language: 'css',
    mime: 'text/css',
    build: (colors, options) => toTailwind(colors, options),
  },
  {
    id: 'scss',
    label: 'SCSS',
    extension: 'scss',
    language: 'scss',
    mime: 'text/x-scss',
    build: (colors, options) => toScss(colors, options),
  },
  {
    id: 'json',
    label: 'JSON',
    extension: 'json',
    language: 'json',
    mime: 'application/json',
    build: (colors, options) => toJson(colors, options),
  },
  {
    id: 'tokens',
    label: 'Design tokens',
    extension: 'tokens.json',
    language: 'json',
    mime: 'application/json',
    build: (colors, options) => toDesignTokens(colors, options),
  },
  {
    id: 'svg',
    label: 'SVG poster',
    extension: 'svg',
    language: 'markup',
    mime: 'image/svg+xml',
    build: (colors) => toSvg(colors),
  },
  {
    id: 'ase',
    label: 'Adobe swatches',
    extension: 'ase',
    language: 'binary',
    mime: 'application/octet-stream',
    binary: true,
    build: (colors, options) => toAse(colors, options),
  },
];

/** Build a single export by id. Returns `{ content, format }` or null. */
export function buildExport(formatId, colors, options = {}) {
  const format = EXPORT_FORMATS.find((entry) => entry.id === formatId);
  if (!format) return null;
  return { content: format.build(colors, options), format };
}

/** A filename like `hueforge-iris-2026-10-21.css`. */
export function exportFilename(format, { name = 'palette' } = {}) {
  const date = new Date().toISOString().slice(0, 10);
  return `hueforge-${slugify(name)}-${date}.${format.extension}`;
}
