# Security policy

## Supported versions

HueForge ships as static files. The latest commit on `main` is the supported version.

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private reporting flow: **Security → Report a vulnerability** on this
repository. If that is unavailable, contact a maintainer directly.

Please include:

- what you can do that you should not be able to do;
- the browser/OS, and the commit or share URL involved;
- reproduction steps, and a proof of concept if you have one.

We aim to acknowledge reports within 72 hours and to ship a fix or mitigation within
14 days for issues that affect users.

## Threat model

HueForge is a client-side tool with one optional local server. The relevant surfaces:

| Surface | Considered risk | Mitigation |
| --- | --- | --- |
| Palette share links (`#p=…`) | Malformed input crashing the app; injection in rendered hex text | Strict hex validation in `decodeShare`, all rendered values normalised via `normalizeHex` |
| Pasted palette text | XSS via `innerHTML` | Inputs are parsed with regexes into hex strings; only normalised hex ever reaches templates |
| Image import | Huge files / decompression bombs | Images are scaled to a 96 px canvas before clustering; `createImageBitmap` failures fall back to `<img>` |
| `localStorage` | Quota exhaustion, disabled storage | Every read/write is guarded; falls back to memory |
| Export dialog | Injecting markup into the preview | All previews are HTML-escaped before the token highlighter runs |
| Clipboard | Silent failure in insecure contexts | Falls back to `execCommand('copy')` and reports failure honestly |
| Playground API (`npm run playground`) | Oversized bodies, request floods | 16 KB body cap, per-IP rate limit, JSON-only, strict palette validation, no shell access |
| Dependencies | Supply chain | Zero runtime dependencies. Three.js is vendored and pinned. Dev dependencies are limited to `jsdom`, `sharp` and `postcss` for tests and asset generation |

### Out of scope

- Attacks that require the user's own machine to be compromised.
- Denial of service against a self-hosted playground instance by its own operator.
- Palette aesthetics. (Genuine issue, wrong tracker.)

## Recognition

If you report a valid security issue, we will credit you in the release notes unless
you ask us not to. Thank you for keeping the tool safe.
