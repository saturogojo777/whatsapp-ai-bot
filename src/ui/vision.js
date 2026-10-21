/**
 * HueForge — vision.js
 * Colour-vision-deficiency simulator UI. Shows each swatch twice: as most
 * people see it, and through the selected CVD model.
 */

import { CVD_LABELS, readableTextColor, simulateCvd } from '../core/color.js';
import { describeColor } from '../core/palette.js';

const MODES = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

/** Build the mode pills once. Main calls this on start-up. */
export function renderVisionModes(container, activeMode = 'none') {
  container.innerHTML = MODES.map(
    (mode) => `
    <button
      class="vision-mode${mode === activeMode ? ' is-active' : ''}"
      type="button"
      role="radio"
      aria-checked="${mode === activeMode}"
      data-vision="${mode}"
    >${CVD_LABELS[mode]}</button>`,
  ).join('');
}

/** Update the active pill without rebuilding the group. */
export function setActiveVisionMode(container, activeMode) {
  container.querySelectorAll('[data-vision]').forEach((button) => {
    const isActive = button.dataset.vision === activeMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-checked', String(isActive));
  });
}

/**
 * @param {HTMLElement} grid
 * @param {{colors: string[], visionMode?: string}} state
 */
export function renderVision(grid, state) {
  const mode = state.visionMode && state.visionMode !== 'none' ? state.visionMode : null;

  grid.innerHTML = state.colors
    .map((hex, index) => {
      const info = describeColor(hex, index);
      const simulated = mode ? simulateCvd(hex, mode) : hex;
      const simInfo = describeColor(simulated, index);
      const normalText = readableTextColor(hex);
      const simText = readableTextColor(simulated);

      return `
      <figure class="vision-item">
        <div class="vision-pair">
          <div class="vision-swatch" style="--c:${hex}; --c-text:${normalText}" title="Original ${hex.toUpperCase()}">
            <span>${hex.slice(1).toUpperCase()}</span>
          </div>
          <div class="vision-swatch vision-swatch--sim" style="--c:${simulated}; --c-text:${simText}" title="${mode ? `${CVD_LABELS[mode]} ${simulated.toUpperCase()}` : `Original ${hex.toUpperCase()}`}">
            <span>${simulated.slice(1).toUpperCase()}</span>
          </div>
        </div>
        <figcaption>
          <strong>${info.token} · ${info.role}</strong><br />
          ${mode ? CVD_LABELS[mode] : 'Original · unchanged'}
        </figcaption>
      </figure>`;
    })
    .join('');
}
