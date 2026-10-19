export const HISTORY_KEY = 'tagspin.history.v1';
export const HISTORY_LIMIT = 100;

export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function normalizeWebsite(value = '') {
  if (!value.trim()) return '';
  try {
    const url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error();
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) throw new Error();
    return hostname;
  } catch { throw new Error('Enter a website like nasa.gov or https://commons.wikimedia.org.'); }
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
  const thumbnail = safeUrl(image.thumbnail), page = safeUrl(image.page);
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
    throw new Error('The image source isn’t responding. Please try again, or choose a different website.');
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('This image source is taking a breather. Please wait a minute before trying again.');
    throw new Error(`The image source returned an error (${response.status}). Try another website or tag.`);
  }
  try { return await response.json(); } catch { throw new Error('The image source sent an unreadable response. Please try again in a moment.'); }
}

function refineQuery(settings) { return settings.tag + (settings.kind === 'all' ? '' : settings.kind === 'photograph' ? ' photograph' : ' illustration'); }

async function searchWikimedia(settings, options) {
  const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${refineQuery(settings)} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(Math.min(settings.count + 10, 50)), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '800', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ObjectName', format: 'json', origin: '*' });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`, options);
  if (data.error) throw new Error('Wikimedia couldn’t search that tag. Try a simpler word or phrase.');
  return Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index).flatMap(item => {
    const info = item.imageinfo?.[0];
    if (!info) return [];
    const meta = info.extmetadata || {};
    const image = normalizeImage({ id: `wikimedia:${item.pageid}`, title: meta.ObjectName?.value || item.title.replace(/^File:/, ''), thumbnail: info.thumburl || info.url, url: info.url, page: info.descriptionurl, creator: meta.Artist?.value, license: meta.LicenseShortName?.value, licenseUrl: meta.LicenseUrl?.value, source: 'Wikimedia Commons' });
    return image ? [image] : [];
  });
}

async function searchNasa(settings, options) {
  const params = new URLSearchParams({ q: refineQuery(settings), media_type: 'image', page_size: String(Math.min(settings.count + 10, 100)) });
  const data = await fetchJson(`https://images-api.nasa.gov/search?${params}`, options);
  return (data.collection?.items || []).flatMap(item => {
    const meta = item.data?.[0], photo = item.links?.find(link => link.rel === 'preview');
    if (!meta || !photo) return [];
    const image = normalizeImage({ id: `nasa:${meta.nasa_id}`, title: meta.title, thumbnail: photo.href, url: photo.href, page: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`, creator: meta.photographer || meta.secondary_creator || meta.center || 'NASA', license: 'NASA media usage guidelines', licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', source: 'NASA' });
    return image ? [image] : [];
  });
}

export function fetchFlickrFeed(tags, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const callback = `tagspin_${crypto.randomUUID().replaceAll('-', '')}`, script = document.createElement('script');
    const cleanup = () => { clearTimeout(timer); script.remove(); delete globalThis[callback]; signal?.removeEventListener('abort', onAbort); };
    const fail = message => { cleanup(); reject(new Error(message)); };
    const onAbort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => fail('Flickr isn’t responding. Try another source or give it a moment.'), 14000);
    globalThis[callback] = data => { cleanup(); resolve(data); };
    script.onerror = () => fail('Flickr couldn’t be reached. Try Wikimedia or NASA instead.');
    // Flickr's documented JSONP feed supports static sites without an API key.
    // The script origin is fixed here; user-provided websites never become script URLs.
    const params = new URLSearchParams({ format: 'json', jsoncallback: callback, tags, tagmode: 'all' });
    script.src = `https://www.flickr.com/services/feeds/photos_public.gne?${params}`;
    signal?.addEventListener('abort', onAbort, { once: true });
    document.head.append(script);
  });
}

async function searchFlickr(settings, options) {
  const tags = settings.tag.split(',').map(tag => tag.trim().replace(/\s+/g, '')).filter(Boolean);
  if (settings.kind !== 'all') tags.push(settings.kind === 'photograph' ? 'photography' : 'illustration');
  const data = await (options.feedFetcher || fetchFlickrFeed)(tags.join(','), options);
  return (data.items || []).flatMap(item => {
    const author = item.author?.match(/\("(.*)"\)/)?.[1] || item.author || 'Flickr contributor';
    const image = normalizeImage({ id: item.link, title: item.title, thumbnail: item.media?.m, url: item.media?.m, page: item.link, creator: author, license: 'See Flickr for usage terms', source: 'Flickr' });
    return image && domainMatches(image.page, 'flickr.com') ? [image] : [];
  });
}

async function searchOpenverse(settings, options) {
  const images = [], sourceMap = { 'flickr.com': 'flickr', 'wordpress.org': 'wordpress', 'metmuseum.org': 'met', 'si.edu': 'smithsonian', 'europeana.eu': 'europeana' };
  const provider = Object.entries(sourceMap).find(([domain]) => domainMatches(`https://${settings.website}`, domain))?.[1];
  const params = new URLSearchParams({ q: settings.tag, page_size: '20', mature: 'false' });
  if (provider) params.set('source', provider);
  if (settings.kind !== 'all') params.set('category', settings.kind);
  for (let page = 1; page <= 5 && images.length < settings.count; page++) {
    params.set('page', String(page));
    const data = await fetchJson(`https://api.openverse.org/v1/images/?${params}`, options);
    for (const item of data.results || []) {
      if (!domainMatches(item.foreign_landing_url, settings.website) && !domainMatches(item.url, settings.website)) continue;
      const image = normalizeImage({ id: `openverse:${item.id}`, title: item.title, thumbnail: item.thumbnail || item.url, url: item.url, page: item.foreign_landing_url, creator: item.creator, license: `${item.license || ''} ${item.license_version || ''}`.trim(), licenseUrl: item.license_url, source: item.source });
      if (image && !images.some(existing => existing.id === image.id)) images.push(image);
    }
    if (page >= (data.page_count || 1) || !data.results?.length) break;
  }
  return images;
}

export async function searchImages(input, options = {}) {
  const settings = validateSettings(input);
  let images;
  if (!settings.website || ['commons.wikimedia.org', 'wikimedia.org', 'wikipedia.org'].includes(settings.website)) images = await searchWikimedia(settings, options);
  else if (settings.website === 'nasa.gov' || settings.website === 'images.nasa.gov') images = await searchNasa(settings, options);
  else if (settings.website === 'flickr.com') images = await searchFlickr(settings, options);
  else images = await searchOpenverse(settings, options);
  const unique = [...new Map(images.map(image => [image.id, image])).values()];
  // Fisher–Yates keeps every fetched image equally likely to enter the requested pool.
  for (let index = unique.length - 1; index > 0; index--) { const other = randomIndex(index + 1); [unique[index], unique[other]] = [unique[other], unique[index]]; }
  if (unique.length < 2) throw new Error(`We found ${unique.length ? 'only one image' : 'no images'} for “${settings.tag}”${settings.website ? ` on ${settings.website}` : ''}. Try a broader tag or leave the website blank.`);
  return unique.slice(0, settings.count);
}
