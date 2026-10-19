import { webImageSearch } from './search.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://mrmayo1980.github.io';
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' };
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (origin && origin !== allowedOrigin && !(local && origin === url.origin)) return new Response(JSON.stringify({ error: 'Origin not allowed.' }), { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers });
    if (url.pathname !== '/api/images') return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404, headers });
    try {
      const result = await webImageSearch({ tag: url.searchParams.get('tag'), count: url.searchParams.get('count'), website: url.searchParams.get('website') || '' }, { apiKey: env.SERPAPI_API_KEY });
      return new Response(JSON.stringify(result.body), { status: result.status, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Enter a search and choose between 2 and 50 images.' }), { status: 400, headers });
    }
  },
};
