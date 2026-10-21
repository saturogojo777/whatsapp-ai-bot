/**
 * HueForge — color.js
 * -----------------------------------------------------------------------------
 * Dependency-free color math shared by the studio, the exporters and the tests.
 *
 * Conventions:
 *   • `hex` strings are always `#rrggbb` (lowercase input is fine).
 *   • RGB channels are 0–255 unless a function name says `Unit` (0–1).
 *   • OKLCH is the working space for generation because it is perceptually
 *     uniform: equal lightness steps look equal, and hue rotations stay vivid.
 *
 * Everything here is pure and runs in both the browser and Node.
 */

/** Clamp a number between min and max. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Clamp an sRGB unit channel to 0–1. */
export const clamp01 = (value) => clamp(value, 0, 1);

/**
 * Normalise any hex-ish string ("abc", "#ABC", "aabbcc", " #AABBCC ") to
 * `#aabbcc`. Returns null when the input cannot be parsed.
 */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(value)) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return `#${value.toLowerCase()}`;
}

/** Parse `#rrggbb` into `{ r, g, b }` with 0–255 channels. */
export function hexToRgb(hex) {
  const safe = normalizeHex(hex) ?? '#000000';
  const int = Number.parseInt(safe.slice(1), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

/** Serialise 0–255 RGB channels into `#rrggbb`. Channels are rounded/clamped. */
export function rgbToHex({ r, g, b }) {
  const toHex = (channel) =>
    Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** sRGB gamma → linear light for a single 0–1 channel. */
export function srgbToLinear(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Linear light → sRGB gamma for a single 0–1 channel. */
export function linearToSrgb(channel) {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Linear RGB (0–1) → OKLab, Björn Ottosson's transform. */
export function linearRgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

/** OKLab → linear RGB (0–1, may be out of gamut). */
export function oklabToLinearRgb({ L, a, b }) {
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.291485548 * b;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** `#rrggbb` → OKLCH `{ l, c, h }` (l 0–1, c 0–~0.4, h degrees 0–360). */
export function hexToOklch(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lab = linearRgbToOklab(
    srgbToLinear(r / 255),
    srgbToLinear(g / 255),
    srgbToLinear(b / 255),
  );
  const c = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.L, c, h };
}

/** OKLCH → linear sRGB and whether it fits inside the display gamut. */
function oklchToLinearRgb({ l, c, h }) {
  const radians = (h * Math.PI) / 180;
  const linear = oklabToLinearRgb({
    L: l,
    a: Math.cos(radians) * c,
    b: Math.sin(radians) * c,
  });
  const epsilon = 1e-5;
  const inGamut = [linear.r, linear.g, linear.b].every(
    (channel) => channel >= -epsilon && channel <= 1 + epsilon,
  );
  return { linear, inGamut };
}

/**
 * OKLCH → `#rrggbb`, gamut-mapped by reducing chroma until the colour fits
 * sRGB. This keeps hue and lightness intact — the intuitive result designers
 * expect when they ask for a vivid colour.
 */
export function oklchToHex({ l, c, h }, { gamutMap = true } = {}) {
  const lightness = clamp01(l);
  const chroma = Math.max(0, c);
  const hue = ((h % 360) + 360) % 360;

  let { linear, inGamut } = oklchToLinearRgb({
    l: lightness,
    c: chroma,
    h: hue,
  });

  if (!inGamut && gamutMap) {
    // Binary search the largest chroma that still fits sRGB.
    let low = 0;
    let high = chroma;
    for (let i = 0; i < 28; i += 1) {
      const mid = (low + high) / 2;
      const candidate = oklchToLinearRgb({ l: lightness, c: mid, h: hue });
      if (candidate.inGamut) low = mid;
      else high = mid;
    }
    linear = oklchToLinearRgb({ l: lightness, c: low, h: hue }).linear;
  }

  const encode = (channel) =>
    Math.round(clamp01(linearToSrgb(clamp01(channel))) * 255);

  return rgbToHex({
    r: encode(linear.r),
    g: encode(linear.g),
    b: encode(linear.b),
  });
}

/** `#rrggbb` → HSL `{ h, s, l }` with percentages 0–100 (for display only). */
export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case red:
        h = ((green - blue) / delta) % 6;
        break;
      case green:
        h = (blue - red) / delta + 2;
        break;
      default:
        h = (red - green) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
export function relativeLuminance(input) {
  const { r, g, b } = typeof input === 'string' ? hexToRgb(input) : input;
  const [red, green, blue] = [r, g, b].map((channel) =>
    srgbToLinear(channel / 255),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio between two colours (1–21). Order does not matter. */
export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Round a contrast ratio for display (e.g. 7.36 → 7.4). */
export const formatRatio = (ratio) =>
  (Math.round(ratio * 10) / 10).toFixed(1);

/**
 * WCAG 2.1 grades for a ratio.
 * `large` is 3:1 for text ≥ 18.66px bold / ≥ 24px regular.
 */
export function contrastGrade(ratio, largeText = false) {
  return {
    aa: ratio >= (largeText ? 3 : 4.5),
    aaa: ratio >= (largeText ? 4.5 : 7),
    large: ratio >= 3,
  };
}

/** Highest-contrast text colour (white or near-black) for a background. */
export function readableTextColor(background) {
  return contrastRatio(background, '#ffffff') >=
    contrastRatio(background, '#0b0d12')
    ? '#ffffff'
    : '#0b0d12';
}

/** OKLab ΔE — perceptual distance, roughly 0–1 for very different colours. */
export function deltaE(hexA, hexB) {
  const a = hexToOklab(hexA);
  const b = hexToOklab(hexB);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

/** `#rrggbb` → OKLab (L, a, b). */
export function hexToOklab(hex) {
  const { r, g, b } = hexToRgb(hex);
  return linearRgbToOklab(
    srgbToLinear(r / 255),
    srgbToLinear(g / 255),
    srgbToLinear(b / 255),
  );
}

/**
 * Colour-vision-deficiency simulation using the Viénot–Brettel–Mollon
 * matrices, applied in linear light.
 */
const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
  // Total colour blindness: keep luminance only (Rec. 709 weights).
  achromatopsia: [
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
  ],
};

/** Simulate a colour-vision deficiency. `type` is a key of CVD_MATRICES. */
export function simulateCvd(hex, type) {
  if (!CVD_MATRICES[type]) return normalizeHex(hex) ?? hex;
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map((channel) => srgbToLinear(channel / 255));
  const matrix = CVD_MATRICES[type];
  const transformed = matrix.map((row) =>
    row.reduce((sum, factor, index) => sum + factor * linear[index], 0),
  );
  const encoded = transformed.map((channel) =>
    Math.round(clamp01(linearToSrgb(clamp01(channel))) * 255),
  );
  return rgbToHex({ r: encoded[0], g: encoded[1], b: encoded[2] });
}

/** OKLab → `#rrggbb` (gamut-mapped through OKLCH). */
export function oklabToHex(lab, { gamutMap = true } = {}) {
  const l = clamp(lab.L, 0, 1);
  const c = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return oklchToHex({ l, c, h }, { gamutMap });
}

/** Linear interpolation between two hex colours in OKLab (avoids muddy midpoints). */
export function mix(hexA, hexB, t = 0.5) {
  const a = hexToOklab(hexA);
  const b = hexToOklab(hexB);
  return oklabToHex({
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/** Human-readable labels for CVD modes. */
export const CVD_LABELS = {
  none: 'Typical vision',
  protanopia: 'Protanopia',
  deuteranopia: 'Deuteranopia',
  tritanopia: 'Tritanopia',
  achromatopsia: 'Achromatopsia',
};

/** Hue families used for poetic, human-readable colour names. */
const HUE_FAMILIES = [
  [14, 'Rose'],
  [34, 'Ember'],
  [54, 'Amber'],
  [80, 'Chartreuse'],
  [138, 'Fern'],
  [176, 'Jade'],
  [198, 'Cyan'],
  [232, 'Azure'],
  [262, 'Indigo'],
  [300, 'Violet'],
  [330, 'Orchid'],
  [348, 'Magenta'],
  [361, 'Rose'],
];

/**
 * A friendly, human-readable name: "Violet Glow", "Deep Jade", "Graphite".
 * Near-exact matches to CSS named colours win ("Tomato"), otherwise the name
 * is derived from hue family + lightness. Names are cosmetic — never used as a
 * unique identifier.
 */
export function colorName(hex) {
  const safe = normalizeHex(hex) ?? '#000000';
  let best = { name: '', distance: Number.POSITIVE_INFINITY };
  for (const [name, value] of Object.entries(CSS_COLOR_NAMES)) {
    const distance = deltaE(safe, value);
    if (distance < best.distance) best = { name, distance };
  }
  if (best.distance < 0.012) return titleCase(best.name);

  const { l, c, h } = hexToOklch(safe);

  if (c < 0.024) {
    if (l > 0.965) return 'Paper';
    if (l > 0.86) return 'Cloud';
    if (l > 0.62) return 'Silver';
    if (l > 0.42) return 'Slate';
    if (l > 0.24) return 'Graphite';
    return 'Ink';
  }

  const family = HUE_FAMILIES.find(([limit]) => h < limit)?.[1] ?? 'Violet';
  let modifier = '';
  if (l > 0.92) modifier = 'Pale';
  else if (l > 0.8) modifier = 'Soft';
  else if (l > 0.67) modifier = 'Light';
  else if (l > 0.52) modifier = '';
  else if (l > 0.4) modifier = 'Deep';
  else if (l > 0.26) modifier = 'Dark';
  else modifier = 'Shadow';

  return modifier ? `${modifier} ${family}` : family;
}

const titleCase = (value) => value[0].toUpperCase() + value.slice(1);

/** Display helpers. */
export const formatRgb = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b})`;
};

export const formatHsl = (hex) => {
  const { h, s, l } = hexToHsl(hex);
  return `hsl(${h} ${s}% ${l}%)`;
};

export const formatOklch = (hex) => {
  const { l, c, h } = hexToOklch(hex);
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;
};

/** A stable, accessible text colour plus its contrast ratio. */
export function bestText(background) {
  const light = contrastRatio(background, '#ffffff');
  const dark = contrastRatio(background, '#0b0d12');
  return light >= dark
    ? { color: '#ffffff', ratio: light }
    : { color: '#0b0d12', ratio: dark };
}

/**
 * The 148 CSS named colours. Kept inline so the tool stays dependency-free and
 * works from `file://` as well as GitHub Pages.
 */
export const CSS_COLOR_NAMES = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};
