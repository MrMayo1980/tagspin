import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { tunnelOrigin, tunnelReady } from './tunnel-health.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const state = join(root, '.local');
mkdirSync(state, { recursive: true, mode: 0o700 });
const runtime = process.env.CONTAINER_RUNTIME || 'podman';
const image = 'docker.io/searxng/searxng@sha256:d81e14a4328ba7a57f297dff0472be629d30bf29580406c0d5b3bdab563c9bed';
function command(args, optional = false) {
  const result = spawnSync(runtime, args, { encoding: 'utf8' });
  if (result.status !== 0 && !optional) throw new Error(`${runtime} ${args[0]} failed: ${result.stderr || result.error?.message || ''}`);
  return result;
}
function launch(label, program, args) {
  const log = openSync(join(state, `${label}.log`), 'w', 0o600);
  const child = spawn(program, args, { cwd: root, detached: true, stdio: ['ignore', log, log] });
  child.on('error', () => {}); child.unref(); closeSync(log);
  if (!child.pid) throw new Error(`Could not start ${label}.`);
  writeFileSync(join(state, `${label}.pid`), String(child.pid), { mode: 0o600 });
  return child.pid;
}
async function waitFor(check, seconds = 35) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result; } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Startup timed out. Check the logs in .local/.');
}
function running(label, expected) {
  try {
    const pid = Number(readFileSync(join(state, `${label}.pid`), 'utf8'));
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(expected);
  } catch { return false; }
}
const configDir = join(state, 'searxng');
mkdirSync(configDir, { recursive: true });
if (command(['container', 'exists', 'tagspin-searxng'], true).status !== 0) {
  const config = `use_default_settings:\n  engines:\n    keep_only:\n      - bing\n      - brave\n      - duckduckgo\n      - bing images\n      - brave.images\n      - duckduckgo images\nserver:\n  secret_key: "${randomBytes(32).toString('hex')}"\n  limiter: false\n  image_proxy: false\nsearch:\n  formats: [html, json]\n  safe_search: 1\noutgoing:\n  request_timeout: 6.0\n  max_request_timeout: 12.0\n`;
  writeFileSync(join(configDir, 'settings.yml'), config, { mode: 0o600 });
  command(['run', '--name', 'tagspin-searxng', '-d', '--memory', '512m', '--cpus', '1', '-p', '127.0.0.1:4388:8080', '-v', `${configDir}:/etc/searxng:Z`, image]);
} else command(['start', 'tagspin-searxng']);
await waitFor(async () => (await fetch('http://127.0.0.1:4388/config', { signal: AbortSignal.timeout(1500) })).ok);
if (!running('search-api', join(root, 'backend/server.mjs'))) launch('search-api', process.execPath, [join(root, 'backend/server.mjs')]);
await waitFor(async () => (await fetch('http://127.0.0.1:4389/health', { signal: AbortSignal.timeout(1500) })).status === 200);
const localBinary = join(homedir(), '.local/bin/tagspin-cloudflared');
const tunnel = process.env.CLOUDFLARED_BIN || (existsSync(localBinary) ? localBinary : 'cloudflared');
let publicOrigin;
if (running('search-tunnel', 'cloudflared') && running('search-tunnel', '127.0.0.1:4389')) {
  publicOrigin = tunnelOrigin(readFileSync(join(state, 'search-tunnel.log'), 'utf8'));
  if (!await tunnelReady(publicOrigin)) {
    console.log('The previous public connection expired; replacing it.');
    const pid = Number(readFileSync(join(state, 'search-tunnel.pid'), 'utf8'));
    process.kill(pid, 'SIGTERM');
    await waitFor(() => !running('search-tunnel', '127.0.0.1:4389'), 35);
    publicOrigin = undefined;
  }
}
if (!publicOrigin) {
  launch('search-tunnel', tunnel, ['tunnel', '--url', 'http://127.0.0.1:4389', '--no-autoupdate', '--protocol', 'http2']);
  publicOrigin = await waitFor(async () => {
    const origin = tunnelOrigin(readFileSync(join(state, 'search-tunnel.log'), 'utf8'));
    return await tunnelReady(origin) ? origin : undefined;
  }, 180);
}
writeFileSync(join(root, 'config.json'), JSON.stringify({ searchEndpoint: `${publicOrigin}/api/images` }, null, 2) + '\n');
console.log(`No-key search is running: ${publicOrigin}/api/images`);
console.log('The trial works while this computer, container, API, and tunnel stay running.');
console.log('Republish config.json if the tunnel address changed. Stop with npm run stop:search.');
