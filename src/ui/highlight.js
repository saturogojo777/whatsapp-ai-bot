/**
 * HueForge — highlight.js
 * A deliberately tiny syntax highlighter for the export preview. It is not a
 * parser; it tokenises the handful of formats we generate. All input is escaped
 * before anything is injected into the DOM.
 */

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

const RULES = {
  css: [
    ['comment', String.raw`\/\*[\s\S]*?\*\/`],
    ['string', String.raw`"[^"\n]*"|'[^'\n]*'`],
    ['keyword', String.raw`@[\w-]+`],
    ['property', String.raw`--[\w-]+|^[ \t]*[a-zA-Z-]+(?=[ \t]*:)`],
    ['number', String.raw`#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|s|deg|vh|vw)?\b`],
  ],
  scss: [
    ['comment', String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
    ['string', String.raw`"[^"\n]*"|'[^'\n]*'`],
    ['keyword', String.raw`@[\w-]+`],
    ['property', String.raw`\$[\w-]+|^[ \t]*[a-zA-Z-]+(?=[ \t]*:)`],
    ['number', String.raw`#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|s|deg)?\b`],
  ],
  json: [
    ['property', String.raw`"(?:[^"\\]|\\.)*"(?=\s*:)`],
    ['string', String.raw`"(?:[^"\\]|\\.)*"`],
    ['number', String.raw`\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b`],
    ['keyword', String.raw`\b(?:true|false|null)\b`],
  ],
  markup: [
    ['comment', String.raw`<!--[\s\S]*?-->`],
    ['keyword', String.raw`<\/?[a-zA-Z][\w:-]*|\/?>`],
    ['property', String.raw`[a-zA-Z-:]+(?==)`],
    ['string', String.raw`"[^"]*"`],
    ['number', String.raw`#[0-9a-fA-F]{3,8}\b`],
  ],
  plain: [],
};

const compiled = new Map();

function getPattern(language) {
  if (compiled.has(language)) return compiled.get(language);
  const rules = RULES[language] ?? [];
  if (!rules.length) {
    compiled.set(language, null);
    return null;
  }

  const groups = rules.map(([type, source], index) => `(?<r${index}>${source})`);
  const pattern = new RegExp(groups.join('|'), 'gm');
  const mapping = rules.map(([type]) => type);
  const entry = { pattern, mapping };
  compiled.set(language, entry);
  return entry;
}

/**
 * @param {string} code Raw source.
 * @param {'css'|'scss'|'json'|'markup'|'plain'|'binary'} language
 * @returns {string} escaped HTML with <span class="tok-*"> wrappers.
 */
export function highlight(code, language = 'plain') {
  const source = String(code ?? '');
  const entry = getPattern(language);
  if (!entry) return escapeHtml(source);

  let html = '';
  let cursor = 0;
  entry.pattern.lastIndex = 0;

  let match = entry.pattern.exec(source);
  while (match) {
    if (match.index > cursor) html += escapeHtml(source.slice(cursor, match.index));

    const groups = match.groups ?? {};
    const key = Object.keys(groups).find((name) => groups[name] !== undefined);
    const index = key ? Number(key.slice(1)) : -1;
    const type = entry.mapping[index] ?? 'plain';
    const token = escapeHtml(match[0]);

    html += type === 'plain' ? token : `<span class="tok-${type}">${token}</span>`;
    cursor = match.index + match[0].length;
    match = entry.pattern.exec(source);
  }

  html += escapeHtml(source.slice(cursor));
  return html;
}
