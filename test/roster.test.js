import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterNames, personaLabel } from '../public/roster.js';
import { createGame } from '../src/engine.js';
import { getHumanView } from '../src/observation.js';
import { islandModel, stageInfo } from '../public/island-scene.js';

test('client names, persona labels and map guidance follow the current roster across games', () => {
  const game = getHumanView(createGame({ id: 'client-roster', randomInt: max => max - 1 }));
  const names = rosterNames(game);
  assert.equal(names.P1, '楚衍');
  assert.equal(names.P2, '陆衡');
  assert.equal(names.P3, '江隐');
  assert.equal(personaLabel(game.players[1]), '适应性变色龙');
  assert.match(stageInfo(game).hint, /江隐/);
  const scene = islandModel(game);
  assert.deepEqual(scene.roles.slice(1).map(p => p.name), ['楚衍', '陆衡', '江隐']);
  const other = getHumanView(createGame({ id: 'other-client-roster', randomInt: () => 0 }));
  assert.equal(rosterNames(other).P1, '林舟');
  assert.equal(names.P1, '楚衍');
});

test('old-save names and neutral welcome seats need no global character-to-seat assumptions', () => {
  const names = rosterNames({ players: [{ id: 'P0', name: '玩家' }, { id: 'P1', name: '旧林舟' }, { id: 'P2', name: '沈默' }, { id: 'P3', name: '顾寒' }] });
  assert.equal(names.P1, '旧林舟');
  assert.equal(names.P2, '沈默');
  assert.equal(personaLabel({ name: '旧林舟' }), '独立Agent');
  assert.deepEqual(rosterNames(null), { P0: '玩家', P1: 'P1', P2: 'P2', P3: 'P3', SYSTEM: '岛屿广播' });
  assert.deepEqual(islandModel(null).roles.slice(1).map(p => p.name), ['P1', 'P2', 'P3']);
});
