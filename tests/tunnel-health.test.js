import test from 'node:test';
import assert from 'node:assert/strict';
import { tunnelOrigin, tunnelReady } from '../backend/tunnel-health.js';

test('a running client with an expired public connection is unhealthy', async () => {
  const origin = tunnelOrigin('Started https://expired-trial.trycloudflare.com tunnel');
  assert.equal(await tunnelReady(origin, async () => { throw new TypeError('DNS lookup failed'); }), false);
  assert.equal(await tunnelReady(origin, async () => new Response('Gone', { status: 530 })), false);
});

test('only a reachable Tagspin health response can be reused', async () => {
  const origin = 'https://live-trial.trycloudflare.com';
  assert.equal(await tunnelReady(origin, async url => {
    assert.equal(url, `${origin}/health`);
    return Response.json({ ready: true });
  }), true);
  assert.equal(await tunnelReady(origin, async () => new Response('<html>Error</html>')), false);
  assert.equal(await tunnelReady(undefined), false);
  assert.equal(await tunnelReady('https://example.com'), false);
});
