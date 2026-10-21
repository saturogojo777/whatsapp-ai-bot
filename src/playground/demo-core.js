/**
 * HueForge Playground — demo-core.js
 * -----------------------------------------------------------------------------
 * A deterministic, dependency-free reply engine used by the optional local
 * playground (`npm run playground`).
 *
 * It is deliberately NOT a language model. It classifies an incoming WhatsApp
 * message by intent, then composes a transparent, template-based reply that is
 * aware of the current palette (hex codes, token names and contrast grades), so
 * you can test the shape of an assistant flow without any API key.
 *
 * Everything here is pure: the same input always produces the same reply, which
 * makes it safe to unit test and easy to reason about.
 */

import { contrastGrade, contrastRatio, formatRatio } from '../core/color.js';
import { describeColor } from '../core/palette.js';
import { hashString, mulberry32 } from '../core/palette.js';

export const TONES = ['warm', 'direct', 'technical', 'playful'];

/** Intent definitions with weighted keyword cues. */
export const INTENTS = {
  greeting: {
    label: 'Greeting',
    cues: [
      ['hi', 2], ['hello', 2], ['hey', 1], ['salam', 2], ['assalam', 2], ['hola', 2],
      ['good morning', 2], ['good evening', 2], ['aoa', 2], ['start', 1],
    ],
  },
  pricing: {
    label: 'Pricing',
    cues: [
      ['price', 3], ['pricing', 3], ['cost', 2], ['how much', 3], ['rate', 1],
      ['budget', 2], ['quote', 2], ['charge', 2], ['plan', 1],
    ],
  },
  availability: {
    label: 'Availability',
    cues: [
      ['stock', 2], ['available', 2], ['in stock', 3], ['size', 1], ['colour', 1],
      ['color', 1], ['variant', 1], ['catalog', 1], ['catalogue', 1],
    ],
  },
  shipping: {
    label: 'Delivery',
    cues: [
      ['delivery', 3], ['shipping', 3], ['ship', 2], ['courier', 2], ['tracking', 2],
      ['how long', 2], ['arrive', 1], ['dispatch', 2],
    ],
  },
  returns: {
    label: 'Returns',
    cues: [
      ['refund', 3], ['return', 3], ['exchange', 3], ['broken', 3], ['damaged', 3],
      ['warranty', 2], ['replace', 3], ['arrived broken', 4],
    ],
  },
  hours: {
    label: 'Opening hours',
    cues: [
      ['hours', 3], ['open', 2], ['close', 2], ['closed', 2], ['timing', 2],
      ['weekend', 1], ['today', 1],
    ],
  },
  human: {
    label: 'Escalation',
    cues: [
      ['human', 3], ['agent', 3], ['person', 2], ['manager', 3], ['call', 1],
      ['complain', 2], ['speak to', 3], ['support', 1],
    ],
  },
  brand: {
    label: 'Brand & design',
    cues: [
      ['colour', 2], ['color', 2], ['palette', 3], ['brand', 2], ['hex', 2],
      ['design', 1], ['contrast', 2], ['accessible', 2], ['wcag', 3],
    ],
  },
};

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });

