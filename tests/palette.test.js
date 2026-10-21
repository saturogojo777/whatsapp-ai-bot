import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HARMONIES,
  PALETTE_SIZE,
  TOKENS,
  decodeShare,
  encodeShare,
  generatePalette,
  moveColor,
  normalizeLocks,
  randomBase,
  resolveMode,
  roleFor,
} from '../src/core/palette.js';
import { hexToOklch, normalizeHex } from '../src/core/color.js';

const isHex = (value) => /^#[0-9a-f]{6}$/.test(value);

test('generation is deterministic for the same inputs', () => {
  const a = generatePalette({ base: '#7c5cff', mode: 'triadic', seed: 42 });
  const b = generatePalette({ base: '#7c5cff', mode: 'triadic', seed: 42 });
  assert.deepEqual(a.colors, b.colors);
});

test('different seeds change the palette', () => {
  const a = generatePalette({ base: '#7c5cff', mode: 'auto', seed: 1 });
  const b = generatePalette({ base: '#7c5cff', mode: 'auto', seed: 99 });
  assert.notDeepEqual(a.colors, b.colors);
});

test('every harmony produces five valid hex colours', () => {
  for (const mode of Object.keys(HARMONIES)) {
    const palette = generatePalette({ base: '#3dd6c4', mode, seed: 7 });
    assert.equal(palette.colors.length, PALETTE_SIZE, mode);
    assert.ok(palette.colors.every(isHex), mode);
    assert.ok(palette.colors.every((hex) => normalizeHex(hex) === hex));
  }
});

test('auto mode resolves to a real harmony deterministically', () => {
  const first = resolveMode('auto', 12);
  const second = resolveMode('auto', 12);
  assert.equal(first, second);
  assert.ok(HARMONIES[first]);
  assert.equal(resolveMode('triadic', 3), 'triadic');
  assert.equal(resolveMode('not-a-mode', 3), 'monochrome');
});

test('locked swatches survive regeneration', () => {
  const initial = generatePalette({ base: '#7c5cff', mode: 'analogous', seed: 5 });
  const locks = [false, true, false, true, false];
  const next = generatePalette({
    base: '#7c5cff',
    mode: 'analogous',
    seed: 900,
    locks,
    previous: initial.colors,
  });

  assert.equal(next.colors[1], initial.colors[1]);
  assert.equal(next.colors[3], initial.colors[3]);
  assert.notEqual(next.colors[0], initial.colors[0]);
});

test('all locks means no change', () => {
  const initial = generatePalette({ base: '#7c5cff', mode: 'complementary', seed: 5 });
  const next = generatePalette({
    base: '#7c5cff',
    mode: 'complementary',
    seed: 77,
    locks: [true, true, true, true, true],
    previous: initial.colors,
  });
  assert.deepEqual(next.colors, initial.colors);
});

test('ramp is always ordered light to dark', () => {
  for (const mode of ['analogous', 'triadic', 'prism', 'shades']) {
    const { colors } = generatePalette({ base: '#ff8a5c', mode, seed: 3 });
    const lightness = colors.map((hex) => hexToOklch(hex).l);
    for (let i = 1; i < lightness.length; i += 1) {
      assert.ok(lightness[i] < lightness[i - 1], `${mode} slot ${i} should be darker`);
    }
  }
});

test('tokens and roles are sensible', () => {
  assert.deepEqual(TOKENS, ['100', '300', '500', '700', '900']);
  assert.equal(roleFor('#f7f5ff'), 'Veil');
  assert.equal(roleFor('#111111'), 'Ink');
});

test('share links round-trip and reject malformed input', () => {
  const state = generatePalette({ base: '#7c5cff', mode: 'split', seed: 12345 });
  const hash = encodeShare({
    colors: state.colors,
    base: state.base,
    mode: state.mode,
    seed: state.seed,
    locks: [true, false, true, false, false],
  });
  const decoded = decodeShare(`#${hash}`);
  assert.deepEqual(decoded.colors, state.colors);
  assert.equal(decoded.base, '#7c5cff');
  assert.equal(decoded.mode, 'split');
  assert.equal(decoded.seed, 12345);
  assert.deepEqual(decoded.locks, [true, false, true, false, false]);

  assert.equal(decodeShare('#p=abc'), null);
  assert.equal(decodeShare('#p=zzzzzz-zzzzzz-zzzzzz-zzzzzz-zzzzzz'), null);
});

test('moveColor reorders without mutating the source', () => {
  const colors = ['#111111', '#222222', '#333333', '#444444', '#555555'];
  const moved = moveColor(colors, 0, 4);
  assert.deepEqual(moved, ['#222222', '#333333', '#444444', '#555555', '#111111']);
  assert.deepEqual(colors, ['#111111', '#222222', '#333333', '#444444', '#555555']);
  assert.deepEqual(moveColor(colors, 1, 1), colors);
});

test('helper normalisers are defensive', () => {
  assert.deepEqual(normalizeLocks(), [false, false, false, false, false]);
  assert.deepEqual(normalizeLocks([1, 0, 'yes']), [true, false, true, false, false]);
  assert.ok(isHex(randomBase(8)));
  assert.equal(randomBase(8), randomBase(8));
});
