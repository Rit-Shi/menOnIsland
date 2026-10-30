import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createGame, applyAction, addMessage } from '../src/engine.js';
import { getObservation } from '../src/observation.js';
import { requestDecision, parseDecision } from '../src/agents.js';
import { loadConfig } from '../src/config.js';

test('private requests use saved character identity and current seat-name routing with seat-bound models', async t => {
  let output = { to: 'P2', message: '与本局的楚衍协商。' };
  let request;
  const gateway = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    request = JSON.parse(body);
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const game = createGame({ id: 'reseated-private', randomInt: () => 0 });
  Object.assign(game.players[1], { name: '苏燃', npc_id: 'NPC-04', code_name: '复仇者', personality: '重视承诺、记住亲历的违约，发言直率。' });
  Object.assign(game.players[2], { name: '楚衍', npc_id: 'NPC-10', code_name: '适应性变色龙', personality: '结合排名调整策略，前期合作，后期灵活。' });
  Object.assign(game.players[3], { name: '阿木', npc_id: 'NPC-05', code_name: '天真理想主义者', personality: '愿意信任和承担公平份额。' });
  for (const id of game.negotiation_order) applyAction(game, id, { type: 'speech', message: '共同讨论。' });
  applyAction(game, 'P0', { type: 'start_private_chat' });
  const cfg = { baseUrl: `http://127.0.0.1:${gateway.address().port}/v1`, apiKey: 'offline-only', models: { P1: 'model-one', P2: 'model-two', P3: 'model-three' }, timeoutMs: 1000 };
  for (const [seat, name, model] of [['P1', '苏燃', 'model-one'], ['P2', '楚衍', 'model-two'], ['P3', '阿木', 'model-three']]) {
    output = { to: 'P0', message: '商量今天的策略。' };
    const result = await requestDecision(cfg, getObservation(game, seat), 'private_chat');
    assert.equal(result.fallback, false);
    assert.equal(request.model, model);
    assert.ok(request.messages[0].content.includes(`你是${name}`));
    assert.ok(request.messages[0].content.includes(game.players.find(p => p.id === seat).personality));
    assert.doesNotMatch(JSON.stringify(request.messages), /人类|is_human|\bHuman\b/);
  }
  for (const recipient of ['P2', '楚衍']) {
    output = { to: recipient, message: `只发给楚衍：${recipient}` };
    const result = await requestDecision(cfg, getObservation(game, 'P1'), 'private_chat');
    assert.equal(result.fallback, false);
    assert.equal(result.action.to, 'P2');
    assert.match(request.messages[0].content, /P2（楚衍）/);
    assert.doesNotMatch(request.messages[0].content, /P2（沈默）/);
    applyAction(game, 'P1', result.action);
    assert.ok(getObservation(game, 'P2').messages.some(m => m.to === 'P2' && m.text === output.message));
    assert.ok(!getObservation(game, 'P3').messages.some(m => m.text === output.message));
  }
  output = { to: '林舟', message: '本局不存在的角色。' };
  const rejected = await requestDecision(cfg, getObservation(game, 'P1'), 'private_chat');
  assert.equal(rejected.fallback, true);
  assert.equal(rejected.code, 'invalid_action');
});

test('reflection JSON is corrected, bound to the current day and passed back without forging its source',async t=>{
  let attempts=0;let invalid=false;const requests=[];
  const gateway=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
    const output=++attempts===1||invalid?{summary:'',lesson:'不完整'}:{day:99,source:'fallback',summary:'今天自己的选择没有拉开金币差距。',lesson:'共同获利不等于获胜。',next_plan:'评估有利于独占第一的合作条件。'};
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
  });
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>gateway.close(resolve)));
  const game=createGame({id:'reflection-adapter',randomInt:()=>0});game.phase='ROUND_UPDATE';
  game.round_results=[{day:1,public_gold_balances:{P0:12,P1:12,P2:12,P3:12},registrations:{P1:'A'},registration_status:{},settlements:{},net_changes:{P1:2},vote_results:[]}];
  const cfg={baseUrl:`http://127.0.0.1:${gateway.address().port}/v1`,apiKey:'offline-test',models:{P1:'one'},timeoutMs:1000};
  const result=await requestDecision(cfg,getObservation(game,'P1'),'reflect');
  assert.equal(result.fallback,false);assert.equal(result.trace.attempt_count,2);
  assert.equal(result.action.type,'reflect');assert.equal(result.action.day,1);assert.equal(result.action.source,undefined);
  assert.equal(requests[1].messages.length,4);assert.ok(JSON.parse(requests[0].messages[1].content).round_results[0].my_net_change===2);
  invalid=true;
  const failed=await requestDecision(cfg,getObservation(game,'P1'),'reflect');
  assert.equal(failed.fallback,true);assert.equal(failed.trace.attempt_count,3);
  assert.equal(failed.action.type,'reflect');assert.match(failed.action.summary,/未能成功生成/);
});

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
