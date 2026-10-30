import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine.js';
import { getHumanView } from '../src/observation.js';
import { stageInfo, islandModel } from '../public/island-scene.js';
import { loadConfig } from '../src/config.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { noticeEvents } from '../public/phase-notice.js';

test('automatic client cannot submit a manual action even when invoked directly', async () => {
  const code = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const actionCode = code.slice(code.indexOf('async function action(value)'), code.indexOf('async function newGame('));
  let requests = 0;
  const context = vm.createContext({ game: { id: 'auto-ui', play_mode: 'auto', current_day: 1 }, busy: false, render() {}, toast() {}, crypto: { randomUUID: () => 'forged' }, api: async () => { requests++; return {}; }, accept() {} });
  vm.runInContext(actionCode, context);
  await context.action({ type: 'speech', message: '手动插入' });
  assert.equal(requests, 0);
});

test('automatic stage guidance never requests human actions and names the selected proxy', () => {
  const game = getHumanView(createGame({ id: 'auto-guidance', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 }));
  game.vote_session = { candidate_ids: ['P0', 'P1', 'P2', 'P3'], vote_round: 1 };
  game.reflection_status = { complete: false, agents: { P0: 'pending', P1: 'pending', P2: 'pending', P3: 'pending' } };
  for (const phase of ['NEGOTIATION', 'PRIVATE_CHAT_READY', 'PRIVATE_CHAT', 'REGISTRATION', 'VOTE_SPEECH', 'VOTE_SUBMISSION', 'INVESTMENT_SUBMISSION', 'ROUND_UPDATE', 'FINISHED']) {
    game.phase = phase;
    const stage = stageInfo(game);
    assert.equal(stage.needsAction, false, phase);
    assert.doesNotMatch(stage.hint, /轮到你|由你|手动|等待你|填写淘汰票/, phase);
    assert.ok(['watch', 'reflection', 'results'].includes(stage.actionKind), phase);
  }
  game.phase = 'NEGOTIATION';
  assert.match(stageInfo(game).hint, /阿木/);
  assert.equal(islandModel(game).roles[0].name, '阿木');
  game.automation_status = 'stopped';
  assert.match(stageInfo(game).title, /停止/);
});

test('setup offers manual by default and all ten personas without a model selector', async () => {
  const { setupForm, newGameSettings } = await import('../public/play-mode.js');
  const config = loadConfig({ env: { MODEL_P1: 'default-proxy' }, envPath: null }).publicConfig;
  const html = setupForm(config);
  assert.match(html, /value="manual" checked/);
  assert.match(html, /value="auto"/);
  assert.match(html, /value="NPC-05"[^>]*>阿木/);
  assert.match(html, /default-proxy/);
  assert.doesNotMatch(html, /name="model"/);
  assert.deepEqual(newGameSettings(new Map([['play_mode', 'manual'], ['proxy_npc_id', 'NPC-05']])), { play_mode: 'manual' });
  assert.deepEqual(newGameSettings(new Map([['play_mode', 'auto'], ['proxy_npc_id', 'NPC-05']])), { play_mode: 'auto', proxy_npc_id: 'NPC-05' });
});

test('auto ending announces either a unique named winner or nobody winning a top tie', () => {
  const game = getHumanView(createGame({ id: 'auto-ending', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 }));
  game.phase = 'FINISHED';
  game.ranking = game.players.map(p => ({ ...p, rank: 1, is_winner: false }));
  assert.match(stageInfo(game).hint, /无人获胜/);
  game.ranking[0].is_winner = true;
  assert.match(stageInfo(game).hint, /阿木.*唯一胜利者/);
});

test('automatic public-end notices describe automatic private startup without a manual command', () => {
  const previous = { id: 'auto-notice', phase_events: [] };
  const next = { id: 'auto-notice', play_mode: 'auto', phase_events: [{ id: 'public-end', day: 1, from: 'NEGOTIATION', to: 'PRIVATE_CHAT_READY' }] };
  const notices = noticeEvents(previous, next);
  assert.equal(notices.length, 1);
  assert.match(notices[0].detail, /自动/);
  assert.doesNotMatch(notices[0].detail, /点击|准备好后/);
});

test('new-game dialog retains a proxy selected by name when human view omits NPC ID', async () => {
  const { setupForm } = await import('../public/play-mode.js');
  const game = getHumanView(createGame({ id: 'keep-proxy', mode: 'auto', proxyNpcId: 'NPC-05', randomInt: () => 0 }));
  assert.equal(game.players[0].npc_id, undefined);
  const code = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const openCode = code.slice(code.indexOf('function openSetup()'), code.indexOf('async function submitSetup('));
  const content = { innerHTML: '' }; let opened = false;
  const context = vm.createContext({ game, config: loadConfig({ env: {}, envPath: null }).publicConfig, setupOptions: {}, setupForm, $: selector => selector === '#new-game-content' ? content : { showModal() { opened = true; } } });
  vm.runInContext(openCode, context); context.openSetup();
  assert.equal(opened, true);
  assert.match(content.innerHTML, /value="NPC-05" selected/);
});
