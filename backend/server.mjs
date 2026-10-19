import { createServer } from 'node:http';
import worker from './worker.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/core.js', ['core.js', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']], ['/assets/mark.svg', ['assets/mark.svg', 'image/svg+xml']]]);

const port = Number(process.env.TAGSPIN_API_PORT || 4389);
const inFlight = new Map();
const cache = new Map();
const recent = new Map();
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://mrmayo1980.github.io';

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const origin = request.headers.origin;
  let trialOrigin;
  try { trialOrigin = new URL(JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8')).searchEndpoint).origin; } catch { /* No trial address has been assigned yet. */ }
  const acceptedOrigin = origin === allowedOrigin || (trialOrigin && origin === trialOrigin);
  const cors = acceptedOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  const send = (status, body, headers = {}) => response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors, ...headers }).end(body);
  if (request.method === 'GET' && url.pathname === '/health') { send(200, JSON.stringify({ ready: true })); return; }
  if (request.method === 'GET' && url.pathname === '/config.json') { send(200, JSON.stringify({ searchEndpoint: './api/images' })); return; }
  if (request.method === 'GET' && assets.has(url.pathname)) {
    const [file, type] = assets.get(url.pathname);
    try { const body = await readFile(root + file); response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(body); }
    catch { send(404, JSON.stringify({ error: 'Not found.' })); }
    return;
  }
  if (url.pathname !== '/api/images') { send(404, JSON.stringify({ error: 'Not found.' })); return; }
  if (origin && !acceptedOrigin) { send(403, JSON.stringify({ error: 'Origin not allowed.' })); return; }
  const forwardedHeaders = new Headers(request.headers); forwardedHeaders.delete('origin');
  if (request.method === 'GET') {
    const peer = request.headers['cf-connecting-ip'] || request.socket.remoteAddress;
    const now = Date.now(), active = (recent.get(peer) || []).filter(time => now - time < 60000);
    if (active.length >= 12) { send(429, JSON.stringify({ error: 'Please wait a minute before searching again.' })); return; }
    recent.set(peer, [...active, now]);
    if (recent.size > 1000) for (const [key, times] of recent) if (now - times.at(-1) > 60000) recent.delete(key);
    const key = url.search;
    const saved = cache.get(key);
    if (saved && saved.expires > now) { send(saved.status, saved.body); return; }
    if (inFlight.has(key)) { const result = await inFlight.get(key); send(result.status, result.body); return; }
    const task = (async () => {
      try {
        const result = await worker.fetch(new Request(url, { method: request.method, headers: forwardedHeaders }), { ...process.env, ALLOWED_ORIGIN: allowedOrigin });
        return { status: result.status, body: await result.text() };
      } catch { return { status: 502, body: JSON.stringify({ error: 'Search is temporarily unavailable.' }) }; }
    })();
    inFlight.set(key, task);
    try {
      const result = await task;
      if (result.status === 200) { if (cache.size >= 100) cache.delete(cache.keys().next().value); cache.set(key, { ...result, expires: Date.now() + 5 * 60000 }); }
      send(result.status, result.body);
    } finally { inFlight.delete(key); }
    return;
  }
  const result = await worker.fetch(new Request(url, { method: request.method, headers: forwardedHeaders }), { ...process.env, ALLOWED_ORIGIN: allowedOrigin });
  response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
}).listen(port, '127.0.0.1', () => console.log(`Tagspin search API: http://127.0.0.1:${port}/api/images`));
