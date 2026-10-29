import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, applyAction, advanceTime, privateMessagesSent } from '../src/engine.js';
import { getObservation, getHumanView } from '../src/observation.js';
import { requestDecision } from '../src/agents.js';
import { GameStore } from '../src/store.js';
import { createRunner } from '../src/runner.js';

async function fixture(t, respond) {
  const directory = await mkdtemp(join(tmpdir(), 'island-model-trace-'));
  const requests = [];
  const gateway = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    await respond(req, res, requests.length);
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const game = createGame({ id: 'model-trace', randomInt: () => 0 });
  for (const id of game.negotiation_order) applyAction(game, id, { type: 'speech', message: '公开协商' });
  advanceTime(game, () => game.private_chat.ends_at);
  const config = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'private-test-credential', models: { P1: 'one', P2: 'two', P3: 'three' }, timeoutMs: 1000, dataDir: directory };
  const logs = async () => (await readFile(join(directory, 'model-calls', 'model-trace.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  return { game, config, directory, requests, logs };
}
function reply(res, content, finishReason = 'stop') {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('x-request-id', 'provider-request-123');
  res.end(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { role: 'assistant', content } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
}

test('private model logs retain stage, request, raw output, finish reason and correlation without credentials', async t => {
  const f = await fixture(t, (_req, res) => reply(res, '{"task_id":"B"}'));
  const result = await requestDecision(f.config, getObservation(f.game, 'P1'), 'register');
  assert.equal(result.fallback, false);
  const records = await f.logs();
  const attempt = records.find(record => record.event === 'model_attempt');
  assert.equal(attempt.game_id, f.game.id);
  assert.equal(attempt.day, 1);
  assert.equal(attempt.phase, 'REGISTRATION');
  assert.equal(attempt.kind, 'register');
  assert.equal(attempt.actor_id, 'P1');
  assert.equal(attempt.model, 'one');
  assert.equal(attempt.attempt, 1);
  assert.equal(attempt.call_id, result.trace.call_id);
  assert.equal(attempt.response.content, '{"task_id":"B"}');
  assert.equal(attempt.response.finish_reason, 'stop');
  assert.equal(attempt.response.request_id, 'provider-request-123');
  assert.equal(attempt.response.usage.total_tokens, 30);
  assert.equal(attempt.response.http_status, 200);
  assert.equal(attempt.outcome, 'valid');
  assert.ok(attempt.elapsed_ms >= 0);
  assert.equal(JSON.parse(attempt.request.messages[1].content).viewer_id, 'P1');
  assert.ok(!JSON.stringify(records).includes(f.config.apiKey));
  assert.ok(!JSON.stringify(records).includes('Authorization'));
});

test('malformed and empty responses record the exact output and a useful parse error', async t => {
  for (const content of ['{"task_id":', '', null]) {
    const f = await fixture(t, (_req, res) => reply(res, content, 'length'));
    const result = await requestDecision(f.config, getObservation(f.game, 'P2'), 'register');
    assert.equal(result.code, 'invalid_JSON');
    const attempts = (await f.logs()).filter(record => record.event === 'model_attempt');
    assert.equal(attempts[0].response.content, content);
    assert.equal(attempts[0].response.finish_reason, 'length');
    assert.equal(attempts[0].outcome, 'invalid_JSON');
    assert.ok(attempts[0].error_detail.length > 0);
  }
});

test('HTTP and invalid gateway envelopes remain distinguishable from malformed model JSON', async t => {
  const f = await fixture(t, (_req, res, attempt) => {
    res.statusCode = attempt === 1 ? 401 : 200;
    res.end(attempt === 1 ? '{"error":"unauthorized"}' : 'not a gateway JSON envelope');
  });
  const first = await requestDecision(f.config, getObservation(f.game, 'P1'), 'register');
  assert.equal(first.code, 'http_401');
  const second = await requestDecision(f.config, getObservation(f.game, 'P1'), 'register');
  assert.equal(second.code, 'invalid_gateway_response');
  const attempts = (await f.logs()).filter(record => record.event === 'model_attempt');
  assert.equal(attempts[0].response.http_status, 401);
  assert.equal(attempts[0].response.body, '{"error":"unauthorized"}');
  assert.equal(attempts[1].response.body, 'not a gateway JSON envelope');
});

test('concurrent log writes preserve JSONL records and redact credentials even when echoed by the model', async t => {
  const { writeModelLog } = await import('../src/model-log.js');
  const f = await fixture(t, (_req, res) => reply(res, '{"task_id":"A"}'));
  await Promise.all(Array.from({ length: 15 }, (_, index) => writeModelLog(f.config, { event: 'test', game_id: f.game.id, index, response: { content: `private text ${f.config.apiKey}` } })));
  const records = await f.logs();
  assert.equal(records.length, 15);
  assert.equal(new Set(records.map(record => record.index)).size, 15);
  assert.ok(!JSON.stringify(records).includes(f.config.apiKey));
  assert.ok(records.every(record => record.response.content.includes('[REDACTED]')));
  assert.equal(await writeModelLog(f.config, { game_id: '../outside', event: 'test' }), false);
});

test('log storage failure cannot turn a valid action into a fallback', async t => {
  const f = await fixture(t, (_req, res) => reply(res, '{"task_id":"B"}'));
  const blocked = join(f.directory, 'not-a-directory');
  await writeFile(blocked, 'file blocks directory creation');
  const notices = [];
  t.mock.method(console, 'error', message => notices.push(message));
  const result = await requestDecision({ ...f.config, dataDir: blocked }, getObservation(f.game, 'P1'), 'register');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.action, { type: 'register', task_id: 'B' });
  assert.ok(notices.some(message => message.includes('[model-log]')));
  assert.ok(!notices.join('').includes(f.config.apiKey));
});

test('only safe diagnostic summaries can appear in human views, and no diagnostics enter Agent context', () => {
  const game = createGame({ id: 'private-log-view', randomInt: () => 0 });
  game.phase = 'ROUND_UPDATE';
  game.diagnostics.push({ day: 1, actor_id: 'P2', model: 'two', code: 'invalid_JSON', phase: 'PRIVATE_CHAT', kind: 'private_chat', attempt_count: 3, recovered: false, raw_response: 'PRIVATE_TRACE_SECRET', action: { to: 'P3', message: 'HIDDEN_PRIVATE' }, request: 'HIDDEN_REQUEST' });
  const human = getHumanView(game);
  assert.equal(human.diagnostics[0].phase, 'PRIVATE_CHAT');
  assert.equal(human.diagnostics[0].kind, 'private_chat');
  assert.equal(human.diagnostics[0].attempt_count, 3);
  assert.ok(!/PRIVATE_TRACE_SECRET|HIDDEN_PRIVATE|HIDDEN_REQUEST/.test(JSON.stringify(human)));
  assert.equal(getObservation(game, 'P1').diagnostics, undefined);
});

test('runner correlates actual submissions with model attempts and records the failed action stage', async t => {
  const f = await fixture(t, (_req, res) => {
    const actor = JSON.parse(f.requests.at(-1).messages[1].content).viewer_id;
    reply(res, actor === 'P2' ? 'not JSON' : '{"task_id":"B"}');
  });
  const store = new GameStore(f.directory);
  await store.save(f.game);
  const runner = createRunner({ store, config: f.config });
  t.after(() => runner.close());
  await runner.kick(f.game.id);
  await runner.idle();
  const game = await store.load(f.game.id);
  assert.equal(game.registrations.P2, 'A');
  assert.equal(game.diagnostics[0].phase, 'REGISTRATION');
  assert.equal(game.diagnostics[0].kind, 'register');
  assert.ok(game.diagnostics[0].attempt_count >= 1);
  const records = await f.logs();
  const submissions = records.filter(record => record.event === 'submission');
  assert.equal(submissions.length, 3);
  for (const record of submissions) assert.ok(records.some(attempt => attempt.event === 'model_attempt' && attempt.call_id === record.call_id));
  assert.equal(submissions.find(record => record.actor_id === 'P2').outcome, 'fallback_applied');
  assert.equal(submissions.find(record => record.actor_id === 'P1').outcome, 'applied');
  const view = getObservation(game, 'P0');
  assert.deepEqual(view.registrations, {});
  assert.ok(!JSON.stringify(view).includes('not JSON'));
});

test('malformed JSON is returned to the same Agent for correction before any fallback', async t => {
  const f = await fixture(t, (_req, res, count) => reply(res, count === 1 ? '{"task_id":' : '{"task_id":"B"}'));
  f.game.registrations.P2 = 'C';
  const observation = getObservation(f.game, 'P1');
  const result = await requestDecision(f.config, observation, 'register');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.action, { type: 'register', task_id: 'B' });
  assert.equal(result.trace.attempt_count, 2);
  assert.deepEqual(result.trace.error_codes, ['invalid_JSON']);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests[1].messages.slice(0, 2), f.requests[0].messages);
  assert.deepEqual(f.requests[1].messages[2], { role: 'assistant', content: '{"task_id":' });
  assert.match(f.requests[1].messages[3].content, /invalid_JSON/);
  assert.match(f.requests[1].messages[3].content, /未提交/);
  assert.match(f.requests[1].messages[3].content, /task_id/);
  assert.deepEqual(JSON.parse(f.requests[1].messages[1].content).registrations, {});
  const records = await f.logs();
  const attempts = records.filter(record => record.event === 'model_attempt');
  assert.deepEqual(attempts.map(record => record.outcome), ['invalid_JSON', 'valid']);
  assert.equal(attempts[0].will_retry, true);
  assert.equal(records.find(record => record.event === 'decision_result').fallback, false);
});

