import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsite, domainMatches, validateSettings, safeUrl, readHistory, saveHistory, HISTORY_KEY, HISTORY_LIMIT, searchImages, fetchJson } from '../core.js';

const settings = { tag: 'cats', count: 3, kind: 'all', website: '' };
const photo = { id: '1', title: 'Cat', thumbnail: 'https://example.org/cat.jpg', url: 'https://example.org/cat.jpg', page: 'https://example.org/cat', creator: 'A creator', license: 'CC BY 4.0', source: 'Example' };
const response = data => ({ ok: true, json: async () => data });
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };

test('website accepts domains and full URLs, rejects credentials and script URLs', () => {
  assert.equal(normalizeWebsite(' https://www.NASA.gov/images?q=moon '), 'nasa.gov');
  assert.equal(normalizeWebsite('commons.wikimedia.org'), 'commons.wikimedia.org');
  assert.equal(normalizeWebsite(''), '');
  for (const bad of ['javascript:alert(1)', 'https://name:secret@nasa.gov', 'localhost', 'https://example.com:444', 'not a website', 'https://-example.com']) assert.throws(() => normalizeWebsite(bad));
});
test('source filter accepts genuine subdomains, rejects lookalikes', () => {
  assert.ok(domainMatches('https://images.nasa.gov/moon', 'nasa.gov'));
  assert.ok(domainMatches('https://www.flickr.com/photos/a', 'flickr.com'));
  assert.ok(!domainMatches('https://flickr.com.evil.example/pic', 'flickr.com'));
  assert.ok(!domainMatches('https://notflickr.com/pic', 'flickr.com'));
});
test('settings reject empty tags, non-integer counts and unsupported categories', () => {
  assert.deepEqual(validateSettings({ ...settings, tag: ' #cats ', count: '10' }), { ...settings, tag: 'cats', count: 10 });
  for (const count of [1, 51, 2.5, '', 'abc']) assert.throws(() => validateSettings({ ...settings, count }));
  assert.throws(() => validateSettings({ ...settings, tag: '  ' }));
  assert.throws(() => validateSettings({ ...settings, kind: 'video' }));
});
test('only HTTPS external media and source links are accepted', () => {
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
test('Wikimedia search returns requested unique images and safe, plain-text attribution', async () => {
  let called;
  const pages = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, { pageid: i, index: i, title: `File:Cat ${i}`, imageinfo: [{ thumburl: `https://example.org/${i}.jpg`, url: `https://example.org/orig${i}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:Cat${i}`, extmetadata: { Artist: { value: '<a href="evil">Creator &amp; friend</a>' } } }] }]));
  const images = await searchImages(settings, { fetcher: async url => { called = new URL(url); return response({ query: { pages } }); } });
  assert.equal(called.hostname, 'commons.wikimedia.org');
  assert.equal(called.searchParams.get('origin'), '*');
  assert.equal(images.length, 3); assert.equal(new Set(images.map(i => i.id)).size, 3);
  assert.equal(images[0].creator, 'Creator & friend');
});
test('NASA website selects NASA API, respects count and preserves credits', async () => {
  let called;
  const items = Array.from({ length: 8 }, (_, i) => ({ data: [{ nasa_id: String(i), title: `Moon ${i}`, photographer: 'NASA photographer' }], links: [{ rel: 'preview', href: `https://images-assets.nasa.gov/${i}.jpg` }] }));
  const images = await searchImages({ ...settings, tag: 'moon', website: 'nasa.gov', kind: 'illustration' }, { fetcher: async url => { called = new URL(url); return response({ collection: { items } }); } });
  assert.equal(called.hostname, 'images-api.nasa.gov'); assert.equal(called.searchParams.get('q'), 'moon illustration');
  assert.equal(images.length, 3); assert.equal(images[0].creator, 'NASA photographer'); assert.match(images[0].page, /^https:\/\/images.nasa.gov\/details\//);
});
test('Flickr uses its public feed, cleans creator names, and matches the source', async () => {
  let usedTags;
  const images = await searchImages({ ...settings, website: 'flickr.com' }, { feedFetcher: async tags => {
    usedTags = tags;
    return { items: Array.from({ length: 5 }, (_, i) => ({ title: `Cat ${i}`, link: `https://www.flickr.com/photos/person/${i}`, media: { m: `https://live.staticflickr.com/${i}.jpg` }, author: 'nobody@flickr.com ("Photographer")' })) };
  } });
  assert.equal(usedTags, 'cats'); assert.equal(images.length, 3); assert.equal(images[0].creator, 'Photographer');
  assert.equal(images[0].source, 'Flickr');
});
test('Openverse follows pages, filters actual domain, and de-duplicates results', async () => {
  const calls = [];
  const item = id => ({ id, title: `Cat ${id}`, thumbnail: `https://images.metmuseum.org/${id}.jpg`, url: `https://images.metmuseum.org/original${id}.jpg`, foreign_landing_url: `https://www.metmuseum.org/art/${id}`, license: 'by', license_version: '4.0', source: 'met' });
  const images = await searchImages({ ...settings, website: 'metmuseum.org' }, { fetcher: async url => {
    const parsed = new URL(url); calls.push(parsed);
    return response({ page_count: 2, results: parsed.searchParams.get('page') === '1' ? [item('1'), { ...item('bad'), foreign_landing_url: 'https://metmuseum.org.evil.example/a', url: 'https://unrelated.org/a.jpg' }, item('1')] : [item('2'), item('3')] });
  } });
  assert.equal(calls.length, 2); assert.equal(calls[0].searchParams.get('source'), 'met'); assert.equal(images.length, 3);
  assert.ok(images.every(image => domainMatches(image.page, 'metmuseum.org')));
});
test('unindexed website has a bounded search and returns a helpful error', async () => {
  let calls = 0;
  await assert.rejects(searchImages({ ...settings, website: 'example.org' }, { fetcher: async () => { calls++; return response({ page_count: 100, results: [{ id: String(calls), foreign_landing_url: 'https://unrelated.org/x', url: 'https://unrelated.org/x.jpg' }] }); } }), /no images/);
  assert.equal(calls, 5);
});
test('empty search and one-image results cannot start an invalid roulette', async () => {
  await assert.rejects(searchImages(settings, { fetcher: async () => response({}) }), /no images/);
  await assert.rejects(searchImages({ ...settings, website: 'nasa.gov' }, { fetcher: async () => response({ collection: { items: [{ data: [{ nasa_id: 'one' }], links: [{ rel: 'preview', href: 'https://images-assets.nasa.gov/a.jpg' }] }] } }) }), /only one image/);
});
test('rate limits, network errors and cancellation produce actionable behavior', async () => {
  await assert.rejects(fetchJson('https://example.org', { fetcher: async () => ({ ok: false, status: 429 }) }), /wait a minute/);
  await assert.rejects(fetchJson('https://example.org', { fetcher: async () => { throw new Error('network'); } }), /isn’t responding/);
  await assert.rejects(fetchJson('https://example.org', { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }) }), /unreadable response/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchJson('https://example.org', { signal: controller.signal, fetcher: async (_, options) => { options.signal.throwIfAborted(); } }), { name: 'AbortError' });
});
