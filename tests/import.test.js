import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPaletteFromHexes,
  parseColorList,
  sortByLightness,
} from '../src/core/import.js';
import { hexToOklch } from '../src/core/color.js';

const isHex = (value) => /^#[0-9a-f]{6}$/.test(value);

test('parseColorList understands hex, shorthand and rgb()', () => {
  assert.deepEqual(parseColorList('#7c5cff, #ff8a5c'), ['#7c5cff', '#ff8a5c']);
  assert.deepEqual(parseColorList('abc 123456'), ['#aabbcc', '#123456']);
  assert.deepEqual(parseColorList('rgb(124, 92, 255)'), ['#7c5cff']);
  assert.deepEqual(parseColorList('rgb(255 138 92 / 0.5)'), ['#ff8a5c']);
  assert.deepEqual(parseColorList('no colours here'), []);
  // Duplicates are removed.
  assert.deepEqual(parseColorList('#fff #ffffff'), ['#ffffff']);
});

test('a single colour becomes a five-step ramp', () => {
  const result = buildPaletteFromHexes(['#7c5cff']);
  assert.equal(result.colors.length, 5);
  assert.ok(result.colors.every(isHex));
  assert.equal(result.base, '#7c5cff');
});

test('given colours are preserved and gaps are interpolated', () => {
  const input = ['#7c5cff', '#ff8a5c', '#ffd166'];
  const result = buildPaletteFromHexes(input);
  assert.equal(result.colors.length, 5);
  assert.ok(result.colors.every(isHex));
  for (const hex of input) assert.ok(result.colors.includes(hex), `${hex} kept`);
});

test('more than five colours are reduced to five usable steps', () => {
  const input = ['#111111', '#333333', '#555555', '#777777', '#999999', '#bbbbbb', '#dddddd'];
  const result = buildPaletteFromHexes(input);
  assert.equal(result.colors.length, 5);
  assert.ok(result.colors.every(isHex));
});

test('output is sorted light to dark', () => {
  const result = buildPaletteFromHexes(['#ffd166', '#7c5cff', '#123456']);
  const lightness = result.colors.map((hex) => hexToOklch(hex).l);
  for (let i = 1; i < lightness.length; i += 1) {
    assert.ok(lightness[i] < lightness[i - 1]);
  }
});

test('sortByLightness does not mutate', () => {
  const input = ['#111111', '#eeeeee'];
  const sorted = sortByLightness(input);
  assert.deepEqual(sorted, ['#eeeeee', '#111111']);
  assert.deepEqual(input, ['#111111', '#eeeeee']);
});

test('invalid input is rejected without throwing', () => {
  assert.equal(buildPaletteFromHexes([]), null);
  assert.equal(buildPaletteFromHexes(['not-a-colour']), null);
});
