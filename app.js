import { HISTORY_KEY, HISTORY_LIMIT, readHistory, saveHistory, validateSettings, searchImages, randomIndex } from './core.js';

const $ = selector => document.querySelector(selector);
const state = { pool: [], settings: null, history: [], busy: false, endpoint: '' };
try { state.history = readHistory(localStorage); } catch { /* History stays in memory if storage is blocked. */ }
const configured = fetch('./config.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(config => { state.endpoint = config.searchEndpoint; }).catch(() => {});

function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function setBusy(value) { state.busy = value; $('#search-fields').disabled = value; $('#spin-again').disabled = value; $('#result').setAttribute('aria-busy', String(value)); $('#spin-button').textContent = value ? '…' : 'Spin'; }
function node(tag, className, text) { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = text; return result; }
function renderHistory() {
  $('#history-count').textContent = state.history.length; $('#history-total').textContent = state.history.length;
  $('#empty-history').hidden = state.history.length > 0; $('#clear-history').hidden = !state.history.length;
  $('#history-grid').replaceChildren(...state.history.map(entry => {
    const link = node('a', 'history-item'); link.href = entry.image.page; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Open ${entry.image.title}`);
    const image = node('img'); image.src = entry.image.thumbnail; image.alt = entry.image.title; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    const date = new Date(entry.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    link.append(image, node('h3', '', entry.settings.tag), node('p', '', date)); return link;
  }));
}
function showImage(image) {
  $('#empty-result').hidden = true; $('#result-image').hidden = false; $('#result-image').src = image.thumbnail; $('#result-image').alt = image.title;
}
async function preload(image) {
  return new Promise(resolve => {
    const img = new Image(); let timer;
    const done = result => { clearTimeout(timer); img.onload = null; img.onerror = null; resolve(result); };
    img.onload = () => done(image); img.onerror = () => done(null); timer = setTimeout(() => done(null), 8000); img.referrerPolicy = 'no-referrer'; img.src = image.thumbnail;
  });
}
async function spin() {
  const winner = state.pool[randomIndex(state.pool.length)];
  $('#result-info').hidden = true;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 16; i++) {
      showImage(state.pool[randomIndex(state.pool.length)]);
      await new Promise(resolve => setTimeout(resolve, 65 + i * 9));
    }
  }
  showImage(winner);
  $('#result-title').textContent = winner.title; $('#pool-count').textContent = `${state.pool.length} images · ${state.settings.tag}`;
  $('#source-link').href = winner.page; $('#result-info').hidden = false;
  const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), image: winner, settings: { ...state.settings }, poolCount: state.pool.length };
  state.history = [entry, ...state.history].slice(0, HISTORY_LIMIT); renderHistory();
  const fewer = state.pool.length < state.settings.count ? `Found ${state.pool.length} of ${state.settings.count} requested images. ` : '';
  status(`${fewer}Picked: ${winner.title}`);
  try { saveHistory(localStorage, state.history); } catch { status(`${fewer}Picked: ${winner.title}. History will last for this visit only because browser storage is unavailable.`); }
}
$('#spin-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return;
  let settings;
  try { settings = validateSettings(Object.fromEntries(new FormData(event.currentTarget))); } catch (error) { status(error.message, true); return; }
  setBusy(true); status('Searching…');
  try {
    await configured;
    const found = await searchImages(settings, { endpoint: state.endpoint });
    status('Loading images…');
    const pool = [];
    for (let index = 0; index < found.length; index += 10) pool.push(...(await Promise.all(found.slice(index, index + 10).map(preload))).filter(Boolean));
    if (pool.length < 2) throw new Error('These images couldn’t load. Try another search.');
    state.pool = pool; state.settings = settings; status('Spinning…');
    if (innerWidth < 700) $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    await spin();
  } catch (error) { status(error.message || 'Search failed. Please try again.', true); }
  finally { setBusy(false); }
});
$('#spin-again').addEventListener('click', async () => {
  if (state.busy || !state.pool.length) return;
  setBusy(true); status('Spinning…');
  try { await spin(); } finally { setBusy(false); }
});
$('header a').addEventListener('click', () => { $('#history').open = true; });
$('#clear-history').addEventListener('click', () => $('#clear-dialog').showModal());
$('#cancel-clear').addEventListener('click', () => $('#clear-dialog').close());
$('#confirm-clear').addEventListener('click', () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch { $('#clear-dialog').close(); status('Couldn’t clear saved history. Browser storage is unavailable.', true); return; }
  state.history = []; renderHistory(); $('#clear-dialog').close();
});
window.addEventListener('storage', event => { if (event.key === HISTORY_KEY || event.key === null) { try { state.history = readHistory(localStorage); renderHistory(); } catch { /* Preserve in-memory history. */ } } });
renderHistory();