test('illegal investment receives the precise valid range and can be resubmitted', async t => {
  const f = await fixture(t, (_req, res, count) => reply(res, JSON.stringify({ amount: count === 1 ? 11 : 5 })));
  const result = await requestDecision(f.config, getObservation(f.game, 'P1'), 'invest');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.action, { type: 'invest', amount: 5 });
  assert.deepEqual(result.trace.error_codes, ['invalid_action']);
  assert.match(f.requests[1].messages.at(-1).content, /0.*10/);
  assert.match(f.requests[1].messages.at(-1).content, /整数/);
});

test('three rejected attempts produce one terminal fallback and complete diagnostic history', async t => {
  const f = await fixture(t, (_req, res) => reply(res, 'bad output', 'length'));
  const result = await requestDecision(f.config, getObservation(f.game, 'P1'), 'register');
  assert.equal(f.requests.length, 3);
  assert.equal(result.fallback, true);
  assert.deepEqual(result.action, { type: 'register', task_id: 'A' });
  assert.equal(result.trace.attempt_count, 3);
  const records = await f.logs();
  const attempts = records.filter(record => record.event === 'model_attempt');
  assert.deepEqual(attempts.map(record => record.will_retry), [true, true, false]);
  const final = records.find(record => record.event === 'decision_result');
  assert.equal(final.fallback, true);
  assert.equal(final.attempt_count, 3);
});

