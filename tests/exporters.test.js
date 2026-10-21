import test from 'node:test';
import assert from 'node:assert/strict';

import { generatePalette } from '../src/core/palette.js';
import {
  EXPORT_FORMATS,
  buildExport,
  exportFilename,
  paletteName,
  slugify,
  toAse,
  toCss,
  toDesignTokens,
  toJson,
  toScss,
  toSvg,
  toTailwind,
} from '../src/core/exporters.js';

const { colors } = generatePalette({ base: '#7c5cff', mode: 'triadic', seed: 12 });

test('CSS export contains every token and the base colour', () => {
  const css = toCss(colors, { prefix: 'brand' });
  assert.match(css, /:root\s*\{/);
  assert.match(css, /--brand-100: #[0-9a-f]{6};/);
  assert.match(css, /--brand-500: #[0-9a-f]{6};/);
  assert.match(css, /--brand-900-rgb: \d+ \d+ \d+;/);
  for (const hex of colors) assert.ok(css.includes(hex));
});

test('Tailwind export uses the v4 @theme block', () => {
  const css = toTailwind(colors, { prefix: 'acme' });
  assert.match(css, /@theme\s*\{/);
  assert.match(css, /--color-acme-700: #[0-9a-f]{6};/);
});

test('SCSS export is valid variable + map syntax', () => {
  const scss = toScss(colors);
  assert.match(scss, /\$hue-100: #[0-9a-f]{6};/);
  assert.match(scss, /\$hue: \(/);
  assert.match(scss, /@function hue\(\$step\)/);
});

test('JSON export parses and keeps five colours', () => {
  const parsed = JSON.parse(toJson(colors, { name: 'Test palette' }));
  assert.equal(parsed.colors.length, 5);
  assert.equal(parsed.colors[0].hex, colors[0]);
  assert.match(parsed.colors[0].oklch, /^oklch\(/);
});

test('design tokens export is valid DTCG-ish JSON', () => {
  const parsed = JSON.parse(toDesignTokens(colors, { prefix: 'brand' }));
  assert.equal(parsed.brand['brand-100'].$type, 'color');
  assert.equal(parsed.brand['brand-500'].$value, colors[2]);
});

test('SVG export is well-formed and includes hex codes', () => {
  const svg = toSvg(colors, { name: 'Test <Palette>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.ok(svg.includes('Test &lt;Palette&gt;'));
  for (const hex of colors) assert.ok(svg.toUpperCase().includes(hex.toUpperCase()));
  // No unescaped user-supplied angle brackets.
  assert.ok(!svg.includes('Test <Palette>'));
});

test('ASE export has a valid header and one block per colour', () => {
  const bytes = toAse(colors);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'ASEF');

  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(4), 1); // major version
  assert.equal(view.getUint16(6), 0); // minor version
  assert.equal(view.getUint32(8), 5); // block count

  // Every block starts with type 0x0001 (colour).
  let offset = 12;
  for (let i = 0; i < 5; i += 1) {
    assert.equal(view.getUint16(offset), 1);
    const length = view.getUint32(offset + 2);
    offset += 6 + length;
  }
  assert.equal(offset, bytes.byteLength);
});

test('slug and filenames are safe', () => {
  assert.equal(slugify('My Cool Palette!'), 'my-cool-palette');
  assert.equal(slugify('   '), 'hueforge');
  const filename = exportFilename(EXPORT_FORMATS[0], { name: 'Iris Glow' });
  assert.match(filename, /^hueforge-iris-glow-\d{4}-\d{2}-\d{2}\.css$/);
});

test('buildExport handles known and unknown formats', () => {
  assert.equal(buildExport('nope', colors), null);
  const css = buildExport('css', colors);
  assert.ok(css.content.includes(':root'));
  assert.equal(css.format.id, 'css');
  const ase = buildExport('ase', colors);
  assert.ok(ase.content instanceof Uint8Array);
});

test('paletteName is human readable', () => {
  const name = paletteName(colors);
  assert.equal(typeof name, 'string');
  assert.ok(name.length > 2);
});
