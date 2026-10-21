/**
 * HueForge — contrast.js
 * Renders the 5×5 WCAG contrast matrix and its summary.
 *
 * Each cell is painted with the real foreground/background pair, so the table
 * doubles as a visual preview: if the ratio text is hard to read, that pair is
 * hard to read.
 */

import { contrastGrade, contrastRatio, formatRatio } from '../core/color.js';
import { describeColor } from '../core/palette.js';

/**
 * @param {HTMLTableElement} table
 * @param {HTMLElement} summary
 * @param {{colors: string[], largeText?: boolean}} state
 */
export function renderContrast(table, summary, state) {
  const { colors, largeText = false } = state;
  const threshold = largeText ? 3 : 4.5;
  const aaaThreshold = largeText ? 4.5 : 7;

  const columns = colors.map((hex, index) => describeColor(hex, index));

  const head = `
    <thead>
      <tr>
        <th scope="col" class="matrix__corner">bg ↓ / text →</th>
        ${columns
          .map(
            (info) => `
          <th scope="col">
            <span class="matrix__swatch"><i style="background:${info.hex}"></i>${info.token}</span>
          </th>`,
          )
          .join('')}
      </tr>
    </thead>`;

  let passAA = 0;
  let passAAA = 0;
  let fail = 0;
  let best = { ratio: 0, fg: colors[0], bg: colors[0] };
  let worst = { ratio: Infinity, fg: colors[0], bg: colors[0] };

  const rows = colors
    .map((bg, rowIndex) => {
      const bgInfo = describeColor(bg, rowIndex);
      const cells = colors
        .map((fg, colIndex) => {
          const fgInfo = describeColor(fg, colIndex);
          const ratio = contrastRatio(fg, bg);
          const self = fg === bg;
          const grade = contrastGrade(ratio, largeText);

          if (!self) {
            if (grade.aa) passAA += 1;
            if (grade.aaa) passAAA += 1;
            if (!grade.aa) fail += 1;
            if (ratio > best.ratio) best = { ratio, fg, bg };
            if (ratio < worst.ratio) worst = { ratio, fg, bg };
          }

          const label = self ? '—' : formatRatio(ratio);
          const gradeLabel = self ? 'same' : grade.aaa ? 'AAA' : grade.aa ? 'AA' : grade.large ? 'AA L' : 'Fail';
          const className = [
            'matrix__cell',
            self ? 'matrix__cell--self' : '',
            !self && !grade.aa ? 'matrix__cell--fail' : '',
            !self && grade.aa && !grade.aaa ? 'matrix__cell--large' : '',
            !self && grade.aaa ? 'matrix__cell--aaa' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return `<td
            class="${className}"
            style="background:${bg}; color:${fg};"
            data-fg="${fg}"
            data-bg="${bg}"
            title="Text ${fg.toUpperCase()} on ${bg.toUpperCase()} — ${formatRatio(ratio)}:1 (${gradeLabel})${
              self ? ', identical colours' : ''
            }"
            aria-label="Text ${fg.toUpperCase()} on background ${bg.toUpperCase()}: ${formatRatio(ratio)} to 1, ${gradeLabel}"
          >
            <span class="matrix__ratio">${label}</span>
            <span class="matrix__grade" style="color:${fg}; opacity:0.78">${gradeLabel}</span>
            ${self ? '' : `<span class="matrix__flag" aria-hidden="true">${grade.aaa ? '✓✓' : grade.aa ? '✓' : grade.large ? '◐' : '×'}</span>`}
          </td>`;
        })
        .join('');

      return `<tr>
        <th scope="row">
          <span class="matrix__swatch"><i style="background:${bgInfo.hex}"></i>${bgInfo.token}</span>
        </th>
        ${cells}
      </tr>`;
    })
    .join('');

  table.innerHTML = `${head}<tbody>${rows}</tbody>`;

  const totalPairs = colors.length * (colors.length - 1);
  summary.innerHTML = `
    <span class="summary-pill summary-pill--pass"><i></i>${passAA}/${totalPairs} pass AA</span>
    <span class="summary-pill"><i></i>${passAAA}/${totalPairs} pass AAA</span>
    <span class="summary-pill summary-pill--fail"><i></i>${fail} fail</span>
    <span class="summary-pill">Best ${formatRatio(best.ratio)}:1</span>
    <span class="contrast-summary__text">
      ${largeText ? 'Large text thresholds (3:1 / 4.5:1)' : 'Body text thresholds (4.5:1 / 7:1)'} ·
      ${fail === 0 ? 'Every pair is text-safe.' : `${fail} pair${fail === 1 ? '' : 's'} need a larger size, bolder weight or different partner.`}
    </span>`;

  // Expose thresholds for potential integrations/tests.
  table.dataset.threshold = String(threshold);
  table.dataset.aaaThreshold = String(aaaThreshold);
  summary.dataset.worst = `${worst.fg}:${worst.bg}:${formatRatio(worst.ratio)}`;
}
