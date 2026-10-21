import test from 'node:test';
import assert from 'node:assert/strict';

import { TONES, classify, completeReply, engineSummary } from '../src/playground/demo-core.js';
import { generatePalette } from '../src/core/palette.js';

const { colors } = generatePalette({ base: '#7c5cff', mode: 'analogous', seed: 24 });

test('classification picks the obvious intent', () => {
  assert.equal(classify('how much does it cost?')[0].id, 'pricing');
  assert.equal(classify('what are your opening hours')[0].id, 'hours');
  assert.equal(classify('my order arrived broken')[0].id, 'returns');
  assert.equal(classify('can I speak to a human please')[0].id, 'human');
  assert.equal(classify('is the blue one in stock?')[0].id, 'availability');
});

test('replies are deterministic and palette-aware', () => {
  const base = { prompt: 'how much does it cost?', palette: colors, tone: 'warm' };
  const a = completeReply(base);
  const b = completeReply(base);
  assert.equal(a.text, b.text);
  assert.equal(a.intent, 'pricing');
  assert.ok(a.text.includes(colors[2].toUpperCase()), 'mentions the accent colour');
  assert.ok(a.text.includes('$19'), 'includes plan pricing');
  assert.equal(a.tone, 'warm');
});

test('tones change the copy', () => {
  const texts = TONES.map(
    (tone) => completeReply({ prompt: 'hello there', palette: colors, tone }).text,
  );
  assert.equal(new Set(texts).size, TONES.length);
});

test('unknown input falls back to a human handoff', () => {
  const reply = completeReply({ prompt: 'zzzz qqqq', palette: colors });
  assert.equal(reply.intent, 'fallback');
  assert.equal(reply.label, 'Needs a human');
  assert.match(reply.text, /human/i);
});

test('prompts are never reflected and replies stay escape-safe', () => {
  const reply = completeReply({ prompt: '<img src=x onerror=alert(1)> hello', palette: colors });
  assert.ok(!reply.text.includes('onerror'), 'prompt is not echoed into the reply');
  assert.ok(!reply.escaped.includes('<'), 'escaped copy contains no raw angle brackets');
  assert.equal(typeof reply.escaped, 'string');
});

test('engine summary documents itself', () => {
  const summary = engineSummary();
  assert.equal(summary.kind, 'deterministic-template');
  assert.ok(summary.intents >= 8);
  assert.deepEqual(summary.tones, TONES);
});
