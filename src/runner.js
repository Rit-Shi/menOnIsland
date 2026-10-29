import { applyAction, currentSpeaker } from './engine.js';
import { getObservation } from './observation.js';
import { requestDecision, fallbackAction } from './agents.js';

function pending(game) {
  if (['NEGOTIATION', 'VOTE_SPEECH'].includes(game.phase)) {
    const id = currentSpeaker(game);
    return id && id !== 'P0' ? [{ id, kind: 'speech' }] : [];
  }
  if (game.phase === 'REGISTRATION') return ['P1', 'P2', 'P3'].filter(id => !Object.hasOwn(game.registrations, id) || (game.agent_registration_revision?.[id] ?? 0) < (game.registration_revision ?? 0)).map(id => ({ id, kind: 'register' }));
  if (game.phase === 'VOTE_SUBMISSION') return game.vote_session.candidate_ids.filter(id => id !== 'P0' && !Object.hasOwn(game.vote_session.votes, id)).map(id => ({ id, kind: 'vote' }));
  if (game.phase === 'INVESTMENT_SUBMISSION') return Object.values(game.active_teams).flat().filter(id => id !== 'P0' && !Object.hasOwn(game.investments, id)).map(id => ({ id, kind: 'invest' }));
  return [];
}
export function createRunner({ store, config, decision = requestDecision, randomInt }) {
  const running = new Map();
  async function pump(id) {
    for (let step = 0; step < 64; step++) {
      const snapshot = await store.load(id);
      const actions = snapshot ? pending(snapshot) : [];
      if (!actions.length) return;
      await store.transact(id, game => { game.thinking = actions.map(a => a.id); game.version++; });
      // Freeze all observations before any result in this secret-decision batch is applied.
      const requests = actions.map(({ id, kind }) => ({ actor: id, kind, observation: getObservation(snapshot, id) }));
      const decisions = await Promise.all(requests.map(async request => {
        try { return await decision(config, request.observation, request.kind); }
        catch { return { action: fallbackAction(request.observation, request.kind), privateMessages: [], fallback: true, code: 'gateway_unavailable', model: config.models[request.actor] }; }
      }));
      await store.transact(id, game => {
        for (let i = 0; i < requests.length; i++) {
          const { actor, kind } = requests[i];
          const result = decisions[i];
          if (!pending(game).some(a => a.id === actor && a.kind === kind)) continue;
          for (const message of result.privateMessages ?? []) {
            try { applyAction(game, actor, { type: 'private_message', ...message }, randomInt); } catch { /* malformed side messages do not block the required action */ }
          }
          try { applyAction(game, actor, result.action, randomInt); }
          catch {
            result.fallback = true; result.code = 'invalid_action';
            applyAction(game, actor, fallbackAction(getObservation(game, actor), kind), randomInt);
          }
          if (result.fallback) game.diagnostics.push({ day: game.current_day, actor_id: actor, model: result.model || config.models[actor], code: result.code });
        }
        game.thinking = [];
        game.version++;
      });
    }
    throw new Error('automatic_step_limit');
  }
  function kick(id) {
    if (running.has(id)) return running.get(id);
    const task = pump(id).catch(async () => {
      await store.transact(id, game => { game.thinking = []; game.version++; });
    }).finally(() => { running.delete(id); });
    running.set(id, task);
    return task;
  }
  return { kick, idle: () => Promise.all([...running.values()]) };
}
