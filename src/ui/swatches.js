/**
 * HueForge — swatches.js
 * Renders the five main palette cards. Each card is a button-ish surface with
 * lock, copy, recolour and reorder actions. Re-renders are intentional and
 * cheap; only colours that actually changed animate in.
 */

import { contrastGrade } from '../core/color.js';
import { describeColor } from '../core/palette.js';
import { icon } from './icons.js';

/** Human rating for the swatch's own on-colour text. */
function ratingFor(ratio) {
  const grade = contrastGrade(ratio);
  if (grade.aaa) return 'AAA';
  if (grade.aa) return 'AA';
  if (grade.large) return 'AA L';
  return 'Fail';
}

const hexToRgba = (hex, alpha) => {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

let previousColors = [];

/**
 * @param {HTMLElement} container
 * @param {{colors: string[], locks: boolean[]}} state
 */
export function renderSwatches(container, state) {
  const changed = (hex, index) => previousColors[index] !== hex;
  const canAnimate =
    previousColors.length === state.colors.length &&
    previousColors.some((hex, index) => hex !== state.colors[index]);

  const html = state.colors
    .map((hex, index) => {
      const info = describeColor(hex, index);
      const locked = Boolean(state.locks[index]);
      const rating = ratingFor(info.textRatio);
      const entering = changed(hex, index) && canAnimate;

      return `
      <article
        class="swatch${entering ? ' swatch--entering' : ''}"
        style="--swatch:${hex}; --on:${info.textColor}; --on-soft:${hexToRgba(info.textColor, 0.12)}; animation-delay:${index * 40}ms;"
        data-index="${index}"
        data-hex="${hex}"
        draggable="true"
        tabindex="0"
        role="group"
        aria-label="Swatch ${index + 1}, ${hex}, ${info.role}, ${info.name}. Text contrast ${info.textRatio.toFixed(1)} to 1, ${rating}.${locked ? ' Locked.' : ''}"
      >
        <div class="swatch__top">
          <span class="swatch__token">${info.token}</span>
          <div class="swatch__tools">
            <button
              class="swatch__icon swatch__lock"
              type="button"
              data-action="lock"
              aria-pressed="${locked}"
              aria-label="${locked ? 'Unlock' : 'Lock'} ${hex}"
              title="${locked ? 'Unlock' : 'Lock'} (${index + 1})"
            >${icon(locked ? 'lock' : 'unlock', { size: 14 })}</button>
          </div>
        </div>

        <div class="swatch__sample" aria-hidden="true">
          <span class="swatch__aa">Aa</span>
          <span class="swatch__ratio-badge">${rating} · on-colour</span>
        </div>

        <div class="swatch__body">
          <div class="swatch__meta">
            <span class="swatch__role">${info.role}</span>
            <span class="swatch__contrast" title="Contrast of this swatch's own label text (${info.textColor})">${info.token} · ${info.textRatio.toFixed(1)}:1</span>
          </div>
          <button class="swatch__hex" type="button" data-action="copy" aria-label="Copy ${hex}" title="Copy ${hex}">
            ${hex.toUpperCase()}
          </button>
          <p class="swatch__name">${info.name}</p>

          <div class="swatch__actions">
            <button class="swatch__action" type="button" data-action="copy" title="Copy hex" aria-label="Copy ${hex}">${icon('copy', { size: 14 })}</button>
            <label class="swatch__action swatch__edit" title="Recolour this swatch">
              <input type="color" data-action="pick" value="${hex}" aria-label="Change swatch ${index + 1} colour" />
              ${icon('palette', { size: 14 })}
            </label>
            <button class="swatch__action" type="button" data-action="left" title="Move left" aria-label="Move swatch ${index + 1} left" ${index === 0 ? 'disabled' : ''}>${icon('arrowLeft', { size: 14 })}</button>
            <button class="swatch__action" type="button" data-action="right" title="Move right" aria-label="Move swatch ${index + 1} right" ${index === state.colors.length - 1 ? 'disabled' : ''}>${icon('arrowRight', { size: 14 })}</button>
          </div>
        </div>
      </article>`;
    })
    .join('');

  container.innerHTML = html;
  previousColors = [...state.colors];
}
