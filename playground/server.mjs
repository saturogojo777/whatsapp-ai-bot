#!/usr/bin/env node
/**
 * HueForge Playground server — zero dependencies.
 *
 *   npm run playground        → http://localhost:4180
 *
 * Serves the static site, injects the playground widget into index.html on the
 * fly, and exposes three tiny JSON endpoints backed by the deterministic reply
 * engine in src/playground/demo-core.js.
 *
 * Deliberately boring: no database, no API keys, no outbound requests. It exists
 * so contributors can exercise the assistant flow locally and so the project
 * demonstrates a real client/server split without shipping secrets.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { completeReply, engineSummary } from '../src/playground/demo-core.js';
import { HARMONIES, generatePalette, randomBase } from '../src/core/palette.js';
import { normalizeHex } from '../src/core/color.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4180;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 16 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 60 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const json = (response, status, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
};

const clientKey = (request) =>
  request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  request.socket.remoteAddress ||
  'unknown';

const buckets = new Map();

function isRateLimited(request) {
  const key = clientKey(request);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, reset: now + RATE_LIMIT.windowMs };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + RATE_LIMIT.windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count > RATE_LIMIT.max;
}

/** Read a JSON body with a hard size cap. */
function readJson(request) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

/** Validate a client-provided palette, falling back to a generated one. */
function sanitisePalette(input) {
  const fallback = generatePalette({ base: '#7c5cff', mode: 'analogous', seed: 24 }).colors;
  if (!Array.isArray(input) || input.length !== 5) return fallback;
  const colors = input.map((hex) => normalizeHex(hex));
  return colors.every(Boolean) ? colors : fallback;
}

/* -------------------------------------------------------------------------- */
/* Static files (with playground injection)                                   */
/* -------------------------------------------------------------------------- */

const playgroundScript = '<script type="module" src="/src/playground/playground.js"></script>';

let cachedHtml = null;

async function serveStatic(request, response, pathname) {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, safe);

  if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    filePath = join(filePath, 'index.html');
    info = await stat(filePath).catch(() => null);
  }

  if (!info?.isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<h1>404</h1><p>Not found. <a href="/">Back to the studio</a></p>');
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const type = MIME[extension] ?? 'application/octet-stream';

  if (extension === '.html' && filePath === join(ROOT, 'index.html')) {
    if (!cachedHtml) {
      const raw = await readFile(filePath, 'utf8');
      cachedHtml = raw.replace('</body>', `  ${playgroundScript}\n  </body>`);
    }
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    response.end(cachedHtml);
    return;
  }

  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': extension === '.woff2' ? 'public, max-age=604800' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).on('error', () => response.destroy()).pipe(response);
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  try {
    /* Health ---------------------------------------------------------- */
    if (url.pathname === '/api/health') {
      json(response, 200, {
        ok: true,
        service: 'hueforge-playground',
        engine: engineSummary(),
        uptimeSeconds: Math.round(process.uptime()),
      });
      return;
    }

    /* Reply ----------------------------------------------------------- */
    if (url.pathname === '/api/complete' && request.method === 'POST') {
      if (isRateLimited(request)) {
        json(response, 429, { error: 'Too many requests — slow down a little.' });
        return;
      }
      const body = await readJson(request);
      const prompt = String(body.prompt ?? '').slice(0, 600).trim();
      if (prompt.length < 2) {
        json(response, 400, { error: 'Write a message of at least two characters.' });
        return;
      }
      const reply = completeReply({
        prompt,
        palette: sanitisePalette(body.palette),
        tone: body.tone,
      });
      json(response, 200, reply);
      return;
    }

    /* Harmony suggestion --------------------------------------------- */
    if (url.pathname === '/api/harmony' && request.method === 'POST') {
      if (isRateLimited(request)) {
        json(response, 429, { error: 'Too many requests — slow down a little.' });
        return;
      }
      const body = await readJson(request);
      const base = normalizeHex(body.base) ?? randomBase(Date.now());
      const reasons = {
        analogous: 'Neighbouring hues keep a product UI calm and cohesive.',
        complementary: 'Opposite hues give a single call-to-action maximum pop.',
        split: 'Split complementary is bold but keeps two anchors near your brand hue.',
        triadic: 'Triadic spreads three even accents — good for dashboards with categories.',
        tetradic: 'Tetradic is rich and editorial; pair it with lots of neutral space.',
        monochrome: 'A single hue across five steps is the safest choice for dense product UI.',
        prism: 'Prism scatters hues from a seeded anchor — playful, but check the contrast matrix.',
      };
      const candidates = Object.keys(HARMONIES).filter((mode) => mode !== 'auto');
      const seed = Number(body.seed) || Date.now() % 100000;
      const mode = candidates[seed % candidates.length];
      const palette = generatePalette({ base, mode, seed });
      json(response, 200, {
        base,
        mode,
        reason: reasons[mode] ?? '',
        colors: palette.colors,
        disclaimer: 'Heuristic suggestion — always confirm with the contrast matrix.',
      });
      return;
    }

    /* Static ---------------------------------------------------------- */
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { error: 'Method not allowed' });
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    json(response, 500, { error: error?.message ?? 'Unexpected server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  HueForge playground → http://localhost:${PORT}`);
  console.log('  Template engine, no API key, no outbound requests.');
  console.log(`  Serving on ${HOST}:${PORT} — press Ctrl+C to stop.\n`);
});
