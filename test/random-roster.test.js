import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, applyAction, advanceTime } from '../src/engine.js';
import { getObservation, getHumanView } from '../src/observation.js';
import { GameStore } from '../src/store.js';

test('new games draw distinct characters independently of their fixed seats', () => {
  const first = createGame({ id: 'first-roster', randomInt: () => 0 });
  const last = createGame({ id: 'last-roster', randomInt: max => max - 1 });
  assert.deepEqual(first.players.slice(1).map(p => p.name), ['林舟', '沈默', '顾寒']);
  assert.deepEqual(last.players.map(p => p.id), ['P0', 'P1', 'P2', 'P3']);
  assert.deepEqual(last.players.slice(1).map(p => p.name), ['楚衍', '陆衡', '江隐']);
  assert.deepEqual(last.players.slice(1).map(p => p.npc_id), ['NPC-10', 'NPC-09', 'NPC-08']);
  assert.equal(new Set(last.players.slice(1).map(p => p.npc_id)).size, 3);
  assert.equal(last.players[1].code_name, '适应性变色龙');
  assert.match(last.players[1].personality, /排名/);
});

test('all ten candidates can occupy every seat with equal ordered-draw frequency', () => {
  const counts = Array.from({ length: 3 }, () => new Map());
  for (let a = 0; a < 10; a++) for (let b = 0; b < 9; b++) for (let c = 0; c < 8; c++) {
    const draws = [a, b, c, 0];
    const game = createGame({ id: 'draw-coverage', randomInt: () => draws.shift() });
    const actors = game.players.slice(1);
    assert.equal(new Set(actors.map(p => p.name)).size, 3);
    actors.forEach((p, seat) => counts[seat].set(p.name, (counts[seat].get(p.name) || 0) + 1));
  }
  for (const seat of counts) {
    assert.equal(seat.size, 10);
    assert.ok([...seat.values()].every(count => count === 72));
  }
});

test('saved character identities survive reload and next-day progression', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'island-roster-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = createGame({ id: 'saved-roster', randomInt: max => max - 1 });
  const profiles = original.players.map(({ id, name, npc_id, personality, code_name }) => ({ id, name, npc_id, personality, code_name }));
  await new GameStore(directory).save(original);
  const game = await new GameStore(directory).load(original.id);
  for (const id of game.negotiation_order) applyAction(game, id, { type: 'speech', message: '观察合作机会。' });
  applyAction(game, 'P0', { type: 'start_private_chat' });
  advanceTime(game, () => game.private_chat.ends_at);
  for (const p of game.players) applyAction(game, p.id, { type: 'register', task_id: 'A' });
  applyAction(game, 'P0', { type: 'lock_registration' });
  for (const id of ['P1', 'P2', 'P3']) applyAction(game, id, { type: 'reflect', day: 1, summary: '选择了A。', lesson: '还需争取相对优势。', next_plan: '评估下一天的合作。' });
  applyAction(game, 'P0', { type: 'next_day' }, () => 0);
  await new GameStore(directory).save(game);
  const reloaded = await new GameStore(directory).load(game.id);
  assert.equal(reloaded.current_day, 2);
  assert.deepEqual(reloaded.players.map(({ id, name, npc_id, personality, code_name }) => ({ id, name, npc_id, personality, code_name })), profiles);
});

test('Agent context includes only its own saved persona and human view only public labels', () => {
  const game = createGame({ id: 'persona-privacy', randomInt: max => max - 1 });
  const view = getObservation(game, 'P1');
  assert.equal(view.self_persona.name, '楚衍');
  assert.equal(view.self_persona.npc_id, 'NPC-10');
  assert.equal(view.self_persona.personality, game.players[1].personality);
  assert.equal(view.players[0].name, 'P0');
  assert.ok(view.players.every(p => p.personality === undefined && p.is_human === undefined));
  assert.deepEqual(Object.keys(view.memories), ['P1']);
  const human = getHumanView(game);
  assert.equal(human.players[2].name, '陆衡');
  assert.equal(human.players[2].code_name, '忠诚盟友');
  assert.equal(human.self_persona, undefined);
  assert.ok(human.players.every(p => p.personality === undefined));
});

test('older saves retain their existing name and own personality without an NPC ID', () => {
  const game = createGame({ id: 'old-persona', randomInt: () => 0 });
  delete game.players[1].npc_id;
  delete game.players[1].code_name;
  game.players[1].name = '旧林舟';
  game.players[1].personality = '旧存档的合作策略，遇到风险时保留本金。';
  assert.equal(getObservation(game, 'P1').self_persona.personality, '旧存档的合作策略，遇到风险时保留本金。');
  assert.equal(getHumanView(game).players[1].name, '旧林舟');
});
