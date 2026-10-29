import { loadConfig } from '../src/config.js';
import { createGame } from '../src/engine.js';
import { getObservation } from '../src/observation.js';
import { requestDecision } from '../src/agents.js';

const config = loadConfig();
const game = createGame({ id: 'model-check', randomInt: () => 0 });
const results = await Promise.all(['P1', 'P2', 'P3'].map(async id => {
  const started = Date.now();
  const result = await requestDecision(config, getObservation(game, id), 'speech');
  return { actor: id, model: config.models[id], available: !result.fallback, code: result.code || 'ok', latency_ms: Date.now() - started, tokens: result.usage ?? null };
}));
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (results.some(result => !result.available)) process.exitCode = 1;
