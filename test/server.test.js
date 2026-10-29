import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { loadConfig } from '../src/config.js';

async function fixture(t, decision) {
  const dir = await mkdtemp(join(tmpdir(), 'island-test-'));
  const config = loadConfig({ env: { DATA_DIR: dir }, envPath: null });
  const app = createApp({ config, decision: decision ?? (async (_config, observation, kind) => ({
    action: kind === 'speech' ? { type: 'speech', message: '先收集淡水。' } : { type: 'register', task_id: 'A' }, privateMessages: [], fallback: false,
  })), randomInt: () => 0 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  async function request(path, body, extraHeaders = {}) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const newCookie = response.headers.get('set-cookie');
    if (newCookie) cookie = newCookie.split(';')[0];
    return { status: response.status, data: await response.json(), cookie };
  }
  async function waitFor(phase) {
    for (let i = 0; i < 200; i++) {
      const response = await request('/api/state');
      if (response.data.phase === phase && !response.data.thinking.length) return response.data;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for ${phase}`);
  }
  t.after(async () => { await app.idle(); await new Promise(resolve => app.server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  return { app, config, request, waitFor, base, getCookie: () => cookie };
}

test('session is required and clients cannot impersonate agents', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/state')).status, 401);
  assert.equal((await f.request('/api/games', {})).status, 201);
  const result = await f.request('/api/action', { actor_id: 'P1', action: { type: 'speech', message: '冒充AI' } });
  assert.equal(result.status, 403);
  assert.equal((await f.request('/api/action', { action: { type: 'speech', message: '你好' } }, { Origin: 'https://evil.example' })).status, 403);
});

test('eight-day API playthrough survives refresh and persists exact balances', async t => {
  const f = await fixture(t);
  await f.request('/api/games', {});
  for (let day = 1; day <= 8; day++) {
    assert.equal((await f.request('/api/action', { action: { type: 'speech', message: '今天选 A' } })).status, 200);
    await f.waitFor('REGISTRATION');
    await f.request('/api/action', { action: { type: 'register', task_id: 'A' } });
    await f.request('/api/action', { action: { type: 'lock_registration' } });
    const state = (await f.request('/api/state')).data;
    assert.equal(state.players[0].gold_units, 120 + day * 24);
    const duplicate = await f.request('/api/action', { action: { type: 'lock_registration' } });
    assert.equal(duplicate.status, 409);
    if (day < 8) await f.request('/api/action', { action: { type: 'next_day' } });
  }
  const final = (await f.request('/api/state')).data;
  assert.equal(final.phase, 'FINISHED');
  assert.equal(final.round_results.length, 8);
  const saved = await f.app.store.load(final.id);
  assert.equal(saved.players[0].gold_units, 312);
  assert.equal(final.session_hash, undefined);
  assert.equal(final.players[1].personality, undefined);
});

test('unknown routes cannot expose local credentials or storage', async t => {
  const f = await fixture(t);
  for (const path of ['/.env.local', '/src/config.js', '/.data/game.json', '/api/games/anything', '/api/observation?viewer=P1']) {
    const result = await fetch(f.base + path);
    assert.equal(result.status, 404);
  }
  const publicConfig = (await f.request('/api/config')).data;
  assert.equal(publicConfig.apiKey, undefined);
});

test('stored human session resumes in a fresh server process model', async t => {
  const f = await fixture(t);
  await f.request('/api/games', {});
  const state = (await f.request('/api/state')).data;
  const other = createApp({ config: f.config, randomInt: () => 0 });
  await new Promise(resolve => other.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => other.server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${other.server.address().port}/api/state`, { headers: { Cookie: f.getCookie() } });
  const restored = await response.json();
  assert.equal(response.status, 200);
  assert.equal(restored.id, state.id);
  assert.deepEqual(restored.negotiation_order, ['P0', 'P1', 'P2', 'P3']);
});
