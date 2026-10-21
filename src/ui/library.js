/**
 * HueForge — library.js
 * Renders the locally saved palette collection. Storage and business rules live
 * in core/storage.js; this module only produces markup.
 */

import { paletteName } from '../core/exporters.js';
import { icon } from './icons.js';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

/**
 * @param {HTMLElement} list
 * @param {HTMLElement} emptyState
 * @param {Array<{id: string, colors: string[], mode: string, seed: number, createdAt?: string}>} entries
 */
export function renderLibrary(list, emptyState, entries) {
  emptyState.hidden = entries.length > 0;
  list.innerHTML = entries
    .map((entry) => {
      const colors = entry.colors;
      const name = paletteName(colors);
      const when = entry.createdAt ? dateFormatter.format(new Date(entry.createdAt)) : '';
      return `
      <li class="saved-item" data-id="${entry.id}">
        <span class="saved-item__strip" aria-hidden="true">
          ${colors.map((hex) => `<span style="background:${hex}"></span>`).join('')}
        </span>
        <span class="saved-item__meta">
          <button type="button" data-action="load" data-id="${entry.id}" aria-label="Load palette ${name}">
            ${name} <span aria-hidden="true">— ${colors[2].toUpperCase()}</span>
          </button>
          <small>${when}${when ? ' · ' : ''}${entry.mode ?? 'auto'}</small>
        </span>
        <button
          class="saved-item__remove"
          type="button"
          data-action="remove"
          data-id="${entry.id}"
          aria-label="Delete palette ${name}"
          title="Delete"
        >${icon('trash', { size: 14 })}</button>
      </li>`;
    })
    .join('');
}
