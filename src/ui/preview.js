/**
 * HueForge — preview.js
 * Paints the palette into two realistic surfaces: a marketing card and a dense
 * app dashboard. Only the five swatches are used — no extra tints — so what you
 * see is what a developer can actually build.
 */

import {
  contrastRatio,
  formatRatio,
  readableTextColor,
} from '../core/color.js';
import { describeColor } from '../core/palette.js';

const CONTENT = [
  {
    heading: 'Design tokens that ship themselves',
    body: 'One base colour becomes a complete ramp with contrast-safe text, hover states and surface tints — ready for CSS, Tailwind or Figma.',
    button: 'Get started',
    badge: 'NEW',
    appTitle: 'Overview',
    pill: 'Live',
    chips: ['OKLCH', 'WCAG AA', 'Zero deps'],
  },
  {
    heading: 'A brand that holds up in the dark',
    body: 'Pastel marketing pages and dense dashboards rarely agree. A five-step ramp gives both a shared, testable vocabulary.',
    button: 'Try the studio',
    badge: 'BETA',
    appTitle: 'Palette audit',
    pill: 'AA',
    chips: ['Accessible', 'Tokenised', 'Offline'],
  },
  {
    heading: 'One hue. Five honest surfaces.',
    body: 'The lightest step is your page, the darkest is your ink, and the middle is the only colour a button ever needs.',
    button: 'See exports',
    badge: 'v2.0',
    appTitle: 'Tokens',
    pill: 'Synced',
    chips: ['CSS', 'Tailwind', 'Design tokens'],
  },
];

const $ = (id) => document.getElementById(id);

/**
 * @param {{colors: string[], largeText?: boolean}} state
 * @param {number} contentIndex
 */
export function renderPreview(state, contentIndex = 0) {
  const colors = state.colors;
  const content = CONTENT[contentIndex % CONTENT.length];

  const card = $('preview-card');
  const app = $('preview-app');
  if (!card || !app) return;

  const cardBg = colors[0];
  const cardText = readableTextColor(cardBg);
  const surface = colors[1];
  const primary = colors[3];
  const primaryText = readableTextColor(primary);

  card.style.setProperty('--p-bg', cardBg);
  card.style.setProperty('--p-text', cardText);
  card.style.setProperty('--p-primary', primary);
  card.style.setProperty('--p-primary-text', primaryText);
  card.style.setProperty('--p-surface', surface);

  const appBg = colors[4];
  const appText = readableTextColor(appBg);
  const accent = colors[2];

  app.style.setProperty('--a-bg', appBg);
  app.style.setProperty('--a-text', appText);
  app.style.setProperty('--a-accent', accent);
  app.style.setProperty('--a-accent-text', readableTextColor(accent));

  // Content swap
  $('preview-heading').textContent = content.heading;
  $('preview-body').textContent = content.body;
  $('preview-button').textContent = content.button;
  $('preview-badge').textContent = content.badge;
  $('preview-app-title').textContent = content.appTitle;
  $('preview-app-pill').textContent = content.pill;
  $('preview-chips').innerHTML = content.chips.map((chip) => `<span>${chip}</span>`).join('');
  $('preview-avatar').style.background = surface;
  $('preview-avatar').style.color = readableTextColor(surface);

  // Metrics that are true for this palette right now.
  $('preview-stat-1').textContent = `${formatRatio(contrastRatio(cardText, cardBg))}:1`;
  $('preview-stat-2').textContent = String(colors.length);
  $('preview-stat-3').textContent = 'OKLCH';

  // Chart bars: deterministic heights derived from the swatch values.
  const chart = $('preview-chart');
  const bars = Array.from({ length: 11 }, (_, index) => {
    const color = colors[index % colors.length];
    const seed = Number.parseInt(color.slice(1 + (index % 3) * 2, 3 + (index % 3) * 2), 16);
    const height = 26 + (seed % 62);
    const opacity = 0.32 + ((index * 7) % 60) / 100;
    return `<i style="height:${height}%; opacity:${opacity.toFixed(2)}"></i>`;
  }).join('');
  chart.innerHTML = bars;

  // Skeleton table rows.
  const table = $('preview-table');
  table.innerHTML = [0, 1, 2]
    .map(
      (row) => `
    <div class="preview-table__row">
      <i style="background:${colors[(row + 2) % colors.length]}"></i>
      <span></span>
      <span></span>
    </div>`,
    )
    .join('');

  // Update the palette name shown in the mini app sidebar.
  $('preview-logo').textContent = 'HF';

  // Accessibility label describing the pair actually used.
  card.setAttribute(
    'aria-label',
    `Marketing card preview. Text ${cardText} on ${cardBg}, contrast ${formatRatio(contrastRatio(cardText, cardBg))} to 1.`,
  );
  const info = describeColor(cardBg, 0);
  app.setAttribute(
    'aria-label',
    `App preview using ${info.role.toLowerCase()} ${cardBg} as the page colour, ${colors[2]} as the accent.`,
  );
}

export const PREVIEW_VARIATIONS = CONTENT.length;
