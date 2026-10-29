import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advanceTime } from '../src/engine.js';
import { getHumanView } from '../src/observation.js';
import { stageInfo, islandModel } from '../public/island-scene.js';

const ids = ['P0', 'P1', 'P2', 'P3'];
const now = () => 1000;
function registration(choices) {
  const game = createGame({ id: 'scene', randomInt: () => 0 });
  for (const id of game.negotiation_order) applyAction(game, id, { type: 'speech', message: '公开协商。' }, () => 0, now);
  advanceTime(game, () => 31000);
  choices?.forEach((task_id, index) => applyAction(game, ids[index], { type: 'register', task_id }));
  return game;
}
function locked(choices) {
  const game = registration(choices);
  applyAction(game, 'P0', { type: 'lock_registration' });
  return game;
}
const view = game => getHumanView(game, now);

test('daily guidance maps all real phases to the six visible steps', () => {
  const game = view(createGame({ id: 'guide', randomInt: () => 0 }));
  const steps = { NEGOTIATION: 0, PRIVATE_CHAT: 1, REGISTRATION: 2, VOTE_SPEECH: 3, VOTE_SUBMISSION: 3, INVESTMENT_SUBMISSION: 4, ROUND_UPDATE: 5, FINISHED: 5 };
  for (const [phase, step] of Object.entries(steps)) {
    game.phase = phase;
    const stage = stageInfo(game);
    assert.equal(stage.step, step, phase);
    assert.ok(stage.title && stage.hint && stage.actionLabel, phase);
  }
  assert.equal(stageInfo(null).step, -1);
  assert.equal(islandModel(null).roles.length, 4);
});

test('guidance distinguishes the players own turn and private voting/investment obligations', () => {
  const game = view(createGame({ id: 'turn', randomInt: () => 0 }));
  assert.equal(stageInfo(game).needsAction, true);
  game.current_speaker = 'P1';
  assert.equal(stageInfo(game).needsAction, false);
  const voting = view(locked(['C', 'C', 'C', 'C']));
  voting.phase = 'VOTE_SUBMISSION';
  assert.equal(stageInfo(voting).needsAction, true);
  voting.my_vote = 'P2';
  assert.equal(stageInfo(voting).needsAction, false);
  const investing = view(locked(['B', 'B', 'A', 'A']));
  assert.equal(stageInfo(investing).needsAction, true);
  investing.my_investment = 0;
  assert.equal(stageInfo(investing).needsAction, false);
});

test('secret registration hides all other destinations and counts even after everyone submits', () => {
  const game = view(registration(['B', 'A', 'B', 'C']));
  const alternate = structuredClone(game);
  game.registrations = { P0: 'B', P1: 'A', P2: 'B', P3: 'C' };
  alternate.registrations = { P0: 'B', P1: 'C', P2: 'C', P3: 'A' };
  assert.deepEqual(islandModel(game), islandModel(alternate));
  const model = islandModel(game);
  assert.equal(model.published, false);
  assert.equal(model.selectedTask, 'B');
  assert.ok(model.roles.every(role => role.location === 'camp'));
  assert.ok(model.tasks.every(task => task.roster.length === 0 && task.state === 'sealed'));
  assert.ok(model.roles.every(role => role.status === '已提交'));
});

test('no role destinations can leak during public or private conversation', () => {
  const game = view(registration());
  for (const phase of ['NEGOTIATION', 'PRIVATE_CHAT']) {
    game.phase = phase;
    game.registrations = { P0: 'A', P1: 'B', P2: 'B', P3: 'C' };
    const alternate = structuredClone(game);
    alternate.registrations = { P0: 'C', P1: 'A', P2: 'C', P3: 'C' };
    assert.deepEqual(islandModel(game), islandModel(alternate));
  }
});

test('private activity, hidden thoughts and scheduler metadata do not affect the scene', () => {
  const game = view(registration());
  game.phase = 'PRIVATE_CHAT';
  const alternate = structuredClone(game);
  alternate.messages.push({ from: 'P1', to: 'P2', text: '隐藏私聊' });
  alternate.thinking = ['P1', 'P3'];
  alternate.private_chat.agent_last_seen = { P1: 5 };
  alternate.version++;
  assert.deepEqual(islandModel(game), islandModel(alternate));
});

