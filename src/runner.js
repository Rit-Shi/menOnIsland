import { applyAction, currentSpeaker, reflectionActors } from './engine.js';
import { getObservation } from './observation.js';
import { requestDecision, fallbackAction } from './agents.js';
import { createPrivateChat } from './private-chat.js';
import { randomUUID } from 'node:crypto';
import { addDecisionDiagnostic, writeSubmissionLog } from './model-log.js';
import { runDailyReflections } from './reflection.js';

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
export function createRunner({ store, config, decision = requestDecision, randomInt, now = Date.now }) {
  const running = new Map();
  const dirty = new Set();
  let closed = false;
  const reflectionAbort = new AbortController();
  const privateChat = createPrivateChat({ store, config, decision, randomInt, now, onChange: id => { kick(id); } });
  async function pump(id) {
    for (let step = 0; step < 64; step++) {
      const snapshot = await store.load(id);
      if (!snapshot || closed) return;
      await privateChat.sync(snapshot);
      if (snapshot.phase === 'PRIVATE_CHAT') return;
      if (reflectionActors(snapshot).length) {
        await store.transact(id, game => { game.thinking = reflectionActors(game); game.version++; });
        await runDailyReflections({ snapshot, store, config, decision, signal: reflectionAbort.signal, now });
        continue;
      }
      const actions = snapshot ? pending(snapshot) : [];
      if (!actions.length) return;
      await store.transact(id, game => { game.thinking = actions.map(a => a.id); game.version++; });
      // Freeze all observations before any result in this secret-decision batch is applied.
      const requests = actions.map(({ id, kind }) => ({ actor: id, kind, callId: randomUUID(), observation: getObservation(snapshot, id, now) }));
      const decisions = await Promise.all(requests.map(async request => {
        try { return await decision(config, request.observation, request.kind, { callId: request.callId }); }
        catch { return { action: fallbackAction(request.observation, request.kind), privateMessages: [], fallback: true, code: 'gateway_unavailable', model: config.models[request.actor] }; }
      }));
      const outcomes = [];
      await store.transact(id, game => {
        for (let i = 0; i < requests.length; i++) {
          const { actor, kind } = requests[i];
          const result = decisions[i];
          result.model ||= config.models[actor];
          result.trace ||= { call_id: requests[i].callId, phase: snapshot.phase, kind, attempt_count: 0, error_codes: [] };
          if (!pending(game).some(a => a.id === actor && a.kind === kind)) {
            outcomes.push({ request: requests[i], result, outcome: 'discarded', code: 'state_changed' });
            continue;
          }
          try { applyAction(game, actor, result.action, randomInt, now); }
          catch {
            result.fallback = true; result.code = 'invalid_action';
            result.action = fallbackAction(getObservation(game, actor, now), kind);
            applyAction(game, actor, result.action, randomInt, now);
          }
          addDecisionDiagnostic(game, requests[i].observation, kind, result);
          outcomes.push({ request: requests[i], result, outcome: result.fallback ? 'fallback_applied' : 'applied', code: result.code });
        }
        game.thinking = [];
        game.version++;
      });
      for (const { request, result, outcome, code } of outcomes) void writeSubmissionLog(config, request.observation, request.kind, result, outcome, result.action, code);
    }
    throw new Error('automatic_step_limit');
  }
  function kick(id) {
    if (closed) return Promise.resolve();
    if (running.has(id)) { dirty.add(id); return running.get(id); }
    const task = (async () => {
      do { dirty.delete(id); await pump(id); } while (!closed && dirty.has(id));
    })().catch(async () => {
      await store.transact(id, game => { game.thinking = []; game.version++; });
    }).finally(() => { running.delete(id); });
    running.set(id, task);
    return task;
  }
  return {
    kick,
    idle: async () => {
      do { await Promise.all([...running.values()]); await privateChat.idle(); } while (running.size || privateChat.isBusy());
    },
    resume: async () => {
      await Promise.all((await store.listIds()).map(async id => {
        const game = await store.load(id);
        if (game?.phase === 'PRIVATE_CHAT' || reflectionActors(game).length) kick(id);
      }));
    },
    close: () => { closed = true; reflectionAbort.abort(); privateChat.close(); },
  };
}
