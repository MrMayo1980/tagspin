import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import worker from './backend/worker.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const port = 4387;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`), path = decodeURIComponent(url.pathname);
    if (path === '/config.json') { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ searchEndpoint: './api/images' })); return; }
    if (path === '/api/images') {
      const result = await worker.fetch(new Request(url, { method: request.method, headers: request.headers }), process.env);
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
    }
    const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`);
    if (!file.startsWith(root) || path.split('/').some(part => part.startsWith('.')) || path.startsWith('/backend/') || path === '/server.mjs') { response.writeHead(403).end('Forbidden'); return; }
    response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' }).end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Tagspin: http://127.0.0.1:${port}`));
