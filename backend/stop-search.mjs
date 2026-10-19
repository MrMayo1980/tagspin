import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const label of ['search-api', 'search-tunnel']) {
  const file = join(root, '.local', `${label}.pid`);
  if (!existsSync(file)) continue;
  const pid = Number(readFileSync(file, 'utf8'));
  try {
    const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    const owned = label === 'search-api' ? args.includes(join(root, 'backend/server.mjs')) : args.includes('cloudflared') && args.includes('127.0.0.1:4389');
    if (owned) process.kill(pid, 'SIGTERM');
  } catch { /* Process already stopped. */ }
  unlinkSync(file);
}
spawnSync(process.env.CONTAINER_RUNTIME || 'podman', ['stop', 'tagspin-searxng'], { stdio: 'inherit' });
console.log('Tagspin search stopped.');
