# Changelog

All notable changes to HueForge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- APCA contrast score alongside WCAG 2.1.
- Ten-step (`50 → 950`) ramp mode.
- `.aco` exporter for Adobe Colour.
- Optional library sync.

## [1.0.0] — 2026-10-21

The first stable release: a complete, zero-dependency palette studio.

### Added
- **OKLCH palette engine** — five calibrated steps (100 → 900) with gamut-mapped sRGB output, seven harmonies plus seeded "auto", locked-swatch regeneration, undo/redo and deterministic seeds.
- **WCAG 2.1 contrast matrix** — every foreground/background pair graded, with a large-text threshold toggle.
- **Colour-vision simulation** — protanopia, deuteranopia, tritanopia and achromatopsia.
- **Live previews** — marketing card and dashboard mock built exclusively from the five swatches.
- **Three.js hero** — simplex-noise displaced orb with palette-reactive lighting, environment map, rings and particles; CSS fallback and reduced-motion support.
- **Eight export formats** — CSS, Tailwind v4, SCSS, JSON, W3C design tokens, SVG poster, Adobe ASE and PNG poster.
- **Import** — paste hex/rgb lists, image colour extraction (k-means in OKLab), screen eyedropper.
- **Sharing and storage** — URL-hash share links, local palette library, defensive `localStorage` wrapper.
- **Accessibility** — keyboard-first studio, native dialogs, ARIA patterns for tabs and radiogroups, skip link, focus management, reduced-motion handling.
- **Optional playground** — zero-dependency local server with a transparent, palette-aware template reply engine and three JSON endpoints.
- **Tooling** — 44 tests across colour maths, palettes, exporters, imports, DOM boot and the demo engine; zero-dependency dev server; asset generator for the banner, social card and README art; GitHub Pages workflow.

### Security
- Strict hex validation on every external input, including share links.
- 16 KB request cap and per-IP rate limiting on the playground API.
- HTML escaping in the export preview and all rendered palette metadata.

[Unreleased]: https://github.com/saturogojo777/whatsapp-ai-bot/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/saturogojo777/whatsapp-ai-bot/releases/tag/v1.0.0
