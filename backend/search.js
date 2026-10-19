import { validateSettings, normalizeImage } from '../core.js';

export function buildQuery(settings) {
  return settings.tag + (settings.website ? ` site:${settings.website}` : '');
}

export function parseResults(data) {
  const images = (data.images_results || []).flatMap(item => {
    const image = normalizeImage({ id: item.original, title: item.title, thumbnail: item.thumbnail, url: item.original, page: item.link, source: item.source, license: 'Check the original source for usage rights.', licenseUrl: item.license_details_url });
    return image ? [image] : [];
  });
  return [...new Map(images.map(image => [image.url, image])).values()].slice(0, 100);
}

export async function webImageSearch(input, { apiKey, fetcher = fetch } = {}) {
  const settings = validateSettings(input);
  if (!apiKey) return { status: 503, body: { error: 'Search is not connected yet.' } };
  const params = new URLSearchParams({ engine: 'google_images', q: buildQuery(settings), api_key: apiKey, safe: 'active', hl: 'en' });
  let response;
  try {
    response = await fetcher(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' } });
  } catch { return { status: 504, body: { error: 'Search is taking too long. Please try again.' } }; }
  if (!response.ok) return { status: response.status === 429 ? 429 : 502, body: { error: response.status === 429 ? 'Search limit reached. Please try again later.' : 'Search is unavailable. Please try again later.' } };
  let data;
  try { data = await response.json(); } catch { return { status: 502, body: { error: 'Search returned an unreadable response.' } }; }
  if (!data || typeof data !== 'object' || (data.images_results !== undefined && !Array.isArray(data.images_results))) return { status: 502, body: { error: 'Search returned an unreadable response.' } };
  if (data.error) {
    if ((Array.isArray(data.images_results) && data.images_results.length === 0) || /hasn.t returned any results/i.test(data.error)) return { status: 200, body: { images: [] } };
    return { status: 502, body: { error: 'Search is unavailable. Please try again later.' } };
  }
  return { status: 200, body: { images: parseResults(data) } };
}
