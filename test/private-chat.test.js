import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine.js';
import { getObservation, getHumanView } from '../src/observation.js';

const ids = ['P0', 'P1', 'P2', 'P3'];
function privateGame() {
  const game = engine.createGame({ id: 'chat', randomInt: () => 0 });
  for (const id of ids) engine.applyAction(game, id, { type: 'speech', message: '公开协商' }, () => 0, () => 1000);
  engine.applyAction(game, 'P0', { type: 'start_private_chat' }, () => 0, () => 1000);
  return game;
}

test('one public round opens exactly 30 seconds of private chat before registration', () => {
  const game = privateGame();
  assert.equal(game.phase, 'PRIVATE_CHAT');
  assert.equal(game.private_chat.started_at, 1000);
  assert.equal(game.private_chat.ends_at, 31000);
  assert.throws(() => engine.applyAction(game, 'P0', { type: 'register', task_id: 'A' }), /阶段/);
  assert.equal(engine.advanceTime(game, () => 30999), false);
  assert.equal(game.phase, 'PRIVATE_CHAT');
  assert.equal(engine.advanceTime(game, () => 31000), true);
  assert.equal(game.phase, 'REGISTRATION');
  const version = game.version;
  assert.equal(engine.advanceTime(game, () => 32000), false);
  assert.equal(game.version, version);
});

test('all roles share the same five-message outgoing limit across recipients', () => {
  const game = privateGame();
  for (const id of ids) {
    const recipients = ids.filter(other => other !== id);
    for (let i = 0; i < 5; i++) engine.applyAction(game, id, { type: 'private_message', to: recipients[i % 3], message: '谈合作' }, () => 0, () => 2000);
    assert.throws(() => engine.applyAction(game, id, { type: 'private_message', to: recipients[0], message: '第六条' }, () => 0, () => 2000), /5|次数|额度/);
    assert.equal(engine.privateMessagesSent(game, id), 5);
  }
  assert.equal(game.messages.filter(m => m.to).length, 20);
});

test('private chat is closed during public speech and after the deadline', () => {
  const game = engine.createGame({ id: 'closed', randomInt: () => 0 });
  assert.throws(() => engine.applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: '提前' }), /私聊/);
  for (const id of ids) engine.applyAction(game, id, { type: 'speech', message: '公开' }, () => 0, () => 1000);
  engine.applyAction(game, 'P0', { type: 'start_private_chat' }, () => 0, () => 1000);
  assert.throws(() => engine.applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: '过期' }, () => 0, () => 31000), /结束|私聊/);
  engine.advanceTime(game, () => 31000);
  assert.throws(() => engine.applyAction(game, 'P1', { type: 'private_message', to: 'P0', message: '报名时夹带' }), /私聊/);
});

test('invalid messages and Agent passes do not use quota; next day resets quota', () => {
  const game = privateGame();
  assert.throws(() => engine.applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: ' ' }, () => 0, () => 2000), /消息/);
  engine.applyAction(game, 'P1', { type: 'private_pass' }, () => 0, () => 2000);
  engine.applyAction(game, 'P0', { type: 'private_message', to: 'P1', message: '有效' }, () => 0, () => 2000);
  assert.equal(engine.privateMessagesSent(game, 'P0'), 1);
  assert.equal(engine.privateMessagesSent(game, 'P1'), 0);
  engine.advanceTime(game, () => 31000);
  ids.forEach(id => engine.applyAction(game, id, { type: 'register', task_id: 'A' }));
  engine.applyAction(game, 'P0', { type: 'lock_registration' });
  for (const actor of ['P1','P2','P3']) engine.applyAction(game, actor, { type:'reflect', day:game.current_day, summary:'当天结果已回顾。', lesson:'共同获利不等于独自获胜。', next_plan:'重新评估可见差距。' });
  engine.applyAction(game, 'P0', { type: 'next_day' }, () => 0);
  assert.equal(game.private_chat, null);
  assert.equal(engine.privateMessagesSent(game, 'P0'), 0);
});

test('observations expose only the viewers quota and visible private messages', () => {
  const game = privateGame();
  engine.applyAction(game, 'P1', { type: 'private_message', to: 'P2', message: '秘密计划' }, () => 0, () => 2000);
  game.private_chat.agent_last_seen.P1 = 7;
  const own = getObservation(game, 'P1', () => 2000);
  assert.equal(own.private_chat.remaining_messages, 4);
  assert.equal(own.private_chat.message_limit, 5);
  assert.equal(own.private_chat.ends_at, 31000);
  assert.equal(own.private_chat.agent_last_seen, undefined);
  const outsider = getObservation(game, 'P0', () => 2000);
  assert.equal(outsider.private_chat.remaining_messages, 5);
  assert.ok(!JSON.stringify(outsider).includes('秘密计划'));
});

test('hidden private messages and private thinking do not change an outsiders observable state', () => {
  const game = privateGame();
  const now = () => 2000;
  const humanBefore = getHumanView(game, now);
  const agentBefore = getObservation(game, 'P3', now);
  engine.applyAction(game, 'P1', { type: 'private_message', to: 'P2', message: '隐蔽协商' }, () => 0, now);
  game.thinking = ['P2'];
  assert.deepEqual(getHumanView(game, now), humanBefore);
  assert.deepEqual(getObservation(game, 'P3', now), agentBefore);
  engine.advanceTime(game, () => 31000);
  assert.match(game.messages.at(-1).id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
