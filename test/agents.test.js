import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createGame, applyAction, addMessage } from '../src/engine.js';
import { getObservation } from '../src/observation.js';
import { requestDecision, parseDecision } from '../src/agents.js';
import { loadConfig } from '../src/config.js';

test('parses model JSON with fences but rejects prose and arrays', () => {
  assert.deepEqual(parseDecision('```json\n{"amount":0}\n```'), { amount: 0 });
  assert.throws(() => parseDecision('抱歉我不能提供'), /JSON/);
  assert.throws(() => parseDecision('[]'), /JSON/);
});

test('gateway uses the chosen agent model and only its filtered observation', async t => {
  let received;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = { body: JSON.parse(body), path: req.url, auth: req.headers.authorization };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"message":"大家各出五枚吧","private_messages":[{"to":"P0","content":"我愿意和你组队"}]}' } }], usage: { total_tokens: 32 } }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const game = createGame({ id: 'model', randomInt: () => 1 });
  [...game.negotiation_order].forEach(id => applyAction(game, id, { type: 'speech', message: '公开协商' }));
  applyAction(game, 'P0', { type: 'start_private_chat' });
  applyAction(game, 'P2', { type: 'private_message', to: 'P3', message: '不能出现在林舟上下文里' });
  const config = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'test-only-key', models: { P1: 'model-one' }, timeoutMs: 1000 };
  const decision = await requestDecision(config, getObservation(game, 'P1'), 'speech');
  assert.equal(decision.action.message, '大家各出五枚吧');
  assert.equal(decision.fallback, false);
  assert.equal(received.path, '/v1/chat/completions');
  assert.equal(received.body.model, 'model-one');
  assert.equal(received.auth, 'Bearer test-only-key');
  assert.ok(!JSON.stringify(received.body).includes('不能出现在林舟上下文里'));
  assert.deepEqual(decision.privateMessages, []);
});

test('private model call sends one addressed message or passes without exposing other inboxes', async t => {
  let output = { to: 'P0', message: '我愿意和你合作' };
  let context;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    context = JSON.parse(JSON.parse(body).messages[1].content);
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const game = createGame({ id: 'private-adapter', randomInt: () => 0 });
  [...game.negotiation_order].forEach(id => applyAction(game, id, { type: 'speech', message: '协商' }));
  applyAction(game, 'P0', { type: 'start_private_chat' });
  applyAction(game, 'P2', { type: 'private_message', to: 'P3', message: '其他人的秘密' });
  const config = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'test-key', models: { P1: 'one' }, timeoutMs: 1000 };
  let result = await requestDecision(config, getObservation(game, 'P1'), 'private_chat');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.action, { type: 'private_message', to: 'P0', message: '我愿意和你合作' });
  assert.equal(context.private_chat.remaining_messages, 5);
  assert.ok(!JSON.stringify(context).includes('其他人的秘密'));
  output = { pass: true };
  result = await requestDecision(config, getObservation(game, 'P1'), 'private_chat');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.action, { type: 'private_pass' });
  output = { to: 'P1', message: '不能自发私聊' };
  result = await requestDecision(config, getObservation(game, 'P1'), 'private_chat');
  assert.equal(result.fallback, true);
  assert.deepEqual(result.action, { type: 'private_pass' });
});

test('invalid or unavailable model yields legal fallbacks without leaking its response', async () => {
  const game = createGame({ id: 'fallback', randomInt: () => 1 });
  const config = { apiKey: '', models: { P1: 'unavailable' } };
  const decision = await requestDecision(config, getObservation(game, 'P1'), 'register');
  assert.deepEqual(decision.action, { type: 'register', task_id: 'A' });
  assert.equal(decision.fallback, true);
  assert.equal(decision.code, 'missing_credentials');
});

test('agent can invest its entire integer balance but cannot overspend or submit fractions', async t => {
  let amount = 13;
  let context;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    context = JSON.parse(JSON.parse(body).messages[1].content);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ amount }) } }] }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const game = createGame({ id: 'whole-coins', randomInt: () => 1 });
  game.players[1].gold = 13;
  const config = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'test-key', models: { P1: 'test-model' }, timeoutMs: 1000 };
  const result = await requestDecision(config, getObservation(game, 'P1'), 'invest');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.action, { type: 'invest', amount: 13 });
  assert.equal(context.players[1].gold, 13);
  for (amount of [14, 1.5]) {
    const rejected = await requestDecision(config, getObservation(game, 'P1'), 'invest');
    assert.equal(rejected.fallback, true);
    assert.equal(rejected.code, 'invalid_action');
  }
});

test('loads model mapping and keeps secrets out of public config', () => {
  const config = loadConfig({ env: { AI_API_KEY: 'test-secret', AI_BASE_URL: 'https://example.com/v1', MODEL_P1: 'one', MODEL_P2: 'two', MODEL_P3: 'three' }, envPath: null });
  assert.equal(config.models.P3, 'three');
  assert.ok(!JSON.stringify(config.publicConfig).includes('test-secret'));
  assert.equal(config.publicConfig.configured, true);
});

test('every Agent action request presents four Agents without human controller metadata', async t => {
  let output;
  let received;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const game = createGame({ id: 'agent-identities', randomInt: () => 0 });
  [...game.negotiation_order].forEach(id => applyAction(game, id, { type: 'speech', message: '一起商量任务。' }));
  applyAction(game, 'P0', { type: 'start_private_chat' });
  addMessage(game, 'SYSTEM', '玩家邀请三名 Agent 重新评估报名。');
  game.vote_session = { candidate_ids: ['P0', 'P1', 'P2', 'P3'], votes: {} };
  const config = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'test-key', models: { P1: 'one', P2: 'two', P3: 'three' }, timeoutMs: 1000 };
  const actions = { speech: { message: '可以合作。' }, private_chat: { pass: true }, register: { task_id: 'A' }, vote: { target_id: 'P0' }, invest: { amount: 0 } };
  for (const id of ['P1', 'P2', 'P3']) {
    for (const [kind, value] of Object.entries(actions)) {
      output = value;
      const result = await requestDecision(config, getObservation(game, id), kind);
      assert.equal(result.fallback, false, `${id}/${kind}`);
      assert.doesNotMatch(JSON.stringify(received.messages), /人类|玩家|is_human|\bHuman\b/i, `${id}/${kind}`);
      assert.match(received.messages[0].content, /4名独立Agent/);
      const context = JSON.parse(received.messages[1].content);
      assert.equal(context.players.length, 4);
      assert.equal(context.players[0].name, 'P0');
      assert.equal(context.viewer_id, id);
    }
  }
});