test('authentication failures do not retry, but a transient provider error may recover', async t => {
  const denied = await fixture(t, (_req, res) => { res.statusCode = 401; res.end('denied'); });
  const first = await requestDecision(denied.config, getObservation(denied.game, 'P1'), 'register');
  assert.equal(first.code, 'http_401');
  assert.equal(denied.requests.length, 1);
  const transient = await fixture(t, (_req, res, count) => {
    if (count === 1) { res.statusCode = 503; res.end('temporarily unavailable'); }
    else reply(res, '{"task_id":"C"}');
  });
  const recovered = await requestDecision(transient.config, getObservation(transient.game, 'P1'), 'register');
  assert.equal(recovered.fallback, false);
  assert.equal(recovered.trace.attempt_count, 2);
  assert.deepEqual(recovered.trace.error_codes, ['http_503']);
  assert.equal(transient.requests[1].messages.length, 2);
});

test('correction attempts share the original timeout rather than resetting it', async t => {
  const f = await fixture(t, async (_req, res, count) => {
    await new Promise(resolve => setTimeout(resolve, 150));
    reply(res, count === 1 ? 'bad output' : '{"task_id":"B"}');
  });
  const result = await requestDecision({ ...f.config, timeoutMs: 250 }, getObservation(f.game, 'P1'), 'register');
  assert.equal(result.code, 'timeout');
  assert.equal(result.fallback, true);
  assert.equal(f.requests.length, 2);
  assert.equal(result.trace.attempt_count, 2);
  assert.deepEqual(result.trace.error_codes, ['invalid_JSON', 'timeout']);
});

test('explicit cancellation prevents retries and is recorded separately from a timeout', async t => {
  const controller = new AbortController();
  const f = await fixture(t, (_req, res, count) => {
    if (count === 1) reply(res, 'bad output');
    else { controller.abort(); res.end('cancelled'); }
  });
  const result = await requestDecision(f.config, getObservation(f.game, 'P1'), 'register', { signal: controller.signal });
  assert.equal(result.code, 'aborted');
  assert.equal(f.requests.length, 2);
  assert.equal((await f.logs()).find(record => record.event === 'decision_result').code, 'aborted');
  controller.abort();
  const before = f.requests.length;
  const alreadyCancelled = await requestDecision(f.config, getObservation(f.game, 'P1'), 'register', { signal: controller.signal });
  assert.equal(alreadyCancelled.trace.attempt_count, 0);
  assert.equal(f.requests.length, before);
});

