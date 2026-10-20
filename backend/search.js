import { validateSettings, normalizeImage, matchesSearch, domainMatches } from '../core.js';

export function buildQuery(settings) {
  return settings.tag + (settings.website ? ` site:${settings.website}` : '');
}

export function parseResults(data, settings) {
  const images = (data.results || []).flatMap(item => {
    if (item.category && item.category !== 'images') return [];
    const image = normalizeImage({ id: item.img_src, title: item.title, thumbnail: item.thumbnail_src || item.img_src, url: item.img_src, page: item.url, source: item.source || item.engine, license: 'Check the original source for usage rights.' });
    if (!image || (settings && (!matchesSearch(image, settings.tag) || (settings.website && !domainMatches(image.page, settings.website) && !domainMatches(image.url, settings.website))))) return [];
    return [image];
  });
  return [...new Map(images.map(image => [image.url, image])).values()].slice(0, 100);
}

export async function webImageSearch(input, { searchUrl = 'http://127.0.0.1:4388', fetcher = fetch, signal } = {}) {
  const settings = validateSettings(input);
  const endpoint = new URL('/search', searchUrl);
  endpoint.search = new URLSearchParams({ q: buildQuery(settings), categories: 'images', format: 'json', safesearch: '1' }).toString();
  let response;
  try {
    const timeout = AbortSignal.timeout(18000);
    response = await fetcher(endpoint.href, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'application/json' } });
  } catch { return { status: 504, body: { error: 'Search is taking too long. Please try again.' } }; }
  if (!response.ok) return { status: response.status === 429 ? 429 : 502, body: { error: 'Search is temporarily unavailable. Please try again later.' } };
  let data;
  try { data = await response.json(); } catch { return { status: 502, body: { error: 'Search returned an unreadable response.' } }; }
  if (!data || !Array.isArray(data.results)) return { status: 502, body: { error: 'Search returned an unreadable response.' } };
  const images = parseResults(data, settings);
  if (!data.results.length && data.unresponsive_engines?.length) return { status: 503, body: { error: 'Search engines are temporarily unavailable. Please try again later.' } };
  return { status: 200, body: { images } };
}
