import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as engine from '../src/engine.js';
import * as observations from '../src/observation.js';
import { loadConfig } from '../src/config.js';
import { GameStore } from '../src/store.js';
import { createRunner } from '../src/runner.js';
import { flushModelLogs } from '../src/model-log.js';

test('auto mode saves the selected P0 persona and samples three other distinct NPCs', () => {
  const game = engine.createGame({ id: 'auto-selection', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 });
  assert.equal(game.play_mode, 'auto');
  assert.equal(game.automation_status, 'running');
  assert.deepEqual(game.players.map(p => p.name), ['阿木', '林舟', '沈默', '顾寒']);
  assert.equal(new Set(game.players.map(p => p.npc_id)).size, 4);
  assert.ok(game.players.every(p => p.is_human === false));
  assert.deepEqual(engine.agentIds(game), ['P0', 'P1', 'P2', 'P3']);
  const manual = engine.createGame({ id: 'manual-default', randomInt: () => 0 });
  assert.equal(manual.play_mode, 'manual');
  assert.equal(manual.players[0].is_human, true);
  assert.deepEqual(engine.agentIds(manual), ['P1', 'P2', 'P3']);
});

test('new game rejects invalid modes and missing or unknown auto personas', () => {
  assert.throws(() => engine.createGame({ mode: 'unknown' }), /模式/);
  for (const proxyNpcId of [undefined, 'NPC-99', '阿木']) assert.throws(() => engine.createGame({ mode: 'auto', proxyNpcId }), /人设/);
});

test('P0 Agent context has its own persona and memory without observer control metadata', () => {
  const game = engine.createGame({ id: 'auto-view', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 });
  game.memories.P0.facts.push({ note: 'P0_ONLY_MEMORY' });
  game.memories.P1.facts.push({ note: 'P1_ONLY_MEMORY' });
  engine.addMessage(game, 'P1', 'P1_P2_SECRET', 'P2');
  const view = observations.getAgentObservation(game, 'P0');
  assert.equal(view.self_persona.name, '阿木');
  assert.equal(view.players[0].name, '阿木');
  assert.deepEqual(Object.keys(view.memories), ['P0']);
  assert.ok(!JSON.stringify(view).includes('P1_ONLY_MEMORY'));
  assert.ok(!JSON.stringify(view).includes('P1_P2_SECRET'));
  assert.ok(view.players.every(p => p.is_human === undefined));
  for (const key of ['play_mode', 'automation_status', 'phase_events', 'agent_ids']) assert.equal(view[key], undefined);
  const human = observations.getHumanView(game);
  assert.equal(human.play_mode, 'auto');
  assert.deepEqual(human.agent_ids, ['P0', 'P1', 'P2', 'P3']);
  assert.equal(human.memories, undefined);
  assert.equal(human.self_persona, undefined);
  assert.ok(!JSON.stringify(human).includes('P1_P2_SECRET'));
});

test('auto P0 can pass private chat and must reflect before next day', () => {
  const game = engine.createGame({ id: 'auto-reflect', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 });
  for (const id of game.negotiation_order) engine.applyAction(game, id, { type: 'speech', message: '独立判断。' });
  engine.applyAction(game, 'P0', { type: 'start_private_chat' });
  engine.applyAction(game, 'P0', { type: 'private_pass' });
  engine.advanceTime(game, () => game.private_chat.ends_at);
  for (const p of game.players) engine.applyAction(game, p.id, { type: 'register', task_id: 'A' });
  engine.applyAction(game, 'P0', { type: 'lock_registration' });
  for (const id of ['P1', 'P2', 'P3']) engine.applyAction(game, id, reflection(1));
  assert.equal(observations.getHumanView(game).reflection_status.complete, false);
  assert.throws(() => engine.applyAction(game, 'P0', { type: 'next_day' }), /反思/);
  engine.applyAction(game, 'P0', reflection(1));
  assert.equal(observations.getHumanView(game).reflection_status.complete, true);
  engine.applyAction(game, 'P0', { type: 'next_day' }, () => 0);
  assert.equal(game.current_day, 2);
  assert.equal(game.players[0].name, '阿木');
});

test('default P0 model follows MODEL_P1 unless MODEL_P0 is configured', () => {
  const config = loadConfig({ env: { MODEL_P1: 'first-model' }, envPath: null });
  assert.equal(config.models.P0, 'first-model');
  assert.equal(config.publicConfig.models.P0, 'first-model');
  assert.equal(config.publicConfig.npc_profiles.length, 10);
  assert.ok(config.publicConfig.npc_profiles.every(p => !Object.hasOwn(p, 'personality')));
  assert.equal(loadConfig({ env: { MODEL_P0: 'proxy-model', MODEL_P1: 'one' }, envPath: null }).models.P0, 'proxy-model');
});

