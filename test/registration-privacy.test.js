import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advanceTime } from '../src/engine.js';
import { getObservation, getHumanView } from '../src/observation.js';

const ids = ['P0', 'P1', 'P2', 'P3'];
function openRegistration(game = createGame({ id: 'secret-registration', randomInt: () => 0 })) {
  [...game.negotiation_order].forEach(id => applyAction(game, id, { type: 'speech', message: '公开协商' }));
  applyAction(game, 'P0', { type: 'start_private_chat' });
  advanceTime(game, () => game.private_chat.ends_at);
  return game;
}

test('unfinished registration exposes submission status and the viewers own task only', () => {
  const game = openRegistration();
  applyAction(game, 'P1', { type: 'register', task_id: 'B' });
  applyAction(game, 'P2', { type: 'register', task_id: 'C' });
  const human = getHumanView(game);
  assert.deepEqual(human.registrations, {});
  assert.deepEqual(human.registration_submitted, { P0: false, P1: true, P2: true, P3: false });
  assert.deepEqual(getObservation(game, 'P1').registrations, { P1: 'B' });
  assert.deepEqual(getObservation(game, 'P2').registrations, { P2: 'C' });
  assert.deepEqual(getObservation(game, 'P3').registrations, {});
  assert.throws(() => applyAction(game, 'P0', { type: 'lock_registration' }), /未完成/);
});

test('even after all submissions, other choices stay hidden until final lock', () => {
  const game = openRegistration();
  const choices = ['B', 'B', 'A', 'A'];
  ids.forEach((id, i) => applyAction(game, id, { type: 'register', task_id: choices[i] }));
  const original = structuredClone(game);
  for (const viewer of ids) {
    const view = getObservation(game, viewer, () => 0);
    assert.deepEqual(view.registrations, { [viewer]: choices[ids.indexOf(viewer)] });
    assert.deepEqual(view.registration_submitted, { P0: true, P1: true, P2: true, P3: true });
    const alternative = structuredClone(game);
    for (const other of ids.filter(id => id !== viewer)) alternative.registrations[other] = 'C';
    assert.deepEqual(getObservation(alternative, viewer, () => 0), view);
  }
  assert.deepEqual(game, original);
  applyAction(game, 'P0', { type: 'lock_registration' });
  assert.equal(game.phase, 'INVESTMENT_SUBMISSION');
  for (const viewer of ids) {
    assert.deepEqual(getObservation(game, viewer).registrations, { P0: 'B', P1: 'B', P2: 'A', P3: 'A' });
    assert.deepEqual(getObservation(game, viewer).active_teams, { B: ['P0', 'P1'] });
  }
});

test('previously revealed daily choices remain public while the new days choices are secret', () => {
  const game = openRegistration();
  ids.forEach(id => applyAction(game, id, { type: 'register', task_id: 'A' }));
  applyAction(game, 'P0', { type: 'lock_registration' });
  applyAction(game, 'P0', { type: 'next_day' }, () => 0);
  openRegistration(game);
  ids.forEach((id, i) => applyAction(game, id, { type: 'register', task_id: ['C', 'A', 'B', 'C'][i] }));
  const view = getHumanView(game);
  assert.deepEqual(view.registrations, { P0: 'C' });
  assert.deepEqual(view.round_results[0].registrations, { P0: 'A', P1: 'A', P2: 'A', P3: 'A' });
});
