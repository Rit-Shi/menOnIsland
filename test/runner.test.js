import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, applyAction, privateMessagesSent } from '../src/engine.js';
import { GameStore } from '../src/store.js';
import { createRunner } from '../src/runner.js';

const ids = ['P0', 'P1', 'P2', 'P3'];
const pass = { action: { type: 'private_pass' }, fallback: false };
const message = (to, text) => ({ action: { type: 'private_message', to, message: text }, fallback: false });
async function eventually(check) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  assert.fail('Expected asynchronous state was not reached');
}
async function fixture(t, decision) {
  const directory = await mkdtemp(join(tmpdir(), 'island-chat-runner-'));
  const store = new GameStore(directory);
  let time = 1000;
  const now = () => time;
  const game = createGame({ id: 'runner', randomInt: () => 0 });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '已公开发言' }, () => 0, now));
  await store.save(game);
  const config = { models: { P1: 'one', P2: 'two', P3: 'three' }, timeoutMs: 60000 };
  const runner = createRunner({ store, config, now, decision });
  t.after(async () => { runner.close(); await runner.idle(); await rm(directory, { recursive: true, force: true }); });
  return { runner, store, config, now, setTime: value => { time = value; } };
}

test('Agents initiate private chat after public speech, reply on new input, and do not spin when idle', async t => {
  const requests = [];
  const f = await fixture(t, async (_config, observation, kind) => {
    requests.push({ kind, observation });
    return observation.viewer_id === 'P1' ? message('P0', '我愿意组队') : pass;
  });
  await f.runner.kick('runner');
  await f.runner.idle();
  let game = await f.store.load('runner');
  assert.equal(privateMessagesSent(game, 'P1'), 1);
  assert.ok(requests.every(r => r.kind === 'private_chat'));
  assert.equal(requests.length, 3);
  await f.store.transact('runner', game => applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: '那你准备投入多少？' }, () => 0, f.now));
  await f.runner.kick('runner');
  await f.runner.idle();
  game = await f.store.load('runner');
  assert.equal(privateMessagesSent(game, 'P1'), 2);
  assert.equal(requests.filter(r => r.observation.viewer_id === 'P1').length, 2);
  assert.ok(requests.at(-1).observation.messages.some(m => m.text === '那你准备投入多少？'));
  await f.runner.kick('runner');
  await f.runner.idle();
  assert.equal(requests.length, 4);
});

test('Agent-to-Agent private conversation stops at five outgoing messages each', async t => {
  const f = await fixture(t, async (_config, observation) => observation.viewer_id === 'P3' ? pass : message(observation.viewer_id === 'P1' ? 'P2' : 'P1', '谈合作'));
  await f.runner.kick('runner');
  await f.runner.idle();
  const game = await f.store.load('runner');
  assert.equal(privateMessagesSent(game, 'P1'), 5);
  assert.equal(privateMessagesSent(game, 'P2'), 5);
  assert.equal(game.messages.filter(m => m.to).length, 10);
  assert.equal(game.phase, 'PRIVATE_CHAT');
});

test('slow private model does not block other replies or registration at the deadline; late results are discarded', async t => {
  let finishSlow;
  let slowSignal;
  const f = await fixture(t, async (_config, observation, kind, options) => {
    if (kind === 'register') return { action: { type: 'register', task_id: 'A' }, fallback: false };
    if (observation.viewer_id === 'P1') {
      slowSignal = options.signal;
      return new Promise(resolve => { finishSlow = resolve; });
    }
    return observation.viewer_id === 'P2' ? message('P0', '快速回复') : pass;
  });
  await f.runner.kick('runner');
  await eventually(async () => (await f.store.load('runner')).messages.some(m => m.text === '快速回复'));
  f.setTime(31000);
  await f.runner.kick('runner');
  await f.runner.idle();
  let game = await f.store.load('runner');
  assert.equal(game.phase, 'REGISTRATION');
  assert.deepEqual(game.registrations, { P1: 'A', P2: 'A', P3: 'A' });
  assert.equal(slowSignal.aborted, true);
  finishSlow(message('P0', '过期结果不得发送'));
  await f.runner.idle();
  game = await f.store.load('runner');
  assert.ok(!game.messages.some(m => m.text === '过期结果不得发送'));
  assert.deepEqual(game.thinking, []);
});

