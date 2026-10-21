import test from 'node:test';
import assert from 'node:assert/strict';

import {
  colorName,
  contrastGrade,
  contrastRatio,
  deltaE,
  formatOklch,
  hexToOklch,
  hexToRgb,
  normalizeHex,
  oklchToHex,
  readableTextColor,
  rgbToHex,
  simulateCvd,
} from '../src/core/color.js';

const isHex = (value) => /^#[0-9a-f]{6}$/.test(value);

test('normalizeHex accepts 3, 6 digit and prefixed values', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex(' 7c5cff '), '#7c5cff');
  assert.equal(normalizeHex('#000000'), '#000000');
  assert.equal(normalizeHex('nope'), null);
  assert.equal(normalizeHex(123), null);
});

test('hex and rgb round-trip', () => {
  for (const hex of ['#000000', '#ffffff', '#7c5cff', '#3dd6c4', '#ff8a5c']) {
    const rgb = hexToRgb(hex);
    assert.equal(rgbToHex(rgb), hex);
  }
});

test('WCAG contrast of black and white is 21:1', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#000000').toFixed(2), '21.00');
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('contrast grades follow WCAG thresholds', () => {
  assert.deepEqual(contrastGrade(7.2), { aa: true, aaa: true, large: true });
  assert.deepEqual(contrastGrade(4.6), { aa: true, aaa: false, large: true });
  assert.deepEqual(contrastGrade(3.2), { aa: false, aaa: false, large: true });
  assert.deepEqual(contrastGrade(2.9), { aa: false, aaa: false, large: false });
  assert.equal(contrastGrade(4.6, true).aaa, true);
});

test('OKLCH conversion stays in gamut and close to the original', () => {
  const originals = ['#7c5cff', '#3dd6c4', '#ff8a5c', '#101820', '#f4f5fa'];
  for (const hex of originals) {
    const { l, c, h } = hexToOklch(hex);
    const roundTrip = oklchToHex({ l, c, h });
    assert.ok(isHex(roundTrip), `${hex} should round-trip to hex`);
    assert.ok(deltaE(hex, roundTrip) < 0.02, `${hex} → ${roundTrip} drifted`);

    // Absurd chroma must be mapped back into sRGB, never throw.
    const vivid = oklchToHex({ l: 0.5, c: 0.9, h: 300 });
    assert.ok(isHex(vivid));
  }
});

test('formatOklch returns a valid CSS colour string', () => {
  assert.match(formatOklch('#7c5cff'), /^oklch\(\d+(\.\d+)?% 0\.\d{3} \d+(\.\d+)?\)$/);
});

test('readableTextColor picks the higher contrast option', () => {
  assert.equal(readableTextColor('#ffffff'), '#0b0d12');
  assert.equal(readableTextColor('#111111'), '#ffffff');
  for (const hex of ['#7c5cff', '#3dd6c4', '#ff8a5c', '#c9c9c9']) {
    const chosen = readableTextColor(hex);
    const other = chosen === '#ffffff' ? '#0b0d12' : '#ffffff';
    assert.ok(contrastRatio(hex, chosen) >= contrastRatio(hex, other), hex);
  }
});

test('colour vision simulation returns valid, distinct hexes', () => {
  for (const mode of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']) {
    const simulated = simulateCvd('#ff5c5c', mode);
    assert.ok(isHex(simulated));
  }
  assert.notEqual(
    simulateCvd('#ff5c5c', 'achromatopsia'),
    simulateCvd('#5c9cff', 'achromatopsia'),
  );
});

test('colorName returns a human label', () => {
  assert.equal(colorName('#ff0000'), 'Red');
  assert.equal(colorName('#000000'), 'Black');
  assert.equal(colorName('#7c5cff'), 'Violet');
  assert.ok(!['Custom', ''].includes(colorName('#e8e2ff')));
  assert.match(colorName('#e8e2ff'), /Violet|Orchid|Lavender|Pale|Soft|Cloud|Paper/);
  assert.equal(colorName('#7c5cff'), 'Violet');
});
