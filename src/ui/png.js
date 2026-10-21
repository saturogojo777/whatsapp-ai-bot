/**
 * HueForge — png.js
 * Renders the palette as a shareable 1600×1000 poster directly on a canvas,
 * then hands back a PNG Blob. No libraries, no server round-trip.
 */

import { contrastGrade, contrastRatio, formatRatio, hexToRgb, readableTextColor } from '../core/color.js';
import { describeColor } from '../core/palette.js';
import { paletteName } from '../core/exporters.js';

const WIDTH = 1600;
const HEIGHT = 1000;

/** Rounded rectangle path (with a manual fallback for older Safari). */
function roundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

const hexWithAlpha = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * @param {string[]} colors Five hex colours, light → dark.
 * @param {object} options
 * @param {string} options.name Palette name for the poster title.
 * @returns {Promise<Blob>}
 */
export async function renderPng(colors, { name = paletteName(colors) } = {}) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts are a nice-to-have */
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  /* Background ---------------------------------------------------------- */
  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowA = ctx.createRadialGradient(180, 40, 0, 180, 40, 900);
  glowA.addColorStop(0, hexWithAlpha(colors[2], 0.32));
  glowA.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glowB = ctx.createRadialGradient(1500, 980, 0, 1500, 980, 780);
  glowB.addColorStop(0, hexWithAlpha(colors[1], 0.18));
  glowB.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Faint measuring grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.028)';
  ctx.lineWidth = 1;
  for (let x = 80; x < WIDTH; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 80; y < HEIGHT; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  /* Header -------------------------------------------------------------- */
  const brandX = 80;
  ctx.save();
  ctx.translate(brandX + 18, 78);
  ctx.strokeStyle = colors[2];
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors[2];
  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#f1f4fa';
  ctx.font = '600 30px "Space Grotesk", "Inter", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('HueForge', brandX + 48, 80);

  ctx.fillStyle = 'rgba(241,244,250,0.42)';
  ctx.font = '500 15px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('ACCESSIBLE PALETTE GENERATOR', brandX + 220, 82);

  // Contrast summary, top right.
  const passes = { aa: 0, aaa: 0, total: 0 };
  for (const fg of colors) {
    for (const bg of colors) {
      if (fg === bg) continue;
      const ratio = contrastRatio(fg, bg);
      passes.total += 1;
      if (contrastGrade(ratio).aa) passes.aa += 1;
      if (contrastGrade(ratio).aaa) passes.aaa += 1;
    }
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(241,244,250,0.55)';
  ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`${passes.aa}/${passes.total} PAIRS PASS AA`, WIDTH - 80, 68);
  ctx.fillStyle = 'rgba(241,244,250,0.32)';
  ctx.fillText(`${passes.aaa}/${passes.total} PASS AAA`, WIDTH - 80, 92);
  ctx.textAlign = 'left';

  /* Title --------------------------------------------------------------- */
  ctx.fillStyle = '#f1f4fa';
  ctx.font = '600 76px "Space Grotesk", "Inter", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, brandX, 218);

  ctx.fillStyle = 'rgba(241,244,250,0.45)';
  ctx.font = '400 19px "Inter", system-ui, sans-serif';
  ctx.fillText('A five-step OKLCH ramp, checked for contrast and ready to export.', brandX, 254);

  /* Swatches ------------------------------------------------------------ */
  const margin = 80;
  const gap = 16;
  const top = 300;
  const swatchHeight = 500;
  const swatchWidth = (WIDTH - margin * 2 - gap * (colors.length - 1)) / colors.length;

  colors.forEach((hex, index) => {
    const x = margin + index * (swatchWidth + gap);
    const info = describeColor(hex, index);
    const on = readableTextColor(hex);
    const subtle = on === '#ffffff' ? 'rgba(255,255,255,0.62)' : 'rgba(11,13,18,0.6)';
    const faint = on === '#ffffff' ? 'rgba(255,255,255,0.42)' : 'rgba(11,13,18,0.42)';

    roundedRect(ctx, x, top, swatchWidth, swatchHeight, 26);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.strokeStyle = on === '#ffffff' ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,18,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Token
    ctx.fillStyle = subtle;
    ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(info.token, x + 26, top + 44);

    // Specimen
    ctx.fillStyle = on;
    ctx.font = '500 108px "Space Grotesk", "Inter", system-ui, sans-serif';
    ctx.fillText('Aa', x + 22, top + 210);

    // Rating pill — describes the text *on this swatch*, which is what a
    // developer would actually place there.
    const ownRatio = contrastRatio(hex, on);
    const label =
      ownRatio >= 7 ? 'AAA text' : ownRatio >= 4.5 ? 'AA text' : ownRatio >= 3 ? 'Large text only' : 'Decorative';
    ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
    const labelWidth = ctx.measureText(label).width + 26;
    roundedRect(ctx, x + 26, top + 258, labelWidth, 30, 15);
    ctx.fillStyle = on === '#ffffff' ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,18,0.08)';
    ctx.fill();
    ctx.fillStyle = subtle;
    ctx.fillText(label, x + 39, top + 278);

    // Hex + name
    ctx.fillStyle = on;
    ctx.font = '600 26px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(hex.toUpperCase(), x + 26, top + swatchHeight - 72);

    ctx.fillStyle = faint;
    ctx.font = '400 16px "Inter", system-ui, sans-serif';
    ctx.fillText(`${info.role} · ${info.name}`, x + 26, top + swatchHeight - 42);
  });

  /* Footer -------------------------------------------------------------- */
  const footerY = 872;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(margin, footerY);
  ctx.lineTo(WIDTH - margin, footerY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(241,244,250,0.4)';
  ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('HUEFORGE · OKLCH · WCAG 2.1', margin, footerY + 42);
  ctx.fillText(`GENERATED ${new Date().toISOString().slice(0, 10)}`, margin, footerY + 68);

  // Worst-case contrast callout, so the poster tells the truth.
  let worst = { ratio: Infinity, fg: colors[0], bg: colors[0] };
  for (const fg of colors) {
    for (const bg of colors) {
      if (fg === bg) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < worst.ratio) worst = { ratio, fg, bg };
    }
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(241,244,250,0.55)';
  ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`LOWEST PAIR ${formatRatio(worst.ratio)}:1`, WIDTH - margin, footerY + 42);
  ctx.fillStyle = 'rgba(241,244,250,0.3)';
  ctx.fillText('CHECK THE CONTRAST MATRIX BEFORE SHIPPING', WIDTH - margin, footerY + 68);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render the PNG.'));
    }, 'image/png');
  });
}
