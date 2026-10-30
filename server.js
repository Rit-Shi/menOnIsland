import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createGame, applyAction, ensureDailyReflection, RuleError } from './src/engine.js';
import { getHumanView } from './src/observation.js';
import { loadConfig } from './src/config.js';
import { GameStore } from './src/store.js';
import { createRunner } from './src/runner.js';

const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  response.end(JSON.stringify(value));
}
async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RuleError('需要 JSON 请求', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16384) throw new RuleError('请求过大', 413);
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(body || '{}'); } catch { throw new RuleError('JSON 格式错误', 400); }
}
export function createApp({ config = loadConfig(), decision, randomInt, now = Date.now } = {}) {
  const store = new GameStore(config.dataDir);
  const runner = createRunner({ store, config, decision, randomInt, now });
  const creations = new Map();
  async function serializeCreation(key, operation) {
    const previous = creations.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    creations.set(key, next);
    try { return await next; }
    finally { if (creations.get(key) === next) creations.delete(key); }
  }
  async function authenticate(request, { enroll = true } = {}) {
    const cookie = request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('island_session='))?.slice(15);
    if (!cookie || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(cookie)) throw new RuleError('请开始一局新游戏', 401);
    const [id, token] = cookie.split('.');
    const game = await store.load(id);
    const tokenHash = hash(token);
    if (!game?.session_hash || game.session_hash.length !== tokenHash.length || !timingSafeEqual(Buffer.from(game.session_hash), Buffer.from(tokenHash))) throw new RuleError('游戏会话已失效', 401);
    if (enroll && ensureDailyReflection(game)) {
      const enrolled = await store.transact(id, current => { ensureDailyReflection(current); return current; });
      runner.kick(id);
      return enrolled;
    }
    return game;
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (request.method === 'POST') {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) throw new RuleError('拒绝跨站请求', 403);
      }
      if (request.method === 'GET' && url.pathname === '/api/config') return json(response, 200, config.publicConfig);
      if (request.method === 'POST' && url.pathname === '/api/games') {
        const options = await readBody(request);
        const id = randomUUID();
        const token = randomBytes(32).toString('hex');
        const game = createGame({ id, randomInt, mode: options.play_mode ?? 'manual', proxyNpcId: options.proxy_npc_id });
        let previous;
        try { previous = await authenticate(request, { enroll: false }); }
        catch (error) { if (!(error instanceof RuleError) || error.status !== 401) throw error; }
        game.session_hash = hash(token);
        if (game.play_mode === 'auto') game.automation_status = 'pending';
        await serializeCreation(previous?.id || id, async () => {
          if (previous) {
            await store.transact(previous.id, async old => {
              if (old.replacement_game_id) {
                const replacement = await store.load(old.replacement_game_id);
                if (replacement && !(replacement.play_mode === 'auto' && replacement.automation_status === 'pending')) throw new RuleError('已在其他页面开启新航程，请刷新后重试');
              }
              // An unactivated save cannot schedule provider work after a failed/crashed creation.
              await store.save(game);
              old.replacement_game_id = id;
              if (old.play_mode === 'auto') { old.automation_status = 'stopped'; old.thinking = []; }
              old.version++;
            });
            if (previous.play_mode === 'auto') runner.cancel(previous.id);
          } else await store.save(game);
          if (game.play_mode === 'auto') {
            const activated = await store.transact(id, current => { current.automation_status = 'running'; current.version++; });
            Object.assign(game, activated);
          }
        });
        json(response, 201, getHumanView(game, now), { 'Set-Cookie': `island_session=${id}.${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` });
        runner.kick(id);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const game = await authenticate(request);
        json(response, 200, getHumanView(game, now));
        runner.kick(game.id);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/action') {
        const session = await authenticate(request);
        const body = await readBody(request);
        if (body.actor_id && body.actor_id !== 'P0') throw new RuleError('只能操作人类玩家', 403);
        const game = await store.transact(session.id, game => {
          if (body.expected_game_id != null && body.expected_game_id !== game.id) throw new RuleError('当前对局已切换，请刷新页面后重试');
          if (game.play_mode === 'auto') throw new RuleError('自动模式由Agent行动，观战时不能手动提交游戏动作', 403);
          if (body.expected_day != null && body.expected_day !== game.current_day) throw new RuleError('页面状态已过期，请重试');
          if (body.request_id && game.accepted_requests?.includes(body.request_id)) return game;
          if (body.action?.type === 'lock_registration' && game.thinking?.length) throw new RuleError('请等待 Agent 完成报名');
          applyAction(game, 'P0', body.action, randomInt, now);
          if (typeof body.request_id === 'string' && body.request_id.length <= 100) game.accepted_requests = [...(game.accepted_requests ?? []), body.request_id].slice(-100);
          return game;
        });
        json(response, 200, getHumanView(game, now));
        runner.kick(game.id);
        return;
      }
      const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/island-scene.js': ['island-scene.js', 'text/javascript'], '/phase-notice.js': ['phase-notice.js', 'text/javascript'], '/roster.js': ['roster.js', 'text/javascript'], '/play-mode.js': ['play-mode.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      if (request.method === 'GET' && staticFiles[url.pathname]) {
        const [file, type] = staticFiles[url.pathname];
        const content = await readFile(join(root, 'public', file));
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Referrer-Policy': 'same-origin' });
        return response.end(content);
      }
      return json(response, 404, { error: '页面或接口不存在' });
    } catch (error) {
      if (error instanceof RuleError) return json(response, error.status, { error: error.message });
      if (error.code === 'ENOENT') return json(response, 404, { error: '页面尚未就绪' });
      console.error(`[server] ${error.code || error.name}`);
      if (!response.headersSent) json(response, 500, { error: '服务暂时异常，请稍后重试' });
      else response.end();
    }
  });
  server.on('listening', () => { runner.resume().catch(error => console.error(`[resume] ${error.code || error.name}`)); });
  server.on('close', runner.close);
  return { server, store, idle: runner.idle };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = loadConfig();
  const app = createApp({ config });
  app.server.listen(config.port, config.host, () => console.log(`孤岛协议已启动：http://${config.host}:${config.port}`));
  app.server.on('error', error => { console.error(`启动失败：${error.code}`); process.exitCode = 1; });
}
