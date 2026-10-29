import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createGame, applyAction } from '../src/engine.js';
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
  applyAction(game, 'P2', { type: 'private_message', to: 'P3', message: '不能出现在林舟上下文里' });
  const config = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'test-only-key', models: { P1: 'model-one' }, timeoutMs: 1000 };
  const decision = await requestDecision(config, getObservation(game, 'P1'), 'speech');
  assert.equal(decision.action.message, '大家各出五枚吧');
  assert.equal(decision.fallback, false);
  assert.equal(received.path, '/v1/chat/completions');
  assert.equal(received.body.model, 'model-one');
  assert.equal(received.auth, 'Bearer test-only-key');
  assert.ok(!JSON.stringify(received.body).includes('不能出现在林舟上下文里'));
});

test('invalid or unavailable model yields legal fallbacks without leaking its response', async () => {
  const game = createGame({ id: 'fallback', randomInt: () => 1 });
  const config = { apiKey: '', models: { P1: 'unavailable' } };
  const decision = await requestDecision(config, getObservation(game, 'P1'), 'register');
  assert.deepEqual(decision.action, { type: 'register', task_id: 'A' });
  assert.equal(decision.fallback, true);
  assert.equal(decision.code, 'missing_credentials');
});

test('loads model mapping and keeps secrets out of public config', () => {
  const config = loadConfig({ env: { AI_API_KEY: 'test-secret', AI_BASE_URL: 'https://example.com/v1', MODEL_P1: 'one', MODEL_P2: 'two', MODEL_P3: 'three' }, envPath: null });
  assert.equal(config.models.P3, 'three');
  assert.ok(!JSON.stringify(config.publicConfig).includes('test-secret'));
  assert.equal(config.publicConfig.configured, true);
});
