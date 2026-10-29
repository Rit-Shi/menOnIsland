import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { loadConfig } from '../src/config.js';
import { request as httpRequest } from 'node:http';

async function fixture(t, decision) {
  let time = 1000;
  const now = () => time;
  const dir = await mkdtemp(join(tmpdir(), 'island-test-'));
  const config = loadConfig({ env: { DATA_DIR: dir }, envPath: null });
  const app = createApp({ config, decision: decision ?? (async (_config, observation, kind) => ({
    action: kind === 'speech' ? { type: 'speech', message: '先收集淡水。' } : kind === 'private_chat' ? { type: 'private_pass' } : { type: 'register', task_id: 'A' }, privateMessages: [], fallback: false,
  })), randomInt: () => 0, now });
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
      if (phase === 'REGISTRATION' && response.data.phase === 'PRIVATE_CHAT') time = response.data.private_chat.ends_at;
      const registered = phase !== 'REGISTRATION' || ['P1', 'P2', 'P3'].every(id => response.data.registration_submitted[id]);
      if (response.data.phase === phase && !response.data.thinking.length && registered) return response.data;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for ${phase}`);
  }
  t.after(async () => { await app.idle(); await new Promise(resolve => app.server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  return { app, config, request, waitFor, base, getCookie: () => cookie, now, setTime: value => { time = value; } };
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
    assert.equal(state.players[0].gold, 10 + day * 2);
    const duplicate = await f.request('/api/action', { action: { type: 'lock_registration' } });
    assert.equal(duplicate.status, 409);
    if (day < 8) await f.request('/api/action', { action: { type: 'next_day' } });
  }
  const final = (await f.request('/api/state')).data;
  assert.equal(final.phase, 'FINISHED');
  assert.equal(final.round_results.length, 8);
  const saved = await f.app.store.load(final.id);
  assert.equal(saved.players[0].gold, 26);
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

test('oversubscribed B completes two vote rounds and hides pending agent investments', async t => {
  const observations = [];
  const f = await fixture(t, async (_config, observation, kind) => {
    observations.push({ kind, observation });
    const id = observation.viewer_id;
    const target = observation.vote_session?.candidate_ids.includes('P3') ? (id === 'P3' ? 'P2' : 'P3') : (id === 'P1' ? 'P2' : 'P1');
    const action = kind === 'speech' ? { type: 'speech', message: '留下我，我会合作。' }
      : kind === 'private_chat' ? { type: 'private_pass' }
      : kind === 'register' ? { type: 'register', task_id: 'B' }
      : kind === 'vote' ? { type: 'vote', target_id: target }
      : { type: 'invest', amount: 5 };
    return { action, privateMessages: [], fallback: false };
  });
  await f.request('/api/games', {});
  await f.request('/api/action', { action: { type: 'speech', message: '都来 B' } });
  await f.waitFor('REGISTRATION');
  await f.request('/api/action', { action: { type: 'register', task_id: 'B' } });
  await f.request('/api/action', { action: { type: 'lock_registration' } });
  for (const target of ['P3', 'P2']) {
    await f.waitFor('VOTE_SPEECH');
    await f.request('/api/action', { action: { type: 'speech', message: '请留下我' } });
    await f.waitFor('VOTE_SUBMISSION');
    await f.request('/api/action', { action: { type: 'vote', target_id: target } });
  }
  const investing = await f.waitFor('INVESTMENT_SUBMISSION');
  assert.equal(investing.my_investment, null);
  assert.equal(investing.investments, undefined);
  await f.request('/api/action', { action: { type: 'invest', amount: 5 } });
  const final = await f.waitFor('ROUND_UPDATE');
  assert.equal(final.phase, 'ROUND_UPDATE');
  assert.equal(final.vote_results.length, 2);
  assert.deepEqual(final.players.map(p => p.gold), [13, 13, 10, 10]);
  assert.ok(observations.filter(o => o.kind === 'invest').every(o => o.observation.my_investment === null && !('investments' in o.observation)));
});

test('accepted request identifiers cannot cause duplicate private messages', async t => {
  const f = await fixture(t);
  await f.request('/api/games', {});
  await f.request('/api/action', { action: { type: 'speech', message: '开启协商' } });
  await f.waitFor('PRIVATE_CHAT');
  const body = { request_id: 'same-request', action: { type: 'private_message', to: 'P1', message: '只应出现一次' } };
  await f.request('/api/action', body);
  await f.request('/api/action', body);
  const state = (await f.request('/api/state')).data;
  assert.equal(state.messages.filter(m => m.text === '只应出现一次').length, 1);
});

test('UTF-8 characters spanning HTTP chunks are preserved in persisted private chat', async t => {
  const f = await fixture(t);
  await f.request('/api/games', {});
  await f.request('/api/action', { action: { type: 'speech', message: '开启协商' } });
  await f.waitFor('PRIVATE_CHAT');
  const payload = Buffer.from(JSON.stringify({ action: { type: 'private_message', to: 'P1', message: '你好' } }));
  const split = payload.indexOf(Buffer.from('你')) + 1;
  const response = await new Promise((resolve, reject) => {
    const request = httpRequest(f.base + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, Origin: f.base, Cookie: f.getCookie() } }, response => {
      response.setEncoding('utf8');
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, data: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.write(payload.subarray(0, split));
    setTimeout(() => request.end(payload.subarray(split)), 30);
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.messages.at(-1).text, '你好');
});

test('agents can reconsider their own choice while other tasks remain secret', async t => {
  const f = await fixture(t, async (_config, observation, kind) => ({
    action: kind === 'speech' ? { type: 'speech', message: '我们可以去 B' }
      : kind === 'private_chat' ? { type: 'private_pass' }
      : { type: 'register', task_id: observation.registrations[observation.viewer_id] === 'B' ? 'A' : 'B' }, privateMessages: [], fallback: false,
  }));
  await f.request('/api/games', {});
  await f.request('/api/action', { action: { type: 'speech', message: '先考虑 B' } });
  await f.waitFor('REGISTRATION');
  const first = (await f.request('/api/state')).data;
  assert.equal(first.registrations.P1, undefined);
  assert.equal((await f.app.store.load(first.id)).registrations.P1, 'B');
  await f.request('/api/action', { action: { type: 'register', task_id: 'A' } });
  const review = await f.request('/api/action', { action: { type: 'reconsider_registrations' } });
  assert.equal(review.status, 200);
  for (let i = 0; i < 200; i++) {
    const state = (await f.request('/api/state')).data;
    if (!state.registration_review_pending && !state.thinking.length) {
      assert.deepEqual(state.registrations, { P0: 'A' });
      const saved = await f.app.store.load(state.id);
      assert.deepEqual(saved.registrations, { P0: 'A', P1: 'A', P2: 'A', P3: 'A' });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Agent registrations were never reconsidered');
});

test('state and action API responses hide task choices until final confirmation, including after reload', async t => {
  const f = await fixture(t);
  await f.request('/api/games', {});
  await f.request('/api/action', { action: { type: 'speech', message: '今天先秘密报名。' } });
  const waiting = await f.waitFor('REGISTRATION');
  assert.deepEqual(waiting.registrations, {});
  assert.deepEqual(waiting.registration_submitted, { P0: false, P1: true, P2: true, P3: true });
  const submitted = await f.request('/api/action', { action: { type: 'register', task_id: 'A' } });
  assert.equal(submitted.status, 200);
  assert.deepEqual(submitted.data.registrations, { P0: 'A' });
  assert.deepEqual((await f.request('/api/state')).data.registrations, { P0: 'A' });
  const persisted = await f.app.store.load(waiting.id);
  assert.deepEqual(persisted.registrations, { P0: 'A', P1: 'A', P2: 'A', P3: 'A' });
  const other = createApp({ config: f.config, now: f.now });
  await new Promise(resolve => other.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => other.server.close(resolve)));
  const restored = await fetch(`http://127.0.0.1:${other.server.address().port}/api/state`, { headers: { Cookie: f.getCookie() } });
  assert.deepEqual((await restored.json()).registrations, { P0: 'A' });
  const published = await f.request('/api/action', { action: { type: 'lock_registration' } });
  assert.equal(published.status, 200);
  assert.notEqual(published.data.phase, 'REGISTRATION');
  assert.deepEqual(published.data.registrations, { P0: 'A', P1: 'A', P2: 'A', P3: 'A' });
});

