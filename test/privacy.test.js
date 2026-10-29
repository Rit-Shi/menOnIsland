import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction } from '../src/engine.js';
import { getObservation, getHumanView } from '../src/observation.js';

const ids = ['P0', 'P1', 'P2', 'P3'];
function atInvestment() {
  const game = createGame({ id: 'privacy', randomInt: () => 0 });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '公共信息' }));
  ids.forEach((id, i) => applyAction(game, id, { type: 'register', task_id: i < 2 ? 'B' : 'A' }));
  applyAction(game, 'P0', { type: 'lock_registration' });
  return game;
}

test('private chat is visible to its participants only, even in agent contexts', () => {
  const game = createGame({ id: 'privacy', randomInt: () => 0 });
  applyAction(game, 'P1', { type: 'private_message', to: 'P2', message: '私聊暗号-不准泄漏' });
  assert.ok(JSON.stringify(getObservation(game, 'P1')).includes('私聊暗号'));
  assert.ok(JSON.stringify(getObservation(game, 'P2')).includes('私聊暗号'));
  assert.ok(!JSON.stringify(getObservation(game, 'P3')).includes('私聊暗号'));
  assert.ok(!JSON.stringify(getHumanView(game)).includes('私聊暗号'));
});

test('pending contributions are absent from every other observation', () => {
  const game = atInvestment();
  applyAction(game, 'P1', { type: 'invest', amount: 7 });
  const human = getHumanView(game);
  assert.equal(human.my_investment, null);
  assert.equal(human.investments, undefined);
  assert.equal(human.players[1].investment, undefined);
  assert.equal(getObservation(game, 'P1').my_investment, 7);
  assert.equal(getObservation(game, 'P2').my_investment, null);
});

test('settlement details are filtered from current view, histories and memories', () => {
  const game = atInvestment();
  applyAction(game, 'P0', { type: 'invest', amount: 8 });
  applyAction(game, 'P1', { type: 'invest', amount: 2 });
  assert.deepEqual(getHumanView(game).round_results[0].my_settlement.investments, { P0: 8, P1: 2 });
  const outsider = getObservation(game, 'P2');
  assert.equal(outsider.round_results[0].my_settlement, null);
  assert.ok(!JSON.stringify(outsider).includes('"investments"'));
  assert.equal(outsider.memories.P1, undefined);
  assert.deepEqual(outsider.players.map(p => p.gold), [10, 16, 12, 12]);
  assert.equal(outsider.round_results[0].my_net_change, 2);
});

test('unrevealed ballots are never included in a different candidate observation', () => {
  const game = createGame({ id: 'votes', randomInt: () => 0 });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '公共信息' }));
  ids.forEach(id => applyAction(game, id, { type: 'register', task_id: 'C' }));
  applyAction(game, 'P0', { type: 'lock_registration' });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '投票发言' }));
  applyAction(game, 'P1', { type: 'vote', target_id: 'P3' });
  assert.equal(getObservation(game, 'P0').vote_session.votes, undefined);
  assert.equal(getObservation(game, 'P1').my_vote, 'P3');
  assert.equal(getObservation(game, 'P0').my_vote, null);
});
