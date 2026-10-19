import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, parseResults, webImageSearch } from '../backend/search.js';
import worker from '../backend/worker.js';
const input = { tag: 'cats', count: 10, website: '' };
const item = { title: 'A cat', original: 'https://any-site.org/cat.jpg', thumbnail: 'https://search-images.org/cat.jpg', link: 'https://any-site.org/cat', source: 'Any site' };

test('general search is unrestricted unless a website is explicitly supplied', () => {
  assert.equal(buildQuery(input), 'cats');
  assert.equal(buildQuery({ ...input, website: 'example.com' }), 'cats site:example.com');
});
test('Google Images results retain original sites and accept HTTP source pages', () => {
  const images = parseResults({ images_results: [item, item, { ...item, original: 'http://another-site.org/cat.jpg', link: 'http://another-site.org/cat' }, { ...item, original: 'https://bad.org/x.jpg', thumbnail: 'javascript:alert(1)' }] });
  assert.equal(images.length, 2); assert.equal(images[0].page, item.link); assert.equal(images[1].page, 'http://another-site.org/cat');
  assert.equal(images[0].source, 'Any site');
});
test('provider key stays on the server and does not appear in returned data', async () => {
  let requested;
  const result = await webImageSearch(input, { apiKey: 'test-secret-key', fetcher: async url => { requested = new URL(url); return { ok: true, json: async () => ({ images_results: [item], search_parameters: { api_key: 'test-secret-key' } }) }; } });
  assert.equal(requested.hostname, 'serpapi.com'); assert.equal(requested.searchParams.get('engine'), 'google_images'); assert.equal(requested.searchParams.get('q'), 'cats');
  assert.equal(requested.searchParams.get('api_key'), 'test-secret-key'); assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.body).includes('test-secret-key'));
});
test('missing credentials do not trigger a provider request', async () => {
  let requested = false;
  const result = await webImageSearch(input, { fetcher: async () => { requested = true; } });
  assert.equal(result.status, 503); assert.equal(requested, false);
});
test('provider errors, including reflected secrets, are never exposed', async () => {
  const result = await webImageSearch(input, { apiKey: 'test-secret-key', fetcher: async () => ({ ok: true, json: async () => ({ error: 'Invalid test-secret-key' }) }) });
  assert.equal(result.status, 502); assert.ok(!JSON.stringify(result).includes('test-secret-key'));
  const limited = await webImageSearch(input, { apiKey: 'test', fetcher: async () => ({ ok: false, status: 429 }) }); assert.equal(limited.status, 429);
});
test('network failures and malformed provider data return server errors', async () => {
  const network = await webImageSearch(input, { apiKey: 'test', fetcher: async () => { throw new Error(); } }); assert.equal(network.status, 504);
  const malformed = await webImageSearch(input, { apiKey: 'test', fetcher: async () => ({ ok: true, json: async () => { throw new Error(); } }) }); assert.equal(malformed.status, 502);
});
test('worker validates input and limits browser access to the configured origin', async () => {
  const env = { ALLOWED_ORIGIN: 'https://mrmayo1980.github.io' };
  const rejected = await worker.fetch(new Request('https://api.example.com/api/images?tag=cats&count=5', { headers: { Origin: 'https://unrelated.example' } }), env); assert.equal(rejected.status, 403);
  const invalid = await worker.fetch(new Request('https://api.example.com/api/images?tag=cats&count=500'), env); assert.equal(invalid.status, 400);
  const unconfigured = await worker.fetch(new Request('https://api.example.com/api/images?tag=cats&count=5', { headers: { Origin: env.ALLOWED_ORIGIN } }), env); assert.equal(unconfigured.status, 503); assert.equal(unconfigured.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  const preflight = await worker.fetch(new Request('https://api.example.com/api/images', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN } }), env); assert.equal(preflight.status, 204);
  const method = await worker.fetch(new Request('https://api.example.com/api/images', { method: 'POST' }), env); assert.equal(method.status, 405);
});
