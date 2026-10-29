import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, settleRound, advanceTime, rankPlayers } from '../src/engine.js';

const fixed = () => 0;
const ids = ['P0', 'P1', 'P2', 'P3'];

test('only a unique highest balance wins, while numerical ties retain shared ranks', () => {
  const game = createGame({ id: 'strict-winner', randomInt: fixed });
  [25, 20, 20, 10].forEach((gold, i) => { game.players[i].gold = gold; });
  let ranking = rankPlayers(game.players);
  assert.deepEqual(ranking.map(p => p.rank), [1, 2, 2, 4]);
  assert.deepEqual(ranking.filter(p => p.is_winner).map(p => p.id), ['P0']);
  game.players[1].gold = 25;
  ranking = rankPlayers(game.players);
  assert.deepEqual(ranking.map(p => p.rank), [1, 1, 3, 4]);
  assert.ok(ranking.every(p => p.is_winner === false));
});
function registered(choices) {
  const game = createGame({ id: 'test', randomInt: fixed });
  for (const id of game.negotiation_order) applyAction(game, id, { type: 'speech', message: '一起商量' }, fixed);
  advanceTime(game, () => game.private_chat.ends_at);
  choices.forEach((task_id, i) => applyAction(game, ids[i], { type: 'register', task_id }, fixed));
  applyAction(game, 'P0', { type: 'lock_registration' }, fixed);
  return game;
}

test('random starting speaker produces a cyclic order and enforces turns', () => {
  const game = createGame({ id: 'test', randomInt: () => 2 });
  assert.deepEqual(game.negotiation_order, ['P2', 'P3', 'P0', 'P1']);
  assert.throws(() => applyAction(game, 'P0', { type: 'speech', message: '抢先' }), /轮到/);
  applyAction(game, 'P2', { type: 'speech', message: '我先说' });
  assert.equal(game.negotiation_turn_index, 1);
});

test('A pays exactly two per person and settlement cannot pay twice', () => {
  const game = registered(['A', 'A', 'A', 'A']);
  assert.equal(game.phase, 'ROUND_UPDATE');
  assert.deepEqual(game.players.map(p => p.gold), [12, 12, 12, 12]);
  settleRound(game);
  assert.deepEqual(game.players.map(p => p.gold), [12, 12, 12, 12]);
});

for (const fixture of [
  { task: 'B', amounts: [5, 5], balances: [13, 13], success: true, reward: 8 },
  { task: 'B', amounts: [6, 5], balances: [13, 14], success: true, reward: 9 },
  { task: 'B', amounts: [6, 6], balances: [13, 13], success: true, reward: 9 },
  { task: 'B', amounts: [7, 6], balances: [13, 14], success: true, reward: 10 },
  { task: 'B', amounts: [8, 2], balances: [10, 16], success: true, reward: 8 },
  { task: 'B', amounts: [10, 0], balances: [8, 18], success: true, reward: 8 },
  { task: 'B', amounts: [4, 5], balances: [6, 5], success: false, reward: 0 },
  { task: 'C', amounts: [10, 10, 10], balances: [20, 20, 20], success: true, reward: 20 },
  { task: 'C', amounts: [10, 10, 9], balances: [0, 0, 1], success: false, reward: 0 },
]) test(`${fixture.task} contributions ${fixture.amounts} settle exactly`, () => {
  const choices = ids.map((_, i) => i < fixture.amounts.length ? fixture.task : 'A');
  const game = registered(choices);
  fixture.amounts.forEach((amount, i) => applyAction(game, ids[i], { type: 'invest', amount }, fixed));
  assert.deepEqual(game.players.slice(0, fixture.amounts.length).map(p => p.gold), fixture.balances);
  const settlement = game.round_results[0].settlements[fixture.task];
  assert.equal(settlement.success, fixture.success);
  assert.equal(settlement.reward_per_player, fixture.reward);
  assert.equal(settlement.reward_pool, fixture.reward * fixture.amounts.length);
});

test('C rounds each member reward upward with overinvestment and free riders', () => {
  const game = registered(['C', 'C', 'C', 'A']);
  game.players.slice(0, 3).forEach(p => { p.gold = 30; });
  [20, 11, 0].forEach((amount, i) => applyAction(game, ids[i], { type: 'invest', amount }, fixed));
  assert.deepEqual(game.players.slice(0, 3).map(p => p.gold), [31, 40, 51]);
  assert.equal(game.round_results[0].settlements.C.reward_pool, 63);
  assert.equal(game.round_results[0].settlements.C.reward_per_player, 21);
});

