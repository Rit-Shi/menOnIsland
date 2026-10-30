import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createGame, applyAction } from '../src/engine.js';
import { getHumanView } from '../src/observation.js';

test('a delayed previous-game poll cannot replace a new roster and actions identify their game', async () => {
  const previous = createGame({ id: 'previous-game', randomInt: () => 0 });
  const current = createGame({ id: 'current-game', randomInt: max => max - 1 });
  for (const game of [previous, current]) {
    for (const id of game.negotiation_order) applyAction(game, id, { type: 'speech', message: '开始协商。' });
    applyAction(game, 'P0', { type: 'start_private_chat' });
  }
  let release, submitted;
  const delayed = new Promise(resolve => { release = resolve; });
  const code = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const controls = code.slice(code.indexOf('function accept(next)'), code.indexOf('function islandMap()'));
  const polling = code.slice(code.indexOf('async function poll()'), code.indexOf("try { config = await api('/api/config'); }"));
  const context = vm.createContext({
    game: getHumanView(previous), gameGeneration: 0, busy: false, polling: false,
    channel: 'P1', drafts: { 'private-P1': '给旧阵容林舟的草稿' },
    serverClockOffset: 0, document: { hidden: false }, window: { confirm: () => true },
    crypto: { randomUUID: () => 'new-roster-message' },
    render() {}, toast() {}, noticeEvents: () => [], phaseNotices: { reset() {}, enqueue() {} },
    api: async (path, body) => {
      if (path === '/api/state') return delayed;
      if (path === '/api/games') return getHumanView(current);
      if (path === '/api/action') { submitted = body; applyAction(current, 'P0', body.action); return getHumanView(current); }
      throw new Error(`Unexpected ${path}`);
    },
  });
  vm.runInContext(controls + '\n' + polling, context);
  const pending = context.poll();
  await context.newGame();
  assert.equal(context.game.id, 'current-game');
  assert.equal(context.game.players[1].name, '楚衍');
  assert.deepEqual(Object.keys(context.drafts), []);
  release(getHumanView(previous));
  await pending;
  assert.equal(context.game.id, 'current-game');
  assert.equal(context.game.players[1].name, '楚衍');
  await context.action({ type: 'private_message', to: 'P1', message: '明确发给本局楚衍。' });
  assert.equal(submitted.expected_game_id, 'current-game');
  assert.ok(current.messages.some(m => m.to === 'P1' && m.text === '明确发给本局楚衍。'));
});
