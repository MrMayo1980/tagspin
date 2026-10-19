export const HISTORY_KEY = 'tagspin.history.v1';
export const HISTORY_LIMIT = 100;

export function safeUrl(value, { httpsOnly = false } = {}) {
  try { const url = new URL(value); return (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:')) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function normalizeWebsite(value = '') {
  if (!value.trim()) return '';
  try {
    const url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error();
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) throw new Error();
    return hostname;
  } catch { throw new Error('Enter a website like example.com.'); }
}

export function domainMatches(url, domain) {
  try { const host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); return host === domain || host.endsWith(`.${domain}`); } catch { return false; }
}

export function validateSettings({ tag, count, kind = 'all', website = '' }) {
  const cleanTag = String(tag || '').trim().replace(/^#+/, '').trim();
  if (!cleanTag || cleanTag.length > 100) throw new Error('Add a tag between 1 and 100 characters.');
  if (!Number.isInteger(Number(count)) || Number(count) < 2 || Number(count) > 50) throw new Error('Choose between 2 and 50 images.');
  if (!['all', 'photograph', 'illustration'].includes(kind)) throw new Error('Choose an image type from the list.');
  return { tag: cleanTag, count: Number(count), kind, website: normalizeWebsite(website) };
}

export function plainText(value = '') {
  return String(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export function normalizeImage(image) {
  if (!image || typeof image !== 'object') return null;
  const thumbnail = safeUrl(image.thumbnail, { httpsOnly: true }), page = safeUrl(image.page);
  if (!thumbnail || !page) return null;
  return {
    id: String(image.id || page).slice(0, 1000),
    title: plainText(image.title || 'Untitled discovery').slice(0, 300),
    thumbnail, url: safeUrl(image.url) || thumbnail, page,
    creator: plainText(image.creator || 'Unknown creator').slice(0, 300),
    license: plainText(image.license || 'See source for usage terms').slice(0, 150),
    licenseUrl: safeUrl(image.licenseUrl), source: plainText(image.source || new URL(page).hostname).slice(0, 150),
  };
}

export function readHistory(storage) {
  try {
    const raw = JSON.parse(storage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, HISTORY_LIMIT).flatMap(entry => {
      try {
        const image = normalizeImage(entry.image), settings = validateSettings(entry.settings);
        if (!image || !Number.isFinite(Date.parse(entry.date))) return [];
        return [{ id: String(entry.id), date: entry.date, image, settings, poolCount: Number(entry.poolCount) || settings.count }];
      } catch { return []; }
    });
  } catch { return []; }
}

export function saveHistory(storage, history) { storage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT))); }

export function randomIndex(length) {
  if (!Number.isInteger(length) || length < 1) throw new Error('No images to choose from.');
  const max = 0x100000000 - (0x100000000 % length), random = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(random); } while (random[0] >= max);
  return random[0] % length;
}

export async function fetchJson(url, { signal, fetcher = fetch, timeout = 14000 } = {}) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  let response;
  try { response = await fetcher(url, { signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal, credentials: 'omit' }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Search isn’t responding. Please try again.');
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('Too many searches. Please wait a minute and try again.');
    throw new Error('Search is unavailable. Please try again later.');
  }
  try { return await response.json(); } catch { throw new Error('Search sent an unreadable response. Please try again.'); }
}

export async function searchImages(input, { endpoint, ...options } = {}) {
  const settings = validateSettings(input);
  if (!endpoint) throw new Error('Search is not connected yet.');
  const absolute = safeUrl(endpoint, { httpsOnly: true });
  if (!absolute && !/^\.\/api\/[a-z-]+$/.test(endpoint)) throw new Error('The search connection is invalid.');
  const params = new URLSearchParams({ tag: settings.tag, count: String(settings.count), website: settings.website });
  const data = await fetchJson(`${endpoint}?${params}`, { timeout: 35000, ...options });
  if (!data || !Array.isArray(data.images)) throw new Error('Search returned an unreadable result. Please try again.');
  const images = data.images.map(normalizeImage).filter(Boolean).filter(image => !settings.website || domainMatches(image.page, settings.website) || domainMatches(image.url, settings.website));
  const unique = [...new Map(images.map(image => [image.url, image])).values()];
  for (let index = unique.length - 1; index > 0; index--) { const other = randomIndex(index + 1); [unique[index], unique[other]] = [unique[other], unique[index]]; }
  if (unique.length < 2) throw new Error(`Not enough images found for “${settings.tag}”. Try another search or leave the website blank.`);
  return unique.slice(0, settings.count);
}