test('incoming message during a private model request is read in a subsequent request', async t => {
  let finishFirst;
  const observations = [];
  const f = await fixture(t, async (_config, observation) => {
    if (observation.viewer_id !== 'P1') return pass;
    observations.push(observation);
    if (observations.length === 1) return new Promise(resolve => { finishFirst = resolve; });
    return message('P0', '已读新计划');
  });
  await f.runner.kick('runner');
  await eventually(() => !!finishFirst);
  await f.store.transact('runner', game => applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: '新计划去C' }, () => 0, f.now));
  finishFirst(pass);
  await f.runner.idle();
  assert.equal(observations.length, 2);
  assert.ok(!observations[0].messages.some(m => m.text === '新计划去C'));
  assert.ok(observations[1].messages.some(m => m.text === '新计划去C'));
});

test('restart preserves deadline and quota, and resumes expired private saves without extending time', async t => {
  const decide = async (_config, _observation, kind) => kind === 'register' ? { action: { type: 'register', task_id: 'A' }, fallback: false } : pass;
  const f = await fixture(t, decide);
  await f.store.transact('runner', game => applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: '存档私聊' }, () => 0, f.now));
  await f.runner.kick('runner');
  await f.runner.idle();
  f.runner.close();
  f.setTime(5000);
  const restarted = createRunner({ store: new GameStore(f.store.directory), config: f.config, decision: decide, now: f.now });
  t.after(() => restarted.close());
  await restarted.resume();
  await restarted.idle();
  let game = await restartedStore();
  assert.equal(game.private_chat.ends_at, 31000);
  assert.equal(privateMessagesSent(game, 'P0'), 1);
  f.setTime(31000);
  await restarted.kick('runner');
  await restarted.idle();
  game = await restartedStore();
  assert.equal(game.phase, 'REGISTRATION');
  assert.equal(game.private_chat.ends_at, 31000);
  async function restartedStore() { return new GameStore(f.store.directory).load('runner'); }
});

test('server deadline timer advances private chat without browser polling or another kick', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t, async (_config, _observation, kind) => kind === 'register' ? { action: { type: 'register', task_id: 'A' }, fallback: false } : pass);
  await f.runner.kick('runner');
  await f.runner.idle();
  f.setTime(31000);
  t.mock.timers.tick(30000);
  let game;
  const timeout = performance.now() + 3000;
  do {
    await new Promise(resolve => setImmediate(resolve));
    game = await f.store.load('runner');
  } while (game.phase === 'PRIVATE_CHAT' && performance.now() < timeout);
  await f.runner.idle();
  assert.equal(game.phase, 'REGISTRATION');
});

test('a slow expired save does not delay recovery or deadline timers of another saved game', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseSlow;
  const f = await fixture(t, async (_config, observation, kind) => {
    if (kind === 'private_chat') return pass;
    if (observation.id === 'runner' && observation.viewer_id === 'P1') return new Promise(resolve => { releaseSlow = resolve; });
    return { action: { type: 'register', task_id: 'A' }, fallback: false };
  });
  const second = createGame({ id: 'second', randomInt: () => 0 });
  ids.forEach(id => applyAction(second, id, { type: 'speech', message: '第二局协商' }, () => 0, () => 40000));
  await f.store.save(second);
  f.setTime(50000);
  const recovery = f.runner.resume();
  try {
    let restored;
    const timeout = performance.now() + 1500;
    do {
      await new Promise(resolve => setImmediate(resolve));
      restored = await f.store.load('second');
    } while (restored.private_chat.agent_last_seen.P1 == null && performance.now() < timeout);
    assert.equal(restored.private_chat.agent_last_seen.P1, 0);
    assert.equal(restored.private_chat.ends_at, 70000);
    f.setTime(70000);
    t.mock.timers.tick(20000);
    const expires = performance.now() + 1500;
    do {
      await new Promise(resolve => setImmediate(resolve));
      restored = await f.store.load('second');
    } while (restored.phase === 'PRIVATE_CHAT' && performance.now() < expires);
    assert.equal(restored.phase, 'REGISTRATION');
  } finally {
    releaseSlow?.({ action: { type: 'register', task_id: 'A' }, fallback: false });
    await recovery;
  }
});
