import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advanceTime, addMessage } from '../src/engine.js';
import { getObservation, getHumanView } from '../src/observation.js';

const ids = ['P0', 'P1', 'P2', 'P3'];
function atInvestment() {
  const game = createGame({ id: 'privacy', randomInt: () => 0 });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '公共信息' }));
  advanceTime(game, () => game.private_chat.ends_at);
  ids.forEach((id, i) => applyAction(game, id, { type: 'register', task_id: i < 2 ? 'B' : 'A' }));
  applyAction(game, 'P0', { type: 'lock_registration' });
  return game;
}

test('private chat is visible to its participants only, even in agent contexts', () => {
  const game = createGame({ id: 'privacy', randomInt: () => 0 });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '公共信息' }));
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
  advanceTime(game, () => game.private_chat.ends_at);
  ids.forEach(id => applyAction(game, id, { type: 'register', task_id: 'C' }));
  applyAction(game, 'P0', { type: 'lock_registration' });
  ids.forEach(id => applyAction(game, id, { type: 'speech', message: '投票发言' }));
  applyAction(game, 'P1', { type: 'vote', target_id: 'P3' });
  assert.equal(getObservation(game, 'P0').vote_session.votes, undefined);
  assert.equal(getObservation(game, 'P1').my_vote, 'P3');
  assert.equal(getObservation(game, 'P0').my_vote, null);
});

test('Agent observations hide controller identities and neutralize P0 in system history and rankings', () => {
  const game = createGame({ id: 'identities', randomInt: () => 0 });
  addMessage(game, 'SYSTEM', '玩家邀请三名 Agent 根据最新报名重新评估任务选择。');
  game.ranking = game.players.map((p, i) => ({ id: p.id, name: p.name, gold: p.gold, rank: i + 1 }));
  const original = structuredClone(game);
  for (const id of ['P1', 'P2', 'P3']) {
    const observation = getObservation(game, id);
    assert.equal(observation.players[0].name, 'P0');
    assert.ok(observation.players.every(p => !Object.hasOwn(p, 'is_human') && !Object.hasOwn(p, 'personality')));
    assert.equal(observation.ranking[0].name, 'P0');
    assert.ok(observation.messages.some(m => m.text.includes('P0邀请')));
    assert.doesNotMatch(JSON.stringify(observation), /人类|玩家|is_human|\bHuman\b/i);
  }
  assert.deepEqual(game, original);
  const human = getHumanView(game);
  assert.equal(human.players[0].name, '玩家');
  assert.equal(human.players[0].is_human, true);
  assert.equal(human.ranking[0].name, '玩家');
  assert.ok(human.messages.some(m => m.text.includes('玩家邀请')));
});

test('identity-neutral Agent views preserve player-authored negotiation text verbatim', () => {
  const game = createGame({ id: 'negotiation-text', randomInt: () => 0 });
  const text = '我猜这个玩家是人类，这只是游戏里的说法。';
  applyAction(game, 'P0', { type: 'speech', message: text });
  const observation = getObservation(game, 'P1');
  assert.equal(observation.messages.find(m => m.from === 'P0').text, text);
  assert.equal(observation.players[0].name, 'P0');
});

test('finished observations derive strict winners for old saves without changing balances or stored ranks', () => {
  const game = createGame({ id: 'old-finish', randomInt: () => 0 });
  game.phase = 'FINISHED';
  game.ranking = game.players.map(p => ({ id: p.id, name: p.name, gold: 10, rank: 1 }));
  const original = structuredClone(game);
  assert.ok(getHumanView(game).ranking.every(p => p.is_winner === false));
  assert.deepEqual(game, original);
  game.players[2].gold = 11;
  for (const viewer of ['P0', 'P1', 'P2', 'P3']) {
    const ranking = getObservation(game, viewer).ranking;
    assert.deepEqual(ranking.filter(p => p.is_winner).map(p => p.id), ['P2']);
    assert.equal(ranking[0].gold, 11);
  }
});
