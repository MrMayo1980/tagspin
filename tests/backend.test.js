import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, parseResults, webImageSearch } from '../backend/search.js';
import worker from '../backend/worker.js';
const input = { tag: 'cats', count: 10, website: '' };
const item = { title: 'A cat', img_src: 'https://any-site.org/cat.jpg', thumbnail_src: 'https://search-images.org/cat.jpg', url: 'https://any-site.org/cat', source: 'Any site', category: 'images' };

test('general search is unrestricted unless a website is explicitly supplied', () => {
  assert.equal(buildQuery(input), 'cats');
  assert.equal(buildQuery({ ...input, website: 'example.com' }), 'cats site:example.com');
});
test('SearXNG image results retain original sites and accept HTTP source pages', () => {
  const images = parseResults({ results: [item, item, { ...item, img_src: 'http://another-site.org/cat.jpg', url: 'http://another-site.org/cat' }, { ...item, img_src: 'https://bad.org/x.jpg', thumbnail_src: 'javascript:alert(1)' }, { ...item, category: 'general', img_src: 'https://non-image.org/cat' }] });
  assert.equal(images.length, 2); assert.equal(images[0].page, item.url); assert.equal(images[1].page, 'http://another-site.org/cat');
  assert.equal(images[0].source, 'Any site');
});
test('search works without API keys and only sends an image-search query', async () => {
  let requested;
  const result = await webImageSearch(input, { searchUrl: 'https://search.example.org', fetcher: async url => { requested = new URL(url); return { ok: true, json: async () => ({ results: [item], unrelated_private_field: 'not-returned' }) }; } });
  assert.equal(requested.hostname, 'search.example.org'); assert.equal(requested.pathname, '/search');
  assert.equal(requested.searchParams.get('categories'), 'images'); assert.equal(requested.searchParams.get('q'), 'cats');
  assert.equal(requested.searchParams.has('api_key'), false); assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.body).includes('not-returned'));
});
test('an unavailable engine does not discard results from the working engines', async () => {
  const result = await webImageSearch(input, { fetcher: async () => ({ ok: true, json: async () => ({ results: [item], unresponsive_engines: [['duckduckgo images', 'access denied']] }) }) });
  assert.equal(result.status, 200); assert.equal(result.body.images.length, 1);
});
test('backend removes off-topic results before returning a pool and preserves rank', async () => {
  const results = [
    { ...item, title: 'Sports car', img_src: 'https://any-site.org/car.jpg' },
    { ...item, title: 'Red panda', img_src: 'https://any-site.org/first.jpg' },
    { ...item, title: 'Giant panda', img_src: 'https://any-site.org/panda.jpg' },
    { ...item, title: 'A red panda on a branch', img_src: 'https://any-site.org/second.jpg' },
  ];
  const result = await webImageSearch({ ...input, tag: 'red panda' }, { fetcher: async () => ({ ok: true, json: async () => ({ results }) }) });
  assert.deepEqual(result.body.images.map(image => image.url), ['https://any-site.org/first.jpg', 'https://any-site.org/second.jpg']);
});
test('backend enforces website restriction even when an engine ignores site syntax', async () => {
  const images = parseResults({ results: [item, { ...item, url: 'https://example.com/cat', img_src: 'https://cdn.example.com/cat.jpg' }] }, { ...input, website: 'example.com' });
  assert.equal(images.length, 1); assert.equal(new URL(images[0].page).hostname, 'example.com');
});
test('off-topic results do not become a fake pool when one engine fails', async () => {
  const result = await webImageSearch({ ...input, tag: 'red panda' }, { fetcher: async () => ({ ok: true, json: async () => ({ results: [item], unresponsive_engines: [['duckduckgo images', 'blocked']] }) }) });
  assert.equal(result.status, 200); assert.deepEqual(result.body.images, []);
});
test('empty searches and unavailable engines are reported separately', async () => {
  const empty = await webImageSearch(input, { fetcher: async () => ({ ok: true, json: async () => ({ results: [] }) }) }); assert.equal(empty.status, 200);
  const unavailable = await webImageSearch(input, { fetcher: async () => ({ ok: true, json: async () => ({ results: [], unresponsive_engines: [['bing images', 'blocked']] }) }) }); assert.equal(unavailable.status, 503);
  const limited = await webImageSearch(input, { fetcher: async () => ({ ok: false, status: 429 }) }); assert.equal(limited.status, 429);
});
test('network failures and malformed provider data return recoverable server errors', async () => {
  const network = await webImageSearch(input, { fetcher: async () => { throw new Error(); } }); assert.equal(network.status, 504);
  const malformed = await webImageSearch(input, { fetcher: async () => ({ ok: true, json: async () => null }) }); assert.equal(malformed.status, 502);
});
test('search handler validates input and limits browser access to the configured origin', async () => {
  const env = { ALLOWED_ORIGIN: 'https://mrmayo1980.github.io' };
  const rejected = await worker.fetch(new Request('https://api.example.com/api/images?tag=cats&count=5', { headers: { Origin: 'https://unrelated.example' } }), env); assert.equal(rejected.status, 403);
  const invalid = await worker.fetch(new Request('https://api.example.com/api/images?tag=cats&count=500'), env); assert.equal(invalid.status, 400);
  const preflight = await worker.fetch(new Request('https://api.example.com/api/images', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN } }), env); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  const method = await worker.fetch(new Request('https://api.example.com/api/images', { method: 'POST' }), env); assert.equal(method.status, 405);
});