/** Score every intent against the prompt; returns a sorted list. */
export function classify(prompt) {
  const text = ` ${String(prompt ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ')} `;
  const scores = Object.entries(INTENTS).map(([id, intent]) => {
    let score = 0;
    const hits = [];
    for (const [cue, weight] of intent.cues) {
      if (text.includes(` ${cue} `) || text.includes(`${cue} `) || text.includes(` ${cue}`)) {
        score += weight;
        hits.push(cue);
      }
    }
    return { id, label: intent.label, score, hits };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/** Token metadata used inside replies. */
function describePalette(colors) {
  const described = colors.map((hex, index) => describeColor(hex, index));
  const surface = described[0];
  const ink = described[4];
  const accent = described[2];
  const onAccent = accent.textColor;
  const pairRatio = contrastRatio(accent.hex, surface.hex);
  return {
    described,
    surface,
    ink,
    accent,
    onAccent,
    accentName: accent.name,
    pairRatio,
    grade: (() => {
      const grade = contrastGrade(pairRatio);
      return grade.aaa ? 'AAA' : grade.aa ? 'AA' : grade.large ? 'AA large' : 'below minimum';
    })(),
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];

/* -------------------------------------------------------------------------- */
/* Reply templates                                                            */
/* -------------------------------------------------------------------------- */

function replyForIntent(intent, context) {
  const { palette, tone, random } = context;
  const { accent, onAccent, accentName, surface, ink, grade, pairRatio } = palette;
  const accentHex = accent.hex.toUpperCase();

  const toneOpen = {
    warm: "Thanks for reaching out — happy to help!",
    direct: 'Here’s the short answer.',
    technical: 'Summary below.',
    playful: 'Say less — here it is.',
  }[tone];

  const catalogueLine = {
    warm: `Right now, the standout is our **${accentName}** set (${accentHex}) — it’s the colour people ask about most.`,
    direct: `Flagship item: **${accentName}** set — ${accentHex}.`,
    technical: `Primary SKU colour token \`${accentHex}\` (${accentName}) carries ${formatRatio(pairRatio)}:1 contrast on the ${surface.name.toLowerCase()} surface.`,
    playful: `The ${accentName} set (${accentHex}) is the crowd favourite. It’s not subtle, and neither are we.`,
  }[tone];

  switch (intent) {
    case 'greeting':
      return {
        text: `${toneOpen}\n\nThis is the **HueForge demo assistant**. I can quote prices, check availability, explain delivery, or hand you to a human.\n\nWhat can I help with?`,
        chips: ['See pricing', 'Check delivery', 'Talk to a human'],
      };

    case 'pricing':
      return {
        text: `${toneOpen}\n\n**Pricing**\n• Starter — $19\n• Studio — $49 (most popular)\n• Team — $99, unlimited seats\n\n${catalogueLine}\n\nAll plans are monthly, cancel anytime. Want me to hold Studio at the current price?`,
        chips: ['Hold Studio', 'Compare plans', 'Talk to a human'],
      };

    case 'availability':
      return {
        text: `${toneOpen}\n\n**Availability**\n${catalogueLine}\n\nLight and dark variants are in stock today; the mid-tone (${palette.described[1].hex.toUpperCase()}) ships within 48 hours.\n\nWant me to reserve one?`,
        chips: ['Reserve one', 'See all variants', 'Check delivery'],
      };

    case 'shipping':
      return {
        text: `${toneOpen}\n\n**Delivery**\n• Express — 1–2 working days\n• Standard — 3–5 working days\n• Free over $75\n\nYou’ll get a tracking link the moment the parcel is scanned. Which city are we shipping to?`,
        chips: ['Express delivery', 'Standard delivery', 'Track my order'],
      };

    case 'returns':
      return {
        text: `${toneOpen}\n\n**Returns & warranty**\nItems can come back within 30 days, unused and in original packaging. Damaged arrivals are replaced free — just send one photo and your order number.\n\nI can start a return right here if you like.`,
        chips: ['Start a return', 'Send a photo', 'Talk to a human'],
      };

    case 'hours':
      return {
        text: `${toneOpen}\n\n**Opening hours**\n• Mon–Fri — 9:00 to 18:00\n• Saturday — 10:00 to 14:00\n• Sunday — closed\n\nMessages sent outside these hours are answered first thing the next working day.`,
        chips: ['Leave a message', 'Book a call', 'See pricing'],
      };

    case 'human':
      return {
        text: `Of course — connecting you with a person.\n\nA teammate will reply here within one working hour. If it is urgent, reply **CALLBACK** with a number and we will ring you instead.\n\n_Your transcript is attached so you will not have to repeat yourself._`,
        chips: ['Request callback', 'Keep chatting', 'See pricing'],
      };

    case 'brand':
      return {
        text: `${toneOpen}\n\n**About our palette**\n• Accent — ${accentHex} (${accentName} on its own is ${onAccent === '#ffffff' ? 'white' : 'near-black'} text)\n• Page surface — ${surface.hex.toUpperCase()} (${surface.name})\n• Ink — ${ink.hex.toUpperCase()} (${ink.name})\n• Accent on surface — ${formatRatio(pairRatio)}:1, ${grade}\n\nEvery pair is graded before we publish, so the shop reads the same for everyone.`,
        chips: ['Check contrast', 'Export tokens', 'See pricing'],
      };

    default:
      return {
        text: `${toneOpen}\n\nI want to answer this properly, so I’m looping in a human. Meanwhile, here are the things I can handle instantly:\n\n• Pricing and plans\n• Stock and variants\n• Delivery times\n• Returns and warranty`,
        chips: ['See pricing', 'Check delivery', 'Talk to a human'],
      };
  }
}

/**
 * Compose a reply.
 *
 * @param {object} options
 * @param {string} options.prompt Incoming WhatsApp message.
 * @param {string[]} options.palette Five hex colours (used to theme the reply).
 * @param {'warm'|'direct'|'technical'|'playful'} options.tone
 * @param {number} [options.seed] Deterministic seed (defaults to the prompt hash).
 * @returns {{ text: string, intent: string, label: string, confidence: number, matched: string[], why: string, chips: string[] }}
 */
export function completeReply({ prompt, palette, tone = 'warm', seed }) {
  const clean = String(prompt ?? '').slice(0, 600).trim();
  const safeTone = TONES.includes(tone) ? tone : 'warm';
  const random = mulberry32(seed ?? (hashString(clean) || 1));
  const ranked = classify(clean);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const total = ranked.reduce((sum, entry) => sum + entry.score, 0) || 1;
  const confidence = best.score === 0 ? 0.2 : Math.min(0.98, best.score / total);

  const intent = best.score === 0 ? 'fallback' : best.id;
  const described = describePalette(palette);

  const { text, chips } = replyForIntent(intent, {
    palette: described,
    tone: safeTone,
    random,
  });

  const variants = {
    greeting: ['Welcome back', 'Friendly opener', 'Short welcome'],
    pricing: ['Pricing table', 'Plan comparison', 'Quote request'],
    availability: ['Stock check', 'Variant list', 'Reserve flow'],
    shipping: ['Delivery windows', 'Tracking handoff', 'Shipping quote'],
    returns: ['Returns policy', 'Damage report', 'Warranty path'],
    hours: ['Opening hours', 'Out-of-hours note', 'Callback offer'],
    human: ['Escalation', 'Callback capture', 'Agent handoff'],
    brand: ['Palette summary', 'Contrast report', 'Token summary'],
    fallback: ['Human handoff', 'Capability menu', 'Clarifying question'],
  };

  return {
    text,
    intent,
    label: intent === 'fallback' ? 'Needs a human' : INTENTS[intent].label,
    variant: pick(random, variants[intent] ?? ['Reply']),
    confidence,
    matched: best.hits,
    runnerUp: runnerUp?.score ? { label: runnerUp.label, score: runnerUp.score } : null,
    why:
      best.score === 0
        ? 'No intent cues matched, so the safest action is a human handoff.'
        : `Matched ${best.hits.map((hit) => `“${hit}”`).join(', ')} → ${INTENTS[intent].label}.`,
    chips,
    tone: safeTone,
    seed: seed ?? hashString(clean),
    disclaimer:
      'Template engine, not an LLM. No message leaves this machine.',
    escaped: esc(text),
  };
}

/** Health/summary data for the playground UI. */
export function engineSummary() {
  return {
    kind: 'deterministic-template',
    intents: Object.keys(INTENTS).length,
    tones: TONES,
    network: 'local-only',
  };
}
