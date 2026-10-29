import { applyAction, advanceTime, privateMessagesSent, PRIVATE_CHAT_MESSAGE_LIMIT } from './engine.js';
import { getObservation } from './observation.js';
import { randomUUID } from 'node:crypto';
import { addDecisionDiagnostic, writeSubmissionLog } from './model-log.js';

const inboxCount = (game, id) => game.messages.filter(m => m.day === game.current_day && m.to === id).length;

export function createPrivateChat({ store, config, decision, randomInt, now, onChange }) {
  const sessions = new Map();
  let closed = false;
  function stop(id) {
    const session = sessions.get(id);
    if (!session) return;
    clearTimeout(session.timer);
    for (const job of session.jobs.values()) job.controller.abort();
    sessions.delete(id);
  }
  async function expire(id) {
    if (closed) return;
    const game = await store.transact(id, game => { advanceTime(game, now); });
    if (game?.phase !== 'PRIVATE_CHAT') stop(id);
    else if (sessions.has(id)) sessions.get(id).timer = null;
    onChange(id);
  }
  function launch(snapshot, actor, session) {
    const controller = new AbortController();
    const callId = randomUUID();
    const seen = inboxCount(snapshot, actor);
    const task = (async () => {
      if (controller.signal.aborted || closed) return;
      const observation = getObservation(snapshot, actor, now);
      const remaining = snapshot.private_chat.ends_at - now();
      if (remaining <= 0) return;
      let abortListener;
      const aborted = new Promise(resolve => {
        abortListener = () => resolve(null);
        controller.signal.addEventListener('abort', abortListener, { once: true });
      });
      let result;
      try {
        const requestConfig = { ...config, timeoutMs: Math.max(1, Math.min(config.timeoutMs || 60000, remaining)) };
        result = await Promise.race([
          Promise.resolve().then(() => decision(requestConfig, observation, 'private_chat', { signal: controller.signal, callId })),
          aborted,
        ]);
      } catch {
        result = { action: { type: 'private_pass' }, fallback: true, code: 'gateway_unavailable' };
      } finally {
        controller.signal.removeEventListener('abort', abortListener);
      }
      if (!result || controller.signal.aborted || closed) {
        await writeSubmissionLog(config, observation, 'private_chat', { trace: { call_id: callId } }, 'discarded', null, 'aborted');
        return;
      }
      result.model ||= config.models[actor];
      result.trace ||= { call_id: callId, phase: snapshot.phase, kind: 'private_chat', attempt_count: 0, error_codes: [] };
      let outcome = 'discarded';
      let errorCode = 'state_changed';
      await store.transact(snapshot.id, game => {
        if (game.phase !== 'PRIVATE_CHAT' || game.current_day !== snapshot.current_day || now() >= game.private_chat.ends_at) return;
        // Only acknowledge the inbox captured for this request; newer input needs another turn.
        game.private_chat.agent_last_seen[actor] = seen;
        try {
          if (!['private_message', 'private_pass'].includes(result.action?.type)) throw new Error('invalid_private_action');
          applyAction(game, actor, result.action, randomInt, now);
        } catch {
          result.fallback = true;
          result.code = 'invalid_action';
          result.action = { type: 'private_pass' };
          applyAction(game, actor, result.action, randomInt, now);
        }
        addDecisionDiagnostic(game, observation, 'private_chat', result);
        outcome = result.fallback ? 'fallback_applied' : 'applied';
        errorCode = result.code ?? null;
        game.thinking = game.thinking.filter(id => id !== actor);
      });
      await writeSubmissionLog(config, observation, 'private_chat', result, outcome, outcome === 'discarded' ? null : result.action, errorCode);
    })().catch(() => {}).finally(() => {
      session.jobs.delete(actor);
      if (!closed) onChange(snapshot.id);
    });
    session.jobs.set(actor, { controller, task });
  }
  async function sync(game) {
    if (closed) return;
    if (game.phase !== 'PRIVATE_CHAT') { stop(game.id); return; }
    if (now() >= game.private_chat.ends_at) { await expire(game.id); return; }
    let session = sessions.get(game.id);
    if (session && session.day !== game.current_day) { stop(game.id); session = null; }
    if (!session) {
      session = { day: game.current_day, jobs: new Map(), timer: null };
      sessions.set(game.id, session);
    }
    if (!session.timer) {
      session.timer = setTimeout(() => { expire(game.id).catch(() => {}); }, Math.max(1, game.private_chat.ends_at - now()));
      session.timer.unref?.();
    }
    for (const actor of ['P1', 'P2', 'P3']) {
      if (session.jobs.has(actor) || privateMessagesSent(game, actor) >= PRIVATE_CHAT_MESSAGE_LIMIT) continue;
      const seen = game.private_chat.agent_last_seen[actor];
      if (seen == null || inboxCount(game, actor) > seen) launch(game, actor, session);
    }
  }
  const jobs = () => [...sessions.values()].flatMap(session => [...session.jobs.values()].map(job => job.task));
  return {
    sync,
    isBusy: () => jobs().length > 0,
    idle: async () => { while (jobs().length) await Promise.all(jobs()); },
    close: () => { closed = true; for (const id of [...sessions.keys()]) stop(id); },
  };
}
