# Contributing to HueForge

Thanks for being here. HueForge exists because colour tooling should be open, local and honest about contrast — and that only works if people like you poke at it.

This document covers everything from a one-character typo fix to a new export format. If something here is unclear, that is a bug in this file: please open an issue.

---

## TL;DR

```bash
git clone https://github.com/saturogojo777/whatsapp-ai-bot.git
cd whatsapp-ai-bot
npm install          # dev-only tooling (jsdom, sharp, postcss)
npm run dev          # http://localhost:4173
npm test             # 44 tests, ~2s
```

Open a pull request against `main`. Describe the *why*, not only the *what*.

---

## Ways to contribute

| You are… | Try this |
| --- | --- |
| A designer | Report a palette that reads badly, propose ramp curves, critique typography and spacing |
| A front-end dev | Add an exporter, improve a11y, shrink the payload, write a browser test |
| A colour nerd | Audit the OKLab maths, add APCA, improve gamut mapping, extend CVD coverage |
| A writer | Tighten the copy on the landing page, improve these docs |
| Short on time | ⭐ Star the repo, share a palette link, open an issue with a screenshot |

No contribution is too small. "I tried it on Safari and the sheet scrolls oddly" is a genuinely useful report.

---

## Project layout

```text
src/core/      pure colour science + exporters — no DOM, fully unit-tested
src/ui/        rendering modules (swatches, matrix, preview, exports, toasts)
src/three/     the Three.js hero scene
src/playground/ optional local assistant demo (not shipped to Pages)
styles/        base.css (tokens/components) → app.css (layout)
tests/         node:test suites
scripts/       dev server, asset generator
playground/    zero-dependency demo API
```

**The rule that keeps this codebase sane:** if it can be a pure function, it belongs in `src/core/` and it gets a test. DOM modules should *render state*, not own it. State lives in `src/main.js`.

---

## Development workflow

1. **Fork** the repository and create a branch: `feat/ramp-10-step`, `fix/contrast-rounding`, `docs/improve-faq`.
2. **Make the change** in small, focused commits.
3. **Add or update tests** if you touched `src/core/`.
4. **Run the suite:** `npm test`.
5. **Open a pull request.** Fill in the template; link the issue it closes.

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(export): add .aco exporter
fix(color): round gamut-mapped channels instead of truncating
docs(readme): clarify Pages deployment
chore(deps): bump sharp to 0.34.5
a11y(swatches): announce contrast grade in the card label
```

The type is a hint for reviewers, not a bureaucracy. `a11y` is welcome here even though it is not in the original spec.

---

## Code style

There is no linter to fight. Match the file you are editing:

- **Vanilla ES modules**, no build step, no framework. Do not add a runtime dependency without discussion — "zero dependencies" is a feature.
- 2-space indentation, single quotes, semicolons, trailing commas.
- Prefer `const`; avoid `let` unless reassigned.
- Name things for what they mean (`described[2]`, not `c3`).
- Comment the *why*. The code already says what.
- CSS: tokens live in `:root` in `base.css`. Never hard-code a colour that should be a token, except inside generated palette styles.
- Keep functions under ~50 lines where reasonable; extract helpers into `src/core/` when they are pure.

### Adding a new export format

1. Write a pure builder in `src/core/exporters.js` that returns a string or `Uint8Array`.
2. Register it in `EXPORT_FORMATS` with `{ id, label, extension, language, mime, build }`. Mark binary formats with `binary: true`.
3. Add a hint string in `src/ui/export-dialog.js` (`HINTS`).
4. Add a test to `tests/exporters.test.js` asserting the structure of the output.
5. Mention it in the README's export table.

### Adding a harmony

1. Add an entry to `HARMONIES` in `src/core/palette.js` with `label`, `hint`, and `offsets`.
2. If it should be selectable automatically, add it to `AUTO_POOL`.
3. Add it to the iteration test in `tests/palette.test.js` (the test loops over every mode, so it should pass by construction).

---

## Testing

```bash
npm test                       # everything
node --test tests/color.test.js   # one file
```

Suites:

| File | Covers |
| --- | --- |
| `tests/color.test.js` | OKLab/OKLCH round-trips, WCAG, CVD, naming |
| `tests/palette.test.js` | determinism, ramps, locks, share links |
| `tests/exporters.test.js` | all eight formats, including ASE binary layout |
| `tests/import.test.js` | paste parsing, ramp completion |
| `tests/dom.test.js` | boots `index.html` in jsdom, exercises the UI |
| `tests/playground.test.js` | demo intent classification and reply engine |

Guidelines:

- Assert **behaviour**, not implementation details.
- Contrast and colour maths need numeric assertions, not snapshots.
- `tests/dom.test.js` stubs WebGL with `null` on purpose — it proves the fallback works. Do not "fix" that.
- New UI behaviour belongs in `dom.test.js`; new maths belongs in a core suite.

---

## Accessibility definition of done

Every PR is checked against this list:

- [ ] Works with keyboard only (Tab, Shift+Tab, Enter, Space, arrows, Escape).
- [ ] Focus is visible and never trapped outside a dialog.
- [ ] New controls have an accessible name (`aria-label`, `<label>`, or visible text).
- [ ] State changes are communicated (`aria-pressed`, `aria-checked`, `aria-live`).
- [ ] Colour is never the only carrier of meaning.
- [ ] Text meets 4.5:1 against its background (3:1 for large text) — this project has no excuse.
- [ ] `prefers-reduced-motion` is respected for new animation.

---

## Review process

- One maintainer approval is enough for docs, typos and small fixes.
- Colour-science changes need a test plus a short explanation in the PR body.
- We aim to respond within a few days. A polite ping after a week is welcome.
- Disagreements are resolved by evidence — a failing test, a screenshot, a spec link. Not by seniority.

---

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include:

1. What you did, what you expected, what happened.
2. Browser and OS.
3. A **share link** if the issue involves a specific palette — the URL hash reproduces it exactly.

## Requesting features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). The most persuasive requests start with the workflow that is currently painful, not the solution.

## Security

Please do **not** open a public issue for security problems. See [SECURITY.md](SECURITY.md).

---

## Licence of contributions

By submitting a pull request you agree that your contribution is licensed under the [MIT licence](LICENSE), and that you have the right to submit it.

---

<div align="center">
<sub>Be kind, be specific, and remember: every palette you ship is somebody's first impression of their screen.</sub>
</div>