test('underfilled roles receive zero rather than automatic A income', () => {
  const game = registered(['B', 'C', 'C', 'A']);
  assert.deepEqual(game.players.map(p => p.gold), [10, 10, 10, 12]);
  assert.equal(game.registration_status.P0, 'insufficient_members');
});

test('investment rejects negative, fractional, excessive and duplicate submissions', () => {
  const game = registered(['B', 'B', 'A', 'A']);
  for (const amount of [-1, 1.2, 11, '5', Infinity]) {
    assert.throws(() => applyAction(game, 'P0', { type: 'invest', amount }), /整数|余额/);
  }
  applyAction(game, 'P0', { type: 'invest', amount: 5 });
  assert.throws(() => applyAction(game, 'P0', { type: 'invest', amount: 6 }), /重复/);
  assert.throws(() => applyAction(game, 'P2', { type: 'invest', amount: 0 }), /成员/);
});

test('four B applicants use fresh speeches and ballots after each elimination', () => {
  const game = registered(['B', 'B', 'B', 'B']);
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '留下我' }, fixed));
  const targets = ['P3', 'P3', 'P0', 'P1'];
  ids.forEach((id, i) => applyAction(game, id, { type: 'vote', target_id: targets[i] }, fixed));
  assert.equal(game.phase, 'VOTE_SPEECH');
  assert.deepEqual(game.vote_session.candidate_ids, ['P0', 'P1', 'P2']);
  assert.deepEqual(game.vote_session.votes, {});
  assert.equal(game.vote_session.vote_round, 2);
  assert.throws(() => applyAction(game, 'P3', { type: 'speech', message: '再说一次' }), /轮到/);
  ['P0', 'P1', 'P2'].forEach(id => applyAction(game, id, { type: 'speech', message: '第二轮' }, fixed));
  ['P0', 'P1', 'P2'].forEach((id, i) => applyAction(game, id, { type: 'vote', target_id: ['P2', 'P2', 'P0'][i] }, fixed));
  assert.deepEqual(game.active_teams.B, ['P0', 'P1']);
  assert.equal(game.vote_results.length, 2);
  assert.equal(game.registration_status.P3, 'eliminated');
});

test('ties randomly eliminate only a highest-vote candidate and reject self votes', () => {
  const game = registered(['C', 'C', 'C', 'C']);
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '发言' }, fixed));
  assert.throws(() => applyAction(game, 'P0', { type: 'vote', target_id: 'P0' }), /自己/);
  ids.forEach((id, i) => applyAction(game, id, { type: 'vote', target_id: ids[(i + 1) % 4] }, () => 2));
  assert.equal(game.vote_results[0].eliminated_id, 'P2');
  assert.deepEqual(game.vote_results[0].tied_ids, ids);
});

test('eight days finish with exact shared ranks and no ninth day', () => {
  const game = createGame({ id: 'eight', randomInt: fixed });
  for (let day = 1; day <= 8; day++) {
    [...game.negotiation_order].forEach(id => applyAction(game, id, { type: 'speech', message: '喝水' }, fixed));
    advanceTime(game, () => game.private_chat.ends_at);
    ids.forEach(id => applyAction(game, id, { type: 'register', task_id: 'A' }, fixed));
    applyAction(game, 'P0', { type: 'lock_registration' }, fixed);
    if (day < 8) applyAction(game, 'P0', { type: 'next_day' }, fixed);
  }
  assert.equal(game.phase, 'FINISHED');
  assert.deepEqual(game.players.map(p => p.gold), [26, 26, 26, 26]);
  assert.deepEqual(game.ranking.map(p => p.rank), [1, 1, 1, 1]);
  assert.throws(() => applyAction(game, 'P0', { type: 'next_day' }), /阶段/);
});

test('registration reconsideration is bounded and all agents must finish before lock', () => {
  const game = createGame({ id: 'revise', randomInt: fixed });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '先看看' }));
  advanceTime(game, () => game.private_chat.ends_at);
  ids.forEach(id => applyAction(game, id, { type: 'register', task_id: 'B' }));
  for (let round = 0; round < 2; round++) {
    applyAction(game, 'P0', { type: 'reconsider_registrations' });
    assert.throws(() => applyAction(game, 'P0', { type: 'lock_registration' }), /重新评估/);
    ids.slice(1).forEach(id => applyAction(game, id, { type: 'register', task_id: 'A' }));
  }
  assert.throws(() => applyAction(game, 'P0', { type: 'reconsider_registrations' }), /次数/);
  assert.deepEqual(ids.slice(1).map(id => game.registrations[id]), ['A', 'A', 'A']);
  applyAction(game, 'P0', { type: 'lock_registration' });
  assert.equal(game.phase, 'ROUND_UPDATE');
});
