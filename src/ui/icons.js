/**
 * HueForge — icons.js
 * Inline 24×24 stroke icons. Inline SVG keeps the page dependency-free and lets
 * icons inherit `currentColor` from whatever swatch or button they sit in.
 */

const paths = {
  copy: `<rect x="9" y="9" width="11" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 6.5V5.2A2.2 2.2 0 0 0 12.8 3H5.2A2.2 2.2 0 0 0 3 5.2v7.6A2.2 2.2 0 0 0 5.2 15h1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  lock: `<rect x="5" y="10" width="14" height="10" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/>`,
  unlock: `<rect x="5" y="10" width="14" height="10" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 6.7-1.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/>`,
  arrowLeft: `<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrowRight: `<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  save: `<path d="M6 4h9.2L18 6.8V20H6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 4v5.5h6V4M9 20v-5.5h6V20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  palette: `<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.4 0 2-1 2-1.9 0-1.5-1.5-1.9-1.5-3 0-.9.7-1.6 1.7-1.6h1.6A5 5 0 0 0 20.8 9c0-3.3-3.9-5.8-8.8-5.8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.2" cy="10" r="1.1" fill="currentColor"/><circle cx="11.6" cy="7.4" r="1.1" fill="currentColor"/><circle cx="15.4" cy="8.4" r="1.1" fill="currentColor"/>`,
  trash: `<path d="M5 7h14M9.5 7V4.8h5V7M7 7l.8 12.2h8.4L17 7M10.4 10.5v5.5M13.6 10.5v5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  download: `<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
};

/** Return an SVG string for the given icon name (empty string if unknown). */
export function icon(name, { size = 16, className = '' } = {}) {
  const body = paths[name];
  if (!body) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"${className ? ` class="${className}"` : ''}>${body}</svg>`;
}
