import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadConfig({ env = process.env, envPath = resolve('.env.local') } = {}) {
  const local = {};
  if (envPath && existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const values = { ...local, ...env };
  const baseUrl = (values.AI_BASE_URL || '').replace(/\/+$/, '');
  const models = { P1: values.MODEL_P1 || 'deepseek-v4.1-flash', P2: values.MODEL_P2 || 'deepseek-v4-flash', P3: values.MODEL_P3 || 'glm-5.2' };
  const apiKey = values.AI_API_KEY || '';
  return {
    baseUrl, apiKey, models,
    timeoutMs: Math.max(100, Math.min(180000, Number(values.AI_TIMEOUT_MS) || 60000)),
    disableThinking: values.AI_DISABLE_THINKING !== 'false',
    host: values.HOST || '127.0.0.1', port: Number(values.PORT) || 3000,
    dataDir: resolve(values.DATA_DIR || '.data'),
    publicConfig: { models, configured: Boolean(baseUrl && apiKey), provider: baseUrl ? new URL(baseUrl).hostname : '未配置网关' },
  };
}
