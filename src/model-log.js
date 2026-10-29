import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const queues = new Map();

export async function flushModelLogs(timeoutMs = 1000) {
  let timer;
  try {
    return await Promise.race([
      Promise.allSettled([...queues.values()]).then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function writeModelLog(config, record) {
  if (!config.dataDir) return false;
  try {
    if (typeof record.game_id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(record.game_id)) throw new Error('invalid_game_id');
    const directory = join(config.dataDir, 'model-calls');
    const filename = join(directory, `${record.game_id}.jsonl`);
    const serialized = JSON.stringify({ logged_at: new Date().toISOString(), ...record }, (_key, value) =>
      typeof value === 'string' && config.apiKey ? value.replaceAll(config.apiKey, '[REDACTED]') : value);
    const previous = queues.get(filename) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      await mkdir(directory, { recursive: true });
      await (config.modelLogAppend || appendFile)(filename, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 });
    });
    queues.set(filename, next);
    try { await next; } finally { if (queues.get(filename) === next) queues.delete(filename); }
    return true;
  } catch (error) {
    console.error(`[model-log] log_write_failed (${error.code || 'invalid_record'})`);
    return false;
  }
}

export function addDecisionDiagnostic(game, observation, kind, result) {
  const trace = result.trace;
  if (!result.fallback && !(trace?.attempt_count > 1)) return;
  game.diagnostics.push({
    day: observation.current_day, actor_id: observation.viewer_id, model: result.model,
    code: result.code || trace?.error_codes?.[0] || 'invalid_action',
    phase: observation.phase, kind, attempt_count: trace?.attempt_count ?? 0,
    recovered: !result.fallback,
  });
}

export function writeSubmissionLog(config, observation, kind, result, outcome, action = result.action, errorCode = null) {
  return writeModelLog(config, {
    event: 'submission', game_id: observation.id, call_id: result.trace?.call_id ?? null,
    day: observation.current_day, actor_id: observation.viewer_id, model: result.model || config.models[observation.viewer_id],
    phase: observation.phase, kind, outcome, action, error_code: errorCode,
    fallback: result.fallback, attempt_count: result.trace?.attempt_count ?? 0,
  });
}