const reflection = day => ({ type: 'reflect', day, summary: '根据可见结果复盘。', lesson: '共同收益不等于独自获胜。', next_plan: '比较后续获胜机会。' });
async function until(check) {
  for (let i = 0; i < 1200; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('automatic game did not reach expected state');
}
async function fixture(t, decision, now = Date.now) {
  const directory = await mkdtemp(join(tmpdir(), 'island-auto-'));
  const config = loadConfig({ env: { DATA_DIR: directory }, envPath: null });
  const store = new GameStore(directory);
  const game = engine.createGame({ id: 'auto-runner', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 });
  await store.save(game);
  const runner = createRunner({ store, config, decision, randomInt: () => 0, now });
  t.after(async () => { runner.close(); await runner.idle(); await flushModelLogs(); await rm(directory, { recursive: true, force: true }); });
  return { store, config, runner, game };
}

test('four Agents finish eight days automatically with private replies, voting, investment and 32 reflections', async t => {
  let time = 1000;
  const calls = [];
  const f = await fixture(t, async (_config, view, kind) => {
    calls.push({ day: view.current_day, actor: view.viewer_id, kind });
    assert.ok(view.self_persona?.personality);
    assert.ok(view.players.every(p => p.is_human === undefined));
    assert.deepEqual(Object.keys(view.memories), [view.viewer_id]);
    const actor = view.viewer_id;
    let action;
    if (kind === 'speech') action = { type: 'speech', message: '独立争取获胜。' };
    if (kind === 'register') action = { type: 'register', task_id: view.current_day === 1 ? 'B' : view.current_day === 2 && actor !== 'P3' ? 'C' : 'A' };
    if (kind === 'vote') action = { type: 'vote', target_id: view.vote_session.candidate_ids.filter(id => id !== actor).at(-1) };
    if (kind === 'invest') action = { type: 'invest', amount: view.current_day === 1 ? 5 : 10 };
    if (kind === 'reflect') action = reflection(view.current_day);
    if (kind === 'private_chat') {
      if (actor === 'P0' && view.private_chat.messages_sent === 0) action = { type: 'private_message', to: 'P1', message: 'P0主动协商。' };
      else if (actor === 'P1' && view.messages.some(m => m.day === view.current_day && m.from === 'P0' && m.to === 'P1')) action = { type: 'private_message', to: 'P0', message: 'P1回复代理。' };
      else action = { type: 'private_pass' };
      if (actor === 'P0' && view.messages.some(m => m.day === view.current_day && m.from === 'P1' && m.to === 'P0')) time = view.private_chat.ends_at;
    }
    return { action, fallback: false };
  }, () => time);
  await f.runner.resume();
  await until(async () => { const game = await f.store.load(f.game.id); return game.phase === 'FINISHED' && observations.getHumanView(game).reflection_status.complete; });
  await f.runner.idle();
  const done = await f.store.load(f.game.id);
  assert.equal(done.current_day, 8);
  assert.equal(done.round_results.length, 8);
  assert.deepEqual(done.players.map(p => p.gold), [35, 35, 32, 24]);
  assert.equal(done.vote_results.length, 2);
  assert.ok(done.ranking.every(p => !p.is_winner));
  for (const id of ['P0', 'P1', 'P2', 'P3']) assert.equal(done.memories[id].reflections.length, 8);
  assert.equal(calls.filter(c => c.kind === 'reflect').length, 32);
  for (const kind of ['speech', 'private_chat', 'register', 'vote', 'invest', 'reflect']) assert.ok(calls.some(c => c.actor === 'P0' && c.kind === kind), kind);
  assert.equal(done.messages.filter(m => m.from === 'P0' && m.to === 'P1').length, 8);
  assert.equal(done.messages.filter(m => m.from === 'P1' && m.to === 'P0').length, 8);
  const count = calls.length;
  await f.runner.kick(done.id);
  assert.equal(calls.length, count);
});

test('cancelled auto games discard late decisions and stopped saves are not resumed', async t => {
  let release, started = false;
  const blocked = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, async () => { started = true; await blocked; return { action: { type: 'speech', message: '不应提交的迟到动作' }, fallback: false }; });
  await f.runner.resume();
  await until(() => started);
  await f.store.transact(f.game.id, game => { game.automation_status = 'stopped'; });
  f.runner.cancel(f.game.id);
  await f.runner.idle();
  release();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(!(await f.store.load(f.game.id)).messages.some(m => m.text === '不应提交的迟到动作'));
  started = false;
  await f.runner.resume(); await f.runner.idle();
  assert.equal(started, false);
});
