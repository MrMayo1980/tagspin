import { HISTORY_KEY, HISTORY_LIMIT, readHistory, saveHistory, validateSettings, searchImages, randomIndex } from './core.js';

const $ = selector => document.querySelector(selector);
const state = { pool: [], settings: null, history: [], busy: false, controller: null };
try { state.history = readHistory(localStorage); } catch { /* Private browsing may disable storage. */ }

function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function externalLink(text, href, className = '') { const link = element('a', className, text); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
function notify(text = '', error = false) { const status = $('#status'); status.textContent = text; status.classList.toggle('error', error); status.hidden = !text; }
function setBusy(busy) {
  state.busy = busy;
  $('#spin-button').disabled = busy;
  $('#spin-again').disabled = busy;
  $('#spin-label').textContent = busy ? 'Finding a little wonder…' : 'Give it a spin';
  $('#roulette-card').setAttribute('aria-busy', String(busy));
  document.body.classList.toggle('loading', busy);
}
function showView(view) {
  const history = view === 'history';
  $('#discover-view').hidden = history; $('#history-view').hidden = !history;
  for (const name of ['discover', 'history']) {
    const tab = $(`#${name}-tab`), active = view === name;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  if (history) renderHistory();
}
function updateHistoryCount() { $('#history-count').textContent = state.history.length; }
function imageNode(image, className = '') {
  const img = element('img', className); img.src = image.thumbnail; img.alt = image.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { img.alt = 'Image unavailable — open its original source'; }, { once: true });
  return img;
}
function imageCard(image, entry) {
  const button = element('button', 'image-card'); button.type = 'button'; button.setAttribute('aria-label', `Open ${image.title}`);
  button.append(imageNode(image));
  if (entry) {
    const line = element('div', 'history-tag'); line.append(element('span', '', `# ${entry.settings.tag}`), element('span', '', new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))); button.append(line);
  }
  const copy = element('div', 'image-card-text'); copy.append(element('h3', '', image.title), element('p', '', image.creator)); button.append(copy);
  button.addEventListener('click', () => showImage(image, entry));
  return button;
}
function showImage(image, entry) {
  const detail = $('#image-detail'); detail.replaceChildren(imageNode(image, 'detail-image'), element('h2', '', image.title));
  const meta = element('div', 'detail-meta'); meta.append(element('span', '', `By ${image.creator}`));
  if (image.licenseUrl) meta.append(externalLink(image.license, image.licenseUrl)); else meta.append(element('span', '', image.license));
  detail.append(meta);
  if (entry) detail.append(element('p', '', `Discovered with #${entry.settings.tag} · ${new Date(entry.date).toLocaleString()} · ${entry.poolCount} images in the roulette`));
  const actions = element('div', 'detail-actions'); actions.append(externalLink('Visit original source ↗', image.page, 'secondary-button'), externalLink('Open image ↗', image.url, 'secondary-button'));
  if (entry) {
    const replay = element('button', 'secondary-button', 'Explore this tag again ↗'); replay.type = 'button';
    replay.addEventListener('click', () => { $('#image-dialog').close(); $('#tag').value = entry.settings.tag; $('#count').value = entry.settings.count; $('#kind').value = entry.settings.kind; $('#website').value = entry.settings.website; showView('discover'); $('#tag').focus(); });
    actions.append(replay);
  }
  detail.append(actions); $('#image-dialog').showModal();
}
function renderCollection() {
  $('#collection-grid').replaceChildren(...state.pool.map(image => imageCard(image)));
  $('#collection-count').textContent = `(${state.pool.length})`; $('#collection-tag').textContent = `# ${state.settings.tag}`; $('#collection-section').hidden = false;
}
function renderHistory() {
  $('#history-grid').replaceChildren(...state.history.map(entry => imageCard(entry.image, entry)));
  $('#history-empty').hidden = state.history.length > 0;
  $('#clear-history').disabled = !state.history.length; $('#export-history').disabled = !state.history.length;
  updateHistoryCount();
}
function persistWinner(image) {
  const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), image, settings: { ...state.settings }, poolCount: state.pool.length };
  state.history = [entry, ...state.history].slice(0, HISTORY_LIMIT);
  try { saveHistory(localStorage, state.history); } catch { notify('Your spin is ready. Browser storage is unavailable or full, so history will only last for this visit. Export it to keep a copy.'); }
  updateHistoryCount();
}
async function preload(image) {
  return new Promise(resolve => {
    const img = new Image(); let timer;
    const done = result => { clearTimeout(timer); img.onload = null; img.onerror = null; resolve(result); };
    img.onload = () => done(image); img.onerror = () => done(null); img.referrerPolicy = 'no-referrer'; timer = setTimeout(() => done(null), 10000); img.src = image.thumbnail;
  });
}
async function playableImages(images) {
  const loaded = [];
  for (let i = 0; i < images.length; i += 8) loaded.push(...await Promise.all(images.slice(i, i + 8).map(preload)));
  return loaded.filter(Boolean);
}
async function animateSpin() {
  $('#inspiration').hidden = true; $('#spin-stage').hidden = false; $('#spin-again').hidden = true;
  $('#stage-kicker').textContent = 'LEAVE A LITTLE ROOM FOR CHANCE'; $('#stage-title').textContent = `A little spin of ${state.settings.tag}.`;
  $('#winner-info').replaceChildren();
  const winnerIndex = randomIndex(state.pool.length), winner = state.pool[winnerIndex];
  const reel = $('#reel'), frames = Array.from({ length: 35 }, () => state.pool[randomIndex(state.pool.length)]), winningFrame = 31;
  frames[winningFrame] = winner;
  reel.replaceChildren(...frames.map((image, index) => { const tile = element('div', 'reel-tile'); tile.setAttribute('aria-hidden', 'true'); const img = imageNode(image); img.loading = 'eager'; tile.append(img); if (index === winningFrame) tile.classList.add('winner'); return tile; }));
  const style = getComputedStyle($('#reel-window')), width = parseFloat(style.getPropertyValue('--tile-width')), gap = parseFloat(style.getPropertyValue('--tile-gap'));
  const end = -(winningFrame * (width + gap) + width / 2);
  reel.style.transform = `translateX(${end}px)`;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const animation = reel.animate([{ transform: `translateX(${-width / 2}px)` }, { transform: `translateX(${end}px)` }], { duration: 3300, easing: 'cubic-bezier(.12,.68,.13,1)', fill: 'none' });
    await animation.finished;
  }
  const finalStyle = getComputedStyle($('#reel-window')), finalWidth = parseFloat(finalStyle.getPropertyValue('--tile-width')), finalGap = parseFloat(finalStyle.getPropertyValue('--tile-gap'));
  reel.style.transform = `translateX(${-(winningFrame * (finalWidth + finalGap) + finalWidth / 2)}px)`;
  $('#stage-kicker').textContent = 'A HAPPY ACCIDENT, JUST FOR YOU'; $('#stage-title').textContent = 'Look what curiosity found.';
  const titleButton = element('button', 'text-button', winner.title); titleButton.addEventListener('click', () => showImage(winner));
  const title = element('h3'); title.append(titleButton);
  $('#winner-info').replaceChildren(title, element('p', '', `${winner.creator} · ${winner.source}`));
  $('#spin-again').hidden = false; persistWinner(winner);
}
$('#spin-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return;
  let settings;
  try { settings = validateSettings(Object.fromEntries(new FormData(event.currentTarget))); } catch (error) { notify(error.message, true); return; }
  setBusy(true); notify();
  const previous = { pool: state.pool, settings: state.settings };
  state.controller = new AbortController();
  $('#inspiration').hidden = true; $('#spin-stage').hidden = false; $('#spin-again').hidden = true;
  $('#stage-kicker').textContent = 'CONNECTING THE DOTS'; $('#stage-title').textContent = `Finding a world of ${settings.tag}…`; $('#winner-info').replaceChildren(); $('#reel').replaceChildren();
  try {
    const found = await searchImages(settings, { signal: state.controller.signal });
    $('#stage-title').textContent = 'Getting the images ready…';
    const pool = await playableImages(found);
    if (pool.length < 2) throw new Error('These images couldn’t load. Try another tag or image source.');
    state.pool = pool; state.settings = settings;
    renderCollection();
    if (pool.length < settings.count) notify(`Found ${pool.length} available images of the ${settings.count} requested. Your roulette uses all ${pool.length}. Try a broader tag for more.`);
    $('#spin-label').textContent = 'A little serendipity in motion…';
    await animateSpin();
  } catch (error) {
    state.pool = previous.pool; state.settings = previous.settings;
    notify(error.message || 'Something interrupted your spin. Please try again.', true);
    $('#stage-kicker').textContent = 'LET’S TRY ANOTHER PATH'; $('#stage-title').textContent = 'A new tag could do the trick.';
    $('#reel').replaceChildren(); $('#spin-again').hidden = !state.pool.length;
  } finally { setBusy(false); }
});
$('#spin-again').addEventListener('click', async () => {
  if (state.busy || !state.pool.length) return;
  setBusy(true); notify();
  try { await animateSpin(); } catch { notify('The spin was interrupted. Give it another try.', true); } finally { setBusy(false); }
});
for (const button of document.querySelectorAll('[data-tag]')) button.addEventListener('click', () => { $('#tag').value = button.dataset.tag; $('#tag').focus(); });
$('#decrease').addEventListener('click', () => { $('#count').value = Math.max(2, (Number($('#count').value) || 10) - 1); });
$('#increase').addEventListener('click', () => { $('#count').value = Math.min(50, (Number($('#count').value) || 10) + 1); });
$('#discover-tab').addEventListener('click', () => showView('discover'));
$('#history-tab').addEventListener('click', () => showView('history'));
$('#start-discovering').addEventListener('click', () => { showView('discover'); $('#tag').focus(); });
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
for (const button of document.querySelectorAll('.dialog-close')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
$('#clear-history').addEventListener('click', () => $('#clear-dialog').showModal());
$('#cancel-clear').addEventListener('click', () => $('#clear-dialog').close());
$('#confirm-clear').addEventListener('click', () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* Session-only history. */ }
  state.history = []; renderHistory(); $('#clear-dialog').close();
});
$('#export-history').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ application: 'Tagspin', version: 1, exportedAt: new Date().toISOString(), spins: state.history }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = `tagspin-history-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('storage', event => { if (event.key === HISTORY_KEY || event.key === null) { try { state.history = readHistory(localStorage); renderHistory(); } catch { /* Keep session state if storage becomes unavailable. */ } } });
window.addEventListener('resize', () => { if (!state.busy && state.pool.length && $('#reel').children.length) { const style = getComputedStyle($('#reel-window')), width = parseFloat(style.getPropertyValue('--tile-width')), gap = parseFloat(style.getPropertyValue('--tile-gap')); $('#reel').style.transform = `translateX(${-(31 * (width + gap) + width / 2)}px)`; } });
updateHistoryCount();
