import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsite, domainMatches, validateSettings, safeUrl, readHistory, saveHistory, HISTORY_KEY, HISTORY_LIMIT, searchImages, fetchJson } from '../core.js';

const settings = { tag: 'cats', count: 3, kind: 'all', website: '' };
const photo = { id: '1', title: 'Cat', thumbnail: 'https://example.org/cat.jpg', url: 'https://example.org/cat.jpg', page: 'https://example.org/cat', creator: 'A creator', license: 'CC BY 4.0', source: 'Example' };
const response = data => ({ ok: true, json: async () => data });
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };

test('website accepts domains and full URLs, rejects credentials and script URLs', () => {
  assert.equal(normalizeWebsite(' https://www.Example.com/images?q=cats '), 'example.com');
  assert.equal(normalizeWebsite('images.example.com'), 'images.example.com');
  assert.equal(normalizeWebsite(''), '');
  for (const bad of ['javascript:alert(1)', 'https://name:secret@example.com', 'localhost', 'https://example.com:444', 'not a website', 'https://-example.com']) assert.throws(() => normalizeWebsite(bad));
});
test('source filter accepts genuine subdomains, rejects lookalikes', () => {
  assert.ok(domainMatches('https://images.example.com/cat', 'example.com'));
  assert.ok(domainMatches('https://www.example.org/photos/a', 'example.org'));
  assert.ok(!domainMatches('https://example.org.evil.example/pic', 'example.org'));
  assert.ok(!domainMatches('https://notexample.org/pic', 'example.org'));
});
test('settings reject empty tags, non-integer counts and unsupported categories', () => {
  assert.deepEqual(validateSettings({ ...settings, tag: ' #cats ', count: '10' }), { ...settings, tag: 'cats', count: 10 });
  for (const count of [1, 51, 2.5, '', 'abc']) assert.throws(() => validateSettings({ ...settings, count }));
  assert.throws(() => validateSettings({ ...settings, tag: '  ' }));
  assert.throws(() => validateSettings({ ...settings, kind: 'video' }));
});
test('external links reject scripts, data URLs, and embedded credentials', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,hello'), '');
  assert.equal(safeUrl('https://secret@example.org/image.jpg'), '');
  assert.equal(safeUrl('https://example.org/image.jpg'), 'https://example.org/image.jpg');
});
test('history survives serialization, enforces cap, ignores corrupt entries', () => {
  const store = storage();
  const entry = { id: '1', date: '2026-10-19T12:00:00.000Z', image: photo, settings, poolCount: 3 };
  saveHistory(store, Array.from({ length: 120 }, () => entry));
  assert.equal(readHistory(store).length, HISTORY_LIMIT);
  assert.equal(readHistory(store)[0].image.title, 'Cat');
  store.setItem(HISTORY_KEY, JSON.stringify([entry, { ...entry, image: { ...photo, page: 'javascript:alert(1)' } }, { ...entry, date: 'invalid' }, null]));
  assert.equal(readHistory(store).length, 1);
  store.setItem(HISTORY_KEY, 'broken JSON'); assert.deepEqual(readHistory(store), []);
  store.setItem(HISTORY_KEY, '{}'); assert.deepEqual(readHistory(store), []);
});
test('search uses one general search endpoint and respects the requested pool size', async () => {
  let called;
  const images = Array.from({ length: 8 }, (_, index) => ({ ...photo, id: String(index), url: `https://site${index}.org/cat.jpg`, page: `https://site${index}.org/cat` }));
  const found = await searchImages(settings, { endpoint: 'https://search.example.com/api/images', fetcher: async url => { called = new URL(url); return response({ images }); } });
  assert.equal(called.hostname, 'search.example.com'); assert.equal(called.searchParams.get('tag'), 'cats');
  assert.equal(called.searchParams.get('website'), ''); assert.equal(found.length, 3);
  assert.equal(new Set(found.map(image => image.page)).size, 3);
});
test('optional websites filter general results by actual page or image domain', async () => {
  const images = [photo, { ...photo, id: '2', url: 'https://cdn.example.org/b.jpg', page: 'https://www.example.org/b' }, { ...photo, id: 'bad', url: 'https://example.org.evil.com/a.jpg', page: 'https://evil.com/a' }];
  const found = await searchImages({ ...settings, website: 'example.org' }, { endpoint: './api/images', fetcher: async () => response({ images }) });
  assert.equal(found.length, 2); assert.ok(found.every(image => domainMatches(image.page, 'example.org')));
});
test('search removes unsafe and duplicate results', async () => {
  const images = [photo, photo, { ...photo, page: 'javascript:alert(1)' }, { ...photo, id: '2', url: 'https://example.org/other.jpg' }];
  const found = await searchImages(settings, { endpoint: './api/images', fetcher: async () => response({ images }) });
  assert.equal(found.length, 2);
});
test('no search is attempted until an endpoint is configured', async () => {
  let requested = false;
  await assert.rejects(searchImages(settings, { fetcher: async () => { requested = true; } }), /not connected/);
  await assert.rejects(searchImages(settings, { endpoint: 'http://untrusted.example/api' }), /invalid/);
  assert.equal(requested, false);
});
test('empty and malformed search responses produce recoverable errors', async () => {
  for (const images of [[], [photo]]) await assert.rejects(searchImages(settings, { endpoint: './api/images', fetcher: async () => response({ images }) }), /Not enough images/);
  await assert.rejects(searchImages(settings, { endpoint: './api/images', fetcher: async () => response({}) }), /unreadable/);
});
test('rate limits, network failures, malformed JSON, and cancellation are handled', async () => {
  await assert.rejects(fetchJson('https://example.org', { fetcher: async () => ({ ok: false, status: 429 }) }), /wait a minute/);
  await assert.rejects(fetchJson('https://example.org', { fetcher: async () => { throw new Error('network'); } }), /isn’t responding/);
  await assert.rejects(fetchJson('https://example.org', { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }) }), /unreadable/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchJson('https://example.org', { signal: controller.signal, fetcher: async (_, options) => { options.signal.throwIfAborted(); } }), { name: 'AbortError' });
});