test('private API enforces a shared five-message quota under concurrent requests and closes exactly at deadline', async t => {
  const f = await fixture(t);
  await f.request('/api/games', {});
  const early = await f.request('/api/action', { action: { type: 'private_message', to: 'P1', message: '过早' } });
  assert.equal(early.status, 409);
  await f.request('/api/action', { action: { type: 'speech', message: '开始协商' } });
  const phase = await f.waitFor('PRIVATE_CHAT');
  assert.equal(phase.private_chat.ends_at, 31000);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => f.request('/api/action', { request_id: `private-${i}`, action: { type: 'private_message', to: ['P1', 'P2', 'P3'][i % 3], message: `第${i}条` } })));
  assert.equal(results.filter(r => r.status === 200).length, 5);
  assert.equal(results.filter(r => r.status === 409).length, 1);
  const state = (await f.request('/api/state')).data;
  assert.equal(state.private_chat.remaining_messages, 0);
  assert.equal(state.messages.filter(m => m.from === 'P0' && m.to).length, 5);
  f.setTime(31000);
  const late = await f.request('/api/action', { action: { type: 'private_message', to: 'P1', message: '过期' } });
  assert.equal(late.status, 409);
  assert.equal((await f.waitFor('REGISTRATION')).private_chat.ends_at, 31000);
});
