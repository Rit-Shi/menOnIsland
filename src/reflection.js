import { randomUUID } from 'node:crypto';
import { applyAction, reflectionActors } from './engine.js';
import { getObservation } from './observation.js';
import { fallbackAction } from './agents.js';
import { addDecisionDiagnostic, writeSubmissionLog } from './model-log.js';

export async function runDailyReflections({ snapshot, store, config, decision, signal, now = Date.now }) {
  // Freeze all owner-filtered contexts before any reflection result is committed.
  const requests = reflectionActors(snapshot).map(actor => ({ actor, callId: randomUUID(), observation: getObservation(snapshot, actor, now) }));
  await Promise.all(requests.map(async ({ actor, callId, observation }) => {
    if (signal.aborted) return;
    let abortListener;
    const aborted = new Promise(resolve => {
      abortListener = () => resolve(null);
      signal.addEventListener('abort', abortListener, { once: true });
    });
    let result;
    try {
      result = await Promise.race([Promise.resolve().then(() => decision(config, observation, 'reflect', { signal, callId })), aborted]);
    } catch {
      result = { action: fallbackAction(observation,'reflect'), fallback: true, code: 'gateway_unavailable' };
    } finally { signal.removeEventListener('abort', abortListener); }
    if (!result || signal.aborted) {
      void writeSubmissionLog(config, observation, 'reflect', { trace: { call_id: callId } }, 'discarded', null, 'aborted');
      return;
    }
    result.model ||= config.models[actor];
    result.trace ||= { call_id: callId, phase: snapshot.phase, kind: 'reflect', attempt_count: 0, error_codes: [] };
    let outcome = 'discarded';
    let code = 'state_changed';
    let submitted = null;
    await store.transact(snapshot.id, game => {
      if (signal.aborted || game.current_day !== snapshot.current_day || game.phase !== snapshot.phase || !reflectionActors(game).includes(actor)) return;
      try {
        if (result.action?.type !== 'reflect') throw new Error('invalid_reflection_action');
        submitted = { ...result.action, source: result.fallback ? 'fallback' : 'model' };
        applyAction(game, actor, submitted);
      } catch {
        result.fallback = true; result.code = 'invalid_action';
        result.action = fallbackAction(observation,'reflect');
        submitted = { ...result.action, source: 'fallback' };
        applyAction(game, actor, submitted);
      }
      game.thinking = (game.thinking || []).filter(id => id !== actor);
      addDecisionDiagnostic(game, observation, 'reflect', result);
      outcome = result.fallback ? 'fallback_applied' : 'applied';
      code = result.code ?? null;
    });
    void writeSubmissionLog(config, observation, 'reflect', result, outcome, submitted, code);
  }));
}
