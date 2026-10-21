#!/usr/bin/env node
/**
 * Zero-dependency static dev server.
 *
 *   npm run dev                  → http://localhost:4173
 *   PORT=8080 npm run dev        → http://localhost:8080
 *   ROOT=dist npm run dev        → serve another folder (e.g. a Pages build)
 *
 * GitHub Pages does not need this; it only exists so contributors can preview
 * the site locally without installing anything.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.ROOT || fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ase': 'application/octet-stream',
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const decoded = decodeURIComponent(url.pathname);
    const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safePath);

    // Never serve outside the project root.
    if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
      send(response, 403, 'Forbidden');
      return;
    }

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }

    if (!info?.isFile()) {
      send(response, 404, `<!doctype html><title>Not found</title><h1>404 — ${decoded} not found</h1>`);
      return;
    }

    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath)
      .on('error', () => response.destroy())
      .pipe(response);
  } catch (error) {
    send(response, 500, `Server error: ${error.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  HueForge running at http://localhost:${PORT}`);
  console.log(`  Bind address ${HOST}:${PORT} — press Ctrl+C to stop.\n`);
});
