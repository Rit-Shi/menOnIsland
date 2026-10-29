import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class GameStore {
  constructor(directory) { this.directory = directory; this.cache = new Map(); this.queues = new Map(); }
  filename(id) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('invalid_game_id');
    return join(this.directory, `${id}.json`);
  }
  async load(id) {
    if (!this.cache.has(id)) {
      try { this.cache.set(id, JSON.parse(await readFile(this.filename(id), 'utf8'))); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    return structuredClone(this.cache.get(id));
  }
  async save(game) {
    await mkdir(this.directory, { recursive: true });
    const destination = this.filename(game.id);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(game), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, destination);
    this.cache.set(game.id, structuredClone(game));
  }
  async transact(id, operation) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const game = await this.load(id);
      if (!game) return null;
      const result = await operation(game);
      await this.save(game);
      return result ?? structuredClone(game);
    });
    this.queues.set(id, next);
    try { return await next; }
    finally { if (this.queues.get(id) === next) this.queues.delete(id); }
  }
}