test('correcting a private reply commits one message and consumes one quota slot', async t => {
  let p1Requests = 0;
  const f = await fixture(t, (_req, res) => {
    const actor = JSON.parse(f.requests.at(-1).messages[1].content).viewer_id;
    reply(res, actor !== 'P1' ? '{"pass":true}' : ++p1Requests === 1 ? 'PRIVATE_INVALID_OUTPUT' : '{"to":"P0","message":"纠正后只发送一次"}');
  });
  f.game.phase = 'PRIVATE_CHAT';
  const store = new GameStore(f.directory);
  await store.save(f.game);
  const runner = createRunner({ store, config: f.config });
  t.after(() => runner.close());
  await runner.kick(f.game.id);
  await runner.idle();
  const game = await store.load(f.game.id);
  assert.equal(privateMessagesSent(game, 'P1'), 1);
  assert.equal(game.messages.filter(message => message.text === '纠正后只发送一次').length, 1);
  assert.equal(p1Requests, 2);
  assert.ok(!JSON.stringify(game.messages).includes('PRIVATE_INVALID_OUTPUT'));
  assert.equal(game.diagnostics[0].recovered, true);
  assert.equal(game.diagnostics[0].phase, 'PRIVATE_CHAT');
  assert.equal(game.diagnostics[0].attempt_count, 2);
  assert.equal((await f.logs()).filter(record => record.event === 'submission' && record.actor_id === 'P1').length, 1);
});

test('investment correction is applied once and still waits for the human submission', async t => {
  const f = await fixture(t, (_req, res, count) => reply(res, JSON.stringify({ amount: count === 1 ? 11 : 5 })));
  ['B', 'B', 'A', 'A'].forEach((task_id, index) => applyAction(f.game, ['P0', 'P1', 'P2', 'P3'][index], { type: 'register', task_id }));
  applyAction(f.game, 'P0', { type: 'lock_registration' });
  const store = new GameStore(f.directory);
  await store.save(f.game);
  const runner = createRunner({ store, config: f.config });
  t.after(() => runner.close());
  await runner.kick(f.game.id);
  await runner.idle();
  const game = await store.load(f.game.id);
  assert.equal(game.phase, 'INVESTMENT_SUBMISSION');
  assert.deepEqual(game.investments, { P1: 5 });
  applyAction(game, 'P0', { type: 'invest', amount: 5 });
  assert.deepEqual(game.players.map(player => player.gold), [13, 13, 12, 12]);
  assert.equal(game.diagnostics[0].recovered, true);
  const submissions = (await f.logs()).filter(record => record.event === 'submission');
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].outcome, 'applied');
});

test('illegal structured promises are corrected rather than silently removed', async t => {
  const f = await fixture(t, (_req, res, count) => reply(res, JSON.stringify({ message: '我愿意合作。', promise: { task_id: 'B', amount: count === 1 ? 11 : 5 } })));
  const game = createGame({ id: f.game.id, randomInt: () => 1 });
  const result = await requestDecision(f.config, getObservation(game, 'P1'), 'speech');
  assert.equal(result.fallback, false);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(result.action.promise, { task_id: 'B', amount: 5 });
  assert.deepEqual(result.trace.error_codes, ['invalid_action']);
});

test('private deadline cancels an in-progress correction without sending it or spending quota', async t => {
  let time = 1000;
  let p1Requests = 0;
  let correctionStarted;
  const started = new Promise(resolve => { correctionStarted = resolve; });
  const f = await fixture(t, (_req, res) => {
    const context = JSON.parse(f.requests.at(-1).messages[1].content);
    if (context.phase === 'REGISTRATION') return reply(res, '{"task_id":"A"}');
    if (context.viewer_id !== 'P1') return reply(res, '{"pass":true}');
    if (++p1Requests === 1) return reply(res, 'PRIVATE_BAD_FORMAT');
    correctionStarted();
    // The response stays pending until expiry aborts the adapter's shared signal.
  });
  f.game.phase = 'PRIVATE_CHAT';
  f.game.private_chat.started_at = 1000;
  f.game.private_chat.ends_at = 31000;
  const store = new GameStore(f.directory);
  await store.save(f.game);
  const runner = createRunner({ store, config: f.config, now: () => time });
  t.after(() => runner.close());
  await runner.kick(f.game.id);
  await started;
  time = 31000;
  await runner.kick(f.game.id);
  await runner.idle();
  const game = await store.load(f.game.id);
  assert.equal(game.phase, 'REGISTRATION');
  assert.equal(privateMessagesSent(game, 'P1'), 0);
  assert.equal(p1Requests, 2);
  assert.deepEqual(game.registrations, { P1: 'A', P2: 'A', P3: 'A' });
  assert.equal(game.diagnostics.length, 0);
  const records = await f.logs();
  assert.ok(records.some(record => record.event === 'submission' && record.actor_id === 'P1' && record.kind === 'private_chat' && record.outcome === 'discarded'));
});
