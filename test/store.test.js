import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, applyAction } from '../src/engine.js';
import { GameStore } from '../src/store.js';

function legacyGame() {
  const game = createGame({ id: 'legacy', randomInt: () => 0 });
  delete game.schema_version;
  game.players.forEach((p, i) => { delete p.gold; p.gold_units = i < 2 ? 180 : 168; });
  game.current_day = 3;
  game.version = 42;
  game.session_hash = 'preserved-session';
  game.accepted_requests = ['preserved-request'];
  game.day_start_balances = { P0: 180, P1: 180, P2: 168, P3: 168 };
  game.round_results = [1, 2].map(day => ({
    day, registrations: { P0: 'B', P1: 'B', P2: 'A', P3: 'A' },
    registration_status: { P0: 'confirmed', P1: 'confirmed', P2: 'confirmed', P3: 'confirmed' },
    settlements: { B: { task_id: 'B', member_ids: ['P0', 'P1'], investments: { P0: 5, P1: 5 }, total_investment: 10, success: true, reward_multiplier: 1.5, reward_pool_units: 180, reward_per_player_units: 90, net_changes_units: { P0: 30, P1: 30 } } },
    public_gold_balances: day === 1 ? { P0: 150, P1: 150, P2: 144, P3: 144 } : { P0: 180, P1: 180, P2: 168, P3: 168 },
    net_changes_units: { P0: 30, P1: 30, P2: 24, P3: 24 }, vote_results: [],
  }));
  game.messages.push({ id: 'private-1', day: 2, from: 'P1', to: 'P2', text: '私信原文', kind: 'chat', at: '2026-10-29T00:00:00.000Z' });
  game.memories.P1.facts.push({ day: 1, task_id: 'B', success: true, investments: { P0: 5, P1: 5 } });
  return game;
}
async function fixture(t, game) {
  const directory = await mkdtemp(join(tmpdir(), 'island-migration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const raw = JSON.stringify(game, null, 2);
  await writeFile(join(directory, `${game.id}.json`), raw);
  const store = new GameStore(directory);
  return { directory, raw, store };
}

test('legacy load replays every rounded reward, preserves progress and backs up original bytes once', async t => {
  const old = legacyGame();
  const f = await fixture(t, old);
  const [game, concurrent] = await Promise.all([f.store.load(old.id), f.store.load(old.id)]);
  assert.equal(game.schema_version, 2);
  assert.deepEqual(game, concurrent);
  assert.deepEqual(game.players.map(p => p.gold), [16, 16, 14, 14]);
  assert.deepEqual(game.round_results[0].public_gold_balances, { P0: 13, P1: 13, P2: 12, P3: 12 });
  assert.deepEqual(game.round_results[1].net_changes, { P0: 3, P1: 3, P2: 2, P3: 2 });
  assert.equal(game.round_results[0].settlements.B.reward_pool, 16);
  assert.deepEqual(game.day_start_balances, { P0: 16, P1: 16, P2: 14, P3: 14 });
  assert.equal(game.current_day, 3);
  assert.equal(game.phase, 'NEGOTIATION');
  assert.equal(game.version, 43);
  assert.equal(game.session_hash, old.session_hash);
  assert.deepEqual(game.accepted_requests, old.accepted_requests);
  assert.deepEqual(game.messages.slice(0, old.messages.length), old.messages);
  assert.deepEqual(game.memories, old.memories);
  assert.deepEqual(game.negotiation_order, old.negotiation_order);
  assert.equal(await readFile(join(f.directory, 'backups', 'integer-gold', 'legacy.json'), 'utf8'), f.raw);
  const persisted = await readFile(join(f.directory, 'legacy.json'), 'utf8');
  assert.ok(!persisted.includes('_units'));
  const restarted = await new GameStore(f.directory).load(old.id);
  assert.deepEqual(restarted, game);
  assert.equal(await readFile(join(f.directory, 'legacy.json'), 'utf8'), persisted);
  assert.equal(await readFile(join(f.directory, 'backups', 'integer-gold', 'legacy.json'), 'utf8'), f.raw);
});

test('legacy pending investments remain locked and next settlement uses the migrated full balance', async t => {
  const old = legacyGame();
  old.phase = 'INVESTMENT_SUBMISSION';
  old.registrations = { P0: 'B', P1: 'B', P2: 'A', P3: 'A' };
  old.active_teams = { B: ['P0', 'P1'] };
  old.investments = { P1: 5 };
  const { store } = await fixture(t, old);
  const game = await store.load(old.id);
  assert.deepEqual(game.investments, { P1: 5 });
  assert.throws(() => applyAction(game, 'P1', { type: 'invest', amount: 6 }), /重复/);
  applyAction(game, 'P0', { type: 'invest', amount: 16 });
  assert.deepEqual(game.players.map(p => p.gold), [16, 27, 16, 16]);
  assert.deepEqual(game.round_results[2].net_changes, { P0: 0, P1: 11, P2: 2, P3: 2 });
});

test('legacy thirds are recalculated per member and final ranks use integer balances', async t => {
  const old = legacyGame();
  old.phase = 'FINISHED';
  old.round_results.push({
    day: 3, registrations: { P0: 'C', P1: 'C', P2: 'C', P3: 'A' }, registration_status: {}, vote_results: [],
    settlements: { C: { task_id: 'C', member_ids: ['P0', 'P1', 'P2'], investments: { P0: 15, P1: 15, P2: 1 }, success: true, reward_pool_units: 744, reward_per_player_units: 248, net_changes_units: { P0: 68, P1: 68, P2: 236 } } },
    public_gold_balances: { P0: 248, P1: 248, P2: 404, P3: 192 }, net_changes_units: { P0: 68, P1: 68, P2: 236, P3: 24 },
  });
  old.ranking = [{ id: 'P2', gold_units: 404, rank: 1 }];
  const { store } = await fixture(t, old);
  const game = await store.load(old.id);
  assert.deepEqual(game.players.map(p => p.gold), [22, 22, 34, 16]);
  assert.deepEqual(game.day_start_balances, { P0: 16, P1: 16, P2: 14, P3: 14 });
  assert.deepEqual(game.ranking.map(p => [p.id, p.gold, p.rank]), [['P2', 34, 1], ['P0', 22, 2], ['P1', 22, 2], ['P3', 16, 4]]);
  assert.equal(game.round_results[2].settlements.C.reward_pool, 63);
});

test('legacy failed tasks and underfilled registration receive no rounding bonus', async t => {
  const old = legacyGame();
  old.current_day = 1;
  old.phase = 'ROUND_UPDATE';
  old.round_results = [{
    day: 1, registrations: { P0: 'B', P1: 'B', P2: 'C', P3: 'A' }, registration_status: { P2: 'insufficient_members' }, vote_results: [],
    settlements: { B: { task_id: 'B', member_ids: ['P0', 'P1'], investments: { P0: 4, P1: 5 }, success: false } },
    public_gold_balances: { P0: 72, P1: 60, P2: 120, P3: 144 }, net_changes_units: { P0: -48, P1: -60, P2: 0, P3: 24 },
  }];
  const { store } = await fixture(t, old);
  const game = await store.load(old.id);
  assert.deepEqual(game.players.map(p => p.gold), [6, 5, 10, 12]);
  assert.deepEqual(game.day_start_balances, { P0: 10, P1: 10, P2: 10, P3: 10 });
  assert.equal(game.round_results[0].settlements.B.reward_per_player, 0);
});

test('schema-2 saves are read unchanged without making migration backups', async t => {
  const game = createGame({ id: 'current', randomInt: () => 0 });
  const { store, directory } = await fixture(t, game);
  assert.deepEqual(await store.load(game.id), game);
  assert.deepEqual(await readdir(directory), ['current.json']);
});
