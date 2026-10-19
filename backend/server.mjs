import { createServer } from 'node:http';
import worker from './worker.js';

const port = Number(process.env.TAGSPIN_API_PORT || 4389);
const inFlight = new Map();
const cache = new Map();
const recent = new Map();
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://mrmayo1980.github.io';

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const origin = request.headers.origin;
  const cors = origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  const send = (status, body, headers = {}) => response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors, ...headers }).end(body);
  if (url.pathname !== '/api/images') { send(404, JSON.stringify({ error: 'Not found.' })); return; }
  if (origin && origin !== allowedOrigin) { send(403, JSON.stringify({ error: 'Origin not allowed.' })); return; }
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
        const result = await worker.fetch(new Request(url, { method: request.method, headers: request.headers }), { ...process.env, ALLOWED_ORIGIN: allowedOrigin });
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
  const result = await worker.fetch(new Request(url, { method: request.method, headers: request.headers }), { ...process.env, ALLOWED_ORIGIN: allowedOrigin });
  response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
}).listen(port, '127.0.0.1', () => console.log(`Tagspin search API: http://127.0.0.1:${port}/api/images`));