test('published A and formed teams occupy their sites while underfilled roles stay at camp', () => {
  const game = view(locked(['A', 'B', 'B', 'C']));
  const model = islandModel(game);
  assert.equal(model.published, true);
  assert.deepEqual(model.roles.map(role => role.location), ['A', 'B', 'B', 'camp']);
  assert.equal(model.roles[3].status, '未成队');
  assert.equal(model.tasks.find(task => task.id === 'B').state, 'working');
  assert.equal(model.tasks.find(task => task.id === 'C').state, 'cancelled');
});

test('oversubscribed candidates move to the contested site before a formal team exists', () => {
  const game = locked(['C', 'C', 'C', 'C']);
  const before = islandModel(view(game));
  assert.ok(before.roles.every(role => role.location === 'C'));
  assert.equal(before.roles.find(role => role.id === 'P0').speaking, true);
  assert.equal(before.tasks.find(task => task.id === 'C').state, 'contested');
  for (const id of ids) applyAction(game, id, { type: 'speech', message: '淘汰前发言。' });
  const ballot = view(game);
  const alternate = structuredClone(ballot);
  alternate.vote_session.votes = { P1: 'P3', P2: 'P0' };
  alternate.thinking = ['P2'];
  assert.deepEqual(islandModel(ballot), islandModel(alternate));
  for (const id of ids) applyAction(game, id, { type: 'vote', target_id: id === 'P3' ? 'P0' : 'P3' }, () => 0);
  const after = islandModel(view(game));
  assert.equal(after.roles.find(role => role.id === 'P3').location, 'camp');
  assert.equal(after.roles.find(role => role.id === 'P3').status, '已淘汰');
  assert.ok(after.roles.filter(role => role.id !== 'P3').every(role => role.location === 'C'));
});

test('other secret investment values or completion markers never drive the map', () => {
  const game = view(locked(['B', 'B', 'A', 'A']));
  const alternate = structuredClone(game);
  alternate.investments = { P1: 10, P2: 0 };
  alternate.thinking = ['P1'];
  assert.deepEqual(islandModel(game), islandModel(alternate));
  assert.equal(islandModel(game).roles.find(role => role.id === 'P1').status, '投入保密');
});

test('public settlement outcomes and public balance deltas animate without disclosing team details', () => {
  const game = locked(['A', 'C', 'C', 'C']);
  for (const id of ['P1', 'P2', 'P3']) applyAction(game, id, { type: 'invest', amount: 10 });
  const observation = view(game);
  assert.equal(observation.round_results[0].my_settlement, null);
  const model = islandModel(observation);
  assert.equal(model.tasks.find(task => task.id === 'C').state, 'success');
  assert.equal(model.tasks.find(task => task.id === 'A').state, 'success');
  assert.deepEqual(model.roles.map(role => role.delta), [2, 10, 10, 10]);
  assert.ok(!JSON.stringify(model).includes('investments'));
  assert.ok(!JSON.stringify(model).includes('reward_pool'));
});

test('failed tasks show public losses and new days clear old work and celebrations', () => {
  const game = locked(['B', 'B', 'A', 'A']);
  applyAction(game, 'P0', { type: 'invest', amount: 4 });
  applyAction(game, 'P1', { type: 'invest', amount: 5 });
  const result = islandModel(view(game));
  assert.equal(result.tasks.find(task => task.id === 'B').state, 'failed');
  assert.deepEqual(result.roles.map(role => role.delta), [-4, -5, 2, 2]);
  applyAction(game, 'P0', { type: 'next_day' }, () => 0);
  const next = islandModel(view(game));
  assert.ok(next.roles.every(role => role.location === 'camp' && role.delta === null));
  assert.ok(next.tasks.every(task => task.state === 'idle'));
});

test('settlement deltas use the previous public day and final tied winners gather at camp', () => {
  const game = view(createGame({ id: 'final-scene', randomInt: () => 0 }));
  game.phase = 'ROUND_UPDATE';
  game.current_day = 2;
  game.round_results = [{ day: 1, public_gold_balances: { P0: 13, P1: 13, P2: 10, P3: 10 } }, { day: 2, public_gold_balances: { P0: 15, P1: 15, P2: 12, P3: 12 }, registrations: {}, task_statuses: {} }];
  assert.deepEqual(islandModel(game).roles.map(role => role.delta), [2, 2, 2, 2]);
  game.phase = 'FINISHED';
  game.ranking = ids.map(id => ({ id, rank: 1, gold: 26 }));
  const final = islandModel(game);
  assert.ok(final.roles.every(role => role.winner && role.location === 'camp'));
});
